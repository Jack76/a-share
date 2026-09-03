import type { Stock } from '../types';
import { assessCapitalFlow } from './capitalFlow.ts';
import {
  resolveMarketRegime,
  type MarketCalibrationContext,
  type MarketRegime,
} from './predictionCalibration.ts';

/**
 * A 股截面因子层。
 *
 * 这不是“主力识别器”，也不把任何单一指标包装成确定性预测。它只把
 * 当前可获得的历史、流动性和资金流数据转成同一截面内可比较的分位数，
 * 再按市场状态动态配权。缺失数据会降低 coverage，而不是用 0 分冒充
 * 弱势，这一点对全市场扫描尤其重要。
 */
export type AShareFactorName =
  | 'MOMENTUM'
  | 'RELATIVE_STRENGTH'
  | 'REVERSAL'
  | 'LOW_VOLATILITY'
  | 'LIQUIDITY'
  | 'CAPITAL_FLOW';

export type AShareFactorSource =
  | 'HISTORY'
  | 'TECHNICAL'
  | 'QUOTE'
  | 'DIRECT_FLOW'
  | 'PROXY_FLOW'
  | 'MISSING';

export interface AShareFactorProfile {
  score: number;
  /** 0-1，表示加权因子数据的有效覆盖率。 */
  coverage: number;
  regime: MarketRegime;
  breakdown: Partial<Record<AShareFactorName, number>>;
  sources: Partial<Record<AShareFactorName, AShareFactorSource>>;
  warnings: string[];
}

export const ASHARE_FACTOR_LABELS: Record<AShareFactorName, string> = {
  MOMENTUM: '动量',
  RELATIVE_STRENGTH: '相对强度',
  REVERSAL: '短线反转',
  LOW_VOLATILITY: '低波动',
  LIQUIDITY: '流动性',
  CAPITAL_FLOW: '资金流',
};

const FACTOR_NAMES: AShareFactorName[] = [
  'MOMENTUM',
  'RELATIVE_STRENGTH',
  'REVERSAL',
  'LOW_VOLATILITY',
  'LIQUIDITY',
  'CAPITAL_FLOW',
];

type FactorWeights = Record<AShareFactorName, number>;

const REGIME_WEIGHTS: Record<MarketRegime, FactorWeights> = {
  RISK_ON: {
    MOMENTUM: 0.28,
    RELATIVE_STRENGTH: 0.24,
    CAPITAL_FLOW: 0.22,
    LOW_VOLATILITY: 0.08,
    REVERSAL: 0.08,
    LIQUIDITY: 0.10,
  },
  NEUTRAL: {
    MOMENTUM: 0.20,
    RELATIVE_STRENGTH: 0.18,
    CAPITAL_FLOW: 0.22,
    LOW_VOLATILITY: 0.16,
    REVERSAL: 0.14,
    LIQUIDITY: 0.10,
  },
  RISK_OFF: {
    MOMENTUM: 0.10,
    RELATIVE_STRENGTH: 0.12,
    CAPITAL_FLOW: 0.25,
    LOW_VOLATILITY: 0.24,
    REVERSAL: 0.19,
    LIQUIDITY: 0.10,
  },
  DIVERGENT: {
    MOMENTUM: 0.12,
    RELATIVE_STRENGTH: 0.14,
    CAPITAL_FLOW: 0.25,
    LOW_VOLATILITY: 0.24,
    REVERSAL: 0.15,
    LIQUIDITY: 0.10,
  },
  UNKNOWN: {
    MOMENTUM: 0.16,
    RELATIVE_STRENGTH: 0.16,
    CAPITAL_FLOW: 0.18,
    LOW_VOLATILITY: 0.20,
    REVERSAL: 0.18,
    LIQUIDITY: 0.12,
  },
};

interface RawFactorValue {
  value?: number;
  source: AShareFactorSource;
  /** 代理数据只贡献部分权重，防止“有数据”被误读成“高质量数据”。 */
  quality: number;
}

type RawFactorMap = Record<AShareFactorName, RawFactorValue>;

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const chronologicalHistory = (stock: Stock) => {
  const history = stock.history || [];
  if (history.length < 2) return history;
  // Upstream data is normally sorted, but a stable copy prevents one malformed
  // response from turning a return factor into a look-ahead signal.
  let sorted = true;
  for (let index = 1; index < history.length; index++) {
    if (history[index - 1].day > history[index].day) {
      sorted = false;
      break;
    }
  }
  return sorted ? history : [...history].sort((a, b) => a.day.localeCompare(b.day));
};

const resolveCurrentPrice = (stock: Stock, history: Stock['history']) => {
  const quote = finite(stock.currentPrice);
  if (quote !== undefined && quote > 0) return quote;
  const close = finite(history?.at(-1)?.close);
  return close !== undefined && close > 0 ? close : undefined;
};

