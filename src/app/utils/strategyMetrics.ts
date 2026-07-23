import type { MarketRegime } from './predictionCalibration';

export interface StrategyTradeObservation {
  returnPercent: number;
  pnl: number;
  entryNotional: number;
  exitNotional: number;
  regime?: MarketRegime;
}

export interface LifecycleTradeObservation extends StrategyTradeObservation {
  entryTimestamp: number;
}

export const aggregateTradeLifecycles = (
  trades: LifecycleTradeObservation[],
): StrategyTradeObservation[] => {
  const lifecycles = new Map<string, StrategyTradeObservation>();
  trades.forEach(trade => {
    const key = `${trade.entryTimestamp}:${trade.regime || 'UNKNOWN'}`;
    const existing = lifecycles.get(key);
    if (!existing) {
      lifecycles.set(key, {
        entryNotional: trade.entryNotional,
        exitNotional: trade.exitNotional,
        pnl: trade.pnl,
        returnPercent: trade.returnPercent,
        regime: trade.regime,
      });
      return;
    }
    const entryNotional = existing.entryNotional + trade.entryNotional;
    const pnl = existing.pnl + trade.pnl;
    lifecycles.set(key, {
      entryNotional,
      exitNotional: existing.exitNotional + trade.exitNotional,
      pnl,
      returnPercent: entryNotional > 0 ? (pnl / entryNotional) * 100 : 0,
      regime: trade.regime,
    });
  });
  return [...lifecycles.values()];
};

export interface EquityObservation {
  timestamp: number;
  equity: number;
}

export interface PredictionObservation {
  probabilityUp: number;
  outcomeUp: boolean;
  regime?: MarketRegime;
}

export interface RegimeMetrics {
  trades: number;
  winRate: number;
  expectancyPercent: number;
  profitFactor: number;
}

export interface StrategyAcceptanceMetrics {
  trades: number;
  winRate: number;
  winRateConfidence95: { low: number; high: number };
  expectancyPercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  turnoverRatio: number;
  brierScore: number | null;
  expectedCalibrationError: number | null;
  regimeBreakdown: Partial<Record<MarketRegime, RegimeMetrics>>;
}

export interface StrategyAcceptancePolicy {
  minimumTrades: number;
  minimumExpectancyPercent: number;
  minimumProfitFactor: number;
  maximumDrawdownPercent: number;
  maximumBrierScore: number;
  maximumCalibrationError: number;
}

export interface StrategyAcceptanceResult {
  passed: boolean;
  checks: Record<keyof StrategyAcceptancePolicy, boolean>;
}

export const DEFAULT_STRATEGY_ACCEPTANCE_POLICY: StrategyAcceptancePolicy = {
  minimumTrades: 30,
  minimumExpectancyPercent: 0,
  minimumProfitFactor: 1.2,
  maximumDrawdownPercent: 15,
  maximumBrierScore: 0.25,
  maximumCalibrationError: 0.1,
};

const round = (value: number, digits = 4) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const summarizeTrades = (trades: StrategyTradeObservation[]): RegimeMetrics => {
  const wins = trades.filter(trade => trade.pnl > 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(trades.filter(trade => trade.pnl <= 0).reduce((sum, trade) => sum + trade.pnl, 0));
  return {
    trades: trades.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 2) : 0,
    expectancyPercent: trades.length
      ? round(trades.reduce((sum, trade) => sum + trade.returnPercent, 0) / trades.length, 4)
      : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : grossProfit > 0 ? 99 : 0,
  };
};

const wilsonInterval = (wins: number, total: number) => {
  if (total === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const probability = wins / total;
  const denominator = 1 + (z * z) / total;
  const center = (probability + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt(
    (probability * (1 - probability)) / total + (z * z) / (4 * total * total),
  );
  return {
    low: round(Math.max(0, center - margin) * 100, 2),
    high: round(Math.min(1, center + margin) * 100, 2),
  };
};

const calculateMaxDrawdown = (equityCurve: EquityObservation[]) => {
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    if (!Number.isFinite(point.equity) || point.equity <= 0) continue;
    peak = Math.max(peak, point.equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - point.equity) / peak) * 100);
  }
  return round(maxDrawdown, 4);
};

