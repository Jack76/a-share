import test from 'node:test';
import assert from 'node:assert/strict';
import { getChinaTradingClock, isChinaAuctionRelevant } from '../src/app/utils/marketClock.ts';
import {
  aggregateTradeLifecycles,
  calculateStrategyAcceptanceMetrics,
  evaluateStrategyAcceptance,
} from '../src/app/utils/strategyMetrics.ts';

test('China market clock is deterministic across host timezones', () => {
  const clock = getChinaTradingClock('2026-07-23T01:30:00.000Z');
  assert.equal(clock.tradeDate, '2026-07-23');
  assert.equal(clock.timeValue, 930);
  assert.equal(clock.isMarketOpen, true);
  assert.equal(isChinaAuctionRelevant('2026-07-23T01:10:00.000Z'), false);
  assert.equal(isChinaAuctionRelevant('2026-07-23T01:15:00.000Z'), true);
});

test('strategy acceptance metrics include drawdown, calibration and regime evidence', () => {
  const metrics = calculateStrategyAcceptanceMetrics({
    trades: [
      { returnPercent: 10, pnl: 10, entryNotional: 100, exitNotional: 110, regime: 'RISK_ON' },
      { returnPercent: -5, pnl: -5, entryNotional: 100, exitNotional: 95, regime: 'RISK_OFF' },
    ],
    equityCurve: [
      { timestamp: 1, equity: 100 },
      { timestamp: 2, equity: 110 },
      { timestamp: 3, equity: 99 },
      { timestamp: 4, equity: 105 },
    ],
    predictions: [
      { probabilityUp: 0.8, outcomeUp: true, regime: 'RISK_ON' },
      { probabilityUp: 0.7, outcomeUp: false, regime: 'RISK_OFF' },
    ],
  });

  assert.equal(metrics.trades, 2);
  assert.equal(metrics.winRate, 50);
  assert.equal(metrics.expectancyPercent, 2.5);
  assert.equal(metrics.profitFactor, 2);
  assert.equal(metrics.maxDrawdownPercent, 10);
  assert.equal(metrics.brierScore, 0.265);
  assert.equal(metrics.expectedCalibrationError, 0.45);
  assert.equal(metrics.regimeBreakdown.RISK_ON?.trades, 1);
  const acceptance = evaluateStrategyAcceptance(metrics);
  assert.equal(acceptance.passed, false);
  assert.equal(acceptance.checks.minimumTrades, false);
});

test('partial exits count as one lifecycle in acceptance metrics', () => {
  const trades = aggregateTradeLifecycles([
    {
      entryTimestamp: 1,
      exitTimestamp: 2,
      entryPrice: 10,
      exitPrice: 11,
      shares: 500,
      entryNotional: 5_000,
      exitNotional: 5_500,
      pnl: 500,
      returnPercent: 10,
      exitReason: 'SIGNAL',
      regime: 'RISK_ON',
    },
    {
      entryTimestamp: 1,
      exitTimestamp: 3,
      entryPrice: 10,
      exitPrice: 12,
      shares: 500,
      entryNotional: 5_000,
      exitNotional: 6_000,
      pnl: 1_000,
      returnPercent: 20,
      exitReason: 'TARGET',
      regime: 'RISK_ON',
    },
  ]);

  assert.equal(trades.length, 1);
  assert.equal(trades[0].entryNotional, 10_000);
  assert.equal(trades[0].pnl, 1_500);
  assert.equal(trades[0].returnPercent, 15);
});
