import type { DailyMetrics, MarketIndex, MarketPhase, Stock, Theme } from '../types';
import type { EventDrivenDetection } from '../data/presetStocks';
import { analyzeTrapRiskV41 } from './trapGuardV41';
import {
  analyzeStockSignal,
  type MicroStructureContext,
  type PredatorSignal,
} from './predatorEngine';
import type { MarketCalibrationContext, MarketRegime } from './predictionCalibration';
import { getChinaTradingClock, type MarketTimestamp } from './marketClock';
import { detectBlackSwan, shouldOverrideSignal } from './blackSwanDetector';
import {
  aggregateTradeLifecycles,
  calculateStrategyAcceptanceMetrics,
  evaluateStrategyAcceptance,
  type EquityObservation,
  type PredictionObservation,
  type StrategyAcceptanceMetrics,
  type StrategyAcceptancePolicy,
  type StrategyAcceptanceResult,
  type StrategyTradeObservation,
} from './strategyMetrics';

export interface ReplaySnapshot {
  timestamp: MarketTimestamp;
  stock: Stock;
  allStocks: Stock[];
  phase: MarketPhase;
  metrics: DailyMetrics;
  marketIndices: MarketIndex[];
  marketContext: MarketCalibrationContext;
  themes: Theme[];
  eventDrivenContext?: EventDrivenDetection;
  microContext?: MicroStructureContext;
  intentContext?: {
    intent: 'Accumulate' | 'Distribute' | 'Neutral';
    decoyScore: number;
    algoReason?: string;
  };
}

export interface ReplayConfig {
  initialCapital: number;
  positionFraction?: number;
  commissionRate?: number;
  sellTaxRate?: number;
  slippageBps?: number;
  acceptancePolicy?: StrategyAcceptancePolicy;
  strictMarketContext?: boolean;
}

export interface ReplaySignalRecord {
  timestamp: number;
  price: number;
  phase: MarketPhase;
  signal: PredatorSignal;
}

export interface ReplayTrade extends StrategyTradeObservation {
  entryTimestamp: number;
  exitTimestamp: number;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  exitReason: 'SIGNAL' | 'STOP' | 'TARGET' | 'END_OF_REPLAY';
}

export interface ReplayRejection {
  timestamp: number;
  side: 'BUY' | 'SELL';
  reason: string;
}

export interface ReplayResult {
  signals: ReplaySignalRecord[];
  trades: ReplayTrade[];
  rejections: ReplayRejection[];
  equityCurve: EquityObservation[];
  metrics: StrategyAcceptanceMetrics;
  acceptance: StrategyAcceptanceResult;
  endingCash: number;
  endingEquity: number;
  openPosition: boolean;
}

interface PendingBuy {
  createdAt: number;
  stopLoss: number;
  target: number;
  regime: MarketRegime;
}

interface PendingSell {
  createdAt: number;
  fraction: number;
}

interface Position {
  shares: number;
  entryPrice: number;
  entryNotional: number;
  entryTimestamp: number;
  entryTradeDate: string;
  stopLoss: number;
  target: number;
  regime: MarketRegime;
}

const assertPointInTimeSnapshot = (
  snapshot: ReplaySnapshot,
  timestamp: number,
  strictMarketContext: boolean,
) => {
  if (!snapshot.stock.code || !Number.isFinite(snapshot.stock.currentPrice) || (snapshot.stock.currentPrice || 0) <= 0) {
    throw new Error('Replay snapshot requires a valid stock code and current price');
  }
  const hasFutureBar = (snapshot.stock.history || []).some(bar => {
    const parsed = Date.parse(bar.day);
    return Number.isFinite(parsed) && parsed > timestamp;
  });
  if (hasFutureBar) throw new Error(`Point-in-time violation for ${snapshot.stock.code}: history contains future bars`);
  if (strictMarketContext) {
    const context = snapshot.marketContext;
    const hasTarget = snapshot.allStocks.some(stock => stock.code === snapshot.stock.code);
    if (!hasTarget) throw new Error(`Replay cross-section does not contain ${snapshot.stock.code}`);
    if (snapshot.allStocks.length < 4_000) {
      throw new Error('Replay requires the complete point-in-time stock cross-section');
    }
    if ((context.totalCount || 0) < 4_000 || (context.coverage || 0) < 0.85) {
      throw new Error('Replay requires a full-market breadth snapshot with at least 85% coverage');
    }
    if (context.dataStatus !== 'FRESH' && context.dataStatus !== 'PARTIAL') {
      throw new Error(`Replay rejected ${context.dataStatus?.toLowerCase() || 'missing'} market context`);
    }
    if (!Number.isFinite(context.phaseConfidence)) {
      throw new Error('Replay requires point-in-time phase confidence');
    }
  }
};

