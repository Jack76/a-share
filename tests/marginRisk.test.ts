import test from 'node:test';
import assert from 'node:assert/strict';
import type { Stock } from '../src/app/types.ts';
import { assessMarginTradingRisk } from '../src/app/utils/marginRisk.ts';

const stock = (changes: Partial<Stock>): Stock => ({
  id: 'margin-test',
  code: '600000',
  name: '融资测试',
  role: 'Main',
  status: 'Watch',
  currentPrice: 10,
  changePercent: -4,
  turnoverAmount: 100_000_000,
  marginData: {
    financingBalance: 50_000,
    financingBuy: 2_000,
    financingRepay: 1_200,
    financingNetBuy: 800,
    shortBalance: 100,
    shortSellVolume: 20,
    shortRepayVolume: 10,
    shortNetSell: 5,
    source: 'eastmoney-margin',
    reportingLag: 'T-1',
    asOf: new Date().toISOString().slice(0, 10),
  },
  ...changes,
});

test('下跌中融资净买入占成交额较高时识别杠杆拥挤', () => {
  const result = assessMarginTradingRisk(stock({}));
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.signal, 'LEVERAGE_CROWDING');
  assert.equal(result.financingNetBuyRatio, 0.08);
  assert.equal(result.riskScore, 18);
  assert.ok(result.buyScoreAdjustment < 0);
});

test('相同融资金额在大成交额股票中不触发固定阈值误报', () => {
  const result = assessMarginTradingRisk(stock({ turnoverAmount: 2_000_000_000 }));
  assert.equal(result.financingNetBuyRatio, 0.004);
  assert.equal(result.riskScore, 0);
  assert.equal(result.signal, 'NEUTRAL');
});

test('下跌中大额融资净偿还识别为去杠杆压力', () => {
  const base = stock({});
  const result = assessMarginTradingRisk(stock({
    marginData: { ...base.marginData!, financingNetBuy: -1_000 },
  }));
  assert.equal(result.signal, 'DELEVERAGING_PRESSURE');
  assert.equal(result.riskScore, 12);
});

test('缺少成交额时融资数据不参与评分', () => {
  const result = assessMarginTradingRisk(stock({
    turnoverAmount: undefined,
    turnover: undefined,
    amount: undefined,
    volume: undefined,
  }));
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.riskScore, 0);
  assert.equal(result.buyScoreAdjustment, 0);
});

test('未标注来源或过期的旧融资字段失效关闭', () => {
  const base = stock({});
  const unverified = assessMarginTradingRisk(stock({
    marginData: { ...base.marginData!, source: undefined },
  }));
  const stale = assessMarginTradingRisk(stock({
    marginData: { ...base.marginData!, asOf: '2020-01-01' },
  }));
  assert.equal(unverified.status, 'INVALID');
  assert.equal(unverified.riskScore, 0);
  assert.equal(stale.status, 'INVALID');
  assert.equal(stale.riskScore, 0);
});
