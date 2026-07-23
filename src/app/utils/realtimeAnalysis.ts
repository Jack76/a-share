/**
 * 实时盘口分析算法 v18.5 Predator-X (Deep Mind Edition)
 * Real-time Market Data Analysis
 * 
 * 核心功能：
 * 1. 涨停概率计算（基于封单强度、委比、量能）
 * 2. 主力筹码分析（基于大单占比、主动买入）
 * 3. 暗盘资金监测（基于盘口异动、隐性买盘）
 * 4. 主力意图雷达（V18.5升级：增加VWAP锚点与冰山单检测）
 */

import { Stock } from '../types';
import { getDirectLargeOrderNetYuan, getTurnoverYuan } from './capitalFlow';

export interface RealtimeMetrics {
  limitUpProbability: number;      // 涨停概率 (0-100)
  mainForceChips: number;           // 主力筹码集中度 (0-100)
  darkPoolMoney: number;            // 暗盘资金强度 (0-100)
  sealStrength: number;             // 封单强度 (0-100)
  buyPressure: number;              // 买盘压力 (0-100)
  priceStability: number;           // 价格稳定性 (0-100)
  mainForceIntent: 'Accumulate' | 'Distribute' | 'Neutral'; // V18.0: 主力意图
  decoyScore: number;               // V18.0: 欺诈系数 (0-100)
  algoReason?: string;              // V18.5: 算法判定理由
}

/**
 * V18.5: 主力意图雷达 & 挂单欺诈识别 (Main Force Intent & Decoy Detection)
 * 升级：引入 VWAP 锚点与冰山单 (Iceberg) 检测，识别更隐蔽的操盘手法。
 * 
 * 逻辑层级：
 * L1: 盘口挂单背离 (Order Book Divergence)
 * L2: 主动买卖流向 (Active Flow)
 * L3: 均价锚点偏离 (VWAP Deviation) - 判定资金真实成本
 * L4: 冰山吞噬效应 (Iceberg Absorption) - 缩量滞涨 or 放量滞跌
 */
