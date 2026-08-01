import type { Stock } from '../types';
import { resolveLimitPercent } from '../../shared/marketRules.ts';
import type { BacktestEvidence, MarketRegime } from './predictionCalibration';

export type HistoricalEvidenceDirection = 'LONG' | 'EXIT';
export type HistoricalSampleLevel = 'STOCK' | 'SECTOR' | 'POOL';

export interface HistoricalHorizonEvidence {
  horizonDays: number;
  sampleSize: number;
  winRate: number;
  expectancy: number;
}

export interface HistoricalPatternEvidence extends BacktestEvidence {
  avgWinPct: number;
  avgLossPct: number;
  optimalStopMult: number;
  direction: HistoricalEvidenceDirection;
  validationType: 'REGIME_WEIGHTED_WALK_FORWARD';
  marketRegime: MarketRegime;
  exactRegimeSampleSize: number;
  totalSampleSize: number;
  effectiveSampleSize: number;
  ownStockSampleSize: number;
  sectorSampleSize: number;
  poolSampleSize: number;
  recentSampleShare: number;
  horizonDays: number;
  horizonEvidence?: HistoricalHorizonEvidence[];
}

interface HistoricalBar {
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HistoricalSetup {
  stock: Stock;
  bars: HistoricalBar[];
  signalIndex: number;
  entryIndex: number;
  entryPrice: number;
  localAtr: number;
  day: string;
  regime: MarketRegime;
  level: HistoricalSampleLevel;
  weight: number;
}

interface WeightedTrade {
  pctReturn: number;
  weight: number;
  level: HistoricalSampleLevel;
  regime: MarketRegime;
  isRecent: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const sma = (values: number[], period: number, endIndex: number): number => {
  if (endIndex < period - 1) return 0;
  let total = 0;
  for (let index = endIndex - period + 1; index <= endIndex; index++) total += values[index];
  return total / period;
};

const normalizeHistory = (stock: Stock): HistoricalBar[] => (stock.history || [])
  .map(bar => {
    const close = Number(bar.close);
    const open = Number(bar.open ?? close);
    const high = Number(bar.high ?? close);
    const low = Number(bar.low ?? close);
    const volume = Number(bar.volume ?? 0);
    return { day: bar.day, open, high, low, close, volume };
  })
  .filter(bar =>
    Boolean(bar.day) &&
    Number.isFinite(bar.open) && bar.open > 0 &&
    Number.isFinite(bar.high) && bar.high > 0 &&
    Number.isFinite(bar.low) && bar.low > 0 &&
    Number.isFinite(bar.close) && bar.close > 0
  )
  .sort((a, b) => a.day.localeCompare(b.day));

const calculateAtr = (bars: HistoricalBar[], index: number, period = 14): number => {
  if (index < period) return bars[index].close * 0.03;
  let total = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor++) {
    const previousClose = bars[cursor - 1]?.close || bars[cursor].close;
    total += Math.max(
      bars[cursor].high - bars[cursor].low,
      Math.abs(bars[cursor].high - previousClose),
      Math.abs(bars[cursor].low - previousClose),
    );
  }
  return total / period;
};

const classifyHistoricalRegime = (
  closes: number[],
  bars: HistoricalBar[],
  index: number,
): MarketRegime => {
  if (index < 20) return 'UNKNOWN';
  const ma5 = sma(closes, 5, index);
  const ma20 = sma(closes, 20, index);
  const return20 = closes[index - 20] > 0
    ? (closes[index] - closes[index - 20]) / closes[index - 20]
    : 0;
  const atrRate = closes[index] > 0 ? calculateAtr(bars, index) / closes[index] : 0;
  const trendUp = closes[index] > ma20 && ma5 > ma20 && return20 > 0.03;
  const trendDown = closes[index] < ma20 && ma5 < ma20 && return20 < -0.03;

  if (atrRate >= 0.055 || (Math.sign(return20) !== Math.sign(ma5 - ma20) && Math.abs(return20) > 0.02)) {
    return 'DIVERGENT';
  }
  if (trendUp) return 'RISK_ON';
  if (trendDown) return 'RISK_OFF';
  return 'NEUTRAL';
};

const regimeWeight = (historical: MarketRegime, current: MarketRegime) => {
  if (current === 'UNKNOWN') return historical === 'UNKNOWN' ? 0.7 : 0.8;
  if (historical === current) return 1;
  if (historical === 'UNKNOWN') return 0.55;
  if (historical === 'NEUTRAL' || current === 'NEUTRAL') return 0.7;
  if (historical === 'DIVERGENT' || current === 'DIVERGENT') return 0.5;
  return 0.3;
};

const recencyWeight = (barsSinceSignal: number) => {
  if (barsSinceSignal <= 120) return 1;
  if (barsSinceSignal <= 300) return 0.7;
  return 0.4;
};

const sampleLevelWeight: Record<HistoricalSampleLevel, number> = {
  STOCK: 1,
  SECTOR: 0.55,
  POOL: 0.25,
};

const resolveSampleLevel = (target: Stock, candidate: Stock): HistoricalSampleLevel => {
  if (target.code === candidate.code) return 'STOCK';
  if (target.concept && candidate.concept && target.concept === candidate.concept) return 'SECTOR';
  return 'POOL';
};

const isLongPatternTriggered = ({
  signalTitle,
  closes,
  volumes,
  bars,
  index,
}: {
  signalTitle: string;
  closes: number[];
  volumes: number[];
  bars: HistoricalBar[];
  index: number;
}) => {
  const current = closes[index];
  const previous = closes[index - 1];
  const ma5 = sma(closes, 5, index);
  const ma10 = sma(closes, 10, index);
  const ma20 = sma(closes, 20, index);
  const change = previous > 0 ? (current - previous) / previous : 0;
  const averageVolume5 = sma(volumes, 5, index);
  const isVolumeShrink = averageVolume5 > 0 && bars[index].volume < averageVolume5 * 0.7;
  const isVolumeHeavy = averageVolume5 > 0 && bars[index].volume > averageVolume5 * 1.5;
  const title = signalTitle.toLowerCase();
  const isWts = title.includes('弱转强') || title.includes('wts');
  const isBoomerang = title.includes('回马枪') || title.includes('return');
  const isSuck = title.includes('低吸') || title.includes('suck');
  const isAmbush = title.includes('伏击') || title.includes('ambush');
  const isSniper = title.includes('狙击') || title.includes('sniper');
  const isAssault = title.includes('突击') || title.includes('assault');

  if (isWts) return previous < closes[Math.max(0, index - 2)] && change > 0.02 && current > ma5;
  if (isBoomerang) return previous < sma(closes, 20, index - 1) && current > ma5 && change > 0.03;
  if (isSuck) return ma20 > 0 && Math.abs(current - ma20) / ma20 < 0.02 && isVolumeShrink;
  if (isAmbush) {
    return closes[index - 3] > closes[index - 2] && closes[index - 2] > previous && change > 0 && isVolumeHeavy;
  }
  if (isSniper) return ma5 > ma10 && ma10 > ma20 && current > ma5 * 0.99 && current < ma5 * 1.01;
  if (isAssault) return previous < sma(closes, 10, index - 1) && current > ma10 && isVolumeHeavy;
  return ma10 > 0 && Math.abs(current - ma10) / ma10 < 0.015 && change > 0;
};

const isExitPatternTriggered = ({
  signalTitle,
  closes,
  volumes,
  bars,
  index,
}: {
  signalTitle: string;
  closes: number[];
  volumes: number[];
  bars: HistoricalBar[];
  index: number;
}) => {
  const current = closes[index];
  const previous = closes[index - 1];
  const ma5 = sma(closes, 5, index);
  const previousMa5 = sma(closes, 5, index - 1);
  const ma10 = sma(closes, 10, index);
  const previousMa10 = sma(closes, 10, index - 1);
  const change = previous > 0 ? (current - previous) / previous : 0;
  const averageVolume5 = sma(volumes, 5, index);
  const isVolumeHeavy = averageVolume5 > 0 && bars[index].volume > averageVolume5 * 1.5;
  const recentHigh = Math.max(...bars.slice(Math.max(0, index - 19), index + 1).map(bar => bar.high));
  const trendBreak = current < ma5 && previous >= previousMa5 && ma5 <= previousMa5;
  const deeperTrendBreak = current < ma10 && previous >= previousMa10;
  const distribution = change < 0 && bars[index].close < bars[index].open && isVolumeHeavy;
  const topReversal = recentHigh > 0 && current >= recentHigh * 0.95 && change < -0.01;
  const hardDrop = change <= -0.025;
  const title = signalTitle.toLowerCase();

  if (/止盈|兑现|顶部|过热|冲高|鱼尾|逃顶/.test(title)) return topReversal || distribution;
  if (/止损|破位|死叉|雪崩|核按钮|风险|撤退/.test(title)) return trendBreak || deeperTrendBreak || hardDrop;
  if (/出货|派发|砸盘|诱多|埋人|烂板|炸板/.test(title)) return distribution || hardDrop || topReversal;
  return trendBreak || deeperTrendBreak || distribution || topReversal || hardDrop;
};

const collectSetups = ({
  target,
  candidate,
  signalTitle,
  direction,
  currentRegime,
}: {
  target: Stock;
  candidate: Stock;
  signalTitle: string;
  direction: HistoricalEvidenceDirection;
  currentRegime: MarketRegime;
}): HistoricalSetup[] => {
  const bars = normalizeHistory(candidate);
  if (bars.length < 30) return [];
  const closes = bars.map(bar => bar.close);
  const volumes = bars.map(bar => bar.volume);
  const level = resolveSampleLevel(target, candidate);
  const setups: HistoricalSetup[] = [];
  const requiredFutureBars = direction === 'LONG' ? 11 : 6;

  for (let index = 20; index < bars.length - requiredFutureBars; index++) {
    const triggered = direction === 'LONG'
      ? isLongPatternTriggered({ signalTitle, closes, volumes, bars, index })
      : isExitPatternTriggered({ signalTitle, closes, volumes, bars, index });
    if (!triggered) continue;

    const entryIndex = index + 1;
    const entryPrice = bars[entryIndex].open;
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) continue;
    if (direction === 'LONG') {
      const openingGap = (entryPrice - bars[index].close) / bars[index].close;
      if (openingGap >= resolveLimitPercent(candidate.code, candidate.name) - 0.005) continue;
    }

    const regime = classifyHistoricalRegime(closes, bars, index);
    const barsSinceSignal = bars.length - 1 - index;
    setups.push({
      stock: candidate,
      bars,
      signalIndex: index,
      entryIndex,
      entryPrice,
      localAtr: calculateAtr(bars, index),
      day: bars[index].day,
      regime,
      level,
      weight: sampleLevelWeight[level] * regimeWeight(regime, currentRegime) * recencyWeight(barsSinceSignal),
    });

    // Keep observations independent within a stock. A signal cannot create
    // another validation trade while its outcome window is still open.
    index += direction === 'LONG' ? 10 : 5;
  }

