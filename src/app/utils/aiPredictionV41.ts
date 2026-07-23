/**
 * v41.0 AI预判系统全面优化 (Enhanced AI Prediction System)
 * 
 * 核心升级：
 * 1. 集成v41.0所有新功能（动态TrapGuard、预期差v41、MACD/RSI背离）
 * 2. 增加250日长周期趋势判断
 * 3. 多时间周期共振分析（短期5日 + 中期20日 + 长期250日）
 * 4. 基于ATR动态防线的精准买卖点
 * 5. 市场阶段适配的策略调整
 */

import { Stock, MarketPhase } from '../types';
import { calculateAlphaDivergence } from './indicators';
import { analyzeTrapRiskV41 } from './trapGuardV41';
import { calculateExpectationGapV41 } from './expectationGapV41';

export interface AIPredictionV41 {
  trend: 'Accelerate' | 'Divergence' | 'Top' | 'Rebound' | 'Neutral';
  summary: string;
  strategy: string;
  positionAdvice: string;
  buyPoint: string;
  sellPoint: string;
  // v41.0 新增字段
  longTermTrend: 'Bull' | 'Bear' | 'Sideways';      // 长期趋势（250日）
  mediumTermTrend: 'Bull' | 'Bear' | 'Sideways';    // 中期趋势（20日）
  shortTermTrend: 'Bull' | 'Bear' | 'Sideways';     // 短期趋势（5日）
  cycleResonance: boolean;                           // 多周期共振
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical'; // 综合风险等级
  confidence: number;                                // 预判信心度（0-100）
  keyFactors: string[];                              // 关键判断因子
}

/**
 * 计算长周期趋势（250日）
 */
const calculateLongTermTrend = (
  history: { close: number; high?: number; low?: number; volume?: number }[],
  currentPrice: number,
  ma250: number | null
): { trend: 'Bull' | 'Bear' | 'Sideways'; strength: number; description: string } => {
  
  if (!ma250 || history.length < 250) {
    return { 
      trend: 'Sideways', 
      strength: 50,
      description: '数据不足（需要250日）'
    };
  }
  
  // 1. 价格相对MA250位置
  const priceVsMA250 = ((currentPrice - ma250) / ma250) * 100;
  
  // 2. MA250斜率（最近20日的变化）
  const recent20 = history.slice(-20);
  if (recent20.length < 20) {
    return { trend: 'Sideways', strength: 50, description: '中期数据不足' };
  }
  
  const closes = history.map(h => h.close);
  const ma250_20daysAgo = closes.length >= 270 
    ? closes.slice(-270, -250).reduce((a, b) => a + b, 0) / 20
    : ma250;
  
  const ma250Slope = ((ma250 - ma250_20daysAgo) / ma250_20daysAgo) * 100;
  
  // 3. 250日内的相对位置（当前价格 vs 250日高低点）
  const last250 = history.slice(-250);
  const high250 = Math.max(...last250.map(h => h.high || h.close));
  const low250 = Math.min(...last250.map(h => h.low || h.close));
  const relativePosition = (currentPrice - low250) / (high250 - low250) * 100; // 0-100
  
  // 4. 综合判断
  let trend: 'Bull' | 'Bear' | 'Sideways' = 'Sideways';
  let strength = 50;
  let description = '';
  
  // 牛市特征：价格站上MA250 + MA250上行 + 处于250日高位区
  if (priceVsMA250 > 5 && ma250Slope > 0.5 && relativePosition > 60) {
    trend = 'Bull';
    strength = Math.min(100, 50 + priceVsMA250 + ma250Slope * 10 + (relativePosition - 50));
    description = `长期牛市（站上年线${priceVsMA250.toFixed(1)}%，处于250日高位区）`;
  }
  // 强牛：价格远离MA250且MA250陡峭上行
  else if (priceVsMA250 > 15 && ma250Slope > 1) {
    trend = 'Bull';
    strength = 90;
    description = `强势长牛（远超年线${priceVsMA250.toFixed(1)}%，趋势强劲）`;
  }
  // 弱牛：价格略高于MA250
  else if (priceVsMA250 > 0 && priceVsMA250 <= 5) {
    trend = 'Bull';
    strength = 60;
    description = `弱势长牛（刚站上年线，需要确认）`;
  }
  
  // 熊市特征：价格跌破MA250 + MA250下行 + 处于250日低位区
  else if (priceVsMA250 < -5 && ma250Slope < -0.5 && relativePosition < 40) {
    trend = 'Bear';
    strength = Math.max(0, 50 + priceVsMA250 - ma250Slope * 10 - (50 - relativePosition));
    description = `长期熊市（跌破年线${Math.abs(priceVsMA250).toFixed(1)}%，处于250日低位区）`;
  }
  // 强熊：价格远离MA250且MA250陡峭下行
  else if (priceVsMA250 < -15 && ma250Slope < -1) {
    trend = 'Bear';
    strength = 10;
    description = `深度长熊（远低于年线${Math.abs(priceVsMA250).toFixed(1)}%，趋势疲弱）`;
  }
  // 弱熊：价格略低于MA250
  else if (priceVsMA250 < 0 && priceVsMA250 >= -5) {
    trend = 'Bear';
    strength = 40;
    description = `弱势长熊（刚跌破年线，观察企稳）`;
  }
  
  // 横盘：价格围绕MA250波动，MA250平坦
  else {
    trend = 'Sideways';
    strength = 50;
    description = `长期横盘（围绕年线波动，方向不明）`;
  }
  
  return { trend, strength, description };
};