const probabilityUpFromSignal = (signal: PredatorSignal) => {
  const probability = Math.min(100, Math.max(0, signal.prediction?.probability || 50)) / 100;
  if (signal.prediction?.direction === 'UP') return probability;
  if (signal.prediction?.direction === 'DOWN') return 1 - probability;
  return 0.5;
};

export const runDecisionReplay = (
  snapshots: ReplaySnapshot[],
  config: ReplayConfig,
): ReplayResult => {
  if (!Number.isFinite(config.initialCapital) || config.initialCapital <= 0) {
    throw new Error('Replay initialCapital must be positive and finite');
  }
  const ordered = [...snapshots].sort(
    (a, b) => getChinaTradingClock(a.timestamp).timestampMs - getChinaTradingClock(b.timestamp).timestampMs,
  );
  const targetCode = ordered[0]?.stock.code;
  if (ordered.some(snapshot => snapshot.stock.code !== targetCode)) {
    throw new Error('Replay snapshots must contain exactly one target instrument');
  }
  const positionFraction = Math.min(1, Math.max(0.01, config.positionFraction ?? 0.2));
  const commissionRate = Math.max(0, config.commissionRate ?? 0.0003);
  const sellTaxRate = Math.max(0, config.sellTaxRate ?? 0.0005);
  const slippageRate = Math.max(0, config.slippageBps ?? 5) / 10_000;
  const strictMarketContext = config.strictMarketContext ?? true;

  let cash = config.initialCapital;
  let position: Position | null = null;
  let pendingBuy: PendingBuy | null = null;
  let pendingSell: PendingSell | null = null;
  let previousPrediction: { price: number; observation: Omit<PredictionObservation, 'outcomeUp'> } | null = null;
  const signals: ReplaySignalRecord[] = [];
  const trades: ReplayTrade[] = [];
  const rejections: ReplayRejection[] = [];
  const equityCurve: EquityObservation[] = [];
  const predictions: PredictionObservation[] = [];

  const closePosition = (
    currentPosition: Position,
    timestamp: number,
    rawPrice: number,
    reason: ReplayTrade['exitReason'],
    fraction = 1,
  ) => {
    const requestedShares = Math.floor((currentPosition.shares * Math.min(1, Math.max(0, fraction))) / 100) * 100;
    const sharesToSell = Math.min(currentPosition.shares, Math.max(100, requestedShares));
    const exitPrice = Math.max(0, rawPrice * (1 - slippageRate));
    const exitNotional = sharesToSell * exitPrice;
    const fees = exitNotional * (commissionRate + sellTaxRate);
    const proceeds = exitNotional - fees;
    const allocatedEntryNotional = currentPosition.entryNotional * (sharesToSell / currentPosition.shares);
    const pnl = proceeds - allocatedEntryNotional;
    cash += proceeds;
    trades.push({
      entryTimestamp: currentPosition.entryTimestamp,
      exitTimestamp: timestamp,
      entryPrice: currentPosition.entryPrice,
      exitPrice,
      shares: sharesToSell,
      entryNotional: allocatedEntryNotional,
      exitNotional,
      pnl,
      returnPercent: allocatedEntryNotional > 0 ? (pnl / allocatedEntryNotional) * 100 : 0,
      exitReason: reason,
      regime: currentPosition.regime,
    });
    const remainingShares = currentPosition.shares - sharesToSell;
    position = remainingShares >= 100 ? {
      ...currentPosition,
      shares: remainingShares,
      entryNotional: currentPosition.entryNotional - allocatedEntryNotional,
    } : null;
  };

  for (const snapshot of ordered) {
    const clock = getChinaTradingClock(snapshot.timestamp);
    const timestamp = clock.timestampMs;
    assertPointInTimeSnapshot(snapshot, timestamp, strictMarketContext);
    const stock = snapshot.stock;
    const currentPrice = stock.currentPrice as number;

    if (previousPrediction) {
      predictions.push({
        ...previousPrediction.observation,
        outcomeUp: currentPrice > previousPrediction.price,
      });
      previousPrediction = null;
    }

    if (pendingBuy && !position) {
      if (stock.isLimitUp) {
        rejections.push({ timestamp, side: 'BUY', reason: '涨停排队成交不可复现' });
      } else {
        const rawEntry = stock.open || currentPrice;
        const entryPrice = rawEntry * (1 + slippageRate);
        const budget = Math.min(cash, cash * positionFraction);
        const shares = Math.floor((budget / (entryPrice * (1 + commissionRate))) / 100) * 100;
        if (shares >= 100) {
          const grossNotional = shares * entryPrice;
          const entryNotional = grossNotional * (1 + commissionRate);
          cash -= entryNotional;
          position = {
            shares,
            entryPrice,
            entryNotional,
            entryTimestamp: timestamp,
            entryTradeDate: clock.tradeDate,
            stopLoss: pendingBuy.stopLoss,
            target: pendingBuy.target,
            regime: pendingBuy.regime,
          };
        } else {
          rejections.push({ timestamp, side: 'BUY', reason: '可用资金不足一手' });
        }
      }
      pendingBuy = null;
    }

    if (pendingSell && position && clock.tradeDate !== position.entryTradeDate) {
      if (stock.isLimitDown) {
        rejections.push({ timestamp, side: 'SELL', reason: '跌停封单无法假设成交' });
      } else {
        closePosition(position, timestamp, stock.open || currentPrice, 'SIGNAL', pendingSell.fraction);
        pendingSell = null;
      }
    } else if (pendingSell && !position) {
      pendingSell = null;
    }

    const trapRisk = analyzeTrapRiskV41(stock, snapshot.phase, snapshot.allStocks);
    const evaluatedStock = { ...stock, trapRiskScore: trapRisk.score };
    const theme = snapshot.themes.find(item => item.name === stock.concept);
    const sectorContext = theme ? {
      rank: snapshot.themes.indexOf(theme) + 1,
      name: theme.name,
      isMainline: theme.type === 'Main',
    } : undefined;
    let signalExitFraction = 1;
    let signal = analyzeStockSignal(
      evaluatedStock,
      snapshot.phase,
      snapshot.marketContext,
      sectorContext,
      snapshot.themes,
      undefined,
      snapshot.microContext,
      snapshot.intentContext,
      snapshot.eventDrivenContext,
      { timestamp },
    );

    const circuitStocks = snapshot.allStocks.map(item => item.code === stock.code
      ? { ...evaluatedStock, status: position ? 'Hold' as const : evaluatedStock.status }
      : item
    );
    const circuitBreaker = detectBlackSwan(
      circuitStocks,
      snapshot.marketIndices,
      snapshot.metrics,
      snapshot.phase,
      timestamp,
    );
    if (position && circuitBreaker.level >= 2) {
      const override = shouldOverrideSignal(stock.id, circuitBreaker.emergencyActions);
      if (override?.action === 'EMERGENCY_SELL' || override?.action === 'REDUCE_50') {
        signalExitFraction = override.action === 'REDUCE_50' ? 0.5 : 1;
        signal = {
          ...signal,
          signalType: 'SELL',
          strategy: `[V62熔断] ${override.reason}`,
          positionAdvice: override.action === 'EMERGENCY_SELL'
            ? '建议仓位: 0% [紧急清仓]'
            : '建议仓位: 50% [危机减仓]',
        };
      }
    } else if (position && circuitBreaker.euphoriaLevel >= 2) {
      const override = shouldOverrideSignal(stock.id, circuitBreaker.euphoriaActions);
      if (override?.action === 'LOCK_PROFIT' || override?.action === 'REDUCE_WINNER') {
        signalExitFraction = override.action === 'LOCK_PROFIT' ? 0.7 : 0.5;
        signal = {
          ...signal,
          signalType: 'SELL',
          strategy: `[V62.1狂热] ${override.reason}`,
          positionAdvice: override.action === 'LOCK_PROFIT'
            ? '建议仓位: 30% [锁定利润]'
            : '建议仓位: 50% [止盈减仓]',
        };
      }
    }
    signals.push({ timestamp, price: currentPrice, phase: snapshot.phase, signal });

    const regime = signal.prediction?.marketRegime || 'UNKNOWN';
    previousPrediction = {
      price: currentPrice,
      observation: { probabilityUp: probabilityUpFromSignal(signal), regime },
    };

    if (position && clock.tradeDate !== position.entryTradeDate) {
      if (stock.isLimitDown) {
        rejections.push({ timestamp, side: 'SELL', reason: '跌停封单无法假设成交' });
      } else {
        const dayOpen = stock.open || currentPrice;
        const dayLow = stock.low || currentPrice;
        const dayHigh = stock.high || currentPrice;
        if (position.stopLoss > 0 && dayOpen <= position.stopLoss) {
          closePosition(position, timestamp, dayOpen, 'STOP');
          pendingSell = null;
        } else if (position.stopLoss > 0 && dayLow <= position.stopLoss) {
          closePosition(position, timestamp, position.stopLoss, 'STOP');
          pendingSell = null;
        } else if (position.target > 0 && dayHigh >= position.target) {
          closePosition(position, timestamp, position.target, 'TARGET');
          pendingSell = null;
        } else if (signal.signalType === 'SELL') {
          pendingSell = pendingSell || {
            createdAt: timestamp,
            fraction: signalExitFraction,
          };
        }
      }
    }

    if (!position && !pendingBuy && signal.signalType === 'BUY' && signal.buyPoint > 0) {
      pendingBuy = {
        createdAt: timestamp,
        stopLoss: signal.smartEntry?.stopLoss || signal.stopLoss,
        target: signal.smartEntry?.target || signal.sellPoint,
        regime,
      };
    }

    equityCurve.push({
      timestamp,
      equity: cash + (position ? position.shares * currentPrice : 0),
    });
  }

  const last = ordered[ordered.length - 1];
  if (position && last) {
    const clock = getChinaTradingClock(last.timestamp);
    if (clock.tradeDate !== position.entryTradeDate && !last.stock.isLimitDown) {
      closePosition(position, clock.timestampMs, last.stock.currentPrice as number, 'END_OF_REPLAY');
      equityCurve.push({ timestamp: clock.timestampMs, equity: cash });
    }
  }

  const acceptanceTrades = aggregateTradeLifecycles(trades);
  const metrics = calculateStrategyAcceptanceMetrics({
    trades: acceptanceTrades,
    equityCurve,
    predictions,
  });
  const acceptance = evaluateStrategyAcceptance(metrics, config.acceptancePolicy);
  const lastPrice = last?.stock.currentPrice || 0;
  const endingEquity = cash + (position ? position.shares * lastPrice : 0);
  return {
    signals,
    trades,
    rejections,
    equityCurve,
    metrics,
    acceptance,
    endingCash: cash,
    endingEquity,
    openPosition: Boolean(position),
  };
};
