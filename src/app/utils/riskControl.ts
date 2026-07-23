import type { MarketPhase, Stock } from '../types';

export interface TradeRiskPlan {
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  shares: number;
  positionValue: number;
  positionPercent: number;
  maxLoss: number;
  riskRewardRatio: number;
  phaseCapPercent: number;
  canOpen: boolean;
  reasons: string[];
}

export interface TradeRiskInput {
  capital: number;
  riskPercent: number;
  maxStopLossPercent: number;
  hedgePercent: number;
  phase: MarketPhase;
  stock?: Stock;
}

const PHASE_CAPS: Record<MarketPhase, number> = {
  Startup: 20,
  Climax: 50,
  Ebb: 0,
  Chaos: 10,
  Ice: 0,
  Repair: 15,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const roundDownLot = (shares: number) => Math.max(0, Math.floor(shares / 100) * 100);

/**
 * Generates a conservative pre-trade plan for A-share cash trading.
 * It intentionally treats stops as risk estimates, not guaranteed exit prices:
 * cash equities are subject to T+1 selling and may gap through a stop overnight.
 */
export const buildTradeRiskPlan = ({
  capital,
  riskPercent,
  maxStopLossPercent,
  hedgePercent,
  phase,
  stock,
}: TradeRiskInput): TradeRiskPlan | null => {
  if (!stock || !Number.isFinite(stock.currentPrice) || stock.currentPrice <= 0) return null;

  const entryPrice = stock.currentPrice;
  const cappedRiskPercent = clamp(riskPercent, 0.25, 2);
  const cappedStopLossPercent = clamp(maxStopLossPercent, 2, 8);
  const cappedHedgePercent = clamp(hedgePercent, 0, 100);
  const phaseCapPercent = PHASE_CAPS[phase];
  const hedgeMultiplier = 1 - cappedHedgePercent / 100;
  const atr = stock.technicals?.atr || entryPrice * 0.03;
  const structuralStop = stock.technicals?.atrBands?.lowerSupport;
  const atrStop = entryPrice - atr * (phase === 'Climax' ? 1.8 : 1.5);
  const hardStop = entryPrice * (1 - cappedStopLossPercent / 100);
  const rawStop = structuralStop && structuralStop > 0 && structuralStop < entryPrice
    ? Math.max(structuralStop, hardStop)
    : Math.max(atrStop, hardStop);
  // Do not place a stop inside ordinary 2% intraday noise, while the hard stop
  // above still caps the planned loss at the user-selected maximum distance.
  const stopPrice = Number(Math.min(entryPrice * 0.98, rawStop).toFixed(2));
  const perShareRisk = Math.max(entryPrice - stopPrice, entryPrice * 0.01);
  const suggestedTarget = stock.aiPrediction?.smartEntry?.target || stock.aiPrediction?.prediction?.targetHigh;
  const targetPrice = Number(Math.max(suggestedTarget || 0, entryPrice + perShareRisk * 2).toFixed(2));
  const riskRewardRatio = Number(((targetPrice - entryPrice) / perShareRisk).toFixed(2));
  const riskBudget = capital * (cappedRiskPercent / 100) * hedgeMultiplier;
  const positionBudget = capital * (phaseCapPercent / 100) * hedgeMultiplier;
  const riskShares = riskBudget / perShareRisk;
  const capitalShares = positionBudget / entryPrice;
  const shares = roundDownLot(Math.min(riskShares, capitalShares));
  const positionValue = Number((shares * entryPrice).toFixed(2));
  const maxLoss = Number((shares * perShareRisk).toFixed(2));
  const positionPercent = capital > 0 ? Number(((positionValue / capital) * 100).toFixed(2)) : 0;
  const reasons: string[] = [];

  if (phaseCapPercent === 0) reasons.push('当前市场阶段为防守期，禁止新增现金仓位。');
  if (stock.isLimitUp) reasons.push('涨停封单的实际成交与撤单风险不可控，不按市价追单。');
  if (riskRewardRatio < 1.5) reasons.push('预估风险回报比低于 1.5，放弃这笔交易。');
  if (shares < 100) reasons.push('风险预算不足以买入一手，保持空仓。');
  if (stock.name.includes('ST') || stock.name.includes('*ST')) reasons.push('风险警示证券不纳入默认短线策略。');
  reasons.push('止损价是事前风险估计，隔夜跳空和 T+1 限制可能导致实际亏损高于估算。');

  return {
    entryPrice,
    stopPrice,
    targetPrice,
    shares,
    positionValue,
    positionPercent,
    maxLoss,
    riskRewardRatio,
    phaseCapPercent,
    canOpen: reasons.length === 1,
    reasons,
  };
};