const returnOver = (stock: Stock, period: number): { value?: number; source: AShareFactorSource } => {
  const history = chronologicalHistory(stock);
  const current = resolveCurrentPrice(stock, history);
  if (!current || !history || history.length <= period) {
    const ma = period <= 5 ? finite(stock.technicals?.ma5) : finite(stock.technicals?.ma20);
    if (current && ma && ma > 0) return { value: current / ma - 1, source: 'TECHNICAL' };
    return { source: 'MISSING' };
  }
  const anchor = finite(history[history.length - 1 - period]?.close);
  if (!anchor || anchor <= 0) return { source: 'MISSING' };
  return { value: current / anchor - 1, source: 'HISTORY' };
};

const calculateRealizedVolatility = (stock: Stock): { value?: number; source: AShareFactorSource } => {
  const history = chronologicalHistory(stock);
  if (history && history.length >= 12) {
    const closes = history.slice(-21).map(bar => finite(bar.close)).filter((value): value is number =>
      value !== undefined && value > 0,
    );
    if (closes.length >= 12) {
      const returns: number[] = [];
      for (let index = 1; index < closes.length; index++) {
        returns.push(closes[index] / closes[index - 1] - 1);
      }
      const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
      const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
      return { value: Math.sqrt(Math.max(0, variance)), source: 'HISTORY' };
    }
  }
  const current = resolveCurrentPrice(stock, history);
  const atr = finite(stock.technicals?.atr);
  if (current && current > 0 && atr !== undefined && atr > 0) {
    return { value: atr / current, source: 'TECHNICAL' };
  }
  return { source: 'MISSING' };
};

const calculateRawFactors = (stock: Stock): RawFactorMap => {
  const shortReturn = returnOver(stock, 5);
  const mediumReturn = returnOver(stock, 20);
  const oneDayReturn = finite(stock.changePercent) !== undefined
    ? (stock.changePercent || 0) / 100
    : (() => {
      const history = chronologicalHistory(stock);
      const latest = finite(history?.at(-1)?.close);
      const previous = finite(history?.at(-2)?.close);
      return latest && previous && previous > 0 ? latest / previous - 1 : undefined;
    })();
  const volatility = calculateRealizedVolatility(stock);
  const turnover = finite(stock.turnoverAmount) ?? finite(stock.turnover) ?? finite(stock.amount);
  const turnoverRate = finite(stock.turnoverRate);
  const volume = finite(stock.volume);
  const price = resolveCurrentPrice(stock, chronologicalHistory(stock));
  const turnoverValue = turnover && turnover > 0
    ? turnover
    : volume && price && volume > 0 && price > 0
      ? volume * price * 100
      : turnoverRate && turnoverRate > 0 ? turnoverRate : undefined;
  const flow = assessCapitalFlow(stock);

  const momentum = shortReturn.value !== undefined && mediumReturn.value !== undefined
    ? shortReturn.value * 0.4 + mediumReturn.value * 0.6
    : shortReturn.value ?? mediumReturn.value;
  const momentumSource = shortReturn.value !== undefined && mediumReturn.value !== undefined
    ? (shortReturn.source === 'HISTORY' && mediumReturn.source === 'HISTORY' ? 'HISTORY' : 'TECHNICAL')
    : shortReturn.value !== undefined ? shortReturn.source : mediumReturn.source;

  return {
    MOMENTUM: { value: momentum, source: momentumSource as AShareFactorSource, quality: momentum === undefined ? 0 : 1 },
    // Cross-sectional ranking supplies the “relative” part. The raw input is
    // excess return versus the local time-series anchor.
    RELATIVE_STRENGTH: { value: mediumReturn.value, source: mediumReturn.source, quality: mediumReturn.value === undefined ? 0 : 1 },
    // Positive score means a recent decline is eligible for a rebound; the
    // ensemble can still down-weight it in risk-on conditions.
    REVERSAL: { value: oneDayReturn === undefined ? undefined : -oneDayReturn, source: oneDayReturn === undefined ? 'MISSING' : stock.changePercent !== undefined ? 'QUOTE' : 'HISTORY', quality: oneDayReturn === undefined ? 0 : 1 },
    // Lower realized volatility is preferred, hence the negative raw value.
    LOW_VOLATILITY: { value: volatility.value === undefined ? undefined : -volatility.value, source: volatility.source, quality: volatility.value === undefined ? 0 : 1 },
    LIQUIDITY: { value: turnoverValue && turnoverValue > 0 ? Math.log1p(turnoverValue) : undefined, source: turnoverValue === undefined ? 'MISSING' : (turnover !== undefined || turnoverRate !== undefined || volume !== undefined) ? 'QUOTE' : 'TECHNICAL', quality: turnoverValue === undefined ? 0 : 1 },
    CAPITAL_FLOW: {
      value: flow.directRatio ?? (flow.proxyPressureYuan !== undefined && flow.turnoverYuan && flow.turnoverYuan > 0
        ? flow.proxyPressureYuan / flow.turnoverYuan
        : undefined),
      source: flow.directRatio !== undefined ? 'DIRECT_FLOW' : flow.proxyPressureYuan !== undefined ? 'PROXY_FLOW' : 'MISSING',
      quality: flow.directRatio !== undefined ? 1 : flow.proxyPressureYuan !== undefined ? 0.55 : 0,
    },
  };
};

