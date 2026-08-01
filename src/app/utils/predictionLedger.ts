import type { Stock } from '../types.ts';
import { getChinaTradingClock } from './marketClock.ts';

export const PREDICTION_LEDGER_KEY = 'dragon-quant-prediction-ledger-v1';
export const PREDICTION_MODEL_VERSION = 'predator-rules-v69.0';

export interface PredictionLedgerEntry {
  id: string;
  modelVersion: string;
  stockCode: string;
  stockName: string;
  signalDate: string;
  createdAt: number;
  sourceAsOf?: string;
  signalType: 'BUY' | 'SELL';
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  probability: number;
  confidenceLow?: number;
  confidenceHigh?: number;
  reliability?: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceReliability?: 'LOW' | 'MEDIUM' | 'HIGH';
  marketDataStatus?: 'FRESH' | 'PARTIAL' | 'STALE' | 'UNAVAILABLE';
  sampleSize: number;
  signalPrice: number;
  targetHigh?: number;
  targetLow?: number;
  stopLoss?: number;
  horizonTradingDays: 5;
  status: 'PENDING' | 'RESOLVED';
  resolvedAt?: number;
  evaluationPrice?: number;
  returnPct?: number;
  outcome?: 'CORRECT' | 'INCORRECT' | 'FLAT';
  resolutionReason?: 'TARGET' | 'STOP' | 'HORIZON';
}

const parseLedger = (raw: string | null): PredictionLedgerEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const readPredictionLedger = (): PredictionLedgerEntry[] => {
  if (typeof localStorage === 'undefined') return [];
  return parseLedger(localStorage.getItem(PREDICTION_LEDGER_KEY));
};

export const isPredictionLedgerSourceUsable = (
  sourceAsOf: string | undefined,
  now = Date.now(),
) => {
  if (!sourceAsOf) return false;
  const sourceMs = Date.parse(sourceAsOf);
  if (!Number.isFinite(sourceMs)) return false;
  const ageMs = now - sourceMs;
  if (ageMs < -60_000) return false;
  const maxAgeMs = getChinaTradingClock(now).isMarketOpen
    ? 5 * 60_000
    : 7 * 24 * 60 * 60_000;
  return ageMs <= maxAgeMs;
};

const resolveEntry = (
  entry: PredictionLedgerEntry,
  stock: Stock | undefined,
  now: number,
): PredictionLedgerEntry => {
  if (entry.status === 'RESOLVED' || !stock?.history?.length) return entry;
  const futureBars = stock.history
    .filter(bar => bar.day > entry.signalDate)
    .slice(0, entry.horizonTradingDays);
  if (futureBars.length < entry.horizonTradingDays) return entry;

  const entryPrice = futureBars[0].open || futureBars[0].close;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return entry;

  let evaluationPrice = futureBars.at(-1)?.close || entryPrice;
  let resolutionReason: PredictionLedgerEntry['resolutionReason'] = 'HORIZON';

  for (const bar of futureBars) {
    const high = bar.high || bar.close;
    const low = bar.low || bar.close;
    if (entry.signalType === 'BUY') {
      if (entry.stopLoss && low <= entry.stopLoss) {
        evaluationPrice = entry.stopLoss;
        resolutionReason = 'STOP';
        break;
      }
      if (entry.targetHigh && high >= entry.targetHigh) {
        evaluationPrice = entry.targetHigh;
        resolutionReason = 'TARGET';
        break;
      }
    }
  }

  const returnPct = ((evaluationPrice - entryPrice) / entryPrice) * 100;
  const directionalReturn = entry.direction === 'DOWN' ? -returnPct : returnPct;
  const outcome = Math.abs(returnPct) < 0.1
    ? 'FLAT'
    : directionalReturn > 0
      ? 'CORRECT'
      : 'INCORRECT';

  return {
    ...entry,
    status: 'RESOLVED',
    resolvedAt: now,
    evaluationPrice,
    returnPct: Math.round(returnPct * 100) / 100,
    outcome,
    resolutionReason,
  };
};

export const syncPredictionLedger = (
  stocks: Stock[],
  now = Date.now(),
): PredictionLedgerEntry[] => {
  if (typeof localStorage === 'undefined') return [];
  const current = readPredictionLedger().filter(entry =>
    isPredictionLedgerSourceUsable(entry.sourceAsOf, now),
  );
  const stockMap = new Map(stocks.map(stock => [stock.code, stock]));
  const resolved = current.map(entry => resolveEntry(entry, stockMap.get(entry.stockCode), now));
  const signalDate = getChinaTradingClock(now).tradeDate;
  const existingIds = new Set(resolved.map(entry => entry.id));

  const additions = stocks.flatMap((stock): PredictionLedgerEntry[] => {
    const signalType = stock.aiPrediction?.signalType;
    const prediction = stock.aiPrediction?.prediction;
    const signalPrice = stock.currentPrice || 0;
    if (
      (signalType !== 'BUY' && signalType !== 'SELL') ||
      !prediction ||
      !Number.isFinite(signalPrice) ||
      signalPrice <= 0 ||
      prediction.marketDataStatus === 'UNAVAILABLE'
      || !isPredictionLedgerSourceUsable(stock.sourceAsOf, now)
    ) {
      return [];
    }

    const id = `${PREDICTION_MODEL_VERSION}:${stock.code}:${signalDate}:${signalType}`;
    if (existingIds.has(id)) return [];
    return [{
      id,
      modelVersion: PREDICTION_MODEL_VERSION,
      stockCode: stock.code,
      stockName: stock.name,
      signalDate,
      createdAt: now,
      sourceAsOf: stock.sourceAsOf,
      signalType,
      direction: prediction.direction,
      probability: prediction.probability,
      confidenceLow: prediction.confidenceLow,
      confidenceHigh: prediction.confidenceHigh,
      reliability: prediction.reliability,
      evidenceReliability: prediction.evidenceReliability,
      marketDataStatus: prediction.marketDataStatus,
      sampleSize: prediction.sampleSize || 0,
      signalPrice,
      targetHigh: prediction.targetHigh,
      targetLow: prediction.targetLow,
      stopLoss: stock.aiPrediction?.smartEntry?.stopLoss,
      horizonTradingDays: 5,
      status: 'PENDING',
    }];
  });

  const next = [...additions, ...resolved].slice(0, 1000);
  localStorage.setItem(PREDICTION_LEDGER_KEY, JSON.stringify(next));
  return next;
};

export const summarizePredictionLedger = (entries: PredictionLedgerEntry[]) => {
  const resolved = entries.filter(entry => entry.status === 'RESOLVED');
  const correct = resolved.filter(entry => entry.outcome === 'CORRECT').length;
  return {
    total: entries.length,
    pending: entries.length - resolved.length,
    resolved: resolved.length,
    correct,
    hitRate: resolved.length > 0 ? (correct / resolved.length) * 100 : null,
  };
};