export const analyzeMainForceIntent = (stock: Stock, ticks: any[]): { intent: 'Accumulate' | 'Distribute' | 'Neutral', decoyScore: number, reason?: string } => {
    if (!stock) return { intent: 'Neutral', decoyScore: 0 };
    
    let intent: 'Accumulate' | 'Distribute' | 'Neutral' = 'Neutral';
    let decoyScore = 0; // 0 = Honest, 100 = Total Fraud
    let factors: string[] = [];

    // 1. 获取盘口挂单数据 (Order Book)
    const bidAmount = stock.bidAmount || (stock.bid1Amount || 0) * 5; 
    const askAmount = stock.askAmount || (stock.ask1Amount || 0) * 5; 
    
    // 2. 获取主动成交数据 (Active Flow)
    const activeBuy = stock.buyVolume || 0;
    const activeSell = stock.sellVolume || 0;
    
    // 3. 计算 VWAP (关键修正 V19.0)
    // 优先使用 stock.avgPrice (全天均价) 作为核心锚点，避免 Ticks 样本过小导致的偏差
    // 只有在 avgPrice 缺失时，才使用 Ticks 计算局部均价
    let sessionVwap = stock.avgPrice || 0;
    let localVwap = stock.currentPrice || 0;
    let volumeChurn = 0; // 换手/成交活跃度
    
    if (ticks && ticks.length > 20) {
        let totalVol = 0;
        let totalVal = 0;
        const prices: number[] = [];

        ticks.forEach(t => {
             const v = parseFloat(t.volume || 0);
             const p = parseFloat(t.price || 0);
             if (v > 0 && p > 0) {
                 totalVol += v;
                 totalVal += v * p;
                 prices.push(p);
             }
        });
        
        if (totalVol > 0) localVwap = totalVal / totalVol; // 计算的是近期瞬时均价
        volumeChurn = totalVol; 
        
        // 如果没有全天均价，勉强使用局部均价
        if (sessionVwap === 0) sessionVwap = localVwap;
    }

    const currentPrice = stock.currentPrice || sessionVwap;
    
    // 核心差异：全天成本偏离度 vs 瞬时成本偏离度
    const globalDeviation = sessionVwap > 0 ? (currentPrice - sessionVwap) / sessionVwap : 0; 
    const localDeviation = localVwap > 0 ? (currentPrice - localVwap) / localVwap : 0;

    // --- 核心判定逻辑 ---

    const orderBookRatio = bidAmount > 0 ? (askAmount / bidAmount) : 1; // >1 压盘(卖压大), <1 托盘(买压大)
    const activeFlowRatio = activeSell > 0 ? (activeBuy / activeSell) : 1; // >1 主动买, <1 主动卖
    
    // 场景 A: 压盘吸筹 (Accumulate)
    const isPressureAccumulate = orderBookRatio > 1.5 && activeFlowRatio > 1.1;
    // 黄金坑修正：只有当股价低于全天均价(主力被套或打压)时，吸筹才更可信
    const isVwapSupport = globalDeviation < -0.01 && activeFlowRatio > 1.3; 
    
    if (isPressureAccumulate || isVwapSupport) {
        intent = 'Accumulate';
        
        // 计算得分
        let baseScore = Math.min(60, (orderBookRatio * activeFlowRatio * 15));
        if (isVwapSupport) baseScore += 20; 
        
        // 冰山检测
        if (volumeChurn > (stock.avgVolume || 1000) * 0.1 && Math.abs(stock.changePercent || 0) < 1) {
            baseScore += 20;
            factors.push("冰山吸筹");
        }
        
        if (isPressureAccumulate) factors.push("压单背离");
        if (isVwapSupport) factors.push("水下暗吃");

        // V19.0 趋势共振检查：如果日线趋势极差，吸筹可能是假象(下跌中继)
        // 假设 technicals.ma20 存在
        const ma20 = (stock.technicals as any)?.ma20 || 0;
        if (ma20 > 0 && currentPrice < ma20 * 0.95) {
             baseScore -= 30; // 趋势极差，扣分
             factors.push("(注意:逆势吸筹风险)");
        }

        decoyScore = Math.min(95, baseScore);
    }
    
    // 场景 B: 托单出货 (Distribute)
    const isSupportDistribute = orderBookRatio < 0.6 && activeFlowRatio < 0.8;
    // 诱多修正：股价远高于全天均价(获利盘丰厚) + 瞬时滞涨
    const isVwapTrap = globalDeviation > 0.03 && localDeviation < 0.005 && activeFlowRatio < 0.7; 
    
    if (isSupportDistribute || isVwapTrap) {
        intent = 'Distribute';
        
        let baseScore = Math.min(60, ((1/orderBookRatio) * (1/activeFlowRatio) * 15));
        if (isVwapTrap) baseScore += 30; // 这是一个非常危险的信号
        
        if (volumeChurn > (stock.avgVolume || 1000) * 0.1 && (stock.changePercent || 0) > 5) {
             baseScore += 15;
             factors.push("高位滞涨");
        }
        
        if (isSupportDistribute) factors.push("托单背离");
        if (isVwapTrap) factors.push("偏离度诱多");
        
        decoyScore = Math.min(95, baseScore);
    }
    
    // 场景 C: 中性/诚实
    if (intent === 'Neutral') {
        decoyScore = 0;
    }
    
    const reason = factors.length > 0 ? factors.join('+') : undefined;
    return { intent, decoyScore, reason };
};

/**
 * v7.2 涨停概率计算
 * 基于实时盘口数据：封单量、委比、成交量、价格位置
 * Update: 支持无Ticks数据的纯快照计算模式
 */