  return setups;
};

const simulateLongTrade = (setup: HistoricalSetup, stopMult: number) => {
  const stopPrice = setup.entryPrice - setup.localAtr * stopMult;
  const targetPrice = setup.entryPrice + setup.localAtr * 3;
  let exitPrice = setup.entryPrice;
  for (
    let index = setup.entryIndex + 1;
    index < Math.min(setup.entryIndex + 11, setup.bars.length);
    index++
  ) {
    const bar = setup.bars[index];
    if (bar.open <= stopPrice) {
      exitPrice = bar.open;
      break;
    }
    if (bar.low <= stopPrice) {
      exitPrice = stopPrice;
      break;
    }
    if (bar.high >= targetPrice) {
      exitPrice = targetPrice;
      break;
    }
    exitPrice = bar.close;
  }
  return ((exitPrice - setup.entryPrice) / setup.entryPrice - 0.002) * 100;
};

const simulateExitTrade = (setup: HistoricalSetup, horizonDays: number) => {
  const outcomeIndex = Math.min(setup.entryIndex + horizonDays - 1, setup.bars.length - 1);
  const holdPrice = setup.bars[outcomeIndex]?.close || setup.entryPrice;
  // Positive means selling avoided a subsequent loss. This is intentionally
  // measured against continuing to hold, not presented as short-sale profit.
  return ((setup.entryPrice - holdPrice) / setup.entryPrice - 0.001) * 100;
};