/**
 * 计算中期趋势（20日）
 */
const calculateMediumTermTrend = (
  currentPrice: number,
  ma20: number | null,
  ma60: number | null
): { trend: 'Bull' | 'Bear' | 'Sideways'; description: string } => {
  
  if (!ma20) {
    return { trend: 'Sideways', description: '数据不足' };
  }
  
  const priceVsMA20 = ((currentPrice - ma20) / ma20) * 100;
  
  // MA20与MA60的关系（金叉/死叉）
  const isGoldenCross = ma60 && ma20 > ma60;
  const isDeathCross = ma60 && ma20 < ma60;
  
  if (priceVsMA20 > 3 && isGoldenCross) {
    return { 
      trend: 'Bull', 
      description: '中期强势（站稳20日线，均线多头排列）' 
    };
  } else if (priceVsMA20 > 0) {
    return { 
      trend: 'Bull', 
      description: '中期偏强（站上20日线）' 
    };
  } else if (priceVsMA20 < -3 && isDeathCross) {
    return { 
      trend: 'Bear', 
      description: '中期弱势（跌破20日线，均线空头排列）' 
    };
  } else if (priceVsMA20 < 0) {
    return { 
      trend: 'Bear', 
      description: '中期偏弱（失守20日线）' 
    };
  } else {
    return { 
      trend: 'Sideways', 
      description: '中期震荡（围绕20日线波动）' 
    };
  }
};

/**
 * 计算短期趋势（5日）
 */
const calculateShortTermTrend = (
  currentPrice: number,
  ma5: number | null,
  ma10: number | null
): { trend: 'Bull' | 'Bear' | 'Sideways'; description: string } => {
  
  if (!ma5) {
    return { trend: 'Sideways', description: '数据不足' };
  }
  
  const priceVsMA5 = ((currentPrice - ma5) / ma5) * 100;
  const isGoldenCross = ma10 && ma5 > ma10;
  const isDeathCross = ma10 && ma5 < ma10;
  
  if (priceVsMA5 > 2 && isGoldenCross) {
    return { 
      trend: 'Bull', 
      description: '短期强势（站稳5日线，短期金叉）' 
    };
  } else if (priceVsMA5 > 0) {
    return { 
      trend: 'Bull', 
      description: '短期偏强（站上5日线）' 
    };
  } else if (priceVsMA5 < -2 && isDeathCross) {
    return { 
      trend: 'Bear', 
      description: '短期弱势（跌破5日线，短期死叉）' 
    };
  } else if (priceVsMA5 < 0) {
    return { 
      trend: 'Bear', 
      description: '短期偏弱（失守5日线）' 
    };
  } else {
    return { 
      trend: 'Sideways', 
      description: '短期震荡' 
    };
  }
};

/**
 * v41.0 AI预判核心引擎
 */
