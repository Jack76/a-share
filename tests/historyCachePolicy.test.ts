import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessFundHistoryCache,
  assessStockHistoryCache,
  FUND_HISTORY_REQUESTED_BARS,
  STOCK_HISTORY_BACKGROUND_BARS,
  STOCK_HISTORY_CACHE_TTL_MS,
  STOCK_HISTORY_REQUESTED_BARS,
  STOCK_HISTORY_UPGRADE_RETRY_MS,
} from '../src/app/services/historyCachePolicy.ts';

const NOW = Date.parse('2026-08-02T03:00:00.000Z');

const history = (count: number, lastDay = '2026-08-01') =>
  Array.from({ length: count }, (_, index) => ({
    day: index === count - 1 ? lastDay : '2026-07-31',
    close: 10 + index,
  }));

test('a completed short history for a newly listed stock is not upgraded on every load', () => {
  const result = assessStockHistoryCache(history(120), {
    cachedAt: NOW - 60_000,
    requestedBars: STOCK_HISTORY_REQUESTED_BARS,
    upgradeAttemptedAt: NOW - 60_000,
  }, NOW);

  assert.equal(result.canRender, true);
  assert.equal(result.isFresh, true);
  assert.equal(result.shouldUpgrade, false);
  assert.equal(result.shouldRefresh, false);
});

test('a legacy 300-bar cache is upgraded once', () => {
  const result = assessStockHistoryCache(history(300), {
    cachedAt: NOW - 60_000,
  }, NOW);

  assert.equal(result.shouldUpgrade, true);
  assert.equal(result.shouldRefresh, true);
});

test('the compact background window is treated as complete for list hydration', () => {
  const result = assessStockHistoryCache(history(STOCK_HISTORY_BACKGROUND_BARS), {
    cachedAt: NOW - 60_000,
    requestedBars: STOCK_HISTORY_BACKGROUND_BARS,
    upgradeAttemptedAt: NOW - 60_000,
  }, NOW, STOCK_HISTORY_BACKGROUND_BARS);

  assert.equal(result.canRender, true);
  assert.equal(result.shouldUpgrade, false);
  assert.equal(result.shouldRefresh, false);
});

test('a failed legacy upgrade is not retried on every page load', () => {
  const result = assessStockHistoryCache(history(300), {
    cachedAt: NOW - 60_000,
    upgradeAttemptedAt: NOW - STOCK_HISTORY_UPGRADE_RETRY_MS + 60_000,
  }, NOW);

  assert.equal(result.shouldUpgrade, false);
  assert.equal(result.shouldRefresh, false);
});

test('expired history remains renderable while requesting a refresh', () => {
  const result = assessStockHistoryCache(history(640), {
    cachedAt: NOW - STOCK_HISTORY_CACHE_TTL_MS - 1,
    requestedBars: STOCK_HISTORY_REQUESTED_BARS,
  }, NOW);

  assert.equal(result.canRender, true);
  assert.equal(result.isFresh, false);
  assert.equal(result.shouldRefresh, true);
});

test('a completed short fund history is not downloaded again on every visit', () => {
  const result = assessFundHistoryCache(history(18), {
    cachedAt: NOW - 60_000,
    requestedBars: FUND_HISTORY_REQUESTED_BARS,
    upgradeAttemptedAt: NOW - 60_000,
  }, NOW);

  assert.equal(result.canRender, true);
  assert.equal(result.shouldUpgrade, false);
  assert.equal(result.shouldRefresh, false);
});

test('an expired fund history remains visible while refreshing', () => {
  const result = assessFundHistoryCache(history(365), {
    cachedAt: NOW - STOCK_HISTORY_CACHE_TTL_MS - 1,
    requestedBars: FUND_HISTORY_REQUESTED_BARS,
  }, NOW);

  assert.equal(result.canRender, true);
  assert.equal(result.isFresh, false);
  assert.equal(result.shouldRefresh, true);
});
