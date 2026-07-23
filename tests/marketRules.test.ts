import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLimitState } from '../supabase/functions/server/market_rules.ts';

const derived = (code: string, name: string, currentPrice: number, changePercent: number) =>
  calculateLimitState({
    code,
    name,
    currentPrice,
    previousClose: 10,
    changePercent,
  });

test('derives board-specific A-share price limits', () => {
  assert.equal(derived('600000', '浦发银行', 11, 10).isLimitUp, true);
  assert.equal(derived('600000', '*ST测试', 10.5, 5).isLimitUp, true);
  assert.equal(derived('300001', '特锐德', 12, 20).isLimitUp, true);
  assert.equal(derived('sz300001', '特锐德', 12, 20).isLimitUp, true);
  assert.equal(derived('688001', '华兴源创', 8, -20).isLimitDown, true);
  assert.equal(derived('920001', '北交测试', 13, 30).isLimitUp, true);
  assert.equal(derived('430001', '北交测试', 7, -30).isLimitDown, true);
});

test('prefers upstream limit prices over derived board rules', () => {
  const result = calculateLimitState({
    code: '600519',
    name: '贵州茅台',
    currentPrice: 12.34,
    previousClose: 10,
    changePercent: 23.4,
    sourceLimitUpPrice: 12.34,
    sourceLimitDownPrice: 8.76,
  });

  assert.equal(result.source, 'UPSTREAM');
  assert.equal(result.isLimitUp, true);
  assert.equal(result.limitUpPrice, 12.34);
});

test('does not manufacture a limit signal on no-limit listing sessions', () => {
  const result = derived('600001', '新股测试', 20, 100);
  assert.equal(result.isLimitUp, false);
  assert.equal(result.isLimitDown, false);

  const listingPrefixResult = derived('688999', 'N测试', 12, 20);
  assert.equal(listingPrefixResult.isLimitUp, false);
});
