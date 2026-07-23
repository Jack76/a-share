import type { Stock } from '../types';

export type CapitalFlowSignal =
  | 'CONFIRMED_INFLOW'
  | 'CONFIRMED_OUTFLOW'
  | 'DIRECT_INFLOW'
  | 'DIRECT_OUTFLOW'
  | 'CONFLICT'
  | 'NEUTRAL'
  | 'PROXY_ONLY'
  | 'UNAVAILABLE';

export interface CapitalFlowAssessment {
  directNetYuan?: number;
  proxyPressureYuan?: number;
  turnoverYuan?: number;
  directRatio?: number;
  signal: CapitalFlowSignal;
  source: 'EASTMONEY_LARGE_ORDER' | 'LEGACY_LARGE_ORDER' | 'OHLCV_PROXY' | 'NONE';
  asOf?: string;
}

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const calculateVolumePricePressureYuan = (
  history: Stock['history'],
): number | undefined => {
  if (!history || history.length < 2) return undefined;

  let weightedPressure = 0;
  let totalWeight = 0;
  history.slice(-5).forEach((bar, index) => {
    const open = finiteNumber(bar.open);
    const high = finiteNumber(bar.high);
    const low = finiteNumber(bar.low);
    const close = finiteNumber(bar.close);
    const volume = finiteNumber(bar.volume);
    if (
      open === undefined || high === undefined || low === undefined ||
      close === undefined || volume === undefined || volume <= 0
    ) return;

    const range = high - low;
    const multiplier = range === 0
      ? close > open ? 1 : close < open ? -1 : 0
      : ((close - low) - (high - close)) / range;
    const weight = 1 + index * 0.25;
    const averagePrice = (open + high + low + close) / 4;
    weightedPressure += volume * 100 * averagePrice * multiplier * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedPressure / totalWeight : undefined;
};

export const getTurnoverYuan = (stock: Stock): number | undefined => {
  const reported = [
    finiteNumber(stock.turnoverAmount),
    finiteNumber(stock.turnover),
    finiteNumber(stock.amount),
  ].find(value => value !== undefined && value > 0);
  if (reported !== undefined) return reported;

  const volume = finiteNumber(stock.volume);
  const price = finiteNumber(stock.currentPrice);
  return volume !== undefined && volume > 0 && price !== undefined && price > 0
    ? volume * 100 * price
    : undefined;
};

export const getDirectLargeOrderNetYuan = (stock: Stock): number | undefined => {
  const canonical = finiteNumber(stock.largeOrderNetYuan);
  if (canonical !== undefined) return canonical;

  // Compatibility for quotes returned by an older edge-function deployment.
  const legacy = finiteNumber(stock.mainMoneyIn);
  return legacy !== undefined && legacy !== 0 ? legacy : undefined;
};

const materialDirection = (value: number | undefined, threshold: number) => {
  if (value === undefined || Math.abs(value) < threshold) return 0;
  return value > 0 ? 1 : -1;
};

export const assessCapitalFlow = (stock: Stock): CapitalFlowAssessment => {
  const directNetYuan = getDirectLargeOrderNetYuan(stock);
  const proxyPressureYuan = calculateVolumePricePressureYuan(stock.history);
  const turnoverYuan = getTurnoverYuan(stock);
  const materialThreshold = Math.max(1_000_000, (turnoverYuan || 0) * 0.002);
  const directDirection = materialDirection(directNetYuan, materialThreshold);
  const proxyDirection = materialDirection(proxyPressureYuan, materialThreshold);
  const directRatio = directNetYuan !== undefined && turnoverYuan
    ? directNetYuan / turnoverYuan
    : undefined;

  let signal: CapitalFlowSignal = 'UNAVAILABLE';
  if (directNetYuan === undefined && proxyPressureYuan !== undefined) signal = 'PROXY_ONLY';
  else if (directNetYuan !== undefined) {
    if (directDirection === 0) signal = 'NEUTRAL';
    else if (proxyDirection !== 0 && proxyDirection !== directDirection) signal = 'CONFLICT';
    else if (directDirection > 0) {
      signal = proxyDirection > 0 ? 'CONFIRMED_INFLOW' : 'DIRECT_INFLOW';
    } else {
      signal = proxyDirection < 0 ? 'CONFIRMED_OUTFLOW' : 'DIRECT_OUTFLOW';
    }
  }

  return {
    directNetYuan,
    proxyPressureYuan,
    turnoverYuan,
    directRatio,
    signal,
    source: stock.largeOrderNetSource === 'eastmoney-f62'
      ? 'EASTMONEY_LARGE_ORDER'
      : directNetYuan !== undefined
        ? 'LEGACY_LARGE_ORDER'
        : proxyPressureYuan !== undefined
          ? 'OHLCV_PROXY'
          : 'NONE',
    asOf: stock.largeOrderNetAsOf || stock.sourceAsOf,
  };
};

export const formatCapitalFlowYuan = (value: number | undefined): string => {
  if (value === undefined) return '--';
  const absolute = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  if (absolute >= 100_000_000) return `${sign}${(absolute / 100_000_000).toFixed(2)}亿`;
  if (absolute >= 10_000) return `${sign}${(absolute / 10_000).toFixed(0)}万`;
  return `${sign}${absolute.toFixed(0)}`;
};
