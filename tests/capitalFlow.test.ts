import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCapitalFlow,
  calculateVolumePricePressureYuan,
  getTurnoverYuan,
} from '../src/app/utils/capitalFlow.ts';
import type { Stock } from '../src/app/types.ts';

const history = [
  { day: '2026-07-21', open: 10, high: 10.2, low: 9.8, close: 10.15, volume: 100_000 },
  { day: '2026-07-22', open: 10.1, high: 10.5, low: 10, close: 10.45, volume: 120_000 },
];

const stock = (changes: Partial<Stock>): Stock => ({
  id: 'flow-test',
  code: '600000',
  name: '测试股份',
  role: 'Main',
  status: 'Watch',
  currentPrice: 10.45,
  history,
  ...changes,
});

test('reported large-order net and OHLCV pressure remain separate but can confirm each other', () => {
  const result = assessCapitalFlow(stock({
    largeOrderNetYuan: 12_000_000,
    largeOrderNetSource: 'eastmoney-f62',
    turnoverAmount: 120_000_000,
  }));

  assert.equal(result.directNetYuan, 12_000_000);
  assert.ok((result.proxyPressureYuan || 0) > 0);
  assert.equal(result.directRatio, 0.1);
  assert.equal(result.signal, 'CONFIRMED_INFLOW');
  assert.equal(result.source, 'EASTMONEY_LARGE_ORDER');
});

test('opposing OHLCV pressure is reported as a conflict, not overwritten as inflow', () => {
  const result = assessCapitalFlow(stock({
    largeOrderNetYuan: -12_000_000,
    turnoverAmount: 120_000_000,
  }));

  assert.equal(result.directNetYuan, -12_000_000);
  assert.equal(result.signal, 'CONFLICT');
});

test('OHLCV-only pressure never becomes a direct large-order value', () => {
  const result = assessCapitalFlow(stock({ turnoverAmount: 120_000_000 }));

  assert.equal(result.directNetYuan, undefined);
  assert.equal(result.signal, 'PROXY_ONLY');
  assert.ok(calculateVolumePricePressureYuan(history) !== undefined);
});

test('turnover fallback converts exchange lots to shares before multiplying by price', () => {
  assert.equal(getTurnoverYuan(stock({
    turnoverAmount: undefined,
    turnover: undefined,
    amount: undefined,
    volume: 20_000,
    currentPrice: 10,
  })), 20_000_000);
});
