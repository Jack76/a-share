import { getChinaTradingClock, type MarketTimestamp } from './marketClock.ts';

export type FundReliability = 'LOW' | 'MEDIUM' | 'HIGH';
export type FundCalibrationStatus = 'UNVALIDATED' | 'LIMITED' | 'OUT_OF_SAMPLE';
export type FundDataStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE';

export interface FundHistoryPoint {
  day: string;
  close: number;
  high?: number;
  low?: number;
  accumulated?: number;
}

export interface FundTrendPrediction {
  targetHigh: number;
  targetLow: number;
  trendStrength: number;
  confidence: number;
  direction: 'Bull' | 'Bear' | 'Neutral';
  dataReliability: FundReliability;
  evidenceReliability: FundReliability;
  calibrationStatus: FundCalibrationStatus;
  sampleSize: number;
  winRate: number;
  brierScore: number | null;
}

export interface FundBenchmarkIndex {
  code: string;
  name: string;
  changePercent: number;
}

export interface FundBenchmark {
  code: string;
  name: string;
  changePercent: number;
}

export interface FundDataFreshness {
  status: FundDataStatus;
  sourceTimestamp: number | null;
  ageMs: number | null;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const fitSlope = (closes: number[]) => {
  if (closes.length < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  closes.forEach((close, index) => {
    sumX += index;
    sumY += close;
    sumXY += index * close;
    sumXX += index * index;
  });
  const denominator = closes.length * sumXX - sumX * sumX;
  return denominator === 0
    ? 0
    : (closes.length * sumXY - sumX * sumY) / denominator;
};

const validHistory = (history: FundHistoryPoint[]) =>
  history.filter(point => Number.isFinite(point.close) && point.close > 0);

export const predictFundPriceAction = (
  history: FundHistoryPoint[],
  currentPrice: number,
  atr: number,
  lookbackDays = 20,
): FundTrendPrediction => {
  const clean = validHistory(history);
  const finitePrice = Number.isFinite(currentPrice) && currentPrice > 0
    ? currentPrice
    : clean.at(-1)?.close || 0;
  const dataReliability: FundReliability = clean.length >= 120
    ? 'HIGH'
    : clean.length >= 60
      ? 'MEDIUM'
      : 'LOW';

  if (finitePrice <= 0 || clean.length < lookbackDays) {
    return {
      targetHigh: finitePrice,
      targetLow: finitePrice,
      trendStrength: 50,
      confidence: 50,
      direction: 'Neutral',
      dataReliability,
      evidenceReliability: 'LOW',
      calibrationStatus: 'UNVALIDATED',
      sampleSize: 0,
      winRate: 50,
      brierScore: null,
    };
  }

  const recentCloses = clean.slice(-lookbackDays).map(point => point.close);
  const slope = fitSlope(recentCloses);
  const slopePct = finitePrice > 0 ? slope / finitePrice : 0;
  const direction = slopePct > 0.001
    ? 'Bull'
    : slopePct < -0.001
      ? 'Bear'
      : 'Neutral';
  const trendStrength = clamp(50 + slopePct * 5_000, 0, 100);

  let sampleSize = 0;
  let wins = 0;
  let brierTotal = 0;
  const start = Math.max(lookbackDays, clean.length - 120);
  for (let index = start; index < clean.length; index++) {
    const training = clean
      .slice(index - lookbackDays, index)
      .map(point => point.close);
    const trainingPrice = training.at(-1) || 0;
    const trainingSlope = fitSlope(training);
    const trainingSlopePct = trainingPrice > 0 ? trainingSlope / trainingPrice : 0;
    if (Math.abs(trainingSlopePct) < 0.0005) continue;

    const predictedUp = trainingSlopePct > 0;
    const outcomeUp = clean[index].close > clean[index - 1].close;
    const probabilityUp = predictedUp
      ? 0.5 + Math.min(0.35, Math.abs(trainingSlopePct) * 40)
      : 0.5 - Math.min(0.35, Math.abs(trainingSlopePct) * 40);
    sampleSize++;
    if (predictedUp === outcomeUp) wins++;
    brierTotal += (probabilityUp - (outcomeUp ? 1 : 0)) ** 2;
  }

  const priorSamples = 20;
  const winRate = sampleSize > 0
    ? ((wins + priorSamples * 0.5) / (sampleSize + priorSamples)) * 100
    : 50;
  const evidenceReliability: FundReliability = sampleSize >= 30
    ? 'HIGH'
    : sampleSize >= 10
      ? 'MEDIUM'
      : 'LOW';
  const calibrationStatus: FundCalibrationStatus = sampleSize >= 30
    ? 'OUT_OF_SAMPLE'
    : sampleSize >= 10
      ? 'LIMITED'
      : 'UNVALIDATED';
  const dataWeight = dataReliability === 'HIGH' ? 1 : dataReliability === 'MEDIUM' ? 0.7 : 0.35;
  const evidenceWeight = evidenceReliability === 'HIGH' ? 1 : evidenceReliability === 'MEDIUM' ? 0.65 : 0.25;
  const directionalEdge = Math.min(35, Math.abs(slopePct) * 5_000);
  const historicalSkill = clamp((winRate - 45) / 20, 0, 1);
  const confidence = direction === 'Neutral'
    ? 50
    : clamp(50 + directionalEdge * dataWeight * evidenceWeight * historicalSkill, 50, 85);

  const finiteAtr = Number.isFinite(atr) && atr > 0 ? atr : finitePrice * 0.02;
  const projected = finitePrice + slope * 3;
  const targetHigh = Math.max(finitePrice * 0.01, projected + finiteAtr * 1.5);
  const targetLow = Math.max(finitePrice * 0.01, projected - finiteAtr * 1.5);

  return {
    targetHigh: Math.max(targetHigh, targetLow),
    targetLow: Math.min(targetHigh, targetLow),
    trendStrength,
    confidence,
    direction,
    dataReliability,
    evidenceReliability,
    calibrationStatus,
    sampleSize,
    winRate,
    brierScore: sampleSize > 0 ? brierTotal / sampleSize : null,
  };
};

const parseChinaTimestamp = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)) {
    return Date.parse(`${trimmed.replace(/\s+/, 'T')}+08:00`);
  }
  return Date.parse(trimmed);
};

