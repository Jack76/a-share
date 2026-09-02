import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMarginTradingRow,
  parseTencentTurnoverYuan,
} from '../worker/marketDataParsers.ts';

test('腾讯行情成交额使用元字段而不是把万元当成元', () => {
  const fields = Array.from({ length: 40 }, () => '');
  fields[35] = '1350.60/55128/7373462605';
  fields[37] = '737346';
  assert.equal(parseTencentTurnoverYuan(fields), 7_373_462_605);

  fields[35] = '';
  assert.equal(parseTencentTurnoverYuan(fields), 7_373_460_000);
});

test('融资融券专用报表字段按正确单位映射', () => {
  const result = parseMarginTradingRow({
    DATE: '2026-07-31 00:00:00',
    SCODE: '600519',
    RZYE: 17_412_576_403,
    RQYE: 158_303_826,
    RZMRE: 593_752_887,
    RZCHE: 424_618_012,
    RZJME: 169_134_875,
    RQMCL: 2_900,
    RQCHL: 11_900,
    RQJMG: -9_000,
    SPJ: 1_350.6,
    SZ: 1_688_360_210_310.6,
    RZYEZB: 1.03133065,
  });

  assert.ok(result);
  assert.equal(result.asOf, '2026-07-31');
  assert.equal(result.financingBalance, 1_741_257.6403);
  assert.equal(result.financingNetBuy, 16_913.4875);
  assert.equal(result.shortSellVolume, 29);
  assert.equal(result.shortRepayVolume, 119);
  assert.equal(result.shortNetSell, -1_215.54);
  assert.equal(result.financingBalanceRatio, 0.0103133065);
});

test('融资报表关键字段不完整时拒绝生成快照', () => {
  assert.equal(parseMarginTradingRow({ DATE: '2026-07-31', SCODE: '600519' }), null);
});
