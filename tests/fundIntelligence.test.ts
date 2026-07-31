import assert from 'node:assert/strict';
import test from 'node:test';
import { detectFundIdentity, predictSmashRisk } from '../src/app/utils/fundIntelligence.ts';

test('fund identity is unavailable without a verifiable dragon-tiger seat', () => {
  const stock = {
    id: 'demo',
    code: 'sh600000',
    name: '国家队概念样例',
    currentPrice: 10,
    changePercent: 1,
    role: 'Leader',
  } as any;

  assert.equal(detectFundIdentity(stock).evidence, 'UNAVAILABLE');
  assert.equal(detectFundIdentity(stock).profile.type, 'Mixed');
});

test('seat identity does not manufacture a participant-specific smash probability', () => {
  const stock = {
    id: 'demo',
    code: 'sh600000',
    name: '样例',
    currentPrice: 10,
    changePercent: 1,
    trapRiskScore: 50,
    dragonTigerBoard: [{
      date: '2026-07-31',
      buySeats: [{ name: '光大佛山绿景路', amount: 1 }],
      sellSeats: [],
    }],
  } as any;

  assert.equal(detectFundIdentity(stock).evidence, 'DIRECT_SEAT');
  assert.equal(predictSmashRisk(stock, 'Chaos').riskScore, 50);
});