export const calculateLimitUpProbability = (stock: Stock, ticks: any[]): number => {
  if (!stock) return 0;

  const currentPrice = stock.currentPrice || 0;
  // If no price, can't calculate
  if (currentPrice === 0) return 0;

  const limitUpPrice = stock.limitUpPrice || (stock.prevClose ? stock.prevClose * 1.1 : currentPrice * 1.1);

  // 0. 特殊处理：如果已经涨停，或者价格已经触及涨停价，概率直接从 90% 起步
  // 允许 0.01 的浮点误差
  const isPriceAtLimit = Math.abs(currentPrice - limitUpPrice) < 0.02;
  if (stock.isLimitUp || isPriceAtLimit) {
      // 基础分 90
      let probability = 90;
      
      // 根据封单强度微调 (如果有封单数据)
      const sealRatio = (stock.sealAmount || 0) / (stock.volume || 1);
      if (sealRatio > 0.2) probability += 5;  // 封单还能再加分
      if (sealRatio > 0.5) probability += 5;  // 超强封单 -> 100%
      
      // 炸板检测：如果炸过板，扣分，表示虽然目前回封但仍有风险
      if (stock.breakCount && stock.breakCount > 0) probability -= 15;
      
      return Math.min(probability, 100);
  }

  const high = stock.high || currentPrice;
  
  let score = 0;

  // 1. 价格位置权重 (40分) - 越接近涨停分越高
  // Fix: handle case where open might be 0 or missing
  const openPrice = stock.open || stock.prevClose || currentPrice;
  const priceRange = limitUpPrice - openPrice;
  
  // 避免除以0
  if (priceRange > 0.01) {
      const pricePosition = ((currentPrice - openPrice) / priceRange) * 100;
      if (pricePosition > 95) score += 40;        // 已接近涨停
      else if (pricePosition > 90) score += 30;   // 90%+
      else if (pricePosition > 80) score += 20;   // 80%+
      else if (pricePosition > 70) score += 10;   // 70%+
  }

  // 2. 封单强度 (30分) - 如果已涨停
  if (stock.isLimitUp) {
    const sealRatio = (stock.sealAmount || 0) / (stock.volume || 1);
    if (sealRatio > 0.3) score += 30;         // 封单量 > 30% 总成交
    else if (sealRatio > 0.2) score += 20;
    else if (sealRatio > 0.1) score += 10;
  } else {
      // 未涨停时，看委比
      const committee = stock.committeeRatio || 0;
      if (committee > 80) score += 15;
      else if (committee > 50) score += 10;
  }

  // 3. 量能强度 (20分)
  const volumeRatio = (stock.volume || 0) / ((stock.avgVolume || stock.volume || 1));
  if (volumeRatio > 3) score += 20;           // 放量3倍+
  else if (volumeRatio > 2) score += 15;      // 放量2倍+
  else if (volumeRatio > 1.5) score += 10;    // 放量1.5倍+

  // 4. 分时走势/趋势强度 (10分)
  if (ticks && ticks.length > 10) {
    const recent = ticks.slice(-10);
    const upTicks = recent.filter((t: any) => parseFloat(t.price || 0) > parseFloat(recent[0].price || 0)).length;
    const upRatio = upTicks / recent.length;
    if (upRatio > 0.8) score += 10;           // 80%时间在上涨
    else if (upRatio > 0.6) score += 5;
  } else {
      // Fallback: 如果没有ticks，用日内强弱代替
      const low = stock.low || currentPrice;
      const dayRange = high - low;
      if (dayRange > 0) {
          const strength = (currentPrice - low) / dayRange;
          if (strength > 0.9) score += 10;
          else if (strength > 0.7) score += 5;
      }
  }

  return Math.min(score, 100);
};

/**
 * v7.2 主力筹码集中度计算
 * 基于大单占比、主动买入、资金流向
 * Update: 增强Snapshot模式下的估算
 */
export const calculateMainForceChips = (stock: Stock, ticks: any[]): number => {
  if (!stock) return 0;

  let score = 0;

  // 1. 大单净流入占比 (40分)
  const bigBuyRatio = (stock.bigBuyAmount || 0) / (stock.volume || 1);
  // 如果没有逐笔大单数据，使用供应商大单净额；不使用量价代理冒充资金流。
  const largeOrderNetYuan = getDirectLargeOrderNetYuan(stock);
  const turnoverYuan = getTurnoverYuan(stock);
  if (stock.bigBuyAmount === undefined && largeOrderNetYuan !== undefined && turnoverYuan) {
       const moneyInRatio = largeOrderNetYuan / turnoverYuan;
       if (moneyInRatio > 0.2) score += 40;
       else if (moneyInRatio > 0.1) score += 25;
       else if (moneyInRatio > 0) score += 10;
  } else {
      if (bigBuyRatio > 0.3) score += 40;         // 大单 > 30%
      else if (bigBuyRatio > 0.2) score += 30;
      else if (bigBuyRatio > 0.1) score += 20;
      else if (bigBuyRatio > 0.05) score += 10;
  }

  // 2. 主力资金净流入 (30分)
  if ((largeOrderNetYuan || 0) > 500_000_000) score += 30;
  else if ((largeOrderNetYuan || 0) > 100_000_000) score += 20;
  else if ((largeOrderNetYuan || 0) > 30_000_000) score += 10;

  // 3. 换手率 (20分) - 适度换手最佳
  const turnoverRate = stock.turnoverRate || 0;
  if (turnoverRate > 5 && turnoverRate < 15) score += 20;  // 5-15%最佳
  else if (turnoverRate > 3 && turnoverRate < 20) score += 15;
  else if (turnoverRate > 1) score += 10;

  // 4. 连续主力流入 (10分)
  if (ticks && ticks.length > 20) {
    const recent = ticks.slice(-20);
    const bigOrders = recent.filter((t: any) => parseFloat(t.volume || 0) > (stock.avgVolume || 0) / 100);
    const bigOrderRatio = bigOrders.length / recent.length;
    if (bigOrderRatio > 0.4) score += 10;
    else if (bigOrderRatio > 0.3) score += 5;
  } else {
      // Fallback: 量比大于1.5且价格上涨
      const volumeRatio = (stock.volume || 0) / (stock.avgVolume || stock.volume || 1);
      const isUp = (stock.changePercent || 0) > 0;
      if (volumeRatio > 1.5 && isUp) score += 10;
      else if (volumeRatio > 1.2 && isUp) score += 5;
  }

  return Math.min(score, 100);
};

