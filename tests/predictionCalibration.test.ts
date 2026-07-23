import test from 'node:test';
import assert from 'node:assert/strict';
import { calibratePrediction, isActionableBullishPrediction } from '../src/app/utils/predictionCalibration.ts';

const completeHistory = Array.from({ length: 120 }, (_, index) => ({
  day: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
  open: 10 + index * 0.01,
  high: 10.2 + index * 0.01,
  low: 9.8 + index * 0.01,
  close: 10.1 + index * 0.01,
  volume: 1_000_000 + index,
}));

const highQualityStock = {
  id: 'test',
  code: '600000',
  name: '测试股份',
  role: 'Main',
  status: 'Watch',
  history: completeHistory,
  technicals: { ma5: 11, ma10: 10.8, ma20: 10.5, atr: 0.3, avgVol5: 1_000_000 },
  intradayIndicators: {
    macdfs: null,
    volumeStructure: { lastVol: 1, avgVol5: 1, isHeavy: false, isShrink: false },
    trend: 'Bullish',
  },
} as const;

test('low-quality data shrinks an optimistic probability toward 50%', () => {
  const result = calibratePrediction({
    stock: { ...highQualityStock, history: [], technicals: undefined, intradayIndicators: undefined } as any,
    phase: 'Startup',
    rawProbability: 90,
    direction: 'UP',
    signalType: 'BUY',
    trapDetected: false,
  });

  assert.equal(result.probability, 58);
  assert.equal(result.reliability, 'LOW');
  assert.ok(result.warnings.length > 0);
});

test('sufficient positive evidence is Bayesian-smoothed instead of copied directly', () => {
  const result = calibratePrediction({
    stock: highQualityStock as any,
    phase: 'Startup',
    rawProbability: 80,
    direction: 'UP',
    signalType: 'BUY',
    trapDetected: false,
    backtest: { sampleSize: 40, winRate: 70, profitFactor: 1.5, expectancy: 1.2 },
  });

  assert.equal(result.probability, 73);
  assert.equal(result.reliability, 'HIGH');
});

test('negative historical expectancy prevents a bullish confidence above 50%', () => {
  const result = calibratePrediction({
    stock: highQualityStock as any,
    phase: 'Startup',
    rawProbability: 85,
    direction: 'UP',
    signalType: 'BUY',
    trapDetected: false,
    backtest: { sampleSize: 30, winRate: 65, profitFactor: 0.8, expectancy: -0.2 },
  });

  assert.equal(result.probability, 50);
  assert.match(result.warnings.join(' '), /未形成正期望/);
});

test('conflicting signal and predicted direction are downgraded', () => {
  const result = calibratePrediction({
    stock: highQualityStock as any,
    phase: 'Repair',
    rawProbability: 80,
    direction: 'DOWN',
    signalType: 'BUY',
    trapDetected: false,
  });

  assert.equal(result.probability, 50);
  assert.match(result.warnings.join(' '), /方向预测冲突/);
});

test('only reliable bullish predictions can strengthen a buy signal', () => {
  assert.equal(isActionableBullishPrediction({ probability: 78, direction: 'DOWN', reliability: 'HIGH' }), false);
  assert.equal(isActionableBullishPrediction({ probability: 78, direction: 'UP', reliability: 'LOW' }), false);
  assert.equal(isActionableBullishPrediction({ probability: 78, direction: 'UP', reliability: 'MEDIUM' }), true);
});

test('broad risk-off conditions cap bullish confidence despite positive stock evidence', () => {
  const result = calibratePrediction({
    stock: highQualityStock as any,
    phase: 'Startup',
    rawProbability: 85,
    direction: 'UP',
    signalType: 'BUY',
    trapDetected: false,
    backtest: { sampleSize: 40, winRate: 72, profitFactor: 1.6, expectancy: 1.4 },
    marketContext: {
      totalCount: 5_300,
      upCount: 900,
      downCount: 3_900,
      limitUpCount: 12,
      limitDownCount: 28,
      indexChange: -1.4,
      isIndexBull: false,
      isIndexStrong: false,
      phaseConfidence: 88,
    },
  });

  assert.equal(result.marketRegime, 'RISK_OFF');
  assert.equal(result.marketDataQuality, 100);
  assert.equal(result.probability, 52);
  assert.match(result.warnings.join(' '), /全市场宽度/);
});

