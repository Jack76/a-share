import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storeSource = readFileSync(
  new URL('../src/app/context/Store.tsx', import.meta.url),
  'utf8',
);
const serverSource = readFileSync(
  new URL('../supabase/functions/server/index.tsx', import.meta.url),
  'utf8',
);
const localDbSource = readFileSync(
  new URL('../src/app/services/localDb.ts', import.meta.url),
  'utf8',
);

test('personal trading state is saved only to the new device-local key', () => {
  assert.match(storeSource, /dragon-quant-device-v2/);
  assert.match(storeSource, /storageMode:\s*'device-local'/);
  assert.doesNotMatch(storeSource, /trading-system-v1/);
  assert.doesNotMatch(storeSource, /make-server-[^'"]+\/data/);
  assert.doesNotMatch(storeSource, /\bprojectId\b|\bpublicAnonKey\b/);
});

test('legacy shared trading-state routes are retired without reading shared KV', () => {
  assert.match(serverSource, /retiredTradingState/);
  assert.match(serverSource, /api\.get\("\/data",\s*retiredTradingState\)/);
  assert.match(serverSource, /api\.post\("\/data",\s*retiredTradingState\)/);
  assert.doesNotMatch(serverSource, /trading:(stocks|themes|metrics|journal)/);
});

test('fund NAV history uses a namespace separate from stock price history', () => {
  assert.match(localDbSource, /FUND_HISTORY_PREFIX = 'fund_hist_'/);
  assert.match(localDbSource, /FUND_HISTORY_PREFIX \+ code/);
});