/**
 * v7.2 暗盘资金监测
 * 基于盘口异动、隐性买盘、委托单分布
 * Update: Snapshot Fallback
 */
export const calculateDarkPoolMoney = (stock: Stock, ticks: any[]): number => {
  if (!stock) return 0;

  let score = 0;

  // 1. 隐性买盘强度 (40分) - 主动买入 vs 被动卖出
  const buyVolume = stock.buyVolume || 0;
  const sellVolume = stock.sellVolume || 0;
  
  if (buyVolume + sellVolume > 0) {
      const hiddenBuyRatio = buyVolume / (buyVolume + sellVolume);
      if (hiddenBuyRatio > 0.7) score += 40;      // 70%主动买入
      else if (hiddenBuyRatio > 0.6) score += 30;
      else if (hiddenBuyRatio > 0.55) score += 20;
      else if (hiddenBuyRatio > 0.5) score += 10;
  } else {
      // Fallback: 如果没有买卖量细分，使用内外盘比或者ChangePercent趋势
      if ((stock.changePercent || 0) > 3) score += 20; // 强势上涨通常伴随主动买入
      if ((stock.changePercent || 0) > 5) score += 10;
  }

  // 2. 盘口压单异动 (30分)
  const bidAmount = stock.bidAmount || 0;     // 买一到买五总量
  const askAmount = stock.askAmount || 0;     // 卖一到卖五总量
  
  // 某些源可能没有 amount，只有 vol
  const hasOrderBook = bidAmount > 0 || askAmount > 0;
  
  if (hasOrderBook) {
      const bidAskRatio = bidAmount / (askAmount || 1);
      if (bidAskRatio > 3) score += 30;           // 买盘压倒性优势
      else if (bidAskRatio > 2) score += 20;
      else if (bidAskRatio > 1.5) score += 10;
  } else {
      // Fallback: 委比
      const committee = stock.committeeRatio || 0;
      if (committee > 30) score += 20;
      else if (committee > 10) score += 10;
  }

  // 2.5 [NEW] 主力资金背离监测 (Ghost Divergence) (New 20分)
  // 逻辑：主力大幅流入但股价未涨 -> 典型的隐性承接/压盘吸筹
  const largeOrderNetYuan = getDirectLargeOrderNetYuan(stock);
  if (largeOrderNetYuan !== undefined) {
      const mainMoney = largeOrderNetYuan;
      const change = stock.changePercent || 0;
      
      // 场景A: 强资金流入 + 滞涨 (吸筹)
      if (mainMoney > 50000000 && change < 3) {
          score += 20; // 5000万+ 且涨幅<3% -> 极强隐性承接
      } else if (mainMoney > 20000000 && change < 2) {
          score += 15;
      } 
      // 场景B: 逆势抗跌 (大盘跌/个股微跌 + 主力红)
      else if (mainMoney > 10000000 && change > -2 && change < 1) {
          score += 10;
      }
      // 场景C: 主力流出则扣分 (非暗盘买入)
      else if (mainMoney < -10000000) {
          score -= 10;
      }
  }

  // 3. 大单隐蔽吸筹 (20分) - 缩量涨停最危险（诱多），放量涨停最安全
  if (stock.isLimitUp) {
    const volumeRatio = (stock.volume || 0) / (stock.avgVolume || stock.volume || 1);
    if (volumeRatio < 0.8) {
      score -= 20; // 缩量涨停，扣分（可能是诱多陷阱）
    } else if (volumeRatio > 1.5) {
      score += 20; // 放量涨停，加分（资金活跃）
    } else {
      score += 10; // 平量涨停，中性
    }
  } else {
      // 未涨停，看是否抗跌 (大盘跌个股涨)
      // 这里简化为：红盘且量比正常
      if ((stock.changePercent || 0) > 0) score += 10;
  }

  // 4. 分时资金流向 (10分) - 基于Ticks数据
  if (ticks && ticks.length > 30) {
    const recent = ticks.slice(-30);
    let netFlow = 0;
    recent.forEach((tick: any) => {
      const vol = parseFloat(tick.volume || 0);
      const price = parseFloat(tick.price || 0);
      const prevPrice = parseFloat(recent[Math.max(0, recent.indexOf(tick) - 1)]?.price || price);
      if (price > prevPrice) netFlow += vol;
      else if (price < prevPrice) netFlow -= vol;
    });
    if (netFlow > 0) score += 10;
  } else {
      // Fallback: 均价线上方
      const avgPrice = (stock.amount || 0) / (stock.volume || 1) / 100; // 估算均价
      if (stock.currentPrice && stock.currentPrice > avgPrice) score += 10;
  }

  return Math.max(0, Math.min(score, 100));
};