const summarizeWeightedTrades = (trades: WeightedTrade[]) => {
  const totalWeight = trades.reduce((sum, trade) => sum + trade.weight, 0);
  const positive = trades.filter(trade => trade.pctReturn > 0);
  const negative = trades.filter(trade => trade.pctReturn <= 0);
  const weighted = (items: WeightedTrade[], selector: (trade: WeightedTrade) => number) => {
    const weight = items.reduce((sum, trade) => sum + trade.weight, 0);
    return weight > 0 ? items.reduce((sum, trade) => sum + selector(trade) * trade.weight, 0) / weight : 0;
  };
  const grossProfit = positive.reduce((sum, trade) => sum + trade.pctReturn * trade.weight, 0);
  const grossLoss = Math.abs(negative.reduce((sum, trade) => sum + trade.pctReturn * trade.weight, 0));
  const sumSquaredWeights = trades.reduce((sum, trade) => sum + trade.weight ** 2, 0);
  const effectiveSampleSize = sumSquaredWeights > 0 ? (totalWeight ** 2) / sumSquaredWeights : 0;
  const recentWeight = trades.filter(trade => trade.isRecent).reduce((sum, trade) => sum + trade.weight, 0);

  return {
    sampleSize: Math.floor(effectiveSampleSize),
    effectiveSampleSize,
    winRate: totalWeight > 0
      ? (positive.reduce((sum, trade) => sum + trade.weight, 0) / totalWeight) * 100
      : 0,
    avgWinPct: weighted(positive, trade => trade.pctReturn),
    avgLossPct: Math.abs(weighted(negative, trade => trade.pctReturn)),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
    expectancy: weighted(trades, trade => trade.pctReturn),
    recentSampleShare: totalWeight > 0 ? recentWeight / totalWeight : 0,
  };
};

