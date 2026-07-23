import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateThemeBreadthConsensus, calculateTopConceptConsensus } from '../src/app/utils/marketConcepts.ts';
import { calculateFullMarketEntropy } from '../src/app/utils/marketCrossSection.ts';
import { detectMarketPhase } from '../src/app/utils/phaseDetection.ts';
import { calculateIndicators } from '../src/app/utils/indicators.ts';
import { buildTradeRiskPlan } from '../src/app/utils/riskControl.ts';
import { getBuySignalVetoReason } from '../src/app/utils/predictionCalibration.ts';
import type { Stock } from '../src/app/types.ts';

const makeStock = (index: number, concept?: string): Stock => ({
  id: `stock-${index}`,
  code: `6000${String(index).padStart(2, '0')}`,
  name: `测试${index}`,
  concept,
  role: 'Normal',
  status: 'Watch',
  currentPrice: 10,
  changePercent: 10 - index,
});

test('placeholder concepts cannot manufacture market consensus', () => {
  const stocks = Array.from({ length: 10 }, (_, index) => makeStock(index, '自动发现'));
  assert.equal(calculateTopConceptConsensus(stocks).consensus, 0);

  const result = detectMarketPhase({
    limitUpCount: 25,
    limitDownCount: 0,
    spaceHeight: 3,
    marketTemp: 50,
    marketEntropy: 50,
  } as any, stocks);

  assert.equal(result.phase, 'Chaos');
  assert.doesNotMatch(result.reason, /主线明确/);
});

test('phase detection can consume a verified full-market theme cross-section', () => {
  const stocks = Array.from({ length: 10 }, (_, index) => makeStock(index));
  const result = detectMarketPhase({
    limitUpCount: 25,
    limitDownCount: 0,
    spaceHeight: 3,
    marketTemp: 50,
    marketEntropy: 50,
  } as any, stocks, undefined, undefined, {
    fullMarketEntropy: 45,
    themeConsensus: 0.5,
    fullMarketSampleSize: 4_500,
  });
  assert.equal(result.phase, 'Startup');
  assert.match(result.reason, /主线明确/);
});

test('real concepts still create consensus using the actual sample size', () => {
  const stocks = Array.from({ length: 6 }, (_, index) => makeStock(index, index < 3 ? '机器人' : `题材${index}`));
  assert.equal(calculateTopConceptConsensus(stocks).consensus, 0.5);
});

test('full-market theme breadth replaces selected-pool consensus', () => {
  const consensus = calculateThemeBreadthConsensus([
    { id: 'a', name: '机器人', type: 'Main', logic: '', stockCount: 6 },
    { id: 'b', name: 'AI', type: 'Sub', logic: '', stockCount: 3 },
    { id: 'c', name: '自动发现', type: 'Sub', logic: '', stockCount: 20 },
  ]);
  assert.equal(consensus, 2 / 3);
});

test('full-market entropy is calculated from the broad return distribution', () => {
  const calm = Array.from({ length: 4_000 }, () => ({ changePercent: 0.1 }));
  const dispersed = Array.from({ length: 4_000 }, (_, index) => ({
    changePercent: [-10, -4, -1, 1, 4, 10][index % 6],
    isLimitUp: index % 6 === 5,
    isLimitDown: index % 6 === 0,
  }));
  assert.ok(calculateFullMarketEntropy(dispersed) > calculateFullMarketEntropy(calm));
});

test('advanced chip metrics use the supplied live price', () => {
  const history = Array.from({ length: 60 }, (_, index) => {
    const close = 10 + Math.sin(index / 4) * 1.5;
    return {
      open: close - 0.1,
      high: close + 0.3,
      low: close - 0.3,
      close,
      volume: 1_000_000 + index * 10_000,
    };
  });

  const lowPriceMetrics = calculateIndicators(history, 8);
  const highPriceMetrics = calculateIndicators(history, 14);
  assert.ok((highPriceMetrics.profitRatio || 0) > (lowPriceMetrics.profitRatio || 0) + 50);
});

test('non-finite risk inputs fail closed', () => {
  const stock = makeStock(1);
  const plan = buildTradeRiskPlan({
    capital: 100_000,
    riskPercent: Number.NaN,
    maxStopLossPercent: 5,
    hedgePercent: 0,
    phase: 'Startup',
    stock,
  });
  assert.equal(plan, null);
});

test('risk disclosure is not mistaken for a position blocker', () => {
  const plan = buildTradeRiskPlan({
    capital: 100_000,
    riskPercent: 1,
    maxStopLossPercent: 5,
    hedgePercent: 0,
    phase: 'Startup',
    stock: makeStock(2),
  });
  assert.equal(plan?.canOpen, true);
  assert.equal(plan?.reasons.length, 1);
});

test('negative out-of-sample evidence vetoes a BUY signal', () => {
  const reason = getBuySignalVetoReason({
    signalType: 'BUY',
    direction: 'UP',
    probability: 65,
    trapDetected: false,
    backtest: {
      sampleSize: 12,
      winRate: 58,
      profitFactor: 0.9,
      expectancy: -0.1,
    },
  });
  assert.match(reason || '', /未形成正期望/);
});

test('a BUY signal without enough non-overlapping validation samples is vetoed', () => {
  const missing = getBuySignalVetoReason({
    signalType: 'BUY',
    direction: 'UP',
    probability: 80,
    trapDetected: false,
  });
  const insufficient = getBuySignalVetoReason({
    signalType: 'BUY',
    direction: 'UP',
    probability: 80,
    trapDetected: false,
    backtest: {
      sampleSize: 9,
      winRate: 70,
      profitFactor: 1.5,
      expectancy: 1,
    },
  });

  assert.match(missing || '', /不足10笔/);
  assert.match(insufficient || '', /不足10笔/);
});