test('index strength with weak breadth is treated as a divergent market', () => {
  const result = calibratePrediction({
    stock: highQualityStock as any,
    phase: 'Startup',
    rawProbability: 82,
    direction: 'UP',
    signalType: 'BUY',
    trapDetected: false,
    backtest: { sampleSize: 35, winRate: 68, profitFactor: 1.4, expectancy: 0.9 },
    marketContext: {
      totalCount: 5_300,
      upCount: 1_800,
      downCount: 2_700,
      limitUpCount: 32,
      limitDownCount: 8,
      indexChange: 0.8,
      isIndexBull: true,
      isIndexStrong: true,
      phaseConfidence: 75,
    },
  });

  assert.equal(result.marketRegime, 'DIVERGENT');
  assert.equal(result.probability, 56);
  assert.match(result.warnings.join(' '), /指数与市场宽度背离/);
});

test('low phase confidence shrinks an otherwise strong prediction', () => {
  const strongPhase = calibratePrediction({
    stock: highQualityStock as any,
    phase: 'Startup',
    rawProbability: 80,
    direction: 'UP',
    signalType: 'BUY',
    trapDetected: false,
    backtest: { sampleSize: 40, winRate: 70, profitFactor: 1.5, expectancy: 1.2 },
    marketContext: {
      totalCount: 5_300,
      upCount: 2_650,
      downCount: 2_650,
      limitUpCount: 25,
      limitDownCount: 25,
      indexChange: 0,
      isIndexBull: true,
      isIndexStrong: false,
      phaseConfidence: 90,
    },
  });
  const uncertainPhase = calibratePrediction({
    stock: highQualityStock as any,
    phase: 'Startup',
    rawProbability: 80,
    direction: 'UP',
    signalType: 'BUY',
    trapDetected: false,
    backtest: { sampleSize: 40, winRate: 70, profitFactor: 1.5, expectancy: 1.2 },
    marketContext: {
      totalCount: 5_300,
      upCount: 2_650,
      downCount: 2_650,
      limitUpCount: 25,
      limitDownCount: 25,
      indexChange: 0,
      isIndexBull: true,
      isIndexStrong: false,
      phaseConfidence: 35,
    },
  });

  assert.ok(uncertainPhase.probability < strongPhase.probability);
  assert.match(uncertainPhase.warnings.join(' '), /阶段判定置信度偏低/);
});

test('unavailable market breadth forces reliability low and contracts confidence', () => {
  const result = calibratePrediction({
    stock: highQualityStock as any,
    phase: 'Startup',
    rawProbability: 85,
    direction: 'UP',
    signalType: 'BUY',
    trapDetected: false,
    backtest: { sampleSize: 40, winRate: 72, profitFactor: 1.6, expectancy: 1.4 },
    marketContext: {
      dataStatus: 'UNAVAILABLE',
      phaseConfidence: 80,
    },
  });

  assert.equal(result.marketRegime, 'UNKNOWN');
  assert.equal(result.marketDataQuality, 0);
  assert.equal(result.reliability, 'LOW');
  assert.ok(result.probability <= 62);
  assert.match(result.warnings.join(' '), /全市场环境数据不可用/);
});

test('stale source data during an open session cannot be rated reliable', () => {
  const result = calibratePrediction({
    stock: highQualityStock as any,
    phase: 'Startup',
    rawProbability: 82,
    direction: 'UP',
    signalType: 'BUY',
    trapDetected: false,
    backtest: { sampleSize: 40, winRate: 70, profitFactor: 1.5, expectancy: 1.2 },
    marketContext: {
      totalCount: 5_300,
      upCount: 3_000,
      downCount: 2_000,
      limitUpCount: 45,
      limitDownCount: 8,
      indexChange: 0.5,
      isIndexBull: true,
      phaseConfidence: 80,
      dataStatus: 'FRESH',
      coverage: 0.99,
      sourceAgeMs: 10 * 60 * 1000,
      isMarketOpen: true,
    },
  });

  assert.equal(result.marketRegime, 'UNKNOWN');
  assert.ok(result.marketDataQuality < 40);
  assert.equal(result.reliability, 'LOW');
});