/**
 * v7.2 封单强度分析
 * 专门针对已涨停股票的封单质量评估
 * (Keep mostly as is, just safety checks)
 */
export const calculateSealStrength = (stock: Stock): number => {
  if (!stock.isLimitUp) return 0;

  let score = 0;

  // 1. 封单金额占比 (40分)
  const sealRatio = (stock.sealAmount || 0) / (stock.volume || 1);
  if (sealRatio > 0.5) score += 40;
  else if (sealRatio > 0.3) score += 30;
  else if (sealRatio > 0.2) score += 20;
  else if (sealRatio > 0.1) score += 10;

  // 2. 涨停时间 (30分) - 越早越强
  const limitUpTime = stock.limitUpTime || '14:30';
  const hour = parseInt(limitUpTime.split(':')[0]);
  const minute = parseInt(limitUpTime.split(':')[1]);
  const totalMinutes = (hour - 9) * 60 + minute - 30;
  
  if (totalMinutes < 30) score += 30;         // 10点前
  else if (totalMinutes < 60) score += 25;    
  else if (totalMinutes < 120) score += 20;   
  else if (totalMinutes < 240) score += 10;   

  // 3. 炸板次数 (20分) - 越少越强
  const breakCount = stock.breakCount || 0;
  if (breakCount === 0) score += 20;
  else if (breakCount === 1) score += 10;
  else score -= 10;

  // 4. 封单量级 (10分)
  const sealAmount = stock.sealAmount || 0;
  if (sealAmount > 100000000) score += 10;    // 1亿+
  else if (sealAmount > 50000000) score += 5; 
  
  return Math.max(0, Math.min(score, 100));
};

/**
 * v7.2 买盘压力指标
 * 衡量市场对该股的追涨意愿
 * Update: Snapshot Fallback
 */