const toWeightedTrade = (setup: HistoricalSetup, pctReturn: number): WeightedTrade => ({
  pctReturn,
  weight: setup.weight,
  level: setup.level,
  regime: setup.regime,
  isRecent: setup.bars.length - 1 - setup.signalIndex <= 120,
});

export const buildHistoricalPatternEvidence = ({
  stock,
  peerStocks = [],
  signalTitle,
  direction,
  marketRegime,
}: {
  stock: Stock;
  peerStocks?: Stock[];
  signalTitle: string;
  direction: HistoricalEvidenceDirection;
  marketRegime: MarketRegime;
}): HistoricalPatternEvidence | null => {
  const uniqueCandidates = [...new Map(
    [stock, ...peerStocks]
      .filter(candidate => (candidate.history?.length || 0) >= 30)
      .slice(0, 30)
      .map(candidate => [candidate.code, candidate]),
  ).values()];
  const setups = uniqueCandidates
    .flatMap(candidate => collectSetups({
      target: stock,
      candidate,
      signalTitle,
      direction,
      currentRegime: marketRegime,
    }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.stock.code.localeCompare(b.stock.code));
  if (setups.length < 10) return null;

  let trades: WeightedTrade[] = [];
  let optimalStopMult = 0;
  if (direction === 'LONG') {
    const stopCandidates = [1, 1.25, 1.5, 1.75, 2, 2.5];
    const chosenStops: number[] = [];
    const running = new Map(stopCandidates.map(stopMult => [stopMult, {
      totalWeight: 0,
      weightedReturn: 0,
      grossProfit: 0,
      grossLoss: 0,
    }]));
    let trainingCount = 0;
    for (let start = 0; start < setups.length;) {
      let end = start + 1;
      while (end < setups.length && setups[end].day === setups[start].day) end++;
      const sameDaySetups = setups.slice(start, end);

      if (trainingCount >= 10) {
        const selectedStop = stopCandidates
          .map(stopMult => {
            const stats = running.get(stopMult)!;
            return {
              stopMult,
              expectancy: stats.totalWeight > 0 ? stats.weightedReturn / stats.totalWeight : 0,
              profitFactor: stats.grossLoss > 0
                ? stats.grossProfit / stats.grossLoss
                : stats.grossProfit > 0 ? 99 : 0,
            };
          })
          .sort((a, b) =>
            b.expectancy - a.expectancy ||
            b.profitFactor - a.profitFactor ||
            a.stopMult - b.stopMult
          )[0]?.stopMult;
        if (selectedStop) {
          sameDaySetups.forEach(setup => {
            chosenStops.push(selectedStop);
            trades.push(toWeightedTrade(setup, simulateLongTrade(setup, selectedStop)));
          });
        }
      }

      // Add the day's outcomes only after scoring every setup from that day,
      // preventing cross-sectional same-day leakage.
      sameDaySetups.forEach(setup => {
        stopCandidates.forEach(stopMult => {
          const pctReturn = simulateLongTrade(setup, stopMult);
          const stats = running.get(stopMult)!;
          stats.totalWeight += setup.weight;
          stats.weightedReturn += pctReturn * setup.weight;
          if (pctReturn > 0) stats.grossProfit += pctReturn * setup.weight;
          else stats.grossLoss += Math.abs(pctReturn * setup.weight);
        });
      });
      trainingCount += sameDaySetups.length;
      start = end;
    }
    if (chosenStops.length) {
      const sortedStops = [...chosenStops].sort((a, b) => a - b);
      optimalStopMult = sortedStops[Math.floor(sortedStops.length / 2)];
    }
  } else {
    trades = setups.map(setup => toWeightedTrade(setup, simulateExitTrade(setup, 5)));
  }

  if (trades.length < 10) return null;
  const summary = summarizeWeightedTrades(trades);
  if (summary.sampleSize < 3) return null;
  const countLevel = (level: HistoricalSampleLevel) => trades.filter(trade => trade.level === level).length;
  const horizonEvidence = direction === 'EXIT'
    ? [1, 3, 5, 10].map(horizonDays => {
        const horizonTrades = setups
          .filter(setup => setup.entryIndex + horizonDays - 1 < setup.bars.length)
          .map(setup => toWeightedTrade(setup, simulateExitTrade(setup, horizonDays)));
        const horizonSummary = summarizeWeightedTrades(horizonTrades);
        return {
          horizonDays,
          sampleSize: horizonSummary.sampleSize,
          winRate: round(horizonSummary.winRate, 1),
          expectancy: round(horizonSummary.expectancy, 2),
        };
      })
    : undefined;

  return {
    sampleSize: summary.sampleSize,
    winRate: round(summary.winRate, 1),
    avgWinPct: round(summary.avgWinPct, 2),
    avgLossPct: round(summary.avgLossPct, 2),
    optimalStopMult: round(optimalStopMult, 2),
    profitFactor: round(clamp(summary.profitFactor, 0, 99), 2),
    expectancy: round(summary.expectancy, 2),
    direction,
    validationType: 'REGIME_WEIGHTED_WALK_FORWARD',
    marketRegime,
    exactRegimeSampleSize: trades.filter(trade => trade.regime === marketRegime).length,
    totalSampleSize: trades.length,
    effectiveSampleSize: round(summary.effectiveSampleSize, 1),
    ownStockSampleSize: countLevel('STOCK'),
    sectorSampleSize: countLevel('SECTOR'),
    poolSampleSize: countLevel('POOL'),
    recentSampleShare: round(summary.recentSampleShare * 100, 1),
    horizonDays: direction === 'EXIT' ? 5 : 10,
    horizonEvidence,
  };
};
