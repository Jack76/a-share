/**
 * v41.0 TrapGuard Dynamic Weight System
 * 动态诱多权重系统 - 根据市场阶段调整各种诱多模式的权重
 * v41.1 优化：信号分组上限，防止同类信号叠加过度
 */

import { Stock, MarketPhase } from '../types';
import { calculateAlphaDivergence } from './indicators';
import { assessMarginTradingRisk } from './marginRisk';

export interface TrapSignal {
  type: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  baseWeight: number;
  group: string; // v41.1 新增：信号分组
}

export interface TrapRiskResult {
  score: number; // 0-100
  signals: TrapSignal[];
  primaryRisk: string; // 主要风险类型
}

/**
 * v41.1 信号分组配置 - 防止同类信号叠加过度
 */
const SIGNAL_GROUP_LIMITS: Record<string, number> = {
  DIVERGENCE: 50,    // 背离类信号总分上限
  TRAP: 60,          // 陷阱类信号总分上限
  EXHAUSTION: 50,    // 动能衰竭类信号总分上限
  PHASE: 30,         // 阶段压制类信号总分上限
  TECHNICAL: 25,     // 技术指标类信号总分上限
  LEVERAGE: 20,      // T-1 融资融券只作为有上限的风险覆盖层
  OTHER: 30          // 其他类信号总分上限
};

/**
 * v41.1 信号分组映射
 */
const SIGNAL_GROUP_MAP: Record<string, string> = {
  'VolumeDivergence': 'DIVERGENCE',
  'MACD': 'DIVERGENCE',
  'RSI': 'DIVERGENCE',
  'LateDayPull': 'TRAP',
  'FakeBreakthrough': 'TRAP',
  'MorningRush': 'TRAP',
  'Exhaustion': 'EXHAUSTION',
  'ChipPressure': 'EXHAUSTION',
  'ProfitTaking': 'EXHAUSTION',
  'AlgoTrapping': 'TRAP',
  'PhaseSuppress': 'PHASE',
  'Overbought': 'TECHNICAL',
  'MarginLeverage': 'LEVERAGE',
  'CoreDivergence': 'TRAP'
};

/**
 * v41.0 动态权重配置
 * 根据市场阶段返回不同的权重系数
 */
const getPhaseWeightMultipliers = (phase: MarketPhase): Record<string, number> => {
  switch (phase) {
    case 'Climax':
      // 高潮期：尾盘拉升+假突破权重加倍（诱多高发期）
      return {
        VolumeDivergence: 1.0,
        LateDayPull: 2.0,        // 尾盘拉升权重加倍
        FakeBreakthrough: 2.0,   // 假突破权重加倍
        Exhaustion: 1.2,
        CoreDivergence: 1.0,
        MorningRush: 1.5,
        AlgoTrapping: 1.0
      };
      
    case 'Ebb':
      // 退潮期：量价背离+高位派发权重加倍（杀高标高发期）
      return {
        VolumeDivergence: 1.5,   // 量价背离权重加倍
        LateDayPull: 1.0,
        FakeBreakthrough: 1.2,
        Exhaustion: 1.5,         // 高位派发权重加倍
        CoreDivergence: 1.5,     // 板块中军背离权重加倍
        MorningRush: 1.0,
        AlgoTrapping: 1.3
      };
      
    case 'Startup':
      // 启动期：诱多风险相对较低，但仍需警惕假突破
      return {
        VolumeDivergence: 0.7,
        LateDayPull: 0.8,
        FakeBreakthrough: 1.0,
        Exhaustion: 0.6,
        CoreDivergence: 0.8,
        MorningRush: 0.9,
        AlgoTrapping: 0.7
      };
      
    case 'Ice':
      // 冰封期：所有拉升都是诱多，全面加权
      return {
        VolumeDivergence: 1.3,
        LateDayPull: 1.5,
        FakeBreakthrough: 1.5,
        Exhaustion: 1.0,
        CoreDivergence: 1.2,
        MorningRush: 1.5,
        AlgoTrapping: 1.5
      };
      
    case 'Repair':
      // 修复期：谨慎乐观，部分诱多权重降低
      return {
        VolumeDivergence: 0.9,
        LateDayPull: 1.0,
        FakeBreakthrough: 0.9,
        Exhaustion: 0.8,
        CoreDivergence: 1.0,
        MorningRush: 1.0,
        AlgoTrapping: 0.8
      };
      
    case 'Chaos':
    default:
      // 混沌期：标准权重
      return {
        VolumeDivergence: 1.0,
        LateDayPull: 1.0,
        FakeBreakthrough: 1.0,
        Exhaustion: 1.0,
        CoreDivergence: 1.0,
        MorningRush: 1.0,
        AlgoTrapping: 1.0
      };
  }
};

