import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHistoricalPatternEvidence,
  clearHistoricalEvidenceCache,
  getHistoricalEvidenceCacheStats,
} from '../src/app/utils/historicalEvidence.ts';

const makeHistory = (phaseOffset = 0) => {
  const start = Date.UTC(2024, 0, 1);
  let previousClose = 20;
  return Array.from({ length: 520 }, (_, index) => {
    const cycle = Math.sin((index + phaseOffset) / 7) * 1.6;
    const slowTrend = Math.sin((index + phaseOffset) / 43) * 2.2;
    const close = 20 + cycle + slowTrend + index * 0.004;
    const open = previousClose + Math.sin((index + phaseOffset) / 3) * 0.12;
    const high = Math.max(open, close) + 0.35;
    const low = Math.min(open, close) - 0.35;
    const volume = 1_000_000 * ((index + phaseOffset) % 19 === 0 ? 2.2 : 1 + Math.sin(index / 9) * 0.18);
    previousClose = close;
    return {
      day: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume,
    };
  });
};

const makeStock = (code: string, concept: string, phaseOffset = 0) => ({
  id: code,
  code,
  name: `测试${code}`,
  concept,
  role: 'Leader' as const,
  status: 'Watch' as const,
  history: makeHistory(phaseOffset),
});

test('exit evidence evaluates several holding horizons with hierarchical samples', () => {
  clearHistoricalEvidenceCache();
  const stock = makeStock('600001', '人工智能', 0);
  const sameSector = makeStock('600002', '人工智能', 3);
  const poolPeer = makeStock('600003', '机器人', 7);
  const result = buildHistoricalPatternEvidence({
    stock,
    peerStocks: [sameSector, poolPeer],
    signalTitle: '风险撤退',
    direction: 'EXIT',
    marketRegime: 'RISK_OFF',
  });

  assert.ok(result);
  assert.equal(result.direction, 'EXIT');
  assert.equal(result.validationType, 'REGIME_WEIGHTED_WALK_FORWARD');
  assert.equal(result.horizonDays, 5);
  assert.deepEqual(result.horizonEvidence?.map(item => item.horizonDays), [1, 3, 5, 10]);
  assert.ok(result.totalSampleSize >= result.sampleSize);
  assert.ok(result.ownStockSampleSize > 0);
  assert.ok(result.sectorSampleSize > 0);
  assert.ok(result.poolSampleSize > 0);
  assert.ok(result.recentSampleShare > 0 && result.recentSampleShare < 100);
});

test('long evidence uses cross-sectional expanding-window validation', () => {
  clearHistoricalEvidenceCache();
  const stock = makeStock('600011', '算力', 0);
  const peer = makeStock('600012', '算力', 5);
  const result = buildHistoricalPatternEvidence({
    stock,
    peerStocks: [peer],
    signalTitle: '回踩等待',
    direction: 'LONG',
    marketRegime: 'NEUTRAL',
  });

  assert.ok(result);
  assert.equal(result.direction, 'LONG');
  assert.ok(result.sampleSize >= 3);
  assert.ok(result.optimalStopMult >= 1 && result.optimalStopMult <= 2.5);
  assert.ok(Number.isFinite(result.expectancy));
  assert.ok(Number.isFinite(result.profitFactor));
});

test('unchanged histories reuse bounded evidence caches across live recalculations', () => {
  clearHistoricalEvidenceCache();
  const stock = makeStock('600021', '算力', 0);
  const peers = [makeStock('600022', '算力', 4), makeStock('600023', '机器人', 8)];
  const input = {
    stock,
    peerStocks: peers,
    signalTitle: '回踩等待',
    direction: 'LONG' as const,
    marketRegime: 'NEUTRAL' as const,
  };

  const first = buildHistoricalPatternEvidence(input);
  const afterFirst = getHistoricalEvidenceCacheStats();
  const second = buildHistoricalPatternEvidence(input);
  const afterSecond = getHistoricalEvidenceCacheStats();

  assert.deepEqual(second, first);
  assert.equal(afterFirst.misses, 1);
  assert.equal(afterSecond.misses, 1);
  assert.equal(afterSecond.hits, 1);
  assert.ok(afterFirst.rawMisses > 0);
  assert.equal(afterSecond.rawMisses, afterFirst.rawMisses);
});