export const generateAIPredictionV41 = (
  stock: Stock,
  marketTemp: number,
  phase: MarketPhase,
  allStocks: Stock[]
): AIPredictionV41 => {
  
  const change = stock.changePercent || 0;
  const isLimitUp = stock.isLimitUp;
  const history = stock.history || [];
  const technicals = stock.technicals || {};
  const currentPrice = stock.currentPrice || 0;
  
  // === 1. 长中短周期趋势判断 ===
  const longTermAnalysis = calculateLongTermTrend(
    history, 
    currentPrice, 
    technicals.ma250 || null
  );
  
  const mediumTermAnalysis = calculateMediumTermTrend(
    currentPrice,
    technicals.ma20 || null,
    technicals.ma60 || null
  );
  
  const shortTermAnalysis = calculateShortTermTrend(
    currentPrice,
    technicals.ma5 || null,
    technicals.ma10 || null
  );
  
  // === 2. 多周期共振判断 ===
  const cycleResonance = 
    (longTermAnalysis.trend === 'Bull' && mediumTermAnalysis.trend === 'Bull' && shortTermAnalysis.trend === 'Bull') ||
    (longTermAnalysis.trend === 'Bear' && mediumTermAnalysis.trend === 'Bear' && shortTermAnalysis.trend === 'Bear');
  
  // === 3. v41.0 动态TrapGuard ===
  const trapResult = analyzeTrapRiskV41(stock, phase, allStocks);
  
  // === 4. v41.0 预期差模型 ===
  const gapResult = calculateExpectationGapV41(stock, marketTemp);
  
  // === 5. Alpha背离 ===
  const { alpha } = calculateAlphaDivergence(history, isLimitUp);
  
  // === 6. ATR动态防线 ===
  const atr = technicals.atr || (currentPrice * 0.03);
  const atrPercent = (atr / currentPrice) * 100;
  const atrBands = technicals.atrBands;
  
  // === 7. 背离检测 ===
  const hasBearDivergence = 
    technicals.macdDivergence === 'bear' || 
    technicals.rsiDivergence === 'bear';
  const hasBullDivergence = 
    technicals.macdDivergence === 'bull' || 
    technicals.rsiDivergence === 'bull';
  
  // === 7.1 MACD/KDJ 金叉死叉状态检测 (v41.2 Added) ===
  const macd = technicals.macd;
  const kdj = technicals.kdj;
  
  // MACD 金叉: DIF > DEA
  const isMACDGold = macd && macd.dif > macd.dea;
  // MACD 水上: DIF > 0 && DEA > 0
  const isMACDWater = macd && macd.dif > 0 && macd.dea > 0;
  // MACD 空中加油: 水上金叉 + 绿柱缩短或刚转红 (这里简化为水上金叉)
  const isAerialRefuel = isMACDGold && isMACDWater;
  
  // KDJ 金叉: J > K && K > D
  const isKDJGold = kdj && kdj.j > kdj.k && kdj.k > kdj.d;
  
  // === 8. 筹码分析 ===
  const chipPressure = technicals.chipPressure || 50;
  const chipSupport = technicals.chipSupport || 50;
  const profitRatio = technicals.profitRatio || 50;
  
  // === 9. 综合风险评级 ===
  let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Medium';
  if (trapResult.score > 75 || hasBearDivergence) {
    riskLevel = 'Critical';
  } else if (trapResult.score > 60) {
    riskLevel = 'High';
  } else if (trapResult.score > 40) {
    riskLevel = 'Medium';
  } else {
    riskLevel = 'Low';
  }
  
  // === 10. 核心预判逻辑 ===
  let trend: AIPredictionV41['trend'] = 'Neutral';
  let summary = '';
  let strategy = '';
  let positionAdvice = '观望';
  let buyPoint = '';
  let sellPoint = '';
  let confidence = 50;
  const keyFactors: string[] = [];
  
  // === 场景A: 三周期共振牛市 + 超预期 (最强信号) ===
  if (
    cycleResonance && 
    longTermAnalysis.trend === 'Bull' && 
    gapResult.gap > 4 && 
    trapResult.score < 40 &&
    chipPressure < 50
  ) {
    trend = 'Accelerate';
    summary = `【三周期共振牛】长期牛市 + 超预期高开 + 低诱多风险，黄金买点`;
    strategy = `多周期共振向上，主力资金持续流入。回踩ATR下支撑(¥${atrBands?.lowerSupport})不破，激进扫板`;
    positionAdvice = '重仓出击';
    buyPoint = atrBands ? `¥${atrBands.lowerSupport}` : '五日线吸';
    sellPoint = atrBands ? `¥${atrBands.upperResistance}` : '目标+15%';
    confidence = 90;
    keyFactors.push('三周期共振', '超预期', '低风险', '筹码压力轻');
  }
  
  // === 场景B: 长期牛市 + 短期回调 (黄金坑) ===
  else if (
    longTermAnalysis.trend === 'Bull' &&
    longTermAnalysis.strength > 70 &&
    shortTermAnalysis.trend === 'Bear' &&
    change < -3 &&
    trapResult.score < 50 &&
    chipSupport > 40
  ) {
    trend = 'Rebound';
    summary = `【黄金坑】长期牛市途中的短期回调，下方筹码支撑${chipSupport.toFixed(0)}%充足`;
    strategy = `长期趋势未变，短期回调是加仓机会。ATR下支撑(¥${atrBands?.lowerSupport})附近分批买入`;
    positionAdvice = '逢低加仓';
    buyPoint = atrBands ? `¥${atrBands.lowerSupport}` : '20日线附近';
    sellPoint = atrBands ? `¥${atrBands.upperResistance}` : '前高';
    confidence = 80;
    keyFactors.push('长期牛市', '短期回调', '低风险', '强支撑');
  }
  
  // === 场景C: 超预期弱转强 (预期差主导) ===
  else if (gapResult.gap > 4 && change > 0 && trapResult.score < 50) {
    // V41.4: Alpha Check for Fake WTS
    if (alpha < -10) {
        trend = 'Neutral'; // Downgrade from Accelerate
        summary = `【伪弱转强】竞价抢跑但资金背离(Alpha:${alpha.toFixed(1)})，谨防诈尸`;
        strategy = `典型的"骗线"形态。表面竞价超预期，实则主力资金大幅流出，大概率为拉高出货`;
        positionAdvice = '观望防骗';
        buyPoint = '不建议参与';
        sellPoint = '现价';
        confidence = 40; // Low confidence
        keyFactors.push('资金背离', '诱多风险', '伪强');
    } else {
        trend = 'Accelerate';
        summary = `【弱转强】${gapResult.reason}`;
        strategy = `竞价超预期，资金抢筹明显。回踩分时均线不破可追，博弈连板`;
        positionAdvice = '积极参与';
        buyPoint = '分时均线吸';
        sellPoint = atrBands ? `¥${atrBands.upperSupport}` : '不炸不卖';
        confidence = 75;
        keyFactors.push('超预期', gapResult.scenario, '低风险');
    }
  }
  
  // === 场景D: 涨停板确认 ===
  else if (isLimitUp && trapResult.score < 60) {
    trend = 'Accelerate';
    summary = '【板上确认】一致性达成，筹码锁定';
    strategy = '持筹者盛宴。排撤自由，坐享溢价，不炸不卖';
    positionAdvice = '锁仓不动';
    buyPoint = '已在板上';
    sellPoint = '炸板或破5日线';
    confidence = 70;
    keyFactors.push('涨停', trapResult.score < 40 ? '低风险' : '中等风险');
  }
  
  // === 场景E: 顶背离 + 高诱多风险 (危险信号) ===
  else if (
    (hasBearDivergence || trapResult.score > 75) &&
    (chipPressure > 70 || profitRatio > 75)
  ) {
    trend = 'Top';
    summary = `【顶部信号】${hasBearDivergence ? 'MACD/RSI顶背离' : '高诱多风险'}，上方筹码压力${chipPressure.toFixed(0)}%`;
    strategy = `机械离场，禁止幻想。破ATR上支撑(¥${atrBands?.upperSupport})立即止损`;
    positionAdvice = '清仓走人';
    buyPoint = '不建议买入';
    sellPoint = '现价/反抽即走';
    confidence = 85;
    keyFactors.push(
      hasBearDivergence ? '顶背离' : '高风险',
      '筹码压力重',
      trapResult.primaryRisk
    );
  }

  // === 场景E-1: 高位死叉 (MACD水上死叉) (v41.2 Added) ===
  else if (
    !isMACDGold && isMACDWater && // 水上死叉 (DIF < DEA & DIF > 0)
    change < -1 &&
    shortTermAnalysis.trend === 'Bear'
  ) {
    trend = 'Top';
    summary = `【高位死叉】MACD高位死叉确立，上升趋势破坏`;
    strategy = `技术面发出离场信号，多头动能衰竭。若无法快速修复，谨防加速下跌`;
    positionAdvice = '反抽离场';
    buyPoint = '不建议买入';
    sellPoint = '现价';
    confidence = 75;
    keyFactors.push('高位死叉', '趋势破坏');
  }
  
  // === 场景F: 不及预期 + 主力出货 ===
  else if (gapResult.gap < -4 || (trapResult.score > 60 && alpha < -10)) {
    trend = 'Top';
    summary = gapResult.gap < -4 
      ? `【主力出货】${gapResult.reason}` 
      : `【诱多派发】${trapResult.primaryRisk}，资金流出(Alpha:${alpha.toFixed(1)})`;
    strategy = '竞价抢跑或资金撤退，禁止抄底。破位离场，不留恋';
    positionAdvice = '一键清仓';
    buyPoint = '不建议买入';
    sellPoint = '现价';
    confidence = 80;
    keyFactors.push('不及预期', '资金流出', trapResult.primaryRisk);
  }
  
  // === 场景G: 长期熊市 + 中期反弹 (反弹非反转) ===
  else if (
    longTermAnalysis.trend === 'Bear' &&
    mediumTermAnalysis.trend === 'Bull' &&
    change > 3
  ) {
    trend = 'Rebound';
    summary = `【反弹非反转】长期熊市中的技术性反弹，不改变长期趋势`;
    strategy = `短线博弈为主，快进快出。破5日线立即止损，不可恋战`;
    positionAdvice = '底仓试错';
    buyPoint = atrBands ? `¥${atrBands.lowerSupport}` : '五日线';
    sellPoint = atrBands ? `¥${atrBands.upperSupport}` : '+5%止盈';
    confidence = 55;
    keyFactors.push('长期熊市', '中期反弹', '短线博弈');
  }
  
  // === 场景H: 蓄势待发 (缩量+正Alpha) ===
  else if (
    !isLimitUp &&
    Math.abs(change) < atrPercent &&
    stock.volume && technicals.avgVol5 && (stock.volume / technicals.avgVol5) < 0.8 && // V41.3: Relaxed from 0.6 to 0.8
    alpha > 3 && // V41.3: Relaxed from 5 to 3
    trapResult.score < 45
  ) {
    trend = 'Rebound';
    const volRatio = stock.volume / technicals.avgVol5;
    summary = `【潜伏伏击】缩量洗盘(量比:${volRatio.toFixed(1)})，暗流涌动`;
    strategy = '左侧博弈点。洗盘末端，主力控盘良好，分批潜伏等待点火';
    positionAdvice = '底仓潜伏';
    buyPoint = atrBands ? `¥${atrBands.lowerSupport}` : '五日线低吸';
    sellPoint = '大阳线';
    confidence = 65;
    keyFactors.push('缩量洗盘', '正Alpha', '低波动');
  }

  // === 场景H-3: 均线回踩 (趋势支撑低吸) (V41.3 Added) ===
  else if (
    longTermAnalysis.trend === 'Bull' && // 必须是长牛背景
    change < -1.5 && change > -5 && // 必须是温和回调，不能是崩盘
    currentPrice > (technicals.ma20 || 0) * 0.98 && // 回踩MA20附近
    currentPrice < (technicals.ma20 || 0) * 1.05 && 
    trapResult.score < 50 && 
    alpha > 0 // 只要主力资金是正的
  ) {
    trend = 'Rebound';
    summary = `【支撑低吸】回踩20日生命线，长牛趋势未改`;
    strategy = `经典的趋势低吸点。长期均线向上发散，短期回踩确认支撑，盈亏比极佳`;
    positionAdvice = '逢低介入';
    buyPoint = '20日线';
    sellPoint = '前高';
    confidence = 70; // 信心度给到70，属于中高
    keyFactors.push('MA20支撑', '趋势低吸', '长牛回调');
  }
  
  // === 场景H-1: 空中加油 (MACD水上金叉 + 趋势向上) (v41.2 Added) ===
  else if (
    isAerialRefuel && 
    trend === 'Neutral' && // 前面没触发其他强信号
    mediumTermAnalysis.trend === 'Bull' &&
    trapResult.score < 60
  ) {
    trend = 'Accelerate';
    summary = `【空中加油】MACD水上金叉，趋势中继再启动`;
    strategy = `上涨中继形态，主力洗盘结束。多头动能(DIF:${macd?.dif.toFixed(2)})再次发散，跟随趋势`;
    positionAdvice = '积极做多';
    buyPoint = '五日线附近';
    sellPoint = atrBands ? `¥${atrBands.upperResistance}` : '前高';
    confidence = 75;
    keyFactors.push('空中加油', '水上金叉', '中继形态');
  }

  // === 场景H-2: 低位金叉共振 (MACD+KDJ双金叉) (v41.2 Added) ===
  else if (
    isMACDGold && isKDJGold &&
    !isMACDWater && // 水下
    change > 0 &&
    trapResult.score < 40
  ) {
    trend = 'Rebound';
    summary = `【双金叉共振】MACD+KDJ低位双金叉，底部确立`;
    strategy = `技术面底部共振，止跌企稳信号明显。右侧买点出现，可轻仓博反弹`;
    positionAdvice = '底仓试错';
    buyPoint = '当前价';
    sellPoint = '0轴压力位';
    confidence = 65;
    keyFactors.push('双金叉', '底部共振');
  }
  
  // === 场景I: 高风险但资金未退 (暴力洗盘) ===
  else if (trapResult.score > 60 && trapResult.score <= 75 && alpha > 0) {
    trend = 'Neutral';
    summary = `【剧烈分歧】盘面凶险，但主力资金未退(Alpha:+${alpha.toFixed(1)})`;
    strategy = `主力借势洗盘，恐慌盘涌出。若不破ATR下支撑(¥${atrBands?.lowerSupport})，暂且观望，谨防被洗`;
    positionAdvice = '轻仓抗单';
    buyPoint = '等待企稳';
    sellPoint = atrBands ? `破¥${atrBands.lowerSupport}` : '破5日线';
    confidence = 50;
    keyFactors.push('高风险', '资金未退', '洗盘');
  }
  
  // === 场景J: 趋势中继（根据周期判断） ===
  else {
    // J1. 三周期共振熊市
    if (cycleResonance && longTermAnalysis.trend === 'Bear') {
      trend = 'Divergence';
      summary = '【三周期共振熊】长中短期均走弱，趋势向下';
      strategy = '空仓观望，不参与下跌';
      positionAdvice = '观望';
      confidence = 70;
      keyFactors.push('三周期共振', '熊市', '趋势下行');
    }
    // J2. 缩量锁仓
    else if (Math.abs(change) < atrPercent && stock.volume && technicals.avgVol5 && (stock.volume / technicals.avgVol5) < 0.8) {
      trend = 'Neutral';
      summary = '【控盘良好】波幅收敛(<ATR)，量能萎缩，主力锁仓';
      strategy = '跟随主力躺赢，破5日线即斩，不破不卖';
      positionAdvice = '持筹不动';
      confidence = 60;
      keyFactors.push('缩量', '低波动', '锁仓');
    }
    // J3. 放量下跌
    else if (change < -atrPercent * 0.8 && stock.volume && technicals.avgVol5 && (stock.volume / technicals.avgVol5) > 1.2) {
      trend = 'Neutral';
      summary = '【放量下跌】抛压涌出，量能放大，主力承接吃力';
      strategy = '谨防破位，反抽减仓';
      positionAdvice = '减仓避险';
      confidence = 65;
      keyFactors.push('放量', '下跌', '抛压');
    }
    // J4. 温和上涨
    else if (change > atrPercent * 0.5 && change < atrPercent * 2) {
      trend = 'Rebound';
      summary = '【温和放量】趋势沿均线攀升，多头排列';
      strategy = '持股待涨，不加速不离场';
      positionAdvice = '持股做T';
      confidence = 60;
      keyFactors.push('温和上涨', mediumTermAnalysis.description);
    }
    // J5. 其他震荡
    else {
      trend = 'Neutral';
      summary = '【随波逐流】缺乏独立逻辑，跟随指数波动';
      strategy = '多看少动，等待方向选择';
      positionAdvice = '观望';
      confidence = 40;
      keyFactors.push('震荡', '方向不明');
    }
    
    buyPoint = atrBands ? `¥${atrBands.lowerSupport}` : '支撑位';
    sellPoint = atrBands ? `¥${atrBands.upperResistance}` : '压力位';
  }
  
  // === 11. 市场阶段修正 ===
  if (phase === 'Ice' || phase === 'Ebb') {
    // 退潮期/冰封期，降低信心度
    confidence = Math.max(0, confidence - 20);
    if (trend === 'Accelerate' && stock.role !== 'Leader') {
      positionAdvice = '谨慎参与（退潮期）';
    }
  } else if (phase === 'Startup' && trend === 'Accelerate') {
    // 启动期，加成信心度
    confidence = Math.min(100, confidence + 10);
  }
  
  return {
    trend,
    summary,
    strategy,
    positionAdvice,
    buyPoint,
    sellPoint,
    // v41.0 新增
    longTermTrend: longTermAnalysis.trend,
    mediumTermTrend: mediumTermAnalysis.trend,
    shortTermTrend: shortTermAnalysis.trend,
    cycleResonance,
    riskLevel,
    confidence: Math.round(confidence),
    keyFactors
  };
};