export const evaluateFundDataFreshness = (
  sourceAsOf: string | number | undefined,
  now: MarketTimestamp = Date.now(),
  isExchangeTraded = false,
): FundDataFreshness => {
  const nowMs = getChinaTradingClock(now).timestampMs;
  const sourceTimestamp = typeof sourceAsOf === 'number'
    ? sourceAsOf
    : typeof sourceAsOf === 'string'
      ? parseChinaTimestamp(sourceAsOf)
      : NaN;
  if (!Number.isFinite(sourceTimestamp) || sourceTimestamp <= 0 || sourceTimestamp > nowMs + 300_000) {
    return { status: 'UNAVAILABLE', sourceTimestamp: null, ageMs: null };
  }

  const clock = getChinaTradingClock(nowMs);
  const minutes = clock.hour * 60 + clock.minute;
  const isSession = clock.isTradingDay && (
    (minutes >= 9 * 60 + 15 && minutes <= 11 * 60 + 35) ||
    (minutes >= 12 * 60 + 55 && minutes <= 15 * 60 + 5)
  );
  const ageMs = Math.max(0, nowMs - sourceTimestamp);
  const allowedAgeMs = isSession
    ? isExchangeTraded
      ? 3 * 60_000
      : 30 * 60_000
    : 7 * 24 * 60 * 60_000;
  return {
    status: ageMs <= allowedAgeMs ? 'FRESH' : 'STALE',
    sourceTimestamp,
    ageMs,
  };
};

export const resolveFundBenchmark = (
  category: string,
  indices: FundBenchmarkIndex[],
): FundBenchmark | undefined => {
  if (/美股|纳指|港股|恒科|日韩|亚太|债券|固收|黄金|贵金属/.test(category)) {
    return undefined;
  }
  const preferredCode = /科创/.test(category)
    ? 'sh000688'
    : /创业板/.test(category)
      ? 'sz399006'
      : /中证500/.test(category)
        ? 'sh000905'
        : /中证1000|微盘|量化/.test(category)
          ? 'sh000852'
          : 'sh000300';
  const index = indices.find(item => item.code === preferredCode);
  return index && Number.isFinite(index.changePercent)
    ? {
      code: index.code,
      name: index.name,
      changePercent: index.changePercent,
    }
    : undefined;
};
