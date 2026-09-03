import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAShareFactorProfiles } from '../src/app/utils/aShareFactors.ts';
import type { Stock } from '../src/app/types.ts';

const makeStock = (
  code: string,
  concept: string,
  slope: number,
  largeOrderNetYuan?: number,
): Stock => {
  const history = Array.from({ length: 40 }, (_, index) => {
    const close = 10 + index * slope;
    return {
      day: `2026-01-${String(index + 1).padStart(2, '0')}`,
      open: close,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 1_000_000 + index * 1_000,
    };
  });
  return {
    id: code,
    code,
    name: `测试${code}`,
    concept,
    role: 'Normal',
    status: 'Watch',
    history,
    currentPrice: history.at(-1)?.close,
    prevClose: history.at(-2)?.close,
    changePercent: slope * 100 / (history.at(-2)?.close || 1),
    turnoverAmount: 50_000_000,
    largeOrderNetYuan,
    technicals: { atr: 0.25, ma5: history.at(-1)?.close, ma20: history.at(-10)?.close },
  };
};

const riskOnContext = {
  totalCount: 5_000,
  upCount: 3_200,
  downCount: 1_200,
  limitUpCount: 90,
  limitDownCount: 12,
  indexChange: 0.8,
  isIndexBull: true,
  isIndexStrong: true,
  phaseConfidence: 80,
  dataStatus: 'FRESH' as const,
  coverage: 0.95,
  sourceAgeMs: 30_000,
  isMarketOpen: true,
};

test('A-share factors rank momentum and neutralize sufficiently large sectors', () => {
  const stocks = [
    makeStock('600001', '算力', 0.12, 8_000_000),
    makeStock('600002', '算力', 0.02, 1_000_000),
    makeStock('600003', '算力', -0.08, -5_000_000),
    makeStock('600004', '机器人', 0.04, 2_000_000),
  ];
  const profiles = buildAShareFactorProfiles(stocks, riskOnContext);
  const leader = profiles.get('600001');
  const laggard = profiles.get('600003');
  assert.ok(leader);
  assert.ok(laggard);
  assert.equal(leader.regime, 'RISK_ON');
  assert.ok((leader.breakdown.MOMENTUM || 0) > (laggard.breakdown.MOMENTUM || 0));
  assert.ok(leader.score > laggard.score);
  assert.ok((leader.coverage || 0) > 0.8);
});

test('missing capital flow is explicit and proxy flow is not treated as main-force identity', () => {
  const direct = makeStock('600011', '测试', 0.05, 4_000_000);
  const proxy = makeStock('600012', '测试', 0.05);
  const profiles = buildAShareFactorProfiles([direct, proxy], riskOnContext);
  assert.equal(profiles.get('600011')?.sources.CAPITAL_FLOW, 'DIRECT_FLOW');
  assert.equal(profiles.get('600012')?.sources.CAPITAL_FLOW, 'PROXY_FLOW');
  assert.ok(profiles.get('600012')?.warnings.some(warning => warning.includes('不等同于主力身份')));
});

test('low coverage stays neutral instead of fabricating a weak score', () => {
  const sparse = makeStock('600021', '测试', 0);
  sparse.history = [];
  sparse.currentPrice = 10;
  sparse.changePercent = undefined;
  sparse.turnoverAmount = undefined;
  sparse.technicals = undefined;
  const profile = buildAShareFactorProfiles([sparse]).get('600021');
  assert.ok(profile);
  assert.equal(profile.score, 50);
  assert.equal(profile.coverage, 0);
  assert.ok(profile.warnings.length > 0);
});