const percentileRanks = (values: Map<string, number>) => {
  const ordered = [...values.entries()].sort((a, b) => a[1] - b[1]);
  const ranks = new Map<string, number>();
  let index = 0;
  while (index < ordered.length) {
    let end = index;
    while (end + 1 < ordered.length && ordered[end + 1][1] === ordered[index][1]) end++;
    const percentile = ordered.length <= 1
      ? 0.5
      : ((index + end) / 2) / (ordered.length - 1);
    for (let cursor = index; cursor <= end; cursor++) ranks.set(ordered[cursor][0], percentile);
    index = end + 1;
  }
  return ranks;
};

const neutralizedRanks = (
  stocks: Stock[],
  values: Map<string, number>,
) => {
  const global = percentileRanks(values);
  const grouped = new Map<string, Map<string, number>>();
  for (const stock of stocks) {
    const value = values.get(stock.code);
    if (value === undefined) continue;
    const group = stock.concept?.trim() || '__NO_SECTOR__';
    const bucket = grouped.get(group) || new Map<string, number>();
    bucket.set(stock.code, value);
    grouped.set(group, bucket);
  }
  const result = new Map<string, number>();
  for (const stock of stocks) {
    const globalRank = global.get(stock.code);
    if (globalRank === undefined) continue;
    const group = stock.concept?.trim() || '__NO_SECTOR__';
    const groupValues = grouped.get(group);
    const groupRank = groupValues && groupValues.size >= 3
      ? percentileRanks(groupValues).get(stock.code)
      : undefined;
    // 65% sector-neutral rank + 35% whole-market rank avoids making a tiny
    // two-name concept look like a robust leader.
    const rank = groupRank === undefined ? globalRank : groupRank * 0.65 + globalRank * 0.35;
    result.set(stock.code, rank);
  }
  return result;
};

const emptyProfile = (regime: MarketRegime): AShareFactorProfile => ({
  score: 50,
  coverage: 0,
  regime,
  breakdown: {},
  sources: {},
  warnings: ['有效量化因子不足，仅作参考'],
});

/**
 * Build one factor profile per stock. This function is intentionally pure:
 * callers can run it for a live cross-section or for each point-in-time replay
 * snapshot without sharing future information between dates.
 */
export const buildAShareFactorProfiles = (
  stocks: Stock[],
  marketContext?: MarketCalibrationContext,
): Map<string, AShareFactorProfile> => {
  const regime = resolveMarketRegime(marketContext);
  const weights = REGIME_WEIGHTS[regime];
  const rawByCode = new Map<string, RawFactorMap>();
  const profiles = new Map<string, AShareFactorProfile>();

  for (const stock of stocks) rawByCode.set(stock.code, calculateRawFactors(stock));

  const ranksByFactor = new Map<AShareFactorName, Map<string, number>>();
  for (const factor of FACTOR_NAMES) {
    const values = new Map<string, number>();
    for (const [code, raw] of rawByCode) {
      if (raw[factor].value !== undefined && Number.isFinite(raw[factor].value)) {
        values.set(code, raw[factor].value as number);
      }
    }
    ranksByFactor.set(factor, neutralizedRanks(stocks, values));
  }

  for (const stock of stocks) {
    const raw = rawByCode.get(stock.code) || calculateRawFactors(stock);
    const breakdown: Partial<Record<AShareFactorName, number>> = {};
    const sources: Partial<Record<AShareFactorName, AShareFactorSource>> = {};
    let weightedScore = 0;
    let availableWeight = 0;
    let totalWeight = 0;
    for (const factor of FACTOR_NAMES) {
      const weight = weights[factor];
      totalWeight += weight;
      const item = raw[factor];
      sources[factor] = item.source;
      const rank = ranksByFactor.get(factor)?.get(stock.code);
      if (rank === undefined || item.quality <= 0) continue;
      const factorScore = clamp(rank * 100, 0, 100);
      breakdown[factor] = round(factorScore);
      const effectiveWeight = weight * clamp(item.quality, 0, 1);
      weightedScore += factorScore * effectiveWeight;
      availableWeight += effectiveWeight;
    }

    if (availableWeight <= 0) {
      profiles.set(stock.code, emptyProfile(regime));
      continue;
    }

    const coverage = clamp(availableWeight / totalWeight, 0, 1);
    const warnings: string[] = [];
    if (coverage < 0.45) warnings.push('量化因子覆盖不足，已降低其对预测的影响');
    if (sources.CAPITAL_FLOW === 'PROXY_FLOW') warnings.push('资金流为量价代理，不等同于主力身份识别');
    if (sources.CAPITAL_FLOW === 'MISSING') warnings.push('缺少可验证资金流，资金因子未参与评分');
    profiles.set(stock.code, {
      score: round(clamp(weightedScore / availableWeight, 0, 100)),
      coverage: round(coverage, 3),
      regime,
      breakdown,
      sources,
      warnings,
    });
  }

  return profiles;
};