export const calculateBuyPressure = (stock: Stock, ticks: any[]): number => {
  if (!stock) return 0;

  let score = 0;

  // 1. 委比 (40分)
  const committeeRatio = stock.committeeRatio || 0;
  if (committeeRatio > 50) score += 40;
  else if (committeeRatio > 30) score += 30;
  else if (committeeRatio > 10) score += 20;
  else if (committeeRatio > 0) score += 10;

  // 2. 外盘占比 (30分)
  const outerVolume = stock.buyVolume || 0;
  const totalVolume = stock.volume || 1;
  
  if (totalVolume > 0 && outerVolume > 0) {
      const outerRatio = (outerVolume / totalVolume) * 100;
      if (outerRatio > 70) score += 30;
      else if (outerRatio > 60) score += 20;
      else if (outerRatio > 55) score += 10;
  } else {
      // Fallback: 用涨跌幅代理买盘意愿
      const change = stock.changePercent || 0;
      if (change > 7) score += 25;
      else if (change > 4) score += 15;
  }

  // 3. 挂单深度 (20分)
  // Use specific bid/ask amounts if available, else skip or guess
  const bidDepth = (stock.bid1Amount || 0) + (stock.bid2Amount || 0);
  const askDepth = (stock.ask1Amount || 0) + (stock.ask2Amount || 0);
  
  if (bidDepth > 0 || askDepth > 0) {
      const depthRatio = bidDepth / (askDepth || 1);
      if (depthRatio > 2) score += 20;
      else if (depthRatio > 1.5) score += 15;
      else if (depthRatio > 1) score += 10;
  } else {
      // Fallback
      if (committeeRatio > 20) score += 10;
  }

  // 4. 分时攻击力 (10分)
  if (ticks && ticks.length > 15) {
    const recent = ticks.slice(-15);
    const avgPrice = recent.reduce((sum: number, t: any) => sum + parseFloat(t.price || 0), 0) / recent.length;
    const currentPrice = stock.currentPrice || 0;
    if (currentPrice > avgPrice * 1.01) score += 10; 
    else if (currentPrice > avgPrice) score += 5;
  } else {
       // Fallback: Current Price near High?
       const high = stock.high || 0;
       const current = stock.currentPrice || 0;
       if (high > 0 && current >= high * 0.99) score += 10;
  }

  return Math.min(score, 100);
};

/**
 * v7.2 价格稳定性分析
 * 评估股价是否稳定向上，还是剧烈震荡
 * Update: Snapshot Fallback
 */
export const calculatePriceStability = (stock: Stock, ticks: any[]): number => {
  if (!stock) return 50; 

  let score = 100;

  // 1. 振幅惩罚 (最多扣40分)
  const high = stock.high || stock.currentPrice || 0;
  const low = stock.low || stock.currentPrice || 0;
  
  if (low > 0) {
      const amplitude = ((high - low) / low) * 100;
      if (amplitude > 8) score -= 40;             
      else if (amplitude > 6) score -= 30;
      else if (amplitude > 4) score -= 20;
      else if (amplitude > 3) score -= 10;
  }

  // 2. 分时波动率 (最多扣30分)
  if (ticks && ticks.length > 30) {
    const recent = ticks.slice(-30);
    const prices = recent.map((t: any) => parseFloat(t.price || 0));
    const mean = prices.reduce((sum: number, p: number) => sum + p, 0) / prices.length;
    const variance = prices.reduce((sum: number, p: number) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / mean) * 100; // 变异系数

    if (cv > 3) score -= 30;
    else if (cv > 2) score -= 20;
    else if (cv > 1) score -= 10;
  } else {
      // Fallback: High-Low Gap vs Change
      // 如果振幅大但涨幅小，说明震荡剧烈 -> 扣分
      const amplitude = low > 0 ? ((high - low) / low) * 100 : 0;
      const change = Math.abs(stock.changePercent || 0);
      if (amplitude > change + 3) score -= 15;
  }

  // 3. 回撤幅度 (最多扣20分)
  if (high > 0 && stock.currentPrice) {
      const drawdown = ((high - stock.currentPrice) / high) * 100;
      if (drawdown > 5) score -= 20;
      else if (drawdown > 3) score -= 15;
      else if (drawdown > 2) score -= 10;
      else if (drawdown > 1) score -= 5;
  }

  // 4. 涨停状态加分 (最多加10分)
  if (stock.isLimitUp) {
    const breakCount = stock.breakCount || 0;
    if (breakCount === 0) score += 10;        
    else if (breakCount === 1) score += 5;    
  }

  return Math.max(0, Math.min(score, 100));
};

/**
 * v7.2 综合实时指标计算
 * 一次性计算所有实时指标
 */
export const calculateRealtimeMetrics = (stock: Stock, ticks: any[]): RealtimeMetrics => {
  const intentAnalysis = analyzeMainForceIntent(stock, ticks);
  
  return {
    limitUpProbability: calculateLimitUpProbability(stock, ticks),
    mainForceChips: calculateMainForceChips(stock, ticks),
    darkPoolMoney: calculateDarkPoolMoney(stock, ticks),
    sealStrength: calculateSealStrength(stock),
    buyPressure: calculateBuyPressure(stock, ticks),
    priceStability: calculatePriceStability(stock, ticks),
    mainForceIntent: intentAnalysis.intent,
    decoyScore: intentAnalysis.decoyScore,
    algoReason: intentAnalysis.reason // V18.5
  };
};
