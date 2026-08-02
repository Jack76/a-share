import type { Stock } from '../types';
import { getTurnoverYuan } from './capitalFlow.ts';

export type MarginRiskSignal =
  | 'LEVERAGE_CROWDING'
  | 'DELEVERAGING_PRESSURE'
  | 'MODERATE_CONFIRMATION'
  | 'NEUTRAL'
  | 'UNAVAILABLE';

export interface MarginRiskAssessment {
  status: 'AVAILABLE' | 'PARTIAL' | 'INVALID' | 'UNAVAILABLE';
  signal: MarginRiskSignal;
  riskScore: number;
  buyScoreAdjustment: number;
  sellPressureScore: number;
  dataAsOf?: string;
  financingNetBuyRatio?: number;
  financingBalanceFloatRatio?: number;
  financingBalanceTurnoverMultiple?: number;
  shortNetSellRatio?: number;
  evidence: string[];
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const formatPercent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

/**
 * 融资融券只作为 T-1 杠杆拥挤/去杠杆风险覆盖层。
 * 金额先除以个股成交额，避免固定的“500/1000 万”阈值对大小盘股产生不同含义。
 */
export const assessMarginTradingRisk = (stock: Stock): MarginRiskAssessment => {
  const margin = stock.marginData;
  if (!margin) {
    return {
      status: 'UNAVAILABLE',
      signal: 'UNAVAILABLE',
      riskScore: 0,
      buyScoreAdjustment: 0,
      sellPressureScore: 0,
      evidence: [],
    };
  }

  const requiredValues = [
    margin.financingBalance,
    margin.financingBuy,
    margin.financingNetBuy,
    margin.shortBalance,
    margin.shortSellVolume,
    margin.shortNetSell,
  ];
  const asOfTimestamp = margin.asOf
    ? Date.parse(`${margin.asOf}T00:00:00+08:00`)
    : Number.NaN;
  const ageMs = Date.now() - asOfTimestamp;
  if (
    margin.source !== 'eastmoney-margin' || margin.reportingLag !== 'T-1' ||
    !Number.isFinite(asOfTimestamp) || ageMs < -24 * 60 * 60 * 1000 ||
    ageMs > 14 * 24 * 60 * 60 * 1000 ||
    requiredValues.some(value => !finite(value)) ||
    margin.financingBalance < 0 ||
    margin.financingBuy < 0 ||
    margin.shortBalance < 0 ||
    margin.shortSellVolume < 0
  ) {
    return {
      status: 'INVALID',
      signal: 'UNAVAILABLE',
      riskScore: 0,
      buyScoreAdjustment: 0,
      sellPressureScore: 0,
      evidence: ['融资融券数据源未验证、字段不完整或非有限数，本次不参与评分'],
    };
  }

  const turnoverYuan = getTurnoverYuan(stock);
  if (!turnoverYuan || turnoverYuan <= 0) {
    return {
      status: 'PARTIAL',
      signal: 'UNAVAILABLE',
      riskScore: 0,
      buyScoreAdjustment: 0,
      sellPressureScore: 0,
      evidence: ['缺少成交额，无法对融资规模做归一化，本次不参与评分'],
    };
  }

  const financingNetBuyYuan = margin.financingNetBuy * 10_000;
  const financingBalanceYuan = margin.financingBalance * 10_000;
  const shortNetSellYuan = margin.shortNetSell * 10_000;
  const financingNetBuyRatio = financingNetBuyYuan / turnoverYuan;
  const financingBalanceTurnoverMultiple = financingBalanceYuan / turnoverYuan;
  const financingBalanceFloatRatio = finite(margin.financingBalanceRatio)
    ? margin.financingBalanceRatio
    : finite(margin.floatMarketCapYuan) && margin.floatMarketCapYuan > 0
      ? financingBalanceYuan / margin.floatMarketCapYuan
      : undefined;
  const shortNetSellRatio = shortNetSellYuan / turnoverYuan;
  const change = finite(stock.changePercent) ? stock.changePercent : 0;

  let riskScore = 0;
  let signal: MarginRiskSignal = 'NEUTRAL';
  const evidence: string[] = [];

  // 下跌中杠杆仍快速增加：拥挤抄底可能放大后续波动。
  if (change <= -3 && financingNetBuyRatio >= 0.03) {
    riskScore += financingNetBuyRatio >= 0.08 ? 18 : 12;
    signal = 'LEVERAGE_CROWDING';
    evidence.push(`股价下跌${Math.abs(change).toFixed(1)}%，融资净买入占成交额${formatPercent(financingNetBuyRatio)}`);
  } else if (change >= 5 && financingNetBuyRatio >= 0.05) {
    // 高位追涨拥挤只给中等风险，不直接判断见顶。
    riskScore += financingNetBuyRatio >= 0.1 ? 12 : 8;
    signal = 'LEVERAGE_CROWDING';
    evidence.push(`上涨中融资净买入占成交额${formatPercent(financingNetBuyRatio)}，追涨拥挤度上升`);
  }

  // 下跌中大额净偿还是当期去杠杆压力，不自动解读为“洗盘完成”。
  if (change <= -3 && financingNetBuyRatio <= -0.05) {
    riskScore += Math.abs(financingNetBuyRatio) >= 0.1 ? 12 : 8;
    signal = 'DELEVERAGING_PRESSURE';
    evidence.push(`下跌中融资净偿还占成交额${formatPercent(Math.abs(financingNetBuyRatio))}，存在去杠杆卖压`);
  }

  // 当前融券受制度与可得性影响较大，只给很低的辅助权重。
  if (shortNetSellRatio >= 0.01) {
    riskScore += 4;
    evidence.push(`融券净卖出折算金额占成交额${formatPercent(shortNetSellRatio)}`);
  }

  if (
    financingBalanceFloatRatio !== undefined &&
    financingBalanceFloatRatio >= 0.08 &&
    (change <= 0 || financingNetBuyRatio > 0)
  ) {
    riskScore += 4;
    evidence.push(`融资余额占流通市值${formatPercent(financingBalanceFloatRatio)}，杠杆集中度较高`);
  }

  riskScore = Math.min(20, Math.max(0, Math.round(riskScore)));

  const moderateConfirmation =
    change > 0 && change < 5 &&
    financingNetBuyRatio >= 0.005 && financingNetBuyRatio <= 0.03 &&
    riskScore === 0;
  if (moderateConfirmation) {
    signal = 'MODERATE_CONFIRMATION';
    evidence.push(`温和上涨与低强度融资净流入共振（成交额占比${formatPercent(financingNetBuyRatio)}）`);
  }

  const buyScoreAdjustment = moderateConfirmation
    ? 2
    : -Math.min(15, Math.round(riskScore * 0.75));

  return {
    status: 'AVAILABLE',
    signal,
    riskScore,
    buyScoreAdjustment,
    sellPressureScore: riskScore,
    dataAsOf: margin.asOf,
    financingNetBuyRatio,
    financingBalanceFloatRatio,
    financingBalanceTurnoverMultiple,
    shortNetSellRatio,
    evidence,
  };
};
