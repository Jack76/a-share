import test from 'node:test';
import assert from 'node:assert/strict';
import type { PredictionLedgerEntry } from '../src/app/utils/predictionLedger.ts';
import {
  isPredictionLedgerSourceUsable,
  summarizePredictionLedger,
} from '../src/app/utils/predictionLedger.ts';

test('prediction ledger summary separates pending and resolved observations', () => {
  const base = {
    modelVersion: 'test',
    stockCode: 'sh600000',
    stockName: '测试',
    signalDate: '2026-01-05',
    createdAt: 1,
    signalType: 'BUY',
    direction: 'UP',
    probability: 60,
    sampleSize: 10,
    signalPrice: 10,
    horizonTradingDays: 5,
  } satisfies Omit<PredictionLedgerEntry, 'id' | 'status'>;
  const entries: PredictionLedgerEntry[] = [
    { ...base, id: 'a', status: 'PENDING' },
    { ...base, id: 'b', status: 'RESOLVED', outcome: 'CORRECT' },
    { ...base, id: 'c', status: 'RESOLVED', outcome: 'INCORRECT' },
  ];
  assert.deepEqual(summarizePredictionLedger(entries), {
    total: 3,
    pending: 1,
    resolved: 2,
    correct: 1,
    hitRate: 50,
  });
});

test('prediction ledger rejects missing and stale quote timestamps', () => {
  const now = Date.parse('2026-07-31T02:00:00.000Z');
  assert.equal(isPredictionLedgerSourceUsable(undefined, now), false);
  assert.equal(isPredictionLedgerSourceUsable('invalid', now), false);
  assert.equal(isPredictionLedgerSourceUsable('2026-07-31T01:58:00.000Z', now), true);
  assert.equal(isPredictionLedgerSourceUsable('2026-07-31T01:40:00.000Z', now), false);
});