/**
 * v41.0 增强版TrapGuard - 动态权重 + 多维度检测
 */
export const analyzeTrapRiskV41 = (
  stock: Stock,
  phase: MarketPhase,
  allStocks: Stock[]
): TrapRiskResult => {
  
  const signals: TrapSignal[] = [];
  let score = 0;
  
  const weightMultipliers = getPhaseWeightMultipliers(phase);
  
  const change = stock.changePercent || 0;
  const turnover = stock.turnoverRate || 0;
  const high = stock.high || stock.currentPrice || 0;
  const current = stock.currentPrice || 0;
  const open = stock.open || current;
  const history = stock.history || [];
  const technicals = stock.technicals || {};
  
  // === 1. 量价背离 (Volume Divergence) ===
  const { alpha } = calculateAlphaDivergence(history, stock.isLimitUp);
  if (alpha < -15 && !stock.isLimitUp) {
    const baseWeight = 35;
    const adjustedWeight = baseWeight * weightMultipliers.VolumeDivergence;
    score += adjustedWeight;
    signals.push({
      type: 'VolumeDivergence',
      severity: alpha < -25 ? 'Critical' : 'High',
      description: `量价严重背离 (Alpha:${alpha.toFixed(1)})，成交量萎缩但价格上涨`,
      baseWeight: adjustedWeight,
      group: 'DIVERGENCE'
    });
  }
  
  // 增强：MACD背离 + RSI背离
  if (technicals.macdDivergence === 'bear') {
    const baseWeight = 30;
    const adjustedWeight = baseWeight * weightMultipliers.VolumeDivergence;
    score += adjustedWeight;
    signals.push({
      type: 'MACD',
      severity: 'High',
      description: 'MACD顶背离，动能衰减信号',
      baseWeight: adjustedWeight,
      group: 'DIVERGENCE'
    });
  }
  
  if (technicals.rsiDivergence === 'bear') {
    const baseWeight = 25;
    const adjustedWeight = baseWeight * weightMultipliers.VolumeDivergence;
    score += adjustedWeight;
    signals.push({
      type: 'RSI',
      severity: 'High',
      description: 'RSI顶背离，超买风险',
      baseWeight: adjustedWeight,
      group: 'DIVERGENCE'
    });
  }
  
  // === 2. 尾盘拉升 (Late Day Pull) ===
  const hasLateNote = stock.notes?.includes('尾盘') || stock.notes?.includes('14:');
  const atr = technicals.atr || (current * 0.03);
  const atrPercent = (atr / current) * 100;
  const lowVolatility = Math.abs(change) < atrPercent * 0.5;
  
  if (hasLateNote && change > 3 && lowVolatility) {
    const baseWeight = 20;
    const adjustedWeight = baseWeight * weightMultipliers.LateDayPull;
    score += adjustedWeight;
    signals.push({
      type: 'LateDayPull',
      severity: 'Medium',
      description: '尾盘突然拉升且全天波动率低，偷鸡行为',
      baseWeight: adjustedWeight,
      group: 'TRAP'
    });
  }
  
  // === 3. 假突破 (Fake Breakthrough) ===
  const ma20 = technicals.ma20 || current;
  const isAboveMA20 = current > ma20;
  const closeToMA20 = isAboveMA20 && (current < ma20 + atr * 0.3);
  
  if (closeToMA20 && change > 2) {
    const baseWeight = 20;
    const adjustedWeight = baseWeight * weightMultipliers.FakeBreakthrough;
    score += adjustedWeight;
    signals.push({
      type: 'FakeBreakthrough',
      severity: 'Medium',
      description: '试探性突破MA20但力度不足，假突破风险',
      baseWeight: adjustedWeight,
      group: 'TRAP'
    });
  }
  
  // === 4. 高位派发 / 动能衰竭 (Exhaustion) ===
  const isHighConsecutive = (stock.consecutiveLimitUps || 0) >= 3;
  const isBroken = !stock.isLimitUp && stock.notes?.includes('炸板');
  const highVolume = turnover > 15;
  
  if (isHighConsecutive && isBroken && highVolume) {
    const baseWeight = 40;
    const adjustedWeight = baseWeight * weightMultipliers.Exhaustion;
    score += adjustedWeight;
    signals.push({
      type: 'Exhaustion',
      severity: 'Critical',
      description: `连板${stock.consecutiveLimitUps}后首次炸板+巨量(${turnover.toFixed(1)}%)，高位派发`,
      baseWeight: adjustedWeight,
      group: 'EXHAUSTION'
    });
  }
  
  // === 5. 板块中军背离 (Core Divergence) ===
  if (stock.concept) {
    const sectorStocks = allStocks.filter(s => s.concept === stock.concept);
    const sectorCore = sectorStocks
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 2);
    
    const coreIsWeak = sectorCore.some(
      core => core.id !== stock.id && (core.changePercent || 0) < -2
    );
    
    if (coreIsWeak && change > 5) {
      const baseWeight = 35;
      const adjustedWeight = baseWeight * weightMultipliers.CoreDivergence;
      score += adjustedWeight;
      signals.push({
        type: 'CoreDivergence',
        severity: 'High',
        description: '板块中军跳水，个股拉升为掩护出货',
        baseWeight: adjustedWeight,
        group: 'TRAP'
      });
    }
  }
  
  // === 6. 早盘诱多 (Morning Rush Trap) ===
  const dropFromHigh = high > 0 ? ((high - current) / high) * 100 : 0;
  if (dropFromHigh > 4 && current < open) {
    const baseWeight = 28;
    const adjustedWeight = baseWeight * weightMultipliers.MorningRush;
    score += adjustedWeight;
    signals.push({
      type: 'MorningRush',
      severity: 'High',
      description: `盘中高点回撤${dropFromHigh.toFixed(1)}%，冲高回落诱多`,
      baseWeight: adjustedWeight,
      group: 'TRAP'
    });
  }
  
  // === 7. 算法绞肉机 (Algo Trapping) ===
  // 7.1 高频无效流动性
  if (turnover > 12 && Math.abs(change) < 1.5 && !stock.isLimitUp) {
    const baseWeight = 45;
    const adjustedWeight = baseWeight * weightMultipliers.AlgoTrapping;
    score += adjustedWeight;
    signals.push({
      type: 'AlgoTrapping',
      severity: 'Critical',
      description: `换手${turnover.toFixed(1)}%但滞涨，量化高频绞肉机`,
      baseWeight: adjustedWeight,
      group: 'TRAP'
    });
  }
  
  // 7.2 算法核按钮（急速杀跌）
  if (high > 0 && dropFromHigh > 8) {
    const baseWeight = 40;
    const adjustedWeight = baseWeight * weightMultipliers.AlgoTrapping;
    score += adjustedWeight;
    signals.push({
      type: 'AlgoTrapping',
      severity: 'Critical',
      description: `日内高点暴跌${dropFromHigh.toFixed(1)}%，触发程序化止损链`,
      baseWeight: adjustedWeight,
      group: 'TRAP'
    });
  }
  
  // === 8. 缩量加速陷阱 (Acceleration Trap) - 退潮期特供 ===
  // 仅针对非核心龙头生效。真正的龙头（Role=Leader/Dragon）通常自带缩量属性，不应视为陷阱。
  const isTrueDragon = (stock.role === 'Leader' || stock.role === 'Dragon') && (stock.strengthScore || 0) > 85;
  
  if (change > 5 && turnover < 3 && (phase === 'Ebb' || phase === 'Chaos') && !isTrueDragon) {
    const baseWeight = 45;
    score += baseWeight;
    signals.push({
      type: 'Exhaustion',
      severity: 'Critical',
      description: '退潮期缩量加速，非核心标的接力即大面',
      baseWeight,
      group: 'EXHAUSTION'
    });
  }
  
  // === 9. 情绪周期压制 (Phase Suppression) ===
  if ((phase === 'Ice' || phase === 'Ebb') && stock.role === 'Follower' && change > 3) {
    const baseWeight = 25;
    score += baseWeight;
    signals.push({
      type: 'PhaseSuppress',
      severity: 'Medium',
      description: '退潮期跟风拉升，缺乏持续性',
      baseWeight,
      group: 'PHASE'
    });
  }
  
  // === 10. 均线乖离率过大 (Overbought) ===
  const ma5 = technicals.ma5 || current;
  const bias5 = ma5 > 0 ? ((current - ma5) / ma5) * 100 : 0;
  
  // 龙头豁免：连板妖股必然乖离率大，这是强势特征而非风险
  const isHighFlyer = (stock.consecutiveLimitUps || 0) >= 3 && stock.isLimitUp;
  
  if (bias5 > 15 && !isHighFlyer) {
    const baseWeight = 18;
    score += baseWeight;
    signals.push({
      type: 'Overbought',
      severity: 'Medium',
      description: `5日线乖离率${bias5.toFixed(1)}%，获利盘兑现压力`,
      baseWeight,
      group: 'TECHNICAL'
    });
  }
  
  // === 11. 筹码压力 (Chip Pressure) - v41.0 新增 ===
  const chipPressure = technicals.chipPressure || 50;
  if (chipPressure > 70 && change > 0) {
    const baseWeight = 20;
    score += baseWeight;
    signals.push({
      type: 'ChipPressure',
      severity: 'Medium',
      description: `上方筹码压力${chipPressure.toFixed(0)}%，套牢盘沉重`,
      baseWeight,
      group: 'EXHAUSTION'
    });
  }
  
  // === 12. 获利盘过多 (Profit Taking Risk) - v41.0 新增 ===
  const profitRatio = technicals.profitRatio || 50;
  if (profitRatio > 75 && phase === 'Ebb') {
    const baseWeight = 25;
    score += baseWeight;
    signals.push({
      type: 'ProfitTaking',
      severity: 'High',
      description: `获利盘比例${profitRatio.toFixed(0)}%，退潮期兑现压力极大`,
      baseWeight,
      group: 'EXHAUSTION'
    });
  }

  // === 13. T-1 融资融券杠杆风险 ===
  // 仅当数据完整且能用成交额归一化时生效；不将融资等同于主力资金。
  const marginRisk = assessMarginTradingRisk(stock);
  if (marginRisk.status === 'AVAILABLE' && marginRisk.riskScore > 0) {
    signals.push({
      type: 'MarginLeverage',
      severity: marginRisk.riskScore >= 18 ? 'High' : 'Medium',
      description: marginRisk.evidence[0] || '融资融券杠杆风险上升',
      baseWeight: marginRisk.riskScore,
      group: 'LEVERAGE'
    });
  }
  
  // === v41.1 信号分组总分限制 ===
  // 对每个分组的信号进行排序和截断，只保留权重最高的信号直到达到上限
  const groupedSignals: Record<string, TrapSignal[]> = {};
  
  // 按分组归类信号
  signals.forEach(signal => {
    const group = signal.group;
    if (!groupedSignals[group]) {
      groupedSignals[group] = [];
    }
    groupedSignals[group].push(signal);
  });
  
  // 对每个分组内的信号按权重排序，并限制总分
  const filteredSignals: TrapSignal[] = [];
  let finalScore = 0;
  
  Object.keys(groupedSignals).forEach(group => {
    const groupSignals = groupedSignals[group].sort((a, b) => b.baseWeight - a.baseWeight);
    const limit = SIGNAL_GROUP_LIMITS[group] || 30;
    
    let groupTotal = 0;
    groupSignals.forEach(signal => {
      if (groupTotal + signal.baseWeight <= limit) {
        filteredSignals.push(signal);
        groupTotal += signal.baseWeight;
        finalScore += signal.baseWeight;
      }
    });
  });
  
  // 最终分数归一化到 0-100
  finalScore = Math.min(100, Math.max(0, finalScore));
  
  // 识别主要风险类型
  const primaryRisk = filteredSignals.length > 0
    ? filteredSignals.sort((a, b) => b.baseWeight - a.baseWeight)[0].type
    : 'None';
  
  return {
    score: Math.round(finalScore),
    signals: filteredSignals,
    primaryRisk
  };
};
