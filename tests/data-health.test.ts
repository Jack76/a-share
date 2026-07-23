import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveMarketHealth } from '../src/app/utils/dataHealth.ts';

test('reports a fully usable market snapshot', () => {
  assert.equal(deriveMarketHealth({
    refreshStatus: 'success',
    indexCount: 6,
    breadthStatus: 'FRESH',
    coverage: 0.96,
  }).state, 'ready');
});

test('does not claim full availability when only indices are usable', () => {
  const result = deriveMarketHealth({
    refreshStatus: 'success',
    indexCount: 6,
    breadthStatus: 'UNAVAILABLE',
    coverage: 0,
  });
  assert.equal(result.state, 'partial');
  assert.match(result.detail, /指数可用/);
});

test('reports a failed refresh without discarding usable indices', () => {
  assert.equal(deriveMarketHealth({
    refreshStatus: 'error',
    indexCount: 3,
    breadthStatus: 'FRESH',
    coverage: 0.95,
  }).state, 'partial');
});

test('reports unavailable when no market source has data', () => {
  assert.equal(deriveMarketHealth({
    refreshStatus: 'error',
    indexCount: 0,
    breadthStatus: 'UNAVAILABLE',
  }).state, 'unavailable');
});