const calculateCalibration = (observations: PredictionObservation[]) => {
  const valid = observations.filter(observation => Number.isFinite(observation.probabilityUp));
  if (valid.length === 0) return { brierScore: null, expectedCalibrationError: null };

  const normalized = valid.map(observation => ({
    probability: Math.min(1, Math.max(0, observation.probabilityUp)),
    outcome: observation.outcomeUp ? 1 : 0,
  }));
  const brierScore = normalized.reduce(
    (sum, observation) => sum + (observation.probability - observation.outcome) ** 2,
    0,
  ) / normalized.length;

  let expectedCalibrationError = 0;
  for (let index = 0; index < 10; index++) {
    const lower = index / 10;
    const upper = (index + 1) / 10;
    const bin = normalized.filter(observation =>
      observation.probability >= lower && (index === 9 ? observation.probability <= upper : observation.probability < upper)
    );
    if (bin.length === 0) continue;
    const confidence = bin.reduce((sum, observation) => sum + observation.probability, 0) / bin.length;
    const accuracy = bin.reduce((sum, observation) => sum + observation.outcome, 0) / bin.length;
    expectedCalibrationError += (bin.length / normalized.length) * Math.abs(confidence - accuracy);
  }

  return {
    brierScore: round(brierScore, 6),
    expectedCalibrationError: round(expectedCalibrationError, 6),
  };
};

export const calculateStrategyAcceptanceMetrics = ({
  trades,
  equityCurve,
  predictions,
}: {
  trades: StrategyTradeObservation[];
  equityCurve: EquityObservation[];
  predictions: PredictionObservation[];
}): StrategyAcceptanceMetrics => {
  const overall = summarizeTrades(trades);
  const wins = trades.filter(trade => trade.pnl > 0).length;
  const averageEquity = equityCurve.length
    ? equityCurve.reduce((sum, point) => sum + point.equity, 0) / equityCurve.length
    : 0;
  const turnoverNotional = trades.reduce(
    (sum, trade) => sum + trade.entryNotional + trade.exitNotional,
    0,
  );
  const regimes: MarketRegime[] = ['RISK_ON', 'NEUTRAL', 'RISK_OFF', 'DIVERGENT', 'UNKNOWN'];
  const regimeBreakdown: Partial<Record<MarketRegime, RegimeMetrics>> = {};
  for (const regime of regimes) {
    const regimeTrades = trades.filter(trade => trade.regime === regime);
    if (regimeTrades.length) regimeBreakdown[regime] = summarizeTrades(regimeTrades);
  }
  const calibration = calculateCalibration(predictions);

  return {
    trades: overall.trades,
    winRate: overall.winRate,
    winRateConfidence95: wilsonInterval(wins, trades.length),
    expectancyPercent: overall.expectancyPercent,
    profitFactor: overall.profitFactor,
    maxDrawdownPercent: calculateMaxDrawdown(equityCurve),
    turnoverRatio: averageEquity > 0 ? round(turnoverNotional / averageEquity, 4) : 0,
    brierScore: calibration.brierScore,
    expectedCalibrationError: calibration.expectedCalibrationError,
    regimeBreakdown,
  };
};

export const evaluateStrategyAcceptance = (
  metrics: StrategyAcceptanceMetrics,
  policy: StrategyAcceptancePolicy = DEFAULT_STRATEGY_ACCEPTANCE_POLICY,
): StrategyAcceptanceResult => {
  const checks: StrategyAcceptanceResult['checks'] = {
    minimumTrades: metrics.trades >= policy.minimumTrades,
    minimumExpectancyPercent: metrics.expectancyPercent > policy.minimumExpectancyPercent,
    minimumProfitFactor: metrics.profitFactor >= policy.minimumProfitFactor,
    maximumDrawdownPercent: metrics.maxDrawdownPercent <= policy.maximumDrawdownPercent,
    maximumBrierScore: metrics.brierScore !== null && metrics.brierScore <= policy.maximumBrierScore,
    maximumCalibrationError: metrics.expectedCalibrationError !== null &&
      metrics.expectedCalibrationError <= policy.maximumCalibrationError,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
};
