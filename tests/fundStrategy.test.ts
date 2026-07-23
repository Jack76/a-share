import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateFundDataFreshness,
  predictFundPriceAction,
  resolveFundBenchmark,
} from '../src/app/utils/fundStrategy.ts';
import {
  alignFundComparisonSeries,
  buildActualPortfolioCurve,
} from '../src/app/utils/fundPortfolio.ts';

test('fund prediction reports out-of-sample evidence instead of heuristic confidence', () => {
  const history = Array.from({ length: 140 }, (_, index) => ({
    day: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
    close: 1 + index * 0.01,
  }));
  const prediction = predictFundPriceAction(history, history.at(-1)!.close, 0.02, 20);

  assert.equal(prediction.direction, 'Bull');
  assert.equal(prediction.dataReliability, 'HIGH');
  assert.equal(prediction.evidenceReliability, 'HIGH');
  assert.equal(prediction.calibrationStatus, 'OUT_OF_SAMPLE');
  assert.ok(prediction.sampleSize >= 30);
  assert.ok(prediction.confidence > 50);
  assert.ok(prediction.brierScore !== null);
});

test('fund freshness uses the China session clock and fails closed on unknown timestamps', () => {
  const now = '2026-07-23T01:30:00.000Z';
  assert.equal(evaluateFundDataFreshness('2026-07-23 09:29:00', now, true).status, 'FRESH');
  assert.equal(evaluateFundDataFreshness('2026-07-23 09:20:00', now, true).status, 'STALE');
  assert.equal(evaluateFundDataFreshness(undefined, now, false).status, 'UNAVAILABLE');
});

test('fund alpha uses a category benchmark and skips incomparable overseas assets', () => {
  const indices = [
    { code: 'sh000300', name: '沪深300', changePercent: 0.2 },
    { code: 'sh000905', name: '中证500', changePercent: -0.3 },
  ];

  assert.equal(resolveFundBenchmark('中证500增强', indices)?.code, 'sh000905');
  assert.equal(resolveFundBenchmark('港股/恒生科技', indices), undefined);
});

test('portfolio curve starts at the real transaction date and uses real historical NAV', () => {
  const curve = buildActualPortfolioCurve(
    [{
      code: '000001',
      costPerUnit: 10.5,
      shares: 20,
      buyDate: '2026-01-01',
      transactions: [
        { type: 'buy', pricePerUnit: 10, shares: 10, date: '2026-01-01' },
        { type: 'buy', pricePerUnit: 11, shares: 10, date: '2026-01-02' },
      ],
    }],
    new Map([['000001', [
      { date: '2026-01-01', nav: 10 },
      { date: '2026-01-02', nav: 11 },
      { date: '2026-01-03', nav: 12 },
    ]]]),
  );

  assert.equal(curve[0].date, '2026-01-01');
  assert.equal(curve[0].marketValue, 100);
  assert.equal(curve[1].invested, 210);
  assert.equal(curve[2].marketValue, 240);
  assert.ok(Math.abs(curve[2].dailyChangePercent - 9.0909) < 0.001);
});

test('fund comparison aligns actual overlapping dates before rebasing', () => {
  const aligned = alignFundComparisonSeries([
    {
      code: 'A',
      history: [
        { date: '2026-01-01', nav: 1 },
        { date: '2026-01-02', nav: 1.1 },
        { date: '2026-01-03', nav: 1.2 },
      ],
    },
    {
      code: 'B',
      history: [
        { date: '2026-01-02', nav: 2 },
        { date: '2026-01-03', nav: 1.8 },
      ],
    },
  ]);

  assert.equal(aligned[0].date, '2026-01-02');
  assert.equal(aligned[0].A, 0);
  assert.equal(aligned[0].B, 0);
  assert.ok(Math.abs(Number(aligned[1].A) - 9.0909) < 0.001);
  assert.ok(Math.abs(Number(aligned[1].B) + 10) < 0.001);
});
