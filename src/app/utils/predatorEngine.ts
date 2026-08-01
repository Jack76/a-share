import { Stock, MarketPhase } from "../types";
import {
  detectFundIdentity,
  predictSmashRisk,
} from "./fundIntelligence";
import { calculateStargateLogic } from "./stargateLogic";
import { getTransmissionSpeed, type TransmissionSpeed, type EventDrivenDetection } from "../data/presetStocks";
import {
  calibratePrediction,
  getBuySignalVetoReason,
  resolveMarketRegime,
  type MarketCalibrationContext,
  type PredictionReliability,
  type CalibrationStatus,
} from "./predictionCalibration";
import { calculateLimitState, resolveLimitPercent } from '../../shared/marketRules';
import { getChinaTradingClock, type MarketTimestamp } from './marketClock';
import { assessCapitalFlow } from './capitalFlow';
import { buildHistoricalPatternEvidence } from './historicalEvidence';

export interface EngineRuntimeContext {
  timestamp: MarketTimestamp;
}

export interface PredatorSignal {
  signalType: "BUY" | "SELL" | "WAIT" | "HOLD";
  signalTitle: string;
  adviceText: string;
  trend:
    | "Accelerate"
    | "Divergence"
    | "Top"
    | "Rebound"
    | "Neutral";
  summary: string;
  strategy: string;
  positionAdvice: string;
  score: number;
  buyPoint: number;
  sellPoint: number;
  stopLoss: number;
  // V60.0 Smart Entry System (条件单精算)
  smartEntry?: {
    primary: number;       // 主买点 (条件单挂单价)
    primaryLabel: string;  // 买点依据
    scaleIn: number;       // 加仓位
    scaleInLabel: string;  // 加仓依据
    stopLoss: number;      // 止损位
    stopLossLabel: string; // 止损依据
    target: number;        // 目标价
    targetLabel: string;   // 目标依据
    method: string;        // 介入方式
    rrRatio: number;       // 盈亏比
    urgency: 'NOW' | 'WAIT_DIP' | 'WAIT_BREAK' | 'NEXT_DAY' | 'NO_ENTRY';
    // V60.2: 历史回测统计
    backtest?: {
      sampleSize: number;      // 回测样本数
      winRate: number;          // 实测胜率 (0-100)
      avgWinPct: number;        // 平均盈利幅度 (%)
      avgLossPct: number;       // 平均亏损幅度 (%)
      optimalStopMult: number;  // 最优ATR止损倍数
      profitFactor: number;     // 盈亏比因子
      expectancy: number;       // 期望值 (每笔期望收益%)
      direction?: 'LONG' | 'EXIT';
      validationType?: 'REGIME_WEIGHTED_WALK_FORWARD';
      marketRegime?: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'DIVERGENT' | 'UNKNOWN';
      exactRegimeSampleSize?: number;
      totalSampleSize?: number;
      effectiveSampleSize?: number;
      ownStockSampleSize?: number;
      sectorSampleSize?: number;
      poolSampleSize?: number;
      recentSampleShare?: number;
      horizonDays?: number;
      horizonEvidence?: { horizonDays: number; sampleSize: number; winRate: number; expectancy: number }[];
    };
    // V60.2: 筹码峰价位
    chipPeaks?: {
      supportPeaks: { price: number; strength: number; label: string }[];
      resistancePeaks: { price: number; strength: number; label: string }[];
      chipConcentration: number;  // 筹码集中度 (0-100)
    };
  };
  // V6.0 Oracle Additions (kept for compatibility)
  prediction?: {
    targetHigh: number;
    targetLow: number;
    probability: number; // 0-100 Confidence
    rawProbability?: number;
    dataQuality?: number;
    reliability?: PredictionReliability;
    dataReliability?: PredictionReliability;
    marketDataReliability?: PredictionReliability;
    marketDataStatus?: 'FRESH' | 'PARTIAL' | 'STALE' | 'UNAVAILABLE';
    evidenceReliability?: PredictionReliability;
    calibrationStatus?: CalibrationStatus;
    sampleSize?: number;
    marketRegime?: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'DIVERGENT' | 'UNKNOWN';
    marketDataQuality?: number;
    confidenceLow?: number;
    confidenceHigh?: number;
    warnings?: string[];
    description: string;
    direction: "UP" | "DOWN" | "SIDEWAYS";
    // V50.2 Intraday Scripting
    script?: "V-Reversal" | "A-Dive" | "N-Wave" | "L-Crash" | "W-Grind" | "One-Way" | "Unknown";
  };
  // V6.2 Sector Context (New)
  sectorResonance?: {
    isHotSector: boolean;
    sectorName: string;
    penaltyApplied: boolean;
  };
  // V8.6 Stargate Integration
  stargate?: {
    gateLevel: number;
    score: number;
    signals: string[];
  };
  // V61.0 Board Tier Context (连板梯队上下文)
  boardTier?: {
    tier: 'FIRST' | 'SECOND' | 'THIRD' | 'DRAGON_HIGH' | 'POST_BREAK' | 'NONE';
    boardHeight: number;        // 当前连板高度 (涨停时)
    priorBoardHeight: number;   // 断板前连板高度 (断板次日)
    yesterdayVolHeavy: boolean;  // 昨日天量板
    yesterdayVolShrink: boolean; // 昨日缩量板
    t1Opening: string;          // T+1开盘预期
    t1Script: string;           // T+1剧本
    t1Action: string;           // T+1操作建议
  };
}

/**
 * v10.0 Micro-Structure Context (分时微观数据)
 * 用于注入分时MACD、量比、资金博弈等高频因子
 */
export interface MicroStructureContext {
  macdfs?: "GoldenCross" | "DeadCross" | "None";
  volumeRatio?: number; // 量比
  largeOrderNetYuan?: number; // 大单+超大单净额（元）
  isHeavyVolume?: boolean; // 分时是否放量
}

/**
 * PREDATOR ENGINE V8.7 (Predator-X)
 * A-Share Short-Term Quant Logic with Chip Structure & Divergence Analysis
 *
 * V8.7 Upgrade:
 * - Integration of "Resonance Pulse" (Sector acceleration).
 * - "Sector Drag" Punishment (Extreme divergence from sector trend).
 * - Adaptive Decision thresholds based on Phase Confidence.
 *
 * V10.0 Upgrade:
 * - Integration of Intraday Micro-Structure (MACDFS, Volume Ratio, Capital Flow).
 *
 * V11.0 Upgrade (Ghost Protocol):
 * - Detection of "Iceberg Orders" (Big orders split into small ones).
 * - "Stealth Hunter" logic to override false SELL signals during accumulation.
 */
export const analyzeStockSignal = (
  stock: Stock,
  phase: MarketPhase,
  marketContext?: MarketCalibrationContext,
  sectorContext?: {
    rank: number;
    name: string;
    isMainline: boolean;
  },
  allThemes: any[] = [], // New Parameter
  manualVelocity?: number, // V10.0: Real-time Velocity Injection
  microContext?: MicroStructureContext & {
    tradeCount?: number; // 成交笔数 (用于计算拆单)
    avgTradeSize?: number; // 笔均量
    buyOrderSmall?: number; // 小单买入占比
    sellOrderLarge?: number; // 大单卖出占比
  },
  intentContext?: {
    // V20.0: Real-time Intent Injection
    intent: "Accumulate" | "Distribute" | "Neutral";
    decoyScore: number;
    algoReason?: string;
  },
  eventDrivenContext?: EventDrivenDetection, // V64.0: 事件驱动传导时滞修正
  runtimeContext?: EngineRuntimeContext,
  historicalPeerStocks: Stock[] = [],
): PredatorSignal => {
  // --- 1. Initialization & DNA Profiling (V13.0) ---
  const current = stock.currentPrice || 0;
  const high = stock.high || current;
  const low = stock.low || current;
  const prevClose = stock.prevClose || current;
  const open = stock.open || prevClose;
  const limitState = calculateLimitState({
    code: stock.code,
    name: stock.name,
    currentPrice: current,
    previousClose: prevClose,
    changePercent: stock.changePercent || 0,
    sourceLimitUpPrice: stock.limitUpPrice,
    sourceLimitDownPrice: stock.limitDownPrice,
  });
  const limitUpPrice = limitState.limitUpPrice;
  const volume = stock.volume || 0;

  // V13.0 DNA Calculation: Elasticity & Personality
  const tech = (stock.technicals || {}) as any;
  const atr = tech.atr || current * 0.03;

  // Elasticity Ratio: How volatile is this stock naturally?
  // Normal ~ 0.03 (3%). High > 0.05 (5%). Low < 0.02 (2%).
  const elasticity = current > 0 ? atr / current : 0.03;

  // Adaptive Scaling Factor (1.0 is standard)
  // Volatile stocks get wider thresholds (up to 1.5x)
  // Stable stocks get tighter thresholds (down to 0.7x)
  const dnaScale = Math.max(
    0.7,
    Math.min(1.5, elasticity / 0.03),
  );

  // Determine Driver Style (Trend vs. Sentiment)
  const ma5 = tech.ma5 || 0;
  const ma10 = tech.ma10 || 0; // Added for isTrendDriver
  const ma20 = tech.ma20 || 0;
  const ma60 = tech.ma60 || 0;
  const ma250 = tech.ma250 || 0;

  // If price respects MA20 consistently, it's a Trend Driver
  // V13.0 Feature: Recognize "Trend DNA" stocks
  const isTrendDriver =
    ma20 > 0 &&
    low >= ma20 * 0.98 &&
    (stock.changePercent || 0) < 9.5;

  let signalType: "BUY" | "SELL" | "WAIT" | "HOLD" = "WAIT";
  let signalTitle = "观望 (WAIT)";
  let adviceText = "多空博弈焦灼，建空仓等待明确信号。";
  let recommendedBuy = 0;
  let recommendedSell = 0;
  let dynamicStopLoss = 0;
  let positionAdvice = ""; // V50.4 Fix: Initialize variable

  // --- V10.1 Chronos & Depth (时序与深度修正) ---
  const marketClock = getChinaTradingClock(runtimeContext?.timestamp);
  const currentHour = marketClock.hour;
  const currentMinute = marketClock.minute;
  const timeVal = marketClock.timeValue;

  // Calculate Valid Trading Minutes Elapsed (China A-Share)
  let minutesElapsed = 240; // Default to full day

  if (timeVal >= 930 && timeVal <= 1130) {
    // Morning Session
    minutesElapsed =
      (currentHour - 9) * 60 + currentMinute - 30;
  } else if (timeVal >= 1300 && timeVal <= 1500) {
    // Afternoon Session (120 mins from morning + current)
    minutesElapsed =
      120 + (currentHour - 13) * 60 + currentMinute;
  } else if (timeVal > 1130 && timeVal < 1300) {
    // Lunch Break
    minutesElapsed = 120;
  }

  minutesElapsed = Math.max(1, Math.min(240, minutesElapsed)); // Clamp

  // --- V15.1 Intraday Turnover Projection (全天换手推演) ---
  // If market is open, we project the full day turnover to judge "Heat"
  // This prevents underestimating volume in the morning.
  const rawTurnover = stock.turnoverRate || 0;
  let effectiveTurnover = rawTurnover;

  // Only project if we are within trading hours (and not just started to avoid Infinity)
  if (
    minutesElapsed < 235 &&
    minutesElapsed > 5 &&
    rawTurnover > 0
  ) {
    const projectionFactor = 240 / minutesElapsed;
    // We use a weighted average of Projection and Raw to avoid extreme noise at open
    // Weight moves from 0% Raw (9:30) to 100% Raw (15:00)
    const confidence = minutesElapsed / 240;
    const projected = rawTurnover * projectionFactor;

    // Conservative Projection: Mix 30% Projected + 70% Raw (to avoid false alarms)
    // Actually, for "Heat" detection, we want to be sensitive.
    // Let's use: Max(Raw, Projected * 0.8) to be safe but aware.
    effectiveTurnover = Math.max(rawTurnover, projected * 0.85);

    // If it's very early (<30 mins), cap the multiplier to avoid 1000% turnover bugs
    if (minutesElapsed < 30) {
      effectiveTurnover = Math.min(
        effectiveTurnover,
        rawTurnover * 5,
      );
    }
  }

  // --- 2. Context & Thresholds ---
  const indexChange = marketContext?.indexChange || 0;
  const isIndexCrash = indexChange < -1.5;
  const isIndexBear = indexChange < -0.5;
  // V16.2: Index Adaptive Logic
  // Uses Technical Trend (MA20/MA5) or Phase to determine "Strong Environment"
  const isIndexStrong =
    marketContext?.isIndexBull ||
    marketContext?.isIndexStrong ||
    indexChange > 0.3 ||
    phase === "Climax" ||
    phase === "Startup";

  // --- V16.1 Adaptive Thresholds (Based on Historical Volatility) ---
  // Try to use historical average turnover if available, otherwise fallback to role-based default
  const turnoverMA5 =
    tech.turnoverMA5 ||
    (stock.turnoverRate ? stock.turnoverRate * 0.6 : 5);

  // Dynamic Heat Threshold: 2.5x Average Turnover (Explosive Volume)
  // V59.6 FIX: Replace hardcoded Min 8% with adaptive floor.
  // Low-volume stocks (turnoverMA5 < 3%) were permanently stuck in "shrink" state
  // because 8% is 3-5x their normal volume. Adaptive floor = min(8, max(turnoverMA5*2, 2))
  // ensures the threshold respects each stock's own baseline liquidity.
  //   turnoverMA5=1.5 → floor=3.0 → baseHeat=3.75 (was forced to 8.0!)
  //   turnoverMA5=5.0 → floor=8.0 → baseHeat=12.5 (unchanged)
  //   turnoverMA5=0.5 → floor=2.0 → baseHeat=2.0 (minimum sanity floor)
  let baseHeat = turnoverMA5 * 2.5;
  const volumeFloor = Math.min(8, Math.max(turnoverMA5 * 2, 2)); // Adaptive: low-vol gets lower floor
  baseHeat = Math.max(
    volumeFloor,
    Math.min(stock.role === "Dragon" ? 40 : 25, baseHeat),
  );

  // Apply DNA Scaling
  let TH_TURNOVER_HEAT = baseHeat * dnaScale;
  let TH_BIAS_HIGH = 1.0 + 0.12 * dnaScale;
  let TH_CHIP_LOCK = 80;
  let TH_SICKLE_DROP = 0.04 * dnaScale;
  let TH_HOLLOW_FLOW = -0.05; // Changed to Ratio (-5%) instead of absolute amount
  let TH_SUCK_ZONE = 1.02;

  if (stock.role === "Dragon" || stock.role === "Leader") {
    TH_BIAS_HIGH = 1.25;
    TH_CHIP_LOCK = 90;
    TH_SICKLE_DROP = 0.06;
    TH_SUCK_ZONE = 1.05;
  } else if (stock.role === "Main") {
    // Main stocks (Large Cap) shouldn't have huge turnover unless limit up
    TH_TURNOVER_HEAT = Math.min(TH_TURNOVER_HEAT, 15);
    TH_HOLLOW_FLOW = -0.03; // Stricter flow requirement (-3%)
  } else if (stock.role === "Follower") {
    TH_TURNOVER_HEAT = Math.min(TH_TURNOVER_HEAT, 10);
    TH_BIAS_HIGH = 1.08;
  }

  if (phase === "Climax") {
    TH_TURNOVER_HEAT *= 1.2;
    TH_BIAS_HIGH += 0.05;
  } else if (phase === "Ice" || phase === "Ebb") {
    TH_TURNOVER_HEAT *= 0.8;
    TH_BIAS_HIGH -= 0.03;
    TH_SICKLE_DROP = 0.03;
  }

  // --- 3. Indicators ---
  // ma/tech vars already defined above for DNA calculation, no need to redeclare

  const defaultATR = stock.isLimitUp
    ? current * 0.02
    : (stock.turnoverRate || 0) < 3
      ? current * 0.02
      : current * 0.025;
  // Re-use atr calculated in Step 1 if available, otherwise fallback
  // const atr = tech.atr || defaultATR; // Already defined in Step 1
  const chipPressure = tech.chipPressure || 50;
  const profitRatio = tech.profitRatio || 50;
  const macdDivergence = tech.macdDivergence;
  const atrBands = tech.atrBands;

  const pivot = (high + low + current) / 3;
  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;

  // --- 4. Pattern Recognition ---
  const isBullish = ma250 > 0 && current > ma250;
  const isAccelerating = ma5 > ma20 && ma20 > ma60;
  const isLimitUp =
    stock.isLimitUp ||
    limitState.isLimitUp;
  const isLockedAbove = chipPressure > TH_CHIP_LOCK;
  const isBlueSky = profitRatio > 90;
  const isTopDivergence = macdDivergence === "bear";
  const isBottomDivergence = macdDivergence === "bull";

  const upperShadowRatio =
    prevClose > 0 ? (high - current) / prevClose : 0;
  // V10.3 Optimization: Smart Tolerance for Core Assets
  // Core assets (Main/Dragon) often wash deeper. We shouldn't be scared by a 4-5% shadow.
  const shadowTolerance =
    stock.role === "Main" || stock.role === "Dragon"
      ? 0.065
      : TH_SICKLE_DROP;
  const isSickle =
    upperShadowRatio > shadowTolerance && current < open;

  const isGreen = (stock.changePercent || 0) < 0;

  // V15.1: Use Effective (Projected) Turnover for Heat Detection
  const isHeavyVolume = effectiveTurnover > TH_TURNOVER_HEAT;
  const isShrinkVolume =
    effectiveTurnover < TH_TURNOVER_HEAT * 0.6;

  // V10.3 Optimization: Deep Drop Tolerance
  // For Main stocks, a -4% drop might be a "Golden Pit" (buy opp), not a crash.
  const dropThreshold = stock.role === "Main" ? -6.0 : -4.0;
  const isDeepDrop = (stock.changePercent || 0) < dropThreshold;
  const isSupportIntact = ma20 > 0 && current > ma20;

  const isShakeout =
    isAccelerating &&
    isGreen &&
    !isDeepDrop &&
    isShrinkVolume &&
    isSupportIntact;
  const isSmash =
    isGreen &&
    ((isHeavyVolume && isDeepDrop) ||
      (current < ma20 && isHeavyVolume));

  const openGap =
    prevClose > 0 ? (open - prevClose) / prevClose : 0;
  const isStrongOpen = openGap > -0.015 && openGap < 0.03;
  const isRapidPull =
    current > open && (current - open) / open > 0.03;
  const isWeakToStrong =
    isStrongOpen && isRapidPull && current > ma5;

  // V10.3 New Pattern: Boomerang (回马枪 / 趋势修复)
  // Yesterday might have been a "Stop Loss" (fake breakdown), but today it reclaimed the trend strongly.
  // Logic: Low was below MA20 (scared people out), but Current > MA5 (strong reclamation) + Volume Active
  
  // V58.0 Optimization: 量能否决 (Volume Veto)
  // 只有"放量"的反包才是真回马枪。缩量反包视为"死猫跳"(Dead Cat Bounce)，不予激活。
  const isVolumeActive = effectiveTurnover > (turnoverMA5 * 0.8); // 至少达到均量线的 80%
  
  const isBoomerang =
    low < ma20 &&          // 曾跌破生命线(洗盘)
    current > ma5 &&       // 强势收复攻击线(反转)
    (stock.changePercent || 0) > 3 && // 实体够大
    !isLimitUp &&          // 还没涨停，给机会买
    isVolumeActive;        // V58.0: 必须有量！

  // V16.4: Resonance Sniper Logic (Index + Sector + Self Trend)
  const isIndexTrendUp = marketContext?.isIndexBull;
  const isSelfTrendUp =
    isBullish || isAccelerating || isTrendDriver;
  const isVelocityStable = (manualVelocity || 0) > -1.0; // Not crashing fast
  const isVolumeSafe =
    !microContext?.volumeRatio ||
    microContext.volumeRatio < 1.5; // Shrink Volume

  const isHealthyPullback =
    (stock.changePercent || 0) < -1.5 &&
    (stock.changePercent || 0) > -6 &&
    isSupportIntact &&
    !isHeavyVolume;

  const isIndexResonanceBuy =
    (isIndexStrong || isIndexTrendUp) &&
    isSelfTrendUp &&
    isHealthyPullback &&
    isVelocityStable &&
    isVolumeSafe &&
    (isTrendDriver ||
      stock.role === "Dragon" ||
      stock.role === "Leader" ||
      stock.role === "Main");

  const isMainRole = stock.role === "Main";
  const isTrendLowSuck =
    isMainRole &&
    isAccelerating &&
    (current <= ma10 * TH_SUCK_ZONE ||
      current <= ma20 * TH_SUCK_ZONE) &&
    (stock.changePercent || 0) > -3 &&
    (stock.changePercent || 0) < 3;

  // V16.1 Fix: Use Relative Flow Ratio for Hollow Rise
  // TH_HOLLOW_FLOW is now a ratio (e.g. -0.05)
  const flowAssessment = assessCapitalFlow(stock);
  const flowRatio = flowAssessment.signal === 'CONFLICT'
    ? undefined
    : flowAssessment.directRatio;
  const isHollowRise =
    isMainRole &&
    (stock.changePercent || 0) > 4 &&
    flowRatio !== undefined &&
    flowRatio < TH_HOLLOW_FLOW;

  const isHighBias = ma5 > 0 && current > ma5 * TH_BIAS_HIGH;
  const isOverheated = effectiveTurnover > TH_TURNOVER_HEAT; // Use Effective Turnover
  const isAcceleratedTop =
    isMainRole &&
    (stock.changePercent || 0) > 7.5 &&
    !isLimitUp &&
    isHighBias &&
    isOverheated;

  // --- V12.0 Optimization: Capacity & Infinity Mode ---
  const turnoverAmount = stock.turnover || 0;
  // Determine if it's a "Capacity Dragon" (Large Cap Leader)
  // > 30亿 turnover is the benchmark for institutional battlefield
  const isCapacityDragon = turnoverAmount > 3000000000;

  // Infinity Mode Flag: High Turnover + Positive Trend + Mainline = Ignore Technical Overbought
  // This prevents selling leaders too early in a "Crazy Bull" market
  const isInfinityMode =
    isCapacityDragon &&
    (stock.changePercent || 0) > 0 &&
    ma5 > 0 &&
    current > ma5;

  // V13.0 DNA Override: Trend Driver Protection
  // If stock is strictly trend-driven (hugs MA20), we suppress "Top Divergence" unless structure breaks
  const isTrendProtected =
    isTrendDriver &&
    current > ma20 &&
    (stock.changePercent || 0) > -3;

  // ═══════════════════════════════════════════════════════════════════════════
  // V61.0: BOARD HEIGHT CONTEXT ENGINE (连板梯队上下文引擎)
  // ═══════════════════════════════════════════════════════════════════════════
  // 短线龙头战法核心原则：不同连板高度 = 完全不同的风险收益特征
  //   首板(试错期) → 2板(分歧生死局) → 3板(妖股确认) → 4板+(空间博弈) → 断板次日(善后)
  
  const boardHeight = stock.consecutiveLimitUps || 0;
  const _hist = stock.history || [];
  
  // ── 提取昨日K线状态 ──
  let yesterdayWasLimitUp = false;
  let yesterdayVolHeavy = false;   // 昨日天量板 (>2.5x均量)
  let yesterdayVolShrink = false;  // 昨日缩量板 (<0.7x均量)
  let priorBoardHeight = 0;       // 断板前的连板高度 (仅断板次日有效)
  let yesterdayAmplitude = 0;     // 昨日振幅
  
  if (_hist.length >= 2) {
    const yBar = _hist[_hist.length - 1];
    const y2Bar = _hist[_hist.length - 2];
    const yClose = yBar.close;
    const yPrevClose = y2Bar.close;

    yesterdayWasLimitUp = yPrevClose > 0 && (yClose - yPrevClose) / yPrevClose >= 0.095;
    
    if (yBar.high && yBar.low && yPrevClose > 0) {
      yesterdayAmplitude = (yBar.high - yBar.low) / yPrevClose;
    }
    
    if (_hist.length >= 6) {
      const volSlice = _hist.slice(-6, -1);
      const avgVol5d = volSlice.reduce((s, h) => s + (h.volume || 0), 0) / 5;
      if (avgVol5d > 0 && yBar.volume) {
        const yVolRatio = yBar.volume / avgVol5d;
        yesterdayVolHeavy = yVolRatio > 2.5;
        yesterdayVolShrink = yVolRatio < 0.7;
      }
    }
    
    // 回溯断板前连板高度
    if (yesterdayWasLimitUp && !isLimitUp) {
      priorBoardHeight = 1;
      for (let i = _hist.length - 2; i >= 1; i--) {
        const d = _hist[i];
        const dPrev = _hist[i - 1];
        if (dPrev.close > 0 && (d.close - dPrev.close) / dPrev.close >= 0.095) {
          priorBoardHeight++;
        } else {
          break;
        }
      }
    }
  }
  
  const isPostBreakDay = yesterdayWasLimitUp && !isLimitUp;
  
  type BoardTier = 'FIRST' | 'SECOND' | 'THIRD' | 'DRAGON_HIGH' | 'POST_BREAK' | 'NONE';
  const boardTier: BoardTier = isPostBreakDay ? 'POST_BREAK'
    : isLimitUp && boardHeight <= 1 ? 'FIRST'
    : isLimitUp && boardHeight === 2 ? 'SECOND'
    : isLimitUp && boardHeight === 3 ? 'THIRD'
    : isLimitUp && boardHeight >= 4 ? 'DRAGON_HIGH'
    : 'NONE';

  // V16.5: Profit Lock Logic (主动止盈)
  // 1. Broken Limit (炸板): High touched limit, but current dropped > 2%
  const isBrokenLimit =
    high >= limitUpPrice - 0.02 &&
    current < limitUpPrice * 0.98;

  // 2. Dragon Stagnation (龙头滞涨): High turnover, High price, but can't seal
  // Logic: Change > 6%, Turnover > 25%, but Volume Ratio huge (selling pressure) and not LimitUp
  const isDragonStagnation =
    (stock.role === "Dragon" || stock.role === "Leader") &&
    (stock.changePercent || 0) > 6 &&
    !isLimitUp &&
    effectiveTurnover > 25 &&
    (microContext?.volumeRatio || 0) > 2.5;

  // --- 5. Prediction (V50.2 Upgrade: Intent-Driven Scenario & Intraday Script) ---
  let expectedDirection: "UP" | "DOWN" | "SIDEWAYS" = "SIDEWAYS";
  let predictionDesc = "";
  let intradayScript: PredatorSignal["prediction"]["script"] = "Unknown";
  let nextDayHigh = current + atr;
  let nextDayLow = current - atr;
  let prob = 60;

  // V50.0: Calculate Closing Strength (收盘强弱)
  // 0 = Closed at Low (Weak), 1 = Closed at High (Strong)
  // V59.6 FIX: Account for gap-up/gap-down — a stock that gaps up 5% then sells off
  // to barely green should NOT show high closingStrength just because (current-low)/(high-low) > 0.5.
  // New formula: blend intraday position with gap-adjusted position.
  const dayRange = high - low;
  const rawClosingStrength = dayRange > 0 ? (current - low) / dayRange : 0.5;
  // Gap-adjusted: Where did we close relative to prevClose?
  const gapAdjustedStrength = prevClose > 0
    ? Math.max(0, Math.min(1, 0.5 + (current - prevClose) / (prevClose * 0.10))) // ±10% maps to 0~1
    : 0.5;
  // Blend: 60% intraday position + 40% gap-adjusted (penalizes high-open-low-close)
  const closingStrength = rawClosingStrength * 0.6 + gapAdjustedStrength * 0.4;
  const isClosingWeak = closingStrength < 0.2; // 尾盘杀跌
  const isClosingStrong = closingStrength > 0.8; // 尾盘抢筹

  // Base Technical Prediction & Script Selection
  if (isLimitUp) {
    expectedDirection = "UP";
    prob = 85;
    nextDayHigh = current * 1.1;
    nextDayLow = current * 1.02;
    predictionDesc = "涨停强势延续，预期高开高打";
    intradayScript = "N-Wave"; // Safe bet: High Open -> Pullback -> Board
  } else if (isInfinityMode || isTrendProtected) {
    expectedDirection = "UP";
    prob = isTrendProtected ? 70 : 80;
    nextDayHigh = current * 1.05;
    nextDayLow = isTrendProtected ? ma20 : ma5;
    predictionDesc = "趋势完好，惯性上涨";
    intradayScript = "One-Way"; // Smooth trend
  } else if (
    isTopDivergence ||
    (isLockedAbove && (stock.changePercent || 0) > 5) ||
    isAcceleratedTop ||
    isHollowRise
  ) {
    expectedDirection = "DOWN";
    prob = isHollowRise ? 85 : 75;
    nextDayHigh = current * 1.01; // 冲高即卖
    nextDayLow = ma5 > 0 ? ma5 : current * 0.95;
    predictionDesc = "顶部背离，建议逢高减仓";
    intradayScript = "A-Dive"; // Lure and Dump
  } else if (isTrendLowSuck) {
    expectedDirection = "UP";
    prob = 78;
    predictionDesc = "缩量回踩到位，看反弹";
    intradayScript = "W-Grind"; // Grind bottom then rise
  } else if (isBrokenLimit) {
    // V50.1 Scenario: Broken Limit (炸板)
    expectedDirection = "DOWN";
    prob = 80;
    nextDayHigh = current * 1.0; // Hard to go up
    nextDayLow = current * 0.93; // Expect -7% open
    predictionDesc = "【核按钮预期】炸板套牢盘沉重，主力撤退，明早竞价大概率大幅低开抢跑。";
    intradayScript = "L-Crash"; // Open low, stay low
  } else if (isWeakToStrong) {
    // V50.1 Scenario: Weak to Strong (弱转强)
    expectedDirection = "UP";
    prob = 82;
    nextDayHigh = current * 1.08;
    nextDayLow = current * 1.01;
    predictionDesc = "【加速预期】分歧转一致，弱转强确认。预期明早高开，缩量加速冲击涨停。";
    intradayScript = "N-Wave"; // Standard acceleration
  } else if (isBoomerang) {
    // V50.1 Scenario: Boomerang (反包)
    expectedDirection = "UP";
    prob = 75;
    nextDayHigh = current * 1.06;
    nextDayLow = current; 
    predictionDesc = "【反包修复】阳包阴确立反转，洗盘结束，看高一线。";
    intradayScript = "V-Reversal"; // Recover lost ground
  } else if ((stock.changePercent || 0) < -4) {
    // Default Crash Logic
    expectedDirection = "DOWN";
    prob = 65;
    predictionDesc = "破位杀跌，惯性下探";
    intradayScript = "L-Crash";
  }

  // --- V50.0: Intent Override (意图修正逻辑) ---
  // Fix the conflict between "Chart says Die" and "Money says Buy"
  
  if (intentContext) {
    const { intent, decoyScore } = intentContext;

    // Scenario 1: Ambush Protection (黄金坑剧本)
    // Condition: Chart is ugly (Down), but Money is Accumulating
    if (
      expectedDirection === "DOWN" && 
      intent === 'Accumulate' && 
      decoyScore > 40
    ) {
      expectedDirection = "SIDEWAYS"; // Upgrade from DOWN
      prob += 15; // Confidence boost
      nextDayLow = current * 0.98; // Support is closer than thought
      nextDayHigh = current * 1.04;
      predictionDesc = "【下杀回升】主力暗中吸筹，明早惯性低开后将有强力承接，不仅不卖，反而是博弈低点。";
      intradayScript = "V-Reversal";
    }
    
    // Scenario 2: Trap Detection (诱多剧本)
    // Condition: Chart is beautiful (UP), but Money is Distributing
    else if (
      expectedDirection === "UP" && 
      intent === 'Distribute' && 
      decoyScore > 60
    ) {
      expectedDirection = "DOWN"; // Downgrade from UP
      prob = 80;
      nextDayHigh = current * 1.02; // Cap the upside
      nextDayLow = current * 0.94; // Deep dive expectation
      predictionDesc = "【冲高回落】虽然形态强势，但监测到托单出货，谨防明早诱多杀跌。";
      intradayScript = "A-Dive";
    }
  }

  // Refine based on Closing Strength
  if (expectedDirection === "SIDEWAYS" && isClosingWeak) {
      predictionDesc += " (需警惕早盘竞价恐慌)";
      nextDayLow = current * 0.97; // Expect deeper open
      if (intradayScript === "Unknown") intradayScript = "W-Grind";
  }

  if (phase === "Ice") prob -= 15;
  if (phase === "Ebb") prob -= 10;
  if (phase === "Climax") prob += 5;
  if (stock.role === "Dragon" || stock.role === "Leader") prob += 10;
  if (stock.role === "Follower") prob -= 5;

  if (isCapacityDragon) prob += 5;

  prob = Math.min(95, Math.max(40, prob));

  // --- 6. Scoring & Stargate ---
  let score = 50;
  const stargateResult = calculateStargateLogic(
    stock,
    allThemes,
    manualVelocity,
  );
  score += (stargateResult.stargateScore - 50) * 0.5;

  // V12.0 Capacity Bonus (Base Score)
  if (isCapacityDragon) {
    score += 10; // Safe haven premium
  }

  // --- V11.0 Ghost Protocol: Stealth Accumulation Detection ---
  // Detects if "Big Orders are Split into Small Orders" (Iceberg/Splitting)
  let stealthScore = 0;
  let isIcebergDetected = false;
  let isPassiveAbsorption = false;

  if (
    microContext &&
    microContext.tradeCount &&
    microContext.avgTradeSize
  ) {
    // 1. Fragmentation Index (碎片化指数) - L2 Data Required
    // Logic: High Volume + High Trade Count + Low Avg Trade Size = Splitting
    const turnover = stock.turnoverRate || 0;

    if (
      turnover > 5 &&
      microContext.tradeCount > 5000 &&
      (stock.changePercent || 0) > -2 &&
      (stock.changePercent || 0) < 3
    ) {
      stealthScore += 20;
    }

    // 2. Small Order Storm (小单风暴) - L2 Data Required
    if (
      microContext.buyOrderSmall &&
      microContext.sellOrderLarge
    ) {
      if (
        microContext.buyOrderSmall > 0.6 &&
        microContext.sellOrderLarge > 0.6 &&
        (stock.changePercent || 0) >= 0
      ) {
        stealthScore += 30;
        isIcebergDetected = true;
      }
    }
  }
  // --- V11.0 L1 Proxy Logic (For Standard Data Feeds) ---
  else {
    // If no L2 data, we use "Volume Efficiency" & "Imbalance" shadows
    const turnover = stock.turnoverRate || 0;
    const amplitude =
      prevClose > 0 ? (high - low) / prevClose : 0;

    // 1. Density Absorption (密度吸筹)
    // Logic: Huge Effort (High Turnover) but Tiny Result (Low Amplitude) -> Controlled Accumulation
    // Example: Turnover 10% but Amplitude only 1.5% -> Someone is eating everything at a fixed price
    if (
      turnover > 8 &&
      amplitude < 0.02 &&
      (stock.changePercent || 0) > -1.5
    ) {
      stealthScore += 35;
      isPassiveAbsorption = true;
      adviceText += " [量能密度异常]";
    }

    // 2. Bid/Ask 1 Imbalance (盘口失衡)
    // We rely on standard Bid1/Ask1 which is available in L1
    const bid1 = stock.bid1Amount || 0;
    const ask1 = stock.ask1Amount || 0;

    // Scenario: Huge Ask Wall, but Price holds (压单不跌)
    if (ask1 > bid1 * 5 && (stock.changePercent || 0) > -0.5) {
      stealthScore += 25;
      isPassiveAbsorption = true;
    }
  }

  // 3. Passive Absorption (被动承接 - 暗盘)
  // 卖盘极大(内盘)，但价格跌不下去(Tick不创新低)，且缩量
  // The "CommitteeRatio" (Bid/Ask diff) calculated later helps here too

  // --- Chronos & Depth (时序与深度修正) ---

  // 1. Chronos: Time-Weighted Validity
  let timeWeight = 1.0;
  let timeNote = "";

  // 早盘黄金进攻期 (09:30 - 10:30)
  if (timeVal >= 930 && timeVal <= 1030) {
    timeWeight = 1.05; // 此时段信号最真，给予加权
    if (isAccelerating) timeNote = " [早盘进攻]";
  }
  // 午盘垃圾时间 (11:00 - 13:30)
  else if (timeVal > 1100 && timeVal <= 1330) {
    timeWeight = 0.9; // 容易骗线，降权
  }
  // 尾盘偷袭期 (14:00 - 14:50) - 最危险的时段
  else if (timeVal >= 1400 && timeVal < 1450) {
    if (!isLimitUp) {
      timeWeight = 0.8; // 非涨停板的尾盘拉升，大概率为次日出货，重罚
      if ((stock.changePercent || 0) > 3)
        timeNote = " [尾盘偷袭疑虑]";
    }
  }

  score *= timeWeight; // 应用时间权重

  // 2. Depth: Pending Order Analysis (盘口博弈)
  // Logic: Analyze Bid/Ask disparity vs Price Action
  const bidVol = stock.bidAmount || stock.bid1Amount || 0; // Use total or level 1
  const askVol = stock.askAmount || stock.ask1Amount || 0;

  // 简单委差计算 (-1 to 1)
  // 负数 = 卖盘大 (压单)
  // 正数 = 买盘大 (托单)
  const committeeRatio =
    bidVol + askVol > 0
      ? (bidVol - askVol) / (bidVol + askVol)
      : 0;

  // V16.0: Intraday Health & Risk/Reward Check
  // ------------------------------------------

  // 1. Intraday Health (分时健康度)
  // Check if price is below VWAP (Average Price) significantly
  const avgPrice =
    stock.avgPrice || (high + low + open + current) / 4; // Fallback estimate
  const distToAvg = (current - avgPrice) / avgPrice;

  // If price is >3% below VWAP, it's very weak intraday structure
  if (distToAvg < -0.03 && (stock.changePercent || 0) < 0) {
    score -= 15;
    adviceText += " [分时承接极弱]";
  }

  // 2. T+1 Risk/Reward Ratio (盈亏比)
  // Reward: Distance to Limit Up
  const rewardDist = (limitUpPrice - current) / current;
  // Risk: Distance to Support (MA5 or Low)
  const supportLevel = ma5 > 0 ? ma5 : low;
  const riskDist = (current - supportLevel) / current;

  // Simple Ratio: Reward / Risk. If Risk is tiny, cap Ratio at 10.
  const rrRatio = riskDist > 0.005 ? rewardDist / riskDist : 5;

  // If pursuing high (change > 5%) but R/R < 1.0 -> Bad Bet
  if (
    (stock.changePercent || 0) > 5 &&
    !isLimitUp &&
    rrRatio < 1.0
  ) {
    score -= 10; // Penalize bad odds
  }

  // 3. T+1 Death Turnover (死亡换手)
  // If Turnover > 45% and not Limit Up -> Extreme Risk
  if ((stock.turnoverRate || 0) > 45 && !isLimitUp) {
    score -= 40;
    signalType = "SELL";
    signalTitle = "撤退 (FLEE)";
    adviceText = `【死亡换手】换手率过高 (>45%) 且未封板，多头动能耗尽，次日核按钮概率极大。`;
  }

  // A. 压单洗盘判定 (Pressure Wash)
  // 卖盘巨大 (Ratio < -0.3) 但股价坚挺 (Change > 0) 且有资金流入
  if (
    committeeRatio < -0.3 &&
    (stock.changePercent || 0) > -1.5
  ) {
    // V11.0 Optimization: Even if no net inflow, price resilience against sell pressure is key
    isPassiveAbsorption = true;
    stealthScore += 25;

    if (microContext?.largeOrderNetYuan && microContext.largeOrderNetYuan > 0) {
      score += 15;
      adviceText += " [压单吃货迹象]";
    } else {
      adviceText += " [暗盘承接迹象]"; // Net inflow might be negative due to "masking", but price holds
    }
  }

  // B. 托单出货判定 (Trap Support)
  // 买盘巨大 (Ratio > 0.3) 但股价滞涨 (Change < 2) 且资金流出
  if (
    committeeRatio > 0.3 &&
    (stock.changePercent || 0) < 3 &&
    microContext?.largeOrderNetYuan &&
    microContext.largeOrderNetYuan < -20_000_000
  ) {
    score -= 20;
    adviceText += " [托单出货嫌疑]";
    signalTitle = "诱多 (TRAP)"; // 强制修标题
  }

  const isResonancePulse =
    sectorContext &&
    sectorContext.rank <= 3 &&
    stargateResult.gateLevel >= 2;
  if (isResonancePulse) {
    score += 15;
  }

  let isLoneWolf = false;
  let isSectorResonance = false;

  if (sectorContext) {
    const isHotSector =
      sectorContext.rank <= 5 || sectorContext.isMainline;
    if (isHotSector) {
      isSectorResonance = true;
      score += 15;
    } else {
      if (
        (stock.changePercent || 0) > 9.0 &&
        sectorContext.rank > 15
      ) {
        isLoneWolf = true;
        score -= 25;
      }
    }
  } else if (
    stock.role === "Independent"
    // V59.3 FIX: Removed "Zhuang" — not a valid Stock.role value
  ) {
    isLoneWolf = true;
    score -= 20;
  }

  if (isIndexCrash) score -= 30;
  else if (isIndexBear) score -= 10;

  if (isLimitUp) score += 30;
  else if (isTrendLowSuck) score += 25;
  else if ((stock.changePercent || 0) > 5) score += 15;
  else if ((stock.changePercent || 0) < -5) score -= 15;

  if (isAccelerating) score += 10;
  if (isBullish) score += 5;
  if (phase === "Ebb") score -= 20;

  if (isLockedAbove) score -= 20;
  if (isBlueSky) score += 15;

  if (isTopDivergence) score -= 25;
  if (isHollowRise) score -= 40;
  if (isBottomDivergence) score += 20;

  if (isWeakToStrong) score += 20;
  if (isSickle) score -= 25;
  if ((stock.trapRiskScore || 0) > 60) score -= 30;

  if (
    atrBands &&
    current > atrBands.upperResistance &&
    !isLimitUp
  )
    score -= 10;
  if (isAcceleratedTop) score -= 15;

  // --- 6.1 V10.0 Micro-Structure Injection (分时微观数据修正) ---
  if (microContext) {
    const { macdfs, volumeRatio, largeOrderNetYuan, isHeavyVolume } =
      microContext;

    // 1. MACDFS 共振
    if (macdfs === "GoldenCross") {
      score += 15;
      // 如果已经是上涨趋势，金叉确认加速
      if ((stock.changePercent || 0) > 0)
        adviceText += " [分时金叉确认]";
    } else if (macdfs === "DeadCross") {
      score -= 20;
      if ((stock.changePercent || 0) > 0)
        adviceText += " [分时死叉预警]";
    }

    // 2. 量比 (Volume Ratio) - 能量爆发
    if (
      volumeRatio &&
      volumeRatio > 2.5 &&
      (stock.changePercent || 0) < 5
    ) {
      score += 10; // 底部/中位放量，好事
    } else if (
      volumeRatio &&
      volumeRatio > 5.0 &&
      (stock.changePercent || 0) > 8 &&
      !isLimitUp
    ) {
      score -= 15; // 高位天量，滞涨风险
    }

    // 3. 资金博弈 (Capital Game) - V53.0 修正：引入价格否决权
    // 原逻辑：跌得越狠+买得越多 = 加分越高 (容易接飞刀)
    // 新逻辑：只有在支撑位(MA20)附近的吸筹才是有效的。破位吸筹视为"被动接盘"或"诱多"。
    
    // 如果股价跌但供应商大单净额显著为正
    if (
      (stock.changePercent || 0) < 0 &&
      largeOrderNetYuan &&
      largeOrderNetYuan > 30_000_000
    ) {
      if (current > ma20) {
          // 趋势支撑有效，视为良性回踩吸筹
          score += 15;
          adviceText += " [支撑位大单流入]";
      } else {
          // 趋势破位，大单流入也可能是被动挂单成交
          score -= 20; 
          adviceText += " [破位接飞刀风险]";
          // 此分支进入时信号已经不是买入，继续保持防守。
      }
    }
    // 如果股价涨但供应商大单净额显著为负 -> 空涨
    else if (
      (stock.changePercent || 0) > 5 &&
      largeOrderNetYuan &&
      largeOrderNetYuan < -50_000_000
    ) {
      // <-5000万
      score -= 25;
      adviceText += " [大单净流出]";
    }
    // V53.0 新增：滞涨陷阱 (资金大买但股价不涨)
    else if (
        largeOrderNetYuan &&
        largeOrderNetYuan > 50_000_000 &&
        (stock.changePercent || 0) > -1 && 
        (stock.changePercent || 0) < 2 &&
        (stock.turnoverRate || 0) > 10
    ) {
        score -= 15;
        adviceText += " [巨量滞涨/诱多嫌疑]";
        signalType = "WAIT";
    }
  }

  // --- 6.2 V20.0 Intent Injection (实时意图修正) ---
  if (intentContext) {
    const { intent, decoyScore, algoReason } = intentContext;

    // A. 欺诈性出货 (Distribute + High Decoy)
    // 致命信号：无论技术面多好，直接判死刑
    if (intent === "Distribute" && decoyScore > 70) {
      score -= 50;
      prob -= 40;
      signalType = "SELL";
      signalTitle = "诱多 (TRAP)";
      adviceText = `[高度警惕]主力意图雷达判定为"托单出货"(系数${decoyScore.toFixed(0)})。${algoReason || ""} 盘口欺诈极强，建议立即离场！`;
    }
    // B. 隐蔽性吸筹 (Accumulate + High Decoy)
    // 黄金信号：看似弱势其实在买
    else if (intent === "Accumulate" && decoyScore > 60) {
      score += 30;
      prob += 20;
      signalType = "BUY"; // 逆转信号
      signalTitle = "博弈 (GAMBLE)";
      adviceText += ` [主力压盘吸筹，建议跟随]`;
    }
    // C. 中性但有算法理由
    else if (intent === "Neutral" && algoReason) {
      adviceText += ` [雷达监控: ${algoReason}]`;
    }
  }

  // --- 6.3 V64.0 Event-Driven Transmission Speed Correction (事件驱动传导时滞修正) ---
  // 当检测到跨板块事件驱动分化模式时，根据个股所属板块的"利好传导速度"调整评分
  // 核心逻辑（来自美伊热战实盘验证）：
  //   - instant板块（油气/黄金）：资金虹吸加分 → 追涨可行
  //   - annual板块（军工/航天）：资金流出惩罚 → 逻辑正确但不可追高，接飞刀
  //   - quarterly板块：中性，轻微影响
  if (eventDrivenContext && eventDrivenContext.mode !== 'NONE') {
    const speed = getTransmissionSpeed(stock.concept);
    const { mode, divergence } = eventDrivenContext;
    // 分化度越大，修正力度越强（上限±25分）
    const intensity = Math.min(divergence / 5, 1); // 0~1 归一化

    if (speed === 'instant') {
      // ★ 即时传导板块：事件直接受益，加分
      const bonus = Math.round(15 * intensity);
      score += bonus;
      if (mode === 'GEO_EVENT') {
        adviceText += ` [V64地缘事件·即时受益+${bonus}] 油价/金价直接传导到利润，资金确定性涌入`;
      } else if (mode === 'COMMODITY_SURGE') {
        adviceText += ` [V64大宗脉冲·即时受益+${bonus}] 商品价格即时兑现`;
      } else {
        adviceText += ` [V64政策冲击·即时受益+${bonus}]`;
      }
    } else if (speed === 'annual') {
      // ★ 长周期板块：逻辑虽正确但资金被虹吸，惩罚
      const penalty = Math.round(20 * intensity);
      score -= penalty;
      if (mode === 'GEO_EVENT') {
        adviceText += ` [V64地缘虹吸·长周期-${penalty}] ⚠️ 战争≠军费立即增加，合同制2-5年才兑现，资金被油气/黄金虹吸`;
      } else if (mode === 'POLICY_SHOCK' && eventDrivenContext.annualAvg > 3) {
        // 反向场景：政策直接利好长周期板块（如军费预算公告）
        score += penalty + Math.round(10 * intensity); // 反转为加分
        adviceText += ` [V64政策直驱·长周期受益] 预算/政策直接利好，传导时滞被政策覆盖`;
      } else {
        adviceText += ` [V64事件虹吸·长周期-${penalty}] 资金流向即时兑现板块`;
      }
      // 额外安全：如果annual板块个股当日已大跌且引擎给出BUY信号 → 降级为WAIT
      if ((stock.changePercent || 0) < -3 && signalType === 'BUY' && mode !== 'POLICY_SHOCK') {
        signalType = 'WAIT';
        signalTitle = '观望 (EVENT)';
        adviceText += ' [事件驱动下跌，不宜接飞刀]';
      }
    } else {
      // quarterly板块：轻微影响
      const adj = Math.round(5 * intensity) * (eventDrivenContext.quarterlyAvg > 0 ? 1 : -1);
      if (Math.abs(adj) >= 3) {
        score += adj;
        adviceText += ` [V64事件波及${adj > 0 ? '+' : ''}${adj}]`;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));

  // --- 7. Decision Strategy ---
  const fundIdentity = detectFundIdentity(stock);
  const fundRisk = predictSmashRisk(stock, phase);

  let stopLossFactor = 1.5;
  if ((stock.role === "Dragon" || stock.role === "Leader") && isSectorResonance)
    stopLossFactor = 2.8;
  if (phase === "Ice" || phase === "Ebb") stopLossFactor = 0.8;

  // V15.0 Fund Pantheon Strategy Injection
  let fundStrategyNote = "";
  let entryAggression = "Neutral";
  const fType = fundIdentity.profile.type;

  // --- Tier 1: The Rulers ---
  if (fType === "NationalTeam") {
    stopLossFactor *= 1.5; // G队票不怕套，容易假摔
    fundStrategyNote = " [G队护盘: 放心持有，破位概率低]";
  } else if (fType === "Northbound") {
    entryAggression = "Defensive";
    fundStrategyNote = " [北向重仓: 沿20日线趋势操作]";
  } else if (fType === "MutualFund") {
    entryAggression = "Defensive";
    fundStrategyNote = " [公募票: 拒绝追高，均线低吸]";
  }

  // --- Tier 2: Apex Predators ---
  else if (fType === "GrandMaster") {
    stopLossFactor *= 1.2; // 六一路格局大，允许深洗
    fundStrategyNote = " [顶级游资: 格局博弈，断板再走]";
  } else if (fType === "Alliance") {
    fundStrategyNote = " [盟主点火: 关注板块效应]";
  } else if (fType === "TrendRider") {
    fundStrategyNote = " [趋势游资: 锁仓主升浪]";
  }

  // --- Tier 3: Opportunists ---
  else if (fType === "Sniper") {
    stopLossFactor = 0.5; // 佛山票，稍微不对劲就跑
    fundStrategyNote = " [佛山一日游: 竞价不强直接走]";
    if (signalType === "BUY") {
      signalType = "WAIT";
      adviceText =
        "检测到佛山独食板，次日溢价极低，不建议接力。";
    }
  } else if (fType === "Scythe") {
    stopLossFactor = 0.4; // 上塘路，极度危险
    fundStrategyNote = " [上塘路: 警惕砸盘，随时准备跑路]";
  } else if (fType === "Viper") {
    fundStrategyNote = " [养家心法: 博弈情绪弱转强]";
  }

  // --- Tier 4: Dark Matter ---
  else if (fType === "DMA_Quant") {
    stopLossFactor *= 0.6;
    fundStrategyNote = " [DMA量化: 严禁追高，只做急跌低吸]";
    if (
      signalType === "BUY" &&
      (stock.changePercent || 0) > 3
    ) {
      signalType = "WAIT";
      adviceText = "量化票已拉升，追高胜率<40%，放弃。";
    }
  } else if (fType === "Syndicate") {
    signalType = "WAIT";
    fundStrategyNote = " [老庄股: 建议规避]";
  } else if (fType === "Retail") {
    fundStrategyNote = " [散户博弈: 关注换手]";
  }

  // V59.4 FIX: Removed legacy dead-code branches for "Quant"/"HotMoney"/"Institution".
  // These FundType values no longer exist in the V15.0 FUND_PROFILES system.
  // Mapping: HotMoney → Scythe/Sniper, Institution → MutualFund, Quant → DMA_Quant.

  if (phase === "Climax" || stock.role === "Dragon" || stock.role === "Leader")
    entryAggression = "Aggressive";
  if (phase === "Ice" || phase === "Ebb")
    entryAggression = "Defensive";
  if (fundIdentity.profile.type === "MutualFund" || fundIdentity.profile.type === "Northbound")
    entryAggression = "Defensive";

  dynamicStopLoss = atrBands
    ? atrBands.lowerSupport
    : current - stopLossFactor * atr;
  recommendedBuy = atrBands
    ? atrBands.lowerSupport
    : ma5 > 0
      ? ma5
      : low;

  if (entryAggression === "Aggressive")
    recommendedBuy = ma5 > 0 ? ma5 : current * 0.98;
  if (entryAggression === "Defensive")
    recommendedBuy = ma20 > 0 ? ma20 : current * 0.9;

  recommendedSell = atrBands
    ? atrBands.upperResistance
    : r1 > 0
      ? r1
      : high;

  // V59.3 FIX: Declare `trend` here (early) to avoid Temporal Dead Zone violation.
  // Previously declared at the bottom (~line 1481) but assigned at ~line 1088 (Ghost Protocol).
  // `let` has TDZ — accessing before declaration throws ReferenceError at runtime.
  let trend: PredatorSignal["trend"] = "Neutral";

  // ═══════════════════════════════════════════════════════════════════════════
  // V59.5: PRIORITY PIPELINE ARCHITECTURE
  // ═══════════════════════════════════════════════════════════════════════════
  // Execution: [PhaseFilter] → [TrapGuard] → [TrendImmunity] → [SignalGen] → [Arbitration] → [GoldenNeedle]
  //
  // Each stage sets LOCKS that downstream stages MUST respect.
  // This eliminates the V59.3-era "signal leakage" bugs where late-stage
  // rescue logic (e.g., Golden Needle) could override early-stage authoritative
  // verdicts (e.g., Consistency Arbitration's SELL for trap stocks).
  //
  // Lock hierarchy (highest priority first):
  //   phaseLocked  > trapDetected > immunityActive
  //   (环境锁)        (陷阱锁)       (趋势盾)
  // ═══════════════════════════════════════════════════════════════════════════

  const pipeline = {
    phaseLocked: false,    // Stage 1: Systemic risk — all BUY signals forbidden
    trapDetected: false,   // Stage 2: Trap flagged — BUY rescue forbidden, SELL is authoritative
    immunityActive: false, // Stage 3: Trend shield — false SELL suppressed to HOLD
    arbitrated: false,     // Stage 5: Final verdict rendered — signal is locked
  };

  // ── STAGE 1: PhaseFilter (环境过滤层) ──────────────────────────────────
  // 核心原则：覆巢之下无完卵。大盘崩盘时锁定管道，禁止一切买入信号。
  // 在 SignalGen 之前运行，确保决策链不会生成注定失败的 BUY。
  const isSystemicRisk =
      (marketContext?.indexChange || 0) < -1.5 ||
      (phase === "Ice" && (marketContext?.indexChange || 0) < -0.8);

  if (isSystemicRisk) {
    pipeline.phaseLocked = true;
  }

  // ── STAGE 2: TrapGuard (陷阱防护层) ────────────────────────────────────
  // 核心原则：微观数据(里子) 永远优于 K线形态(面子)。
  // 预计算复合陷阱标志，一旦检测到，后续所有"救援"逻辑（趋势豁免、金针探底）全部阻断。
  const alpha = tech.alpha || 0;
  const isAlphaDivergence = alpha < -15; // 严重的负Alpha

  // V59.6 FIX: Replace boolean OR with weighted scoring to prevent a single weak signal
  // from triggering full trap arbitration. Each trap factor contributes a weighted score;
  // only when the composite trapCompositeScore exceeds the threshold (40) does isTrap activate.
  let trapCompositeScore = 0;
  if (intentContext?.intent === "Distribute" && intentContext.decoyScore > 60) {
    trapCompositeScore += 35; // 资金欺诈 — highest weight (definitive signal)
  }
  if (isHollowRise) {
    trapCompositeScore += 25; // 空涨 — strong structural signal
  }
  if (isAlphaDivergence) {
    // V59.6 FIX: Graduated Alpha weight based on severity.
    // Alpha=-15 (threshold) → 20pts (needs companion signal to trigger trap)
    // Alpha=-25 → 30pts (needs only weak companion)
    // Alpha=-35+ → 40+pts (single-handedly triggers trap — catastrophic exhaustion)
    // Formula: base 20 + 1pt per unit beyond threshold, capped at 45
    const alphaSeverityBonus = Math.min(25, Math.abs(alpha + 15) * 1.0);
    trapCompositeScore += 20 + alphaSeverityBonus; // Alpha 枯竭 — momentum exhaustion (graduated)
  }
  if ((stock.trapRiskScore || 0) > 60) {
    // Graduated: score 61 → +5, score 80 → +10, score 100 → +20
    trapCompositeScore += Math.min(20, ((stock.trapRiskScore || 0) - 60) * 0.5);
  }
  if (microContext?.macdfs === "DeadCross" && (stock.changePercent || 0) > 3) {
    trapCompositeScore += 15; // 高位分时死叉
  }
  const isTrap = trapCompositeScore >= 40;

  if (isTrap) {
    pipeline.trapDetected = true;
  }

  // ── STAGE 3: TrendImmunity (趋势护盾层) ────────────────────────────────
  // 核心原则：趋势票洗盘太猛时保护持仓者不被震下车。
  // 但陷阱优先于豁免：isTrap → 趋势护盾不激活（防止"僵尸主升"被保护）。
  // 核弹例外：上塘路/佛山席位砸盘风险 > 90 时强制失效。
  const isNuclearFund = (fundIdentity.profile.type === "Scythe" || fundIdentity.profile.type === "Sniper") && fundRisk.riskScore > 90;

  if (
    (isInfinityMode || isTrendProtected || isCapacityDragon) &&
    current > ma20 &&
    (stock.changePercent || 0) > -7 && // 跌停不豁免
    !isNuclearFund &&
    !pipeline.trapDetected // V59.5: 陷阱否决豁免 — Trap > Immunity
  ) {
    pipeline.immunityActive = true;
  }

  // ── STAGE 4: SignalGen (信号生成层) ────────────────────────────────────
  // 核心：主决策链。基于 Stages 1-3 的预判结果生成原始交易信号。
  // 尊重管道锁：phaseLocked → 不生成 BUY; immunityActive → SELL 降级为 HOLD

  // ── V61.0: POST-BREAK DAY PRIORITY (断板次日优先判定) ──────────────────
  // 优先级最高：断板次日是短线最高频、最关键的决策场景。
  // 必须在所有通用信号逻辑之前完成判定，防止被后续低优先级逻辑覆盖。
  let boardTierHandled = false;

  if (boardTier === 'POST_BREAK') {
    const chgPct = stock.changePercent || 0;
    const isDragonOrLeader = stock.role === "Dragon" || stock.role === "Leader";
    const isMainRole_pb = stock.role === "Main" || stock.role === "Vice";
    const isFollowerRole = stock.role === "Follower" || stock.role === "Normal";
    
    // ── 场景1: 断板反包 (Reborn) ──
    // 昨日断板，今日阳线反包(涨幅>3%)且放量 → 弱转强确认，买入信号
    // 限制：系统风险锁定时不触发
    if (chgPct > 3 && !isShrinkVolume && !pipeline.phaseLocked) {
      signalType = "BUY";
      signalTitle = "反包 (REBORN)";
      adviceText = `[V61断板反包] ${priorBoardHeight}板断板后阳线反包(+${chgPct.toFixed(1)}%)，分歧转一致确认。这是连板股最经典的\"二波启动\"买点，主力洗盘结束后重新进攻。`;
      recommendedBuy = current;
      dynamicStopLoss = low > 0 ? low * 0.98 : current * 0.95;
      expectedDirection = "UP";
      intradayScript = "V-Reversal";
      score = Math.min(90, 65 + priorBoardHeight * 5);
      prob = 78;
      boardTierHandled = true;
    }
    // ── 场景2: 天量断板 → 无条件出逃 ──
    // 昨日放天量封板(量比>2.5x)后今日断板 → 主力昨日已完成出货
    else if (yesterdayVolHeavy) {
      signalType = "SELL";
      signalTitle = "天量见顶 (VOL_TOP)";
      adviceText = `[V61天量断板] 昨日涨停放出天量(>2.5倍均量)，主力借涨停高位对倒出货。今日断板确认顶部，无论角色一律离场。${priorBoardHeight >= 3 ? '高位天量是妖股终结的标志性信号。' : ''}`;
      recommendedSell = current;
      dynamicStopLoss = current * 0.95;
      expectedDirection = "DOWN";
      intradayScript = "L-Crash";
      score = Math.min(score, 20);
      prob = 35;
      // 强制禁止下游豁免
      pipeline.immunityActive = false;
      pipeline.trapDetected = true;
      boardTierHandled = true;
    }
    // ── 场景3: 龙头首阴 (Dragon First Dip) ──
    // 3板+龙头/领涨断板，跌幅在-1%~-5%，缩量 → 黄金坑低吸
    else if (isDragonOrLeader && priorBoardHeight >= 3 && chgPct > -5 && chgPct < -0.5 && !isHeavyVolume) {
      signalType = "BUY";
      signalTitle = "首阴 (1ST_DIP)";
      adviceText = `[V61龙头首阴] ${priorBoardHeight}板总龙/板龙首次回调(${chgPct.toFixed(1)}%)且缩量，这是龙头战法的\"黄金买点\"。龙头首阴本质是获利盘消化，不改趋势。在-3%~-5%附近分批低吸，止损设在今日最低价下方。`;
      recommendedBuy = low > 0 ? low * 1.01 : current;
      dynamicStopLoss = low > 0 ? low * 0.97 : current * 0.93;
      expectedDirection = "UP";
      intradayScript = "V-Reversal";
      score = Math.min(88, 60 + priorBoardHeight * 5);
      prob = 75;
      boardTierHandled = true;
    }
    // ── 场景4: 龙头大面 → 观望等企稳 ──
    // 龙头断板跌幅超过-5% → 不是首阴而是真正的转折，等企稳再说
    else if (isDragonOrLeader && priorBoardHeight >= 3 && chgPct <= -5) {
      signalType = "WAIT";
      signalTitle = "重挫 (CRASH)";
      adviceText = `[V61龙头重挫] ${priorBoardHeight}板龙头大幅回撤(${chgPct.toFixed(1)}%)，已超出\"首阴\"容忍范围(-5%)。这可能是\"天地板\"级别的转势信号，短线客先离场，等2~3日观察是否能企稳再做打算。`;
      expectedDirection = "DOWN";
      intradayScript = "L-Crash";
      score = Math.min(score, 30);
      prob = 40;
      boardTierHandled = true;
    }
    // ── 场景5: 二板分歧断板 → 核按钮 ──
    // 2板断板(priorBoardHeight=2) + 跟风/普通角色 → 高概率核按钮
    else if (isFollowerRole && priorBoardHeight <= 2) {
      signalType = "SELL";
      signalTitle = "核按钮 (NUKE)";
      adviceText = `[V61杂毛断板] ${priorBoardHeight}板跟风股断板，${chgPct < -3 ? '大幅低开确认主力撤退' : '上攻失败高位套牢'}。跟风股没有\"首阴低吸\"的容错空间，竞价/开盘无条件离场。`;
      recommendedSell = current;
      expectedDirection = "DOWN";
      intradayScript = "L-Crash";
      score = Math.min(score, 25);
      prob = 30;
      pipeline.immunityActive = false;
      boardTierHandled = true;
    }
    // ── 场景6: 中军/副龙断板 → 条件性观望 ──
    else if (isMainRole_pb) {
      if (chgPct < -3) {
        signalType = "SELL";
        signalTitle = "止损 (CUT)";
        adviceText = `[V61中军断板] ${priorBoardHeight}板中军/副龙断板且跌幅较深(${chgPct.toFixed(1)}%)。中军不同于龙头，没有情绪溢价保护，趋势一旦破位恢复难度极大，先出来观望。`;
        recommendedSell = current;
        expectedDirection = "DOWN";
        score = Math.min(score, 35);
        boardTierHandled = true;
      } else {
        signalType = "WAIT";
        signalTitle = "观察 (WATCH)";
        adviceText = `[V61中军断板] ${priorBoardHeight}板中军断板但跌幅可控(${chgPct.toFixed(1)}%)。观察是否能在MA5/MA10获得支撑企稳，企稳后可低吸博反包。`;
        expectedDirection = "SIDEWAYS";
        score = Math.min(score, 45);
        boardTierHandled = true;
      }
    }
    // ── 场景7: 通用断板 → 基于板高给建议 ──
    else if (!boardTierHandled) {
      if (priorBoardHeight >= 3 && chgPct > -3) {
        signalType = "WAIT";
        signalTitle = "观察 (WATCH)";
        adviceText = `[V61断板观察] ${priorBoardHeight}板高位断板，跌幅尚可(${chgPct.toFixed(1)}%)。关注尾盘能否企稳收十字星/小阳，若企稳则明日有\"弱转强\"机会。`;
        score = Math.min(score, 45);
      } else {
        signalType = "SELL";
        signalTitle = "离场 (EXIT)";
        adviceText = `[V61断板离场] ${priorBoardHeight}板断板，无明确支撑逻辑，建议减仓或清仓，避免\"温水煮蛙\"式阴跌。`;
        recommendedSell = current;
        expectedDirection = "DOWN";
        score = Math.min(score, 30);
      }
      boardTierHandled = true;
    }
  }

  // V8.5 Lone Wolf Veto (仅在 boardTier 未处理时执行通用链)
  if (boardTierHandled) {
    // 断板次日信号已锁定，跳过通用 SignalGen 链
    // (downstream Stages 5/6 仍会执行仲裁和兜底)
  } else if (isLoneWolf && !isIndexCrash) {
    signalType = "WAIT";
    signalTitle = "规避 (AVOID)";
    adviceText = `[孤狼预警]个股涨势独立，但所属板块 [${sectorContext?.name || "未知"}] 热度极低或处于拖累状态。`;
    score = Math.min(score, 40);
  }
  // V11.0: Anti-Washout Override (幽灵协议：防洗盘熔断)
  // If signal is SELL/WAIT but Stealth Score is high -> FORCE HOLD/BUY
  else if (
    (signalType === "SELL" || signalType === "WAIT") &&
    (stealthScore > 40 || isIcebergDetected)
  ) {
    // Check if it's not a complete crash
    if ((stock.changePercent || 0) > -3) {
      signalType = "HOLD"; // Downgrade Sell to Hold
      signalTitle = "护盘 (GUARD)";
      adviceText = `[幽灵协议]检测到拆单吸筹痕迹（隐形得分 ${stealthScore}）。技术面虽示弱，但暗盘承接有力，判定为洗盘。建议保留底仓观察。`;
      recommendedSell = 0; // Cancel sell recommendation
      dynamicStopLoss = low < ma20 ? low : ma20; // Loosen stop loss to day's low

      if (isIcebergDetected) {
        adviceText += " (大单拆小单确认)";
        trend = "Rebound"; // Expect rebound
      }
    }
  }
  // V10.0: Micro-Structure Veto (微观一票否决)
  else if (
    microContext?.macdfs === "DeadCross" &&
    (stock.changePercent || 0) > 5 &&
    !isLimitUp
  ) {
    signalType = "SELL";
    signalTitle = "止盈 (TAKE)";
    adviceText = `[分时死叉]高位动能衰竭，分时 MACD 死叉确认。建议立即兑现利润。`;
    recommendedSell = current;
  } else if (
    stargateResult.gateLevel >= 2 &&
    (stock.changePercent || 0) > 4 &&
    !isTopDivergence &&
    (stock.trapRiskScore || 0) < 40
  ) {
    signalType = "BUY";
    signalTitle = "星门 (STARGATE)";
    const primarySignal =
      stargateResult.signals.length > 0
        ? stargateResult.signals[0]
        : "空间维度共振";
    adviceText = `[星门加速]${primarySignal}。穿越速度 ${stargateResult.penetrationVelocity?.toFixed(2) || "0.00"} pts/m。`;
    recommendedBuy = current;
  } else if (
    isIndexCrash &&
    !isLimitUp &&
    stock.role !== "Independent"
  ) {
    signalType = "WAIT";
    signalTitle = "避险 (SAFE)";
    adviceText = `[系统性风险]大盘重挫 ${indexChange.toFixed(2)}%，泥沙俱下。暂停开仓，优先防守。`;
    if ((stock.changePercent || 0) < -2) {
      signalType = "SELL";
      signalTitle = "止损 (CUT)";
    }
  } else if (
    // V59.4 FIX: Updated from dead "HotMoney" to current FundType values.
    // Scythe (上塘路) and Sniper (佛山) are the modern equivalents of "HotMoney" — 
    // both are high-smash-probability day-traders that nuke the next morning.
    (fundIdentity.profile.type === "Scythe" || fundIdentity.profile.type === "Sniper") &&
    fundRisk.riskScore > 90
  ) {
    signalType = "SELL";
    signalTitle = "核按钮 (NUKE)";
    adviceText = `[资金预警]识别为 ${fundIdentity.detectedName}。该席位习惯次日砸盘，建议竞价/开盘立即核按钮离场。`;
    recommendedSell = stock.open || current;
    expectedDirection = "DOWN";
  }
  // V16.5: Sky High Profit Taking (高空止盈策略)
  else if (isBrokenLimit) {
    // V54.0: Reseal Sniper (回封狙击)
    // 识别：股价炸板，但并没有大幅回落（> Limit * 0.95），量能可控，且分时出现回流。
    // 这可能是"T字板"洗盘，是极强的买点，而非卖点。
    const brokenDepth = limitUpPrice > 0 ? (limitUpPrice - current) / limitUpPrice : 0;
    const isHovering = brokenDepth < 0.04 && brokenDepth > 0; // 仅回撤 4% 以内
    const isResealing = microContext?.largeOrderNetYuan &&
      microContext.largeOrderNetYuan > 10_000_000; // 有大单回流抢筹
    const isHealthyVolume = (stock.turnoverRate || 0) < 35; // 换手没有失控

    if (
        isHovering && 
        (isResealing || isHealthyVolume) && 
        (stock.role === "Dragon" || stock.role === "Leader")
    ) {
        signalType = "BUY";
        signalTitle = "回封 (RESEAL)";
        adviceText = `[T字洗盘] 龙头股虽然炸板，但股价坚挺(回撤 <${(brokenDepth*100).toFixed(1)}%)且量能未失控。这是一次极为凶悍的洗盘，建议在回封瞬间打板介入，博弈T字连板。`;
        recommendedBuy = limitUpPrice; // 直接挂涨停价扫货
        dynamicStopLoss = current * 0.95; 
        score = 85; // 极高确信度
        expectedDirection = "UP";
        intradayScript = "N-Wave";
    } else {
        // 普通炸板 -> 维持原来的出货判断
        signalType = "SELL";
        signalTitle = "炸板 (SMASH)";
        adviceText = `[板上确认]触及涨停后回落超 2%，封板失败风险极高。主力借涨停出货，建议立即止盈，防止日内大面。`;
        recommendedSell = current;
        expectedDirection = "DOWN";
    }
  } else if (
    isHighBias &&
    (stock.changePercent || 0) > 8 &&
    !isLimitUp &&
    !isInfinityMode
  ) {
    signalType = "SELL";
    signalTitle = "减仓 (TRIM)";
    adviceText = `[乖离警报]股价偏离 5日线 >${((TH_BIAS_HIGH - 1) * 100).toFixed(0)}%，短期获利盘极其丰厚。虽未破位，但随时可能引发剧烈震荡，建议兑现部分利润。`;
    recommendedSell = current;
    expectedDirection = "SIDEWAYS";
  } else if (isDragonStagnation) {
    signalType = "SELL";
    signalTitle = "止盈 (TAKE)";
    adviceText = `[高位滞涨]涨幅 >6% 但换手过高 (${effectiveTurnover.toFixed(1)}%) 且迟迟未封板。分时量比 >2.5，多头动能衰竭，建议清仓。`;
    recommendedSell = current;
    expectedDirection = "DOWN";
  } else if (isLimitUp) {
    // ═══ V61.0: BOARD-HEIGHT-SPECIFIC LIMIT-UP STRATEGY ═══
    signalType = "HOLD";
    
    if (boardTier === 'FIRST') {
      // ── 首板：试错期，关注能否晋级 ──
      // V67.8 FIX: 三档制替代二分法。calculateLimitUpStrength 基础分60，正常量能+10≈70，
      // 旧阈值75导致绝大多数涨停被判为"烂板"。现改为：强封>75 / 普通封板>55 / 烂板≤55。
      signalTitle = "首板 (1ST)";
      const sealScore = stock.strengthScore || 50;
      const resoScore = stock.resonanceScore || 0;
      const isHardSeal = sealScore > 75;
      const isNormalSeal = sealScore > 55;
      const isSectorHot = isSectorResonance || resoScore > 50;
      
      if (isHardSeal && isSectorHot) {
        adviceText = `[V61首板·强封] 封板强度${sealScore}分，板块共振${resoScore}分，明日晋级2板概率较高。资金: [${fundIdentity.detectedName}]。策略: 持股不动，明日竞价高开>2%可排板接力。`;
        dynamicStopLoss = current * 0.94;
        score = Math.max(score, 72);
      } else if (isHardSeal) {
        adviceText = `[V61首板·独板] 封板质量较强(${sealScore}分)但板块共振不足(${resoScore}分)。独狼首板次日溢价有限，明日冲高不板建议止盈。资金: [${fundIdentity.detectedName}]。`;
        dynamicStopLoss = current * 0.96;
      } else if (isNormalSeal && isSectorHot) {
        // V67.8 NEW: 普通封板+板块共振 → 中性偏多
        adviceText = `[V61首板·普通] 封板强度中等(${sealScore}分)，板块有共振(${resoScore}分)。次日走势取决于板块人气延续，竞价高开可持有，低于预期则止盈。资金: [${fundIdentity.detectedName}]。`;
        dynamicStopLoss = current * 0.95;
        score = Math.max(score, 62);
      } else if (isNormalSeal) {
        // V67.8 NEW: 普通封板无共振 → 中性
        adviceText = `[V61首板·普通] 封板强度中等(${sealScore}分)，板块共振不足(${resoScore}分)。独狼普通板次日溢价有限，冲高不板建议止盈。资金: [${fundIdentity.detectedName}]。`;
        dynamicStopLoss = current * 0.96;
      } else {
        adviceText = `[V61首板·烂板] 封板强度偏低(${sealScore}分)${yesterdayVolHeavy ? '且放量过大' : ''}。烂板次日低开概率高，建议竞价弱于预期直接出局。资金: [${fundIdentity.detectedName}]。`;
        dynamicStopLoss = current * 0.97;
        score = Math.min(score, 55);
      }
    } else if (boardTier === 'SECOND') {
      // ── 2板：分歧生死局 ──
      signalTitle = "二板 (2ND)";
      const isVolExpand = effectiveTurnover > (turnoverMA5 * 1.8);
      const isVolControlled = effectiveTurnover < (turnoverMA5 * 1.3);
      
      if (isVolControlled) {
        adviceText = `[V61二板·缩量] 2连板且缩量加速(换手${effectiveTurnover.toFixed(1)}%)，一致性强！明日大概率继续缩量加速冲击3板。资金: [${fundIdentity.detectedName}]。策略: 坚定锁仓。`;
        dynamicStopLoss = current * 0.93;
        score = Math.max(score, 80);
      } else if (isVolExpand) {
        adviceText = `[V61二板·放量] 2连板出现明显放量(换手${effectiveTurnover.toFixed(1)}%)，分歧加大。这是连板最危险的一天——明日竞价是\"生死局\"。竞价高开>3%缩量=弱转强加仓；竞价低开放量=核按钮。资金: [${fundIdentity.detectedName}]。`;
        dynamicStopLoss = current * 0.95;
        score = Math.min(score, 65);
      } else {
        adviceText = `[V61二板] 2连板量能正常。明日是关键分歧日，做好\"加仓\"与\"核按钮\"两手准备。关注竞价量比和开盘强度。资金: [${fundIdentity.detectedName}]。`;
        dynamicStopLoss = current * 0.95;
      }
    } else if (boardTier === 'THIRD') {
      // ── 3板：妖股确认，格局持有 ──
      signalTitle = "三板 (3RD)";
      adviceText = `[V61三板·确认] 3连板！妖股胚子确认。能走到3板说明市场认可度极高，已经脱离\"普通连板\"进入\"空间博弈\"。资金: [${fundIdentity.detectedName}]。策略: 格局持有，不到断板不走。止损线放宽到-6%容忍洗盘。`;
      dynamicStopLoss = current * 0.94;
      score = Math.max(score, 78);
      
      if (phase === "Ebb" || phase === "Ice") {
        adviceText += ` ⚠️退潮期3板抗性弱，建议适度减仓锁利。`;
        score = Math.min(score, 65);
      }
    } else if (boardTier === 'DRAGON_HIGH') {
      // ── 4板+：空间博弈，纯情绪驱动 ──
      signalTitle = `${boardHeight}板 (HIGH)`;
      const spaceHeight = boardHeight;
      
      adviceText = `[V61高位龙·${boardHeight}板] 进入纯空间博弈阶段！${boardHeight >= 7 ? '已是超级妖股，' : ''}此时技术指标全部失效，只看情绪和封单。资金: [${fundIdentity.detectedName}]。`;
      
      if (yesterdayVolShrink) {
        adviceText += ` 昨日缩量加速，一致性极强，继续锁仓。断板即走。`;
        dynamicStopLoss = current * 0.92;
        score = Math.max(score, 82);
      } else if (yesterdayVolHeavy) {
        adviceText += ` ⚠️昨日放天量(见顶预警)，今日虽然封住但筹码已松动。建议保留底仓，开始逢高减仓。`;
        dynamicStopLoss = current * 0.96;
        score = Math.min(score, 60);
      } else {
        adviceText += ` 量能正常，走一步看一步。核心观察：市场总高度是否还有空间、板块是否仍在发酵。`;
        dynamicStopLoss = current * 0.94;
      }
    } else {
      // Fallback: 通用涨停 (boardTier === 'NONE' 但 isLimitUp)
      signalTitle = "锁仓 (LOCK)";
      const limitUpStopThreshold =
        stock.role === "Dragon"
          ? 0.94
          : phase === "Ebb"
            ? 0.98
            : 0.96;
      dynamicStopLoss = current * limitUpStopThreshold;
      adviceText = `标的封死涨停。资金属性: [${fundIdentity.detectedName}]，建议: ${fundIdentity.profile.tacticalAdvice}`;
    }
    
    boardTierHandled = true;
  }
  // V59.3 FIX: Removed duplicate isBrokenLimit/isDragonStagnation branches (dead code).
  // Already fully handled above (~line 1144/1185) with V54.0 Reseal Sniper logic.
  else if (isHollowRise) {
    signalType = "SELL";
    signalTitle = "空涨 (HOLLOW)";
    adviceText = `[中军诱多]股价拉升但供应商大单净额显著为负 (占成交额 > ${(Math.abs(TH_HOLLOW_FLOW) * 100).toFixed(1)}%)。价格与大单方向背离，建议分批离场。`;
    recommendedSell = current;
    expectedDirection = "DOWN";
  }
  // V13.0 DNA Override: Trend Stocks Ignore Divergence
  else if (
    isTopDivergence &&
    !isInfinityMode &&
    !isTrendProtected
  ) {
    signalType = "SELL";
    signalTitle = "出逃 (EVAC)";
    adviceText = `[顶背离警报]股价创新高但动能衰竭。MACD 死叉在即，大概率见顶，立即止盈离场。`;
    recommendedSell = current;
    expectedDirection = "DOWN";
  } else if (isAcceleratedTop && !isInfinityMode) {
    signalType = "SELL";
    signalTitle = "减仓 (TRIM)";
    adviceText = `[中军加速]乖离率过大 (> ${(TH_BIAS_HIGH - 1) * 100}%) 且换手过热 (> ${TH_TURNOVER_HEAT.toFixed(1)}%)。锁定利润，设回撤止盈。`;
    recommendedSell = current;
    expectedDirection = "DOWN";
  }
  // V12.0 Infinity Mode Override
  else if (isInfinityMode) {
    signalType = "HOLD";
    signalTitle = "无限 (INF)";
    adviceText = `[无限模式]检测到容量龙 (${(turnoverAmount / 100000000).toFixed(0)}亿) 处于主升浪。忽略 RSI 超买及乖离率信号，死守 5 日线持有。`;
    dynamicStopLoss = ma5;
    expectedDirection = "UP";
    score = Math.max(score, 75); // <--- VITAL FIX: Ensure Infinity Mode has passing score!
  }
  // V13.0 Trend Protection Override
  else if (isTrendProtected) {
    signalType = "HOLD";
    signalTitle = "趋势 (TREND)";
    adviceText = `[趋势DNA]识别为机构趋势票 (贴合 MA20)。当前虽有背离但趋势完好，系统自动屏蔽左侧卖点，建议沿 20 日线持股。`;
    dynamicStopLoss = ma20;
    expectedDirection = "UP";
  } else if (isLockedAbove && (stock.changePercent || 0) > 3) {
    signalType = "SELL";
    signalTitle = "诱多 (TRAP)";
    adviceText = `[筹码阻击]上方套牢盘 > ${TH_CHIP_LOCK}%。主力拉升意愿不足，谨防冲高回落。`;
    expectedDirection = "DOWN";
  } else if (isSmash) {
    signalType = "SELL";
    signalTitle = "离场 (ESCAPE)";
    adviceText = `[主力出货]放量杀跌 (换手 > ${TH_TURNOVER_HEAT}%) 且击穿支撑。资金坚决流出，切勿盲目抄底。`;
    recommendedSell = current;
    expectedDirection = "DOWN";
  } else if (isSickle) {
    signalType = "SELL";
    signalTitle = "止损 (CUT)";
    adviceText = `[主力镰刀]长上影线 (> ${(TH_SICKLE_DROP * 100).toFixed(1)}%) 确认出货。日内亏钱效应显著，离场避险。`;
  } else if ((stock.trapRiskScore || 0) > 60) {
    signalType = "SELL";
    signalTitle = "避险 (AVOID)";
    adviceText = `[风控熔断]综合诱多风险评分 ${(stock.trapRiskScore || 0).toFixed(0)} (高于阈值 60)。系统强制中止开仓计划。`;
    expectedDirection = "DOWN";
  } else if (isIndexResonanceBuy) {
    signalType = "BUY";
    signalTitle = "狙击 (SNIPER)";
    adviceText = `[趋势共振]大盘MA20主升，个股缩量回踩支撑。分时量能稳定，系统判定为黄金买点。`;
    recommendedBuy = current;
    dynamicStopLoss = low < ma20 ? low : ma20;
    // Boost Score for Resonance
    score = Math.min(99, score + 20);
  }

  // V17.5 FIX: Ensure High-Confidence Signals have matching scores
  // This prevents UI displaying "Infinity (SIGNAL)" with a score of 2%
  if (
    signalTitle.includes("无限") ||
    signalTitle.includes("主升")
  ) {
    score = Math.max(score, 75);
  }
  if (
    signalTitle.includes("狙击") ||
    signalTitle.includes("突击")
  ) {
    score = Math.max(score, 80);
  } else if (signalType === "WAIT" && isShakeout) {
    // V59.3 FIX: Added `signalType === "WAIT"` guard to prevent overriding
    // prior SELL/HOLD/BUY decisions from the main decision chain.
    signalType = "BUY";
    signalTitle = "低吸 (SUCK)";
    adviceText = `缩量洗盘:上升趋势中良性回调。换手极低 (< ${(TH_TURNOVER_HEAT * 0.6).toFixed(1)}%) 说明筹码锁定良好，回踩 MA20 是黄金买点。`;
    recommendedBuy = ma20 > 0 ? ma20 : current;
    dynamicStopLoss = ma60 > 0 ? ma60 : current * 0.95;
  } else if (signalType === "WAIT" && isTrendLowSuck) {
    signalType = "BUY";
    signalTitle = "低吸 (SUCK)";
    adviceText = `趋势低吸:中军回踩支撑 (MA10/20) 且缩量。当前环境 [${phase}] 允许试错，盈亏比极佳。`;
    dynamicStopLoss = ma60 > 0 ? ma60 : current * 0.9;
  } else if (signalType === "WAIT" && isBlueSky && isAccelerating) {
    // V50.4: Vertigo Circuit Breaker (主升浪熔断机制)
    // 解决痛点：主升浪末端加速时，用户追高被埋。
    const amplitude = prevClose > 0 ? (high - low) / prevClose : 0;
    const isVolatile = amplitude > 0.07 && !isLimitUp; // 振幅过大，筹码松动
    const isOverheated = effectiveTurnover > 18 && stock.role !== "Dragon"; // 非龙头高换手

    if (isVolatile) {
      signalType = "HOLD"; // 降级
      signalTitle = "震荡 (CHOP)";
      adviceText = `[主升预警]虽然获利盘主导，但今日振幅过大(${(amplitude * 100).toFixed(1)}%)，表明多空分歧剧烈。筹码开始松动，主升浪转为高位震荡，建议去弱留强。`;
      expectedDirection = "SIDEWAYS";
      intradayScript = "W-Grind";
    } else if (isOverheated) {
      signalType = "SELL"; // 熔断
      signalTitle = "分歧 (SPLIT)";
      adviceText = `[高位放量]主升浪中出现异常换手(${effectiveTurnover.toFixed(1)}%)。非龙头股放量滞涨是出货信号，警惕见顶。`;
      expectedDirection = "DOWN";
      intradayScript = "A-Dive";
    } else {
      // 真正的良性主升
      signalType = "HOLD";
      signalTitle = "主升 (MAIN)";
      // Check Bias for strict advice
      const bias5 = ma5 > 0 ? (current - ma5) / ma5 : 0;
      if (bias5 > 0.12) {
         adviceText = `天空之城(加速段): 获利盘占比 ${profitRatio.toFixed(0)}%。乖离率偏高，这是持筹者的盛宴，空仓者严禁追高接力！`;
         positionAdvice = "持股不动 | 禁止开仓";
      } else {
         adviceText = `天空之城(稳健段): 获利盘占比 ${profitRatio.toFixed(0)}%，上方万里无云。走势平稳，属于最安全的持股阶段。`;
      }
      dynamicStopLoss = ma5;
      intradayScript = "One-Way";
    }
  } else if (signalType === "WAIT" && isBottomDivergence) {
    // V59.3 FIX: Same guard
    signalType = "BUY";
    signalTitle = "伏击 (AMBUSH)";
    adviceText = `底背离确认:股价新低但指标回升。主力在底部吸筹，盈亏比极佳，建议潜伏。`;
    recommendedBuy = current;
    dynamicStopLoss = low;
  } else if (signalType === "WAIT" && isWeakToStrong) {
    // V59.3 FIX: Same guard
    signalType = "BUY";
    signalTitle = "弱转强 (WTS)";
    adviceText = `反包确认:分歧转一致，且冲破筹码密集区。预测明日加速，目标位 ${nextDayHigh.toFixed(2)}。`;
    recommendedBuy = current;
  } else if (signalType === "WAIT" && isBoomerang) {
    // V59.3 FIX: Same guard
    signalType = "BUY";
    signalTitle = "回马枪 (RETURN)";
    adviceText = `趋势修复:主力借势洗盘挖坑，今日放量收复失地。属于典型的"假摔"后反转，建议立即纠错买回。`;
    recommendedBuy = current;
    dynamicStopLoss = low; // Stop loss at the "pit" bottom
  } else if (
    signalType === "WAIT" &&
    isAccelerating &&
    current > ma5 &&
    (stock.trapRiskScore || 0) < 50
  ) {
    const dailyDrawdown =
      high > 0 ? (high - current) / high : 0;
    const isRealTimeStrong =
      (stock.changePercent || 0) > 0 && current >= open;
    const intradayRange = high - low;
    const isNotBottom =
      intradayRange > 0
        ? (current - low) / intradayRange > 0.3
        : true;

    if (
      dailyDrawdown < 0.035 &&
      isRealTimeStrong &&
      isNotBottom
    ) {
      signalType = "BUY";
      signalTitle = "突击 (ASSAULT)";
      adviceText =
        "上升通道完好，分时走势主动进攻。趋势跟随策略。";
      recommendedBuy = ma5;
      dynamicStopLoss = ma10;
    } else {
      signalType = "WAIT";
      signalTitle = "观望 (WAIT)";
      if (!isRealTimeStrong)
        adviceText =
          "上升趋势中，但今日分时偏弱（绿盘或阴线），不宜追涨。";
      else
        adviceText =
          "虽然处于上升趋势，但日内回撤较大，建议等待企稳信号。";
    }
  }

  // ── STAGE 5: Arbitration (仲裁层) ──────────────────────────────────────
  // 核心：对 SignalGen 的输出进行一致性验证和强制修正。
  // 执行顺序：Fund注入 → 趋势豁免 → 价格否决 → 雪崩熔断 → 一致性仲裁 → 趋势映射 → T+1推演

  // --- 5A: Fund Strategy Injection ---
  if (
    fundStrategyNote &&
    !adviceText.includes(fundStrategyNote)
  ) {
    adviceText += fundStrategyNote;
  }

  // --- 5B: Trend Immunity Override (V50.3) ---
  // V59.5: Replaced inline conditions with pre-computed pipeline.immunityActive flag.
  // --- V50.3: Trend Immunity Protocol (趋势豁免机制) ---
  // 解决痛点：趋势票盘中洗盘太猛，导致算法误报“止损”，将用户震下车。
  // 逻辑：只要是“无限模式”或“趋势保护”状态，且未跌破MA20，强行屏蔽分时卖点。
  if (
    (signalType === "SELL" || signalTitle.includes("止损") || signalTitle.includes("离场")) &&
    pipeline.immunityActive // V59.5: Pre-computed in Stage 3 (includes !isTrap, !isNuclear guards)
  ) {
    {
      const preOverrideTitle = signalTitle;
      signalType = "HOLD";
      signalTitle = "抗跌 (RESIST)";
      adviceText = `[趋势豁免]虽盘中触发${preOverrideTitle}信号，但该股拥有[${isInfinityMode ? "无限模式" : "趋势DNA"}]护体，且未破生命线(MA20)。判定为暴力洗盘，系统强制屏蔽止损，建议锁仓忍受波动。`;
      
      // Override Prediction
      predictionDesc = "趋势完好，无视分时波动，等待尾盘修复";
      if (intradayScript === "L-Crash" || intradayScript === "A-Dive") {
        intradayScript = "W-Grind"; // Downgrade crash script to washout script
      }
    }
  }

  // --- 5C: Price Action Veto (V53.0) ---
  // --- V53.0: Price Action Veto (价格否决权) ---
  // 核心原则：资金数据存在欺骗性，但价格走势（K线）是真实的。
  // 任何基于资金面的买入信号，如果缺乏均线支撑或形态配合，必须降级。
  const isTrendBroken = current < ma20 && ma5 < ma20;
  
  if (
    signalType === "BUY" &&
    isTrendBroken &&
    !isBottomDivergence &&
    !isBoomerang && 
    !isTrendLowSuck
  ) {
    // 趋势破位，资金再好也是"诱多"或"接飞刀"
    signalType = "WAIT";
    signalTitle = "观望 (WAIT)";
    adviceText = `[价格否决]尽管资金面或形态有吸筹迹象，但K线已有效跌破生命线(MA20)。不论资金流入多少，趋势破位是铁律，建议放弃抄底，防止被埋。`;
    score = Math.min(score, 45); // 强制不及格
    expectedDirection = "DOWN"; // 修正预期
    intradayScript = "L-Crash";
  } else if (
    signalType === "BUY" &&
    isSmash &&
    !isTrendLowSuck // 回踩不算砸盘
  ) {
    signalType = "SELL";
    signalTitle = "止损 (CUT)";
    adviceText = `[K线熔断]虽然模型评分尚可，但今日出现放量阴线(Smash Candle)。这种形态往往是主力不计成本砸盘，资金数据可能失真，先出来再说。`;
    score = Math.min(score, 30);
  }

  // --- 5D: Avalanche Protocol (V54.0 雪崩协议) ---
  // V59.5: isSystemicRisk 已在 Stage 1 (PhaseFilter) 预计算，pipeline.phaseLocked 已设置。
  // 此处执行信号修正：BUY → WAIT。

  if (pipeline.phaseLocked && signalType === "BUY") {
      // 豁免条件：必须是市场总龙或独立妖股，且逆势翻红
      // V59.4 FIX: Added "Leader" — "Dragon" is not a valid Stock.role value.
      const isShelter = (stock.role === "Dragon" || stock.role === "Leader" || stock.role === "Independent") && (stock.changePercent || 0) > 2;
      
      if (!isShelter) {
          signalType = "WAIT";
          signalTitle = "空仓 (EMPTY)";
          adviceText = `[雪崩熔断] 指数重挫 ${(marketContext?.indexChange || 0).toFixed(2)}%，市场进入冰点普跌模式。系统强制熔断所有非龙头股的买入计划，现金为王。`;
          score = 0; // 强制归零
          expectedDirection = "DOWN";
          intradayScript = "L-Crash";
      } else {
          adviceText += " [抱团避险] 大盘崩盘，资金抱团妖股取暖，注意快进快出。";
      }
  }

  // --- 8. Final Trend Mapping & Return ---
  // (trend already declared above V8.5 Lone Wolf Veto to avoid TDZ)
  trend = "Neutral"; // Reset before final mapping
  if (signalType === "BUY") trend = "Accelerate";
  if (signalType === "SELL") trend = "Divergence";
  if (signalType === "HOLD") trend = "Accelerate";
  if (signalTitle.includes("伏击")) trend = "Rebound";
  if (
    signalTitle.includes("出逃") ||
    signalTitle.includes("离场")
  )
    trend = "Top";

  // --- V56.0: Contextual T+1 Simulation (情境化博弈推演) ---
  // 核心重构：抛弃单纯的K线形态推演，引入"身份+环境"的动态博弈。
  // 解决痛点：区分"仙人指路"与"避雷针"，区分"龙头首阴"与"杂毛见顶"。
  
  const t1ClosePosition = (current - low) / (high - low || 1); // 收盘位置 (0=最低, 1=最高)
  const t1UpperShadow = (high - Math.max(open, current)) / prevClose; 
  const t1LowerShadow = (Math.min(open, current) - low) / prevClose; 
  const t1BodyRatio = Math.abs(current - open) / prevClose; 

  let t1Opening = "平开预期 (-1% ~ +1%)";
  let t1Script = "随盘波动 (Volatility)";
  let t1Action = "观察竞价强弱";
  
  // ----------------------------------------------------------------
  // V61.0 Scenario 0: Board-Tier T+1 Override (连板梯队T+1推演)
  // ----------------------------------------------------------------
  // 优先于角色逻辑：连板高度决定T+1走势的权重 > 角色权重
  
  if (boardTier === 'FIRST') {
      const sealScore = stock.strengthScore || 50;
      if (sealScore > 75 && isSectorResonance) {
          t1Opening = "高开 (+3% ~ +5%)";
          t1Script = "一致加速冲2板";
          t1Action = "竞价高开缩量直接挂涨停排板。若竞价放量分歧，则观望10分钟再定。";
      } else if (sealScore > 60) {
          t1Opening = "小幅高开 (+1% ~ +3%)";
          t1Script = "分歧震荡";
          t1Action = "冲高不板止盈，回调至均价线可做T。竞价低于预期(-1%以下)直接出。";
      } else {
          t1Opening = "平开或低开 (-2% ~ +1%)";
          t1Script = "分歧回落";
          t1Action = "烂板次日溢价率极低，竞价弱于预期立即出局，不恋战。";
      }
  } else if (boardTier === 'SECOND') {
      if (yesterdayVolShrink || effectiveTurnover < turnoverMA5 * 1.2) {
          t1Opening = "一字/高开 (+5% ~ +9%)";
          t1Script = "缩量加速冲3板";
          t1Action = "极度缩量一致，排板扫货。2板缩量加速是连板股最强信号。";
      } else if (yesterdayVolHeavy || effectiveTurnover > turnoverMA5 * 2) {
          t1Opening = "大幅分歧 (-3% ~ +3%)";
          t1Script = "生死分歧局";
          t1Action = "【关键局】竞价是生死线：高开>3%缩量→排板加仓(弱转强)；低开或放量→竞价核按钮(分歧转一致失败)。";
      } else {
          t1Opening = "小幅高开 (+1% ~ +3%)";
          t1Script = "常规分歧";
          t1Action = "观察前30分钟量能。缩量回封则持有，放量打开则止盈。";
      }
  } else if (boardTier === 'THIRD') {
      t1Opening = "高开 (+3% ~ +7%)";
      t1Script = "妖股加速";
      t1Action = "3板确认妖股胚子，格局持有！缩量加速继续锁仓；炸板但不大跌可观望回封；跌破-5%无条件离场。";
      if (phase === "Ebb" || phase === "Ice") {
          t1Script = "退潮期3板(风险)";
          t1Action = "退潮期高位板风险极大，建议竞价高开冲高即卖，不博弈4板。";
      }
  } else if (boardTier === 'DRAGON_HIGH') {
      if (yesterdayVolShrink) {
          t1Opening = "一字/秒板 (+7% ~ +10%)";
          t1Script = `${boardHeight}板一致加速`;
          t1Action = `缩量${boardHeight}板，市场一致看多，继续锁仓。除非大盘崩盘或断板，否则不动。`;
      } else {
          t1Opening = "高开分歧 (+2% ~ +5%)";
          t1Script = `${boardHeight}板分歧博弈`;
          t1Action = `高位${boardHeight}板分歧，核心看封单承接力。10:00前回封继续拿；久攻不封且量能放大则果断止盈。`;
      }
  } else if (boardTier === 'POST_BREAK') {
      // 断板次日T+1推演
      if (priorBoardHeight >= 3 && (stock.role === "Dragon" || stock.role === "Leader")) {
          if ((stock.changePercent || 0) > 2) {
              // 断板反包了
              t1Opening = "高开 (+3% ~ +5%)";
              t1Script = "二波启动";
              t1Action = "断板反包确认！看高一线，博弈二波主升。持有不动。";
          } else if ((stock.changePercent || 0) > -3) {
              t1Opening = "小幅低开 (-1% ~ -3%)";
              t1Script = "惯性下探后企稳";
              t1Action = "龙头断板次日仍有情绪惯性。在-3%~-5%低吸，博弈反包阳线。";
          } else {
              t1Opening = "低开 (-3% ~ -5%)";
              t1Script = "深度调整";
              t1Action = "龙头深跌可能需要2-3日修复，今日不急，等止跌企稳信号。";
          }
      } else if (priorBoardHeight <= 2 && (stock.role === "Follower" || stock.role === "Normal")) {
          t1Opening = "低开 (-3% ~ -7%)";
          t1Script = "惯性杀跌";
          t1Action = "杂毛断板后无任何溢价，惯性杀跌为主。反抽即卖，不抱幻想。";
      } else {
          t1Opening = "分歧 (-2% ~ +2%)";
          t1Script = "方向待定";
          t1Action = "观察开盘30分钟量价关系再做决策。";
      }
  }
  // ---- V61.0 END (如果 boardTier 已处理，下方角色逻辑的 else-if 会自然跳过) ----
  
  // ----------------------------------------------------------------
  // Scenario 1: Dragon Reborn (龙头/妖股特权逻辑)
  // ----------------------------------------------------------------
  // V61.0: 只在 boardTier 未覆盖时执行 (boardTier=NONE 时)
  if (boardTier !== 'NONE' && !t1Script.includes("随盘波动")) {
      // boardTier 已处理 T+1，跳过角色逻辑
  } else if (stock.role === "Dragon" || stock.role === "Leader") {
      if (isBrokenLimit) {
          // 龙头炸板 -> 预期弱转强
          t1Opening = "预期高开 (+2% ~ +5%)";
          t1Script = "弱转强秒板 (Weak-to-Strong)";
          t1Action = "竞价若超预期高开，直接挂涨停扫货(排板)。这是妖股最常见的成妖节点。";
      } else if ((stock.changePercent || 0) < -5) {
          // 龙头首阴 -> 预期反核
          t1Opening = "预期低开 (-3% ~ -5%)";
          t1Script = "深水反核 (Long-Leg Reversal)";
          t1Action = "严禁核按钮！在-5%以下分批低吸，博弈日内大地天板。";
      } else if (t1UpperShadow > 0.04) {
          // 龙头长上影 -> 仙人指路
          t1Opening = "小幅高开 (+1% ~ +3%)";
          t1Script = "反包上影线";
          t1Action = "昨日分歧已被消化，今日看涨。持有不动。";
      }
  }
  
  // ----------------------------------------------------------------
  // Scenario 2: Death Trap (杂毛/跟风股 杀跌逻辑)
  // ----------------------------------------------------------------
  else if (stock.role === "Follower" || stock.role === "Normal") {
      // V59.3 FIX: Replaced "Chop" (invalid Stock.role) with "Normal"
      if (t1UpperShadow > 0.03) {
          // 跟风股长上影 -> 避雷针
          t1Opening = "大幅低开 (-3% ~ -5%)";
          t1Script = "低开低走 (Drop Dead)";
          t1Action = "竞价立即核按钮！这是主力出货留下的避雷针，次日大概率直接闷杀。";
      } else if (isBrokenLimit) {
          // 跟风股炸板 -> 核按钮
          t1Opening = "跌停开盘 (-8% ~ -10%)";
          t1Script = "一字核按钮 (Nuclear Drop)";
          t1Action = "挂跌停价出逃。主力已撤退，不要抱有任何幻想。";
      }
  }

  // ----------------------------------------------------------------
  // Scenario 3: Mainline Trend (中军趋势逻辑)
  // ----------------------------------------------------------------
  else if (stock.role === "Main" || isTrendDriver) {
      if (t1ClosePosition < 0.2 && effectiveTurnover < turnoverMA5 * 1.5) {
           // V59.6 FIX: Relative threshold (was hardcoded <10). 缩量回调 -> 黄金坑
           t1Opening = "小幅低开 (-1% ~ -2%)";
           t1Script = "探底回升 (V-Shape)";
           t1Action = "回踩五日线是买点，不要被洗出去。";
      } else if (effectiveTurnover > turnoverMA5 * 3 && (stock.changePercent || 0) < 2) {
           // 放量滞涨 -> 阴跌
           t1Opening = "低开 (-2% ~ -4%)";
           t1Script = "阴跌出货 (Slow Bleed)";
           t1Action = "趋势坏了，反抽即卖。";
      }
  }

  // ----------------------------------------------------------------
  // Scenario 4: General Tech Patterns (通用形态补漏)
  // ----------------------------------------------------------------
  // 只有在未匹配上述特殊身份时，才使用通用逻辑
  if (t1Script.includes("随盘波动")) {
      if (isLimitUp) {
          t1Opening = "一字/高开 (+5% ~ +9%)";
          t1Script = "缩量加速";
          t1Action = "持股不动，炸板再走。";
      } else if (t1ClosePosition > 0.9 && t1BodyRatio > 0.04) {
          t1Opening = "高开 (+2% ~ +4%)";
          t1Script = "惯性冲高";
          t1Action = "早盘冲高不板止盈。";
      } else if (t1ClosePosition < 0.1 && t1BodyRatio > 0.04) {
          t1Opening = "低开 (-2% ~ -5%)";
          t1Script = "惯性杀跌";
          t1Action = "反抽离场。";
      }
  }

  // --- 5E: Consistency Arbitration (V57.0 一致性仲裁庭) ---
  // V59.5: alpha, isAlphaDivergence, isTrap 已在 Stage 2 (TrapGuard) 预计算。
  // pipeline.trapDetected 为 true 时，此处执行信号翻转：BUY/bullish-HOLD → SELL。
  // pipeline.arbitrated 将在执行后设为 true，锁定仲裁结果。

  // V59.1: 扩展仲裁范围 - 看多型 HOLD 信号同样适用
  // "主升(MAIN)"、"无限(INF)"、"趋势(TREND)" 虽然是 HOLD，但本质是看多持仓。
  // 如果底层数据检测到陷阱，必须降级，否则会误导持仓者继续"死拿"一个已经失去灵魂的趋势。
  // V59.2: 排除"锁仓(LOCK)" — 封板状态下无法卖出，涨停本身是最强多头信号，
  //        Alpha 历史负值不应否决当日封板事实。强制 SELL 一个已封板的股票毫无意义。
  const isBullishHold = signalType === "HOLD" && (
      signalTitle.includes("主升") || 
      signalTitle.includes("无限") || 
      signalTitle.includes("趋势")
  ) && !isLimitUp; // V59.2: 涨停封板豁免 — 封板 HOLD 不参与仲裁

  if ((signalType === "BUY" || isBullishHold) && isTrap) {
      // 记录原始信号标题（用于文案）
      const originalTitle = signalTitle;
      // 触发仲裁：强势翻空
      signalType = "SELL";
      signalTitle = "诱多 (TRAP)";
      
      // 修正文案，解释原因
      let trapReason = "诱多陷阱";
      if (isHollowRise) trapReason = "缩量空涨";
      else if (intentContext?.intent === "Distribute") trapReason = "主力托单出货";
      else if (isAlphaDivergence) trapReason = `Alpha枯竭 (${alpha.toFixed(1)})`;
      else if (microContext?.macdfs === "DeadCross") trapReason = "高位分时死叉";
                         
      adviceText = `[系统仲裁] 警告！虽然K线形态呈现"买入"特征(如反包/突破)，但底层数据监测到【${trapReason}】。这是典型的"画线诱多"，请立即终止买入计划，逢高离场。`;
      
      // V59.0: 针对"回马枪"的特定修正
      if (isBoomerang && isAlphaDivergence) {
          signalTitle = "僵尸 (ZOMBIE)";
          adviceText = `[回马枪否决] 这是一个极其危险的"僵尸复活"陷阱。虽然股价反包MA5，但Alpha值严重背离(${alpha.toFixed(1)})，表明上涨缺乏内生动能，仅是主力利用技术图形进行的最后诱多。`;
      }
      
      // V59.1: 针对主升浪+Alpha枯竭的特定修正
      if (isBullishHold && isAlphaDivergence) {
          signalTitle = "假主升 (FAKE)";
          adviceText = `[主升否决] 极度危险！形态虽呈天空之城(获利盘主导)，但Alpha严重背离(${alpha.toFixed(1)})，股价上涨完全脱离真实资金驱动。没有灵魂的主升浪随时断裂坠落，立即止盈撤退。`;
      }
      
      // V59.1: 非回马枪场景下的看多HOLD降级文案
      if (isBullishHold && !isBoomerang) {
          const _origTitle = originalTitle;
          if (adviceText.includes("[系统仲裁]")) {
              adviceText = `[仲裁降级] 致命矛盾！技术形态显示为${_origTitle}，但底层监测到【${trapReason}】。主升浪已名存实亡，请立即解除锁仓，逢高撤退。`;
          }
      }
      
      // 修正评分与预期
      score = Math.min(score, 40); // 强制不及格
      prob = Math.min(prob, 45);   // V59.2: 同步压低置信度，防止详情页 isHighConfidence 误判
      recommendedBuy = 0; // 撤销买点
      recommendedSell = current; // 建议现价卖出
      expectedDirection = "DOWN";
      trend = "Top"; // 标记为见顶
      
      // 修正 T+1 剧本
      predictionDesc = "【诱多确认】形态骗线，资金出逃，预期冲高回落。";
      intradayScript = "A-Dive"; // A字杀
      
      // V59.5: Lock pipeline — Arbitration verdict is authoritative
      pipeline.arbitrated = true;
  }

  // ── STAGE 6: GoldenNeedle (金针兜底层) ────────────────────────────────
  // 核心：最后的超跌反弹救援。必须通过所有上游管道锁检查。
  // 锁检查：!pipeline.trapDetected (陷阱不救) && !pipeline.phaseLocked (崩盘不救) && !pipeline.arbitrated (仲裁已判不翻)
  // --- V55.0: Golden Needle (恐慌连阴反转) ---
  // 识别连续下跌后的单针探底，博弈超跌反弹
  // 必须在T+1推演之后，因为依赖 t1LowerShadow 等变量
  const isConsecutiveDrop = (stock.changePercent || 0) < -3 || ((stock.changePercent || 0) < 0 && current < ma5);
  const hasLongLowerShadow = t1LowerShadow > 0.04 && t1BodyRatio < 0.03; // 长下影 + 小实体
  const isStabilizing = t1ClosePosition > 0.4; // 收盘收回一半跌幅
  
  // V59.6 FIX: Golden Needle volume confirmation + support proximity
  // True exhaustion needles occur on SHRINKING volume (空头力竭).
  // Heavy-volume long lower shadows are often institutional manipulation (对倒).
  const gnVolShrinking = isShrinkVolume || effectiveTurnover < (turnoverMA5 * 1.2);
  // Support proximity: needle near MA20/MA60 is far more reliable than needle in mid-air
  const gnNearSupport = (ma20 > 0 && low <= ma20 * 1.02 && low >= ma20 * 0.96)
    || (ma60 > 0 && low <= ma60 * 1.02 && low >= ma60 * 0.96);
  // V59.6: Confidence grading — base 60, +5 for shrink vol, +5 for support proximity
  let gnConfidence = 60;
  if (gnVolShrinking) gnConfidence += 5;
  if (gnNearSupport) gnConfidence += 5;
  
  // V59.4 FIX: Added `!isTrap` guard to prevent Golden Needle from overriding
  // the V57.0 Consistency Arbitration's SELL verdict for trap-flagged stocks.
  // V59.6: Added volume + support confirmation. Heavy-volume needles without support are rejected.
  if (
      (signalType === "WAIT" || signalType === "SELL") &&
      !isTrap && // V59.4: Trap-flagged stocks must NOT be rescued by Golden Needle
      !pipeline.trapDetected && !pipeline.phaseLocked && !pipeline.arbitrated && // V59.5: Pipeline lock check
      isConsecutiveDrop &&
      hasLongLowerShadow &&
      isStabilizing &&
      (gnVolShrinking || gnNearSupport) && // V59.6: Must have at least one confirmation
      !isSystemicRisk // 大盘不能崩
  ) {
      signalType = "BUY";
      signalTitle = "金针 (NEEDLE)";
      adviceText = `[恐慌反转] 连续杀跌后出现"单针探底"形态。下影线长达 ${(t1LowerShadow*100).toFixed(1)}%${gnVolShrinking ? '，缩量确认空头力竭' : ''}${gnNearSupport ? '，精准刺探均线支撑' : ''}。博弈超跌反弹，次日高开确认。`;
      score = gnConfidence;
      recommendedBuy = current;
      dynamicStopLoss = low; 
      trend = "Rebound";
      intradayScript = "V-Reversal";
  }

  // --- V55.1: Dynamic Position Matrix (动态仓位矩阵 - 首仓风控修正) ---
  // 解决痛点：之前的建议是"目标总仓位"，容易误导空仓用户直接梭哈。
  // 新逻辑：区分"首仓(Entry)"和"加仓(Add)"，强制分批。
  
  let targetPos = 0; // 目标总仓位
  let entryPos = 0;  // 建议首笔开仓
  let posReason = "空仓";

  if (signalType === "BUY") {
      // Base Position based on Score
      if (score >= 90) { 
          targetPos = 80; 
          entryPos = 40; // 即使是龙头，首仓也不得超过40%
          posReason = "重仓搏杀"; 
      }
      else if (score >= 75) { 
          targetPos = 50; 
          entryPos = 25; // 标准首仓
          posReason = "稳健推升"; 
      }
      else if (score >= 60) { 
          targetPos = 25; 
          entryPos = 15; // 试错单
          posReason = "轻仓试错"; 
      }
      else { 
          targetPos = 10; 
          entryPos = 10; 
          posReason = "底仓观察"; 
      }

      // Modifiers
      // 1. Volatility Penalty (高波惩罚)
      const amp = prevClose > 0 ? (high - low) / prevClose : 0;
      if (amp > 0.08 && stock.role !== "Dragon" && stock.role !== "Leader") {
          targetPos *= 0.7; 
          entryPos *= 0.6; // 高波股首仓更要轻
          posReason += "/高波折算";
      }
      
      // 2. Phase Penalty (冰点限仓)
      if (phase === "Ice" || phase === "Ebb") {
          targetPos = Math.min(targetPos, 20); 
          entryPos = Math.min(entryPos, 10);
          posReason = "冰点限仓";
      }

      // 3. Role Bonus (龙头加权)
      if (stock.role === "Dragon" || stock.role === "Leader" || isInfinityMode) {
           targetPos = Math.min(100, targetPos * 1.2); 
           entryPos = Math.min(50, entryPos * 1.2); // 龙头首仓最高允许50%
           posReason = "龙头加权";
      }

      // ── V61.0: Board-Tier Position Modifier (连板梯队仓位修正) ──
      if (boardTier === 'POST_BREAK') {
          if (signalTitle.includes("首阴") || signalTitle.includes("1ST_DIP")) {
              // 龙头首阴低吸：允许较重仓位（黄金买点）
              targetPos = Math.min(60, targetPos * 1.3);
              entryPos = Math.min(30, entryPos * 1.2);
              posReason = `${priorBoardHeight}板龙头首阴`;
          } else if (signalTitle.includes("反包") || signalTitle.includes("REBORN")) {
              // 断板反包：确认信号，标准仓位
              posReason = `${priorBoardHeight}板断板反包`;
          } else {
              // 其他断板买入：保守试错
              targetPos = Math.min(20, targetPos);
              entryPos = Math.min(10, entryPos);
              posReason = "断板试错";
          }
      }
  } else if (signalType === "HOLD") {
       // ── V61.0: Board-Tier Hold Position (连板持仓策略) ──
       if (boardTier === 'FIRST') {
           targetPos = 100;
           entryPos = 0;
           posReason = "首板锁仓";
       } else if (boardTier === 'SECOND') {
           targetPos = 100;
           entryPos = 0;
           posReason = "2板锁仓·明日生死局";
       } else if (boardTier === 'THIRD') {
           targetPos = 100;
           entryPos = 0;
           posReason = "3板妖股确认·格局持有";
       } else if (boardTier === 'DRAGON_HIGH') {
           if (yesterdayVolHeavy) {
               targetPos = 60; // 天量高位板，开始减仓
               entryPos = 0;
               posReason = `${boardHeight}板天量·逢高减仓`;
           } else {
               targetPos = 100;
               entryPos = 0;
               posReason = `${boardHeight}板空间博弈·断板再走`;
           }
       } else {
           targetPos = 100;
           entryPos = 0;
           posReason = "锁仓";
       }
  }

  // Final Position Formatting
  // V55.1 Output: 清晰展示首仓建议
  if (signalType === "BUY") {
      positionAdvice = `首仓: ${Math.floor(entryPos)}% | 目标: ${Math.floor(targetPos)}% [${posReason}]`;
      positionAdvice += `\n买点 <${recommendedBuy.toFixed(2)} (分批介入)`;
  } else if (signalType === "SELL") {
      positionAdvice = `建议仓位: 0% [清仓离场] | 止盈 >${recommendedSell.toFixed(2)}`;
  } else if (signalType === "HOLD") {
      // V61.0: 板高上下文注入 HOLD 建议
      if (boardTier !== 'NONE' && boardTier !== 'POST_BREAK') {
          positionAdvice = `${posReason} | 止损 <${dynamicStopLoss.toFixed(2)}`;
          if (boardTier === 'SECOND' && yesterdayVolHeavy) {
              positionAdvice += `\n⚠️明日竞价决定去留: 高开缩量→加仓; 低开放量→核按钮`;
          } else if (boardTier === 'DRAGON_HIGH' && yesterdayVolHeavy) {
              positionAdvice += `\n⚠️天量预警: 目标仓位${targetPos}%, 逢高减至底仓`;
          }
      } else {
          positionAdvice = `建议持仓: 锁仓不动 | 止损 <${dynamicStopLoss.toFixed(2)}`;
      }
  } else {
      positionAdvice = `建议仓位: 0% [观望]`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // V60.3: CHIP PEAK LEVEL CALCULATOR (筹码峰价位引擎 — OHLC升级版)
  // ═══════════════════════════════════════════════════════════════════════════
  // 升级：OHLC区间展开 + 趋势方向加权 + 高斯邻近扩散
  // - 将每根K线的成交量均匀分布到 [low, high] 区间，而非全部堆到 close
  // - 上涨日(close>open)：上半区间额外加权，模拟主动买入筹码堆积
  // - 下跌日(close<open)：下半区间额外加权，模拟被动套牢筹码沉淀
  // - 高斯扩散替代硬编码邻近0.3权重，更平滑的筹码分布
  const _calcChipPeaks = (): NonNullable<NonNullable<PredatorSignal['smartEntry']>['chipPeaks']> | null => {
    const hist = stock.history;
    if (!hist || hist.length < 20 || current <= 0) return null;
    
    const recentBars = hist.slice(-60); // 最近60日
    
    // 使用完整 OHLC 确定价格范围（有 high/low 就用，否则 fallback 到 close）
    const allHighs = recentBars.map(h => h.high || h.close);
    const allLows = recentBars.map(h => h.low || h.close);
    const pMin = Math.min(...allLows) * 0.98;
    const pMax = Math.max(...allHighs) * 1.02;
    if (pMax <= pMin) return null;
    
    const binCount = 40; // 升级到40格，提高分辨率
    const binSize = (pMax - pMin) / binCount;
    const bins: number[] = new Array(binCount).fill(0);
    const binPrices: number[] = new Array(binCount).fill(0).map((_, i) => pMin + (i + 0.5) * binSize);
    
    // 辅助：将价格映射到bin索引（钳位到合法范围）
    const priceToBin = (price: number): number => Math.min(binCount - 1, Math.max(0, Math.floor((price - pMin) / binSize)));
    
    // 指数时间衰减: λ=0.04, 半衰期≈17天
    const wLen = recentBars.length;
    recentBars.forEach((bar, idx) => {
      const daysAgo = wLen - 1 - idx;
      const timeWeight = Math.exp(-0.04 * daysAgo);
      const vol = (bar.volume || 1) * timeWeight;
      
      const barHigh = bar.high || bar.close;
      const barLow = bar.low || bar.close;
      const barOpen = bar.open || bar.close;
      const barClose = bar.close;
      
      // ── OHLC 区间展开 ──
      const binLo = priceToBin(barLow);
      const binHi = priceToBin(barHigh);
      const spanBins = Math.max(1, binHi - binLo + 1);
      const volPerBin = vol / spanBins;
      
      // ── 趋势方向加权 ──
      // 上涨日：close > open，成交量更多沉淀在上半区（买方积极）
      // 下跌日：close < open，成交量更多沉淀在下半区（卖方主导/套牢）
      const isUp = barClose >= barOpen;
      
      for (let b = binLo; b <= binHi; b++) {
        let trendMult = 1.0;
        if (spanBins > 1) {
          const posInRange = (b - binLo) / (binHi - binLo); // 0=最低, 1=最高
          if (isUp) {
            trendMult = 0.7 + 0.6 * posInRange; // 0.7 → 1.3
          } else {
            trendMult = 1.3 - 0.6 * posInRange; // 1.3 → 0.7
          }
        }
        bins[b] += volPerBin * trendMult;
      }
      
      // ── 高斯邻近扩散（σ=1.2 bins）──
      // 成交不会精确停留在某个价位，向邻近2个bin做高斯衰减扩散
      const sigma = 1.2;
      const centerBin = priceToBin(barClose);
      const spreadVol = vol * 0.15; // 15%的成交量用于扩散（避免过度模糊）
      for (let delta = -2; delta <= 2; delta++) {
        if (delta === 0) continue;
        const targetBin = centerBin + delta;
        if (targetBin < 0 || targetBin >= binCount) continue;
        const gaussWeight = Math.exp(-0.5 * (delta / sigma) ** 2);
        bins[targetBin] += spreadVol * gaussWeight / spanBins;
      }
    });
    
    const totalVol = bins.reduce((a, b) => a + b, 0) || 1;
    const avgBinVol = totalVol / binCount;
    
    // 找出所有"峰"：比左右两个bin都高 + 超过平均值1.2倍
    type Peak = { price: number; strength: number; binIdx: number };
    const peaks: Peak[] = [];
    for (let i = 1; i < binCount - 1; i++) {
      if (bins[i] > bins[i-1] && bins[i] > bins[i+1] && bins[i] > avgBinVol * 1.2) {
        peaks.push({
          price: binPrices[i],
          strength: Math.min(100, (bins[i] / totalVol) * 100 * binCount * 0.4),
          binIdx: i,
        });
      }
    }
    // 按强度排序
    peaks.sort((a, b) => b.strength - a.strength);
    const topPeaks = peaks.slice(0, 5); // 最多取5个峰
    
    // 分类：在现价下方的是支撑峰，上方的是阻力峰
    const supportPeaks = topPeaks
      .filter(p => p.price < current * 0.998)
      .sort((a, b) => b.price - a.price) // 离现价最近的在前
      .slice(0, 3)
      .map((p, i) => ({
        price: p.price,
        strength: p.strength,
        label: `筹码峰S${i+1}(密集度${p.strength.toFixed(0)}%)`,
      }));
    
    const resistancePeaks = topPeaks
      .filter(p => p.price > current * 1.002)
      .sort((a, b) => a.price - b.price) // 离现价最近的在前
      .slice(0, 3)
      .map((p, i) => ({
        price: p.price,
        strength: p.strength,
        label: `筹码峰R${i+1}(密集度${p.strength.toFixed(0)}%)`,
      }));
    
    // 筹码集中度：前3大峰占总量比例
    const topVol = topPeaks.slice(0, 3).reduce((s, p) => s + bins[p.binIdx], 0);
    const chipConcentration = Math.min(100, (topVol / totalVol) * 100);
    
    return { supportPeaks, resistancePeaks, chipConcentration };
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // V60.2: HISTORICAL BACKTEST ENGINE (历史回测引擎)
  // ═══════════════════════════════════════════════════════════════════════════
  // 在history[]上模拟简化版信号检测，统计真实胜率和最优止损
  const _backtestHistory = (): NonNullable<NonNullable<PredatorSignal['smartEntry']>['backtest']> | null => {
    const evidenceDirection = signalType === 'SELL' || expectedDirection === 'DOWN'
      ? 'EXIT'
      : 'LONG';
    const regimeAwareEvidence = buildHistoricalPatternEvidence({
      stock,
      peerStocks: historicalPeerStocks,
      signalTitle,
      direction: evidenceDirection,
      marketRegime: resolveMarketRegime(marketContext),
    });
    // A cache hit may intentionally be null when evidence is insufficient.
    // Returning it directly prevents the retired single-stock engine from
    // rebuilding the same 600-bar scan on every live tick or interaction.
    return regimeAwareEvidence;

    /* c8 ignore start -- retained temporarily for saved-data compatibility */
    const hist = stock.history;
    if (!hist || hist.length < 30) return null;
    
    // 计算滚动均线和ATR的辅助函数
    const sma = (arr: number[], period: number, endIdx: number): number => {
      if (endIdx < period - 1) return 0;
      let sum = 0;
      for (let i = endIdx - period + 1; i <= endIdx; i++) sum += arr[i];
      return sum / period;
    };
    
    const closes = hist.map(h => h.close);
    const highs = hist.map(h => h.high || h.close);
    const lows = hist.map(h => h.low || h.close);
    const opens = hist.map(h => h.open || h.close);
    const volumes = hist.map(h => h.volume || 0);
    
    // V60.3: True Range ATR — 使用完整 OHLC 计算真实波幅
    // TR = max(high-low, |high-prevClose|, |low-prevClose|)
    const calcLocalATR = (idx: number, period = 14): number => {
      if (idx < period) return closes[idx] * 0.03;
      let sum = 0;
      for (let i = idx - period + 1; i <= idx; i++) {
        const tr = Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i-1]),
          Math.abs(lows[i] - closes[i-1])
        );
        sum += tr;
      }
      return sum / period;
    };
    
    // ── 信号检测模板 ──
    // 基于当前信号类型,在历史数据中寻找类似形态
    type TradeSetup = { entryIndex: number; entryPrice: number; localATR: number };
    type TradeResult = { entryPrice: number; exitPrice: number; pctReturn: number; holdDays: number; stopMult: number };
    const setups: TradeSetup[] = [];
    
    // 根据signalTitle识别模式类型
    const titleLower = signalTitle.toLowerCase();
    const isWTS = titleLower.includes('弱转强') || titleLower.includes('wts');
    const isBoomerang = titleLower.includes('回马枪') || titleLower.includes('return');
    const isSuck = titleLower.includes('低吸') || titleLower.includes('suck');
    const isAmbush = titleLower.includes('伏击') || titleLower.includes('ambush');
    const isSniper = titleLower.includes('狙击') || titleLower.includes('sniper');
    const isAssault = titleLower.includes('突击') || titleLower.includes('assault');
    
    // 从第20天开始（需要足够数据算均线）
    for (let i = 20; i < closes.length - 6; i++) {
      const c = closes[i];
      const c1 = closes[i-1];
      const m5 = sma(closes, 5, i);
      const m10 = sma(closes, 10, i);
      const m20 = sma(closes, 20, i);
      const localATR = calcLocalATR(i);
      const chg = c1 > 0 ? (c - c1) / c1 : 0;
      const vol = volumes[i];
      const avgVol5 = sma(volumes, 5, i);
      const isVolShrink = avgVol5 > 0 && vol < avgVol5 * 0.7;
      const isVolHeavy = avgVol5 > 0 && vol > avgVol5 * 1.5;
      
      let triggered = false;
      
      // 弱转强：昨日阴线(close<prev), 今日反包(close>open且涨幅>2%)
      if (isWTS && c1 < closes[Math.max(0, i-2)] && chg > 0.02 && c > m5) {
        triggered = true;
      }
      // 回马枪：跌破MA20后反包回来(昨日close<MA20, 今日close>MA5, 涨>3%)
      if (isBoomerang && c1 < sma(closes, 20, i-1) && c > m5 && chg > 0.03) {
        triggered = true;
      }
      // 低吸：缩量回踩支撑(价格在MA20附近±2%, 缩量)
      if (isSuck && m20 > 0 && Math.abs(c - m20) / m20 < 0.02 && isVolShrink) {
        triggered = true;
      }
      // 伏击：连续下跌后出现底背离信号(连跌3天后放量阳线)
      if (isAmbush && closes[i-3] > closes[i-2] && closes[i-2] > c1 && chg > 0 && isVolHeavy) {
        triggered = true;
      }
      // 狙击：均线多头排列 + 缩量回踩MA5
      if (isSniper && m5 > m10 && m10 > m20 && c > m5 * 0.99 && c < m5 * 1.01) {
        triggered = true;
      }
      // 突击：放量突破MA10(昨日<MA10, 今日>MA10, 放量)
      if (isAssault && c1 < sma(closes, 10, i-1) && c > m10 && isVolHeavy) {
        triggered = true;
      }
      // 通用回踩信号（如果没有特定类型匹配）
      if (!isWTS && !isBoomerang && !isSuck && !isAmbush && !isSniper && !isAssault) {
        // 价格在MA10附近且阳线
        if (m10 > 0 && Math.abs(c - m10) / m10 < 0.015 && chg > 0) {
          triggered = true;
        }
      }
      
      if (!triggered) continue;
      
      // 信号在第 i 日收盘后确认，最早只能在下一交易日开盘成交。
      const entryIndex = i + 1;
      const entryPrice = opens[entryIndex];
      if (!Number.isFinite(entryPrice) || entryPrice <= 0) continue;
      const limitRate = resolveLimitPercent(stock.code, stock.name);
      const openingGap = c > 0 ? (entryPrice - c) / c : 0;
      // 涨停价开盘的排队成交不可复现，保守地排除这类“纸面盈利”。
      if (openingGap >= limitRate - 0.005) continue;
      setups.push({ entryIndex, entryPrice, localATR });

      // 与最长10日持仓窗口对齐，避免同一标的的回测交易互相重叠。
      i += 10;
    }

    // Expanding-window walk-forward prevents a trade from both selecting the
    // stop and reporting its performance. Ten training and ten validation
    // trades are the minimum evidence accepted by this proxy backtest.
    if (setups.length < 20) return null;

    const simulateTrade = (setup: TradeSetup, stopMult: number): TradeResult => {
      const { entryIndex, entryPrice, localATR } = setup;
      const slPrice = entryPrice - localATR * stopMult;
      const targetPrice = entryPrice + localATR * 3;
      let exitPrice = entryPrice;
      let holdDays = 0;

      // A-share cash equities cannot be sold on the entry day. If stop and
      // target are both touched intraday, the conservative stop-first order is used.
      for (let j = entryIndex + 1; j < Math.min(entryIndex + 11, closes.length); j++) {
        holdDays = j - entryIndex;
        if (opens[j] <= slPrice) {
          exitPrice = opens[j];
          break;
        }
        if (lows[j] <= slPrice) {
          exitPrice = slPrice;
          break;
        }
        if (highs[j] >= targetPrice) {
          exitPrice = targetPrice;
          break;
        }
        exitPrice = closes[j];
      }

      const roundTripCostRate = 0.002;
      const pctReturn = entryPrice > 0
        ? ((exitPrice - entryPrice) / entryPrice - roundTripCostRate) * 100
        : 0;
      return { entryPrice, exitPrice, pctReturn, holdDays, stopMult };
    };

    const summarize = (trades: TradeResult[]) => {
      const wins = trades.filter(trade => trade.pctReturn > 0);
      const losses = trades.filter(trade => trade.pctReturn <= 0);
      const totalWin = wins.reduce((sum, trade) => sum + trade.pctReturn, 0);
      const totalLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pctReturn, 0));
      return {
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        avgWinPct: wins.length > 0 ? totalWin / wins.length : 0,
        avgLossPct: losses.length > 0 ? totalLoss / losses.length : 0,
        profitFactor: totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? 99 : 0,
        expectancy: trades.length > 0
          ? trades.reduce((sum, trade) => sum + trade.pctReturn, 0) / trades.length
          : 0,
      };
    };

    const stopCandidates = [1, 1.25, 1.5, 1.75, 2, 2.5];
    const chooseOptimalStop = (trainingSetups: TradeSetup[]) => stopCandidates
        .map(stopMult => ({
          stopMult,
          stats: summarize(trainingSetups.map(setup => simulateTrade(setup, stopMult))),
        }))
        .sort((a, b) =>
          b.stats.expectancy - a.stats.expectancy ||
          b.stats.profitFactor - a.stats.profitFactor ||
          a.stopMult - b.stopMult
        )[0].stopMult;

    // Expanding-window walk-forward: each reported trade is evaluated with a
    // stop selected only from setups that occurred before it.
    const validationTrades: TradeResult[] = [];
    const walkForwardStops: number[] = [];
    for (let index = 10; index < setups.length; index++) {
      const walkForwardStop = chooseOptimalStop(setups.slice(0, index));
      walkForwardStops.push(walkForwardStop);
      validationTrades.push(simulateTrade(setups[index], walkForwardStop));
    }
    const sortedStops = [...walkForwardStops].sort((a, b) => a - b);
    const optimalStopMult = sortedStops[Math.floor(sortedStops.length / 2)] || 1.5;
    const validation = summarize(validationTrades);

    return {
      sampleSize: validationTrades.length,
      winRate: Math.round(validation.winRate * 10) / 10,
      avgWinPct: Math.round(validation.avgWinPct * 100) / 100,
      avgLossPct: Math.round(validation.avgLossPct * 100) / 100,
      optimalStopMult: Math.round(optimalStopMult * 100) / 100,
      profitFactor: Math.round(validation.profitFactor * 100) / 100,
      expectancy: Math.round(validation.expectancy * 100) / 100,
    };
    /* c8 ignore stop */
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // V60.0: SMART ENTRY CALCULATOR (条件单精算引擎)
  // ═══════════════════════════════════════════════════════════════════════════
  // 根据当前走势、信号类型、技术结构给出精准的条件单价位
  // 目标：用户可以直接拿数字去设置条件单
  
  const _calcSmartEntry = (): PredatorSignal['smartEntry'] => {
    const vwap = stock.avgPrice || (high + low + current) / 3;
    const pivotPt = (high + low + prevClose) / 3;
    const pivotS1 = 2 * pivotPt - high;
    const pivotS2 = pivotPt - (high - low);
    const atrVal = atr || current * 0.03;
    
    // ── 资金面 & 环境修正因子 ──
    const isDefensive = entryAggression === 'Defensive';
    const isAggressive = entryAggression === 'Aggressive';
    // 高砸盘风险 → 止损需更宽，防止被洗出
    const fundRiskMultiplier = fundRisk.riskScore > 70 ? 1.5 : (fundRisk.riskScore > 40 ? 1.2 : 1.0);
    // 大盘冰点/系统性风险 → 压制紧迫度
    const isMarketHostile = pipeline.phaseLocked || phase === 'Ice';
    
    // ── V60.1: 成交量确认因子 ──
    // 核心逻辑：缩量回踩支撑 = 主力未出货,支撑可信; 放量下杀支撑 = 出货嫌疑,支撑不可信
    // volumeConfidence: >1 = 支撑增强(缩量), <1 = 支撑减弱(放量)
    const volRatio = effectiveTurnover > 0 && turnoverMA5 > 0
      ? effectiveTurnover / turnoverMA5
      : 1.0;
    const volumeConfidence = volRatio < 0.7 ? 1.20   // 显著缩量: 支撑+20%可信度
      : volRatio < 1.0 ? 1.10                         // 温和缩量: 支撑+10%
      : volRatio > 1.8 ? 0.75                         // 暴量下杀: 支撑-25%可信度
      : volRatio > 1.3 ? 0.90                         // 放量偏大: 支撑-10%
      : 1.0;                                           // 正常量: 不修正
    
    // ── V60.1: 跳空缺口识别 ──
    // 未回补缺口是重要的支撑/阻力关卡
    const todayGap = prevClose > 0 ? (open - prevClose) / prevClose : 0;
    // 向上跳空: open > prevClose * 1.01 且今日最低未回补(low > prevClose)
    const hasGapUpSupport = todayGap > 0.01 && low > prevClose;
    const gapUpSupportPrice = hasGapUpSupport ? prevClose : 0;
    // 向下跳空: open < prevClose * 0.99 且今日最高未回补(high < prevClose)
    const hasGapDownResistance = todayGap < -0.01 && high < prevClose;
    const gapDownResistancePrice = hasGapDownResistance ? prevClose : 0;
    // 缺口中位(向上跳空时)
    const gapMidSupport = hasGapUpSupport ? (prevClose + open) / 2 : 0;
    
    // ── V60.1: 信号类型回测止损倍数表 ──
    // 基于各信号模式的历史特征,动态调整ATR止损倍数和最大止损百分比
    // 高胜率紧凑型(弱转强) → 窄止损; 低胜率大波动型(伏击) → 宽止损
    const SIGNAL_STOP_PROFILES: Record<string, { atrMult: number; maxPct: number; label: string }> = {
      '弱转强':  { atrMult: 1.0, maxPct: 0.04, label: '紧凑止损(高胜率)' },
      'WTS':     { atrMult: 1.0, maxPct: 0.04, label: '紧凑止损(高胜率)' },
      '回马枪':  { atrMult: 1.3, maxPct: 0.05, label: '中等止损(反包型)' },
      'RETURN':  { atrMult: 1.3, maxPct: 0.05, label: '中等止损(反包型)' },
      '突击':    { atrMult: 1.2, maxPct: 0.05, label: '趋势止损(跟随型)' },
      'ASSAULT': { atrMult: 1.2, maxPct: 0.05, label: '趋势止损(跟随型)' },
      '低吸':    { atrMult: 1.8, maxPct: 0.07, label: '宽幅止损(左侧型)' },
      'SUCK':    { atrMult: 1.8, maxPct: 0.07, label: '宽幅止损(左侧型)' },
      '狙击':    { atrMult: 1.2, maxPct: 0.05, label: '共振止损(多因子)' },
      'SNIPER':  { atrMult: 1.2, maxPct: 0.05, label: '共振止损(多因子)' },
      '伏击':    { atrMult: 2.0, maxPct: 0.08, label: '极宽止损(背离潜伏)' },
      'AMBUSH':  { atrMult: 2.0, maxPct: 0.08, label: '极宽止损(背离潜伏)' },
      '回封':    { atrMult: 1.5, maxPct: 0.06, label: '回封止损(高波动)' },
      'RESEAL':  { atrMult: 1.5, maxPct: 0.06, label: '回封止损(高波动)' },
      '金针':    { atrMult: 1.0, maxPct: 0.04, label: '精确止损(金针型)' },
      'NEEDLE':  { atrMult: 1.0, maxPct: 0.04, label: '精确止损(金针型)' },
      '主升':    { atrMult: 1.5, maxPct: 0.06, label: '趋势止损(主升浪)' },
      'MAIN':    { atrMult: 1.5, maxPct: 0.06, label: '趋势止损(主升浪)' },
      '锁仓':    { atrMult: 1.5, maxPct: 0.06, label: '锁仓止损(高控盘)' },
      'LOCK':    { atrMult: 1.5, maxPct: 0.06, label: '锁仓止损(高控盘)' },
    };
    const matchedProfile = Object.entries(SIGNAL_STOP_PROFILES).find(
      ([key]) => signalTitle.includes(key)
    );
    const stopProfile = matchedProfile
      ? matchedProfile[1]
      : { atrMult: 1.5, maxPct: 0.06, label: '默认止损' };
    
    // V60.2: 计算筹码峰和历史回测
    const chipPeaks = _calcChipPeaks();
    const backtestResult = _backtestHistory();
    
    // Walk-forward样本外代理验证覆写静态止损 profile。
    if (backtestResult && backtestResult.sampleSize >= 10 && backtestResult.optimalStopMult > 0.5) {
      stopProfile.atrMult = backtestResult.optimalStopMult;
      // 如果回测胜率高(>60%),可收紧最大止损%; 胜率低(<40%),放宽止损
      if (backtestResult.winRate > 60) {
        stopProfile.maxPct = Math.max(0.03, stopProfile.maxPct * 0.85);
        stopProfile.label = `滚动代理止损(命中${backtestResult.winRate.toFixed(0)}%·${backtestResult.sampleSize}样本)`;
      } else if (backtestResult.winRate < 40) {
        stopProfile.maxPct = Math.min(0.10, stopProfile.maxPct * 1.25);
        stopProfile.label = `滚动代理止损(命中${backtestResult.winRate.toFixed(0)}%·宽防护)`;
      } else {
        stopProfile.label = `滚动代理止损(命中${backtestResult.winRate.toFixed(0)}%·${backtestResult.sampleSize}样本)`;
      }
    }
    
    // Key levels arsenal
    const levels = {
      vwap,
      ma5: ma5 > 0 ? ma5 : 0,
      ma10: ma10 > 0 ? ma10 : 0,
      ma20: ma20 > 0 ? ma20 : 0,
      ma60: ma60 > 0 ? ma60 : 0,
      atrUpper: atrBands?.upperResistance || (current + 2 * atrVal),
      atrLowerSup: atrBands?.lowerSupport || (current - 1.5 * atrVal),
      atrLowerRes: atrBands?.lowerResistance || (current - 2 * atrVal),
      pivotS1: pivotS1 > 0 ? pivotS1 : current * 0.97,
      pivotS2: pivotS2 > 0 ? pivotS2 : current * 0.95,
      prevClose,
      todayLow: low,
      todayOpen: open,
      limitUp: limitUpPrice,
      // V60.1: 跳空缺口关卡
      gapUpSupport: gapUpSupportPrice,
      gapMidSupport,
      gapDownResistance: gapDownResistancePrice,
      // V60.2: 筹码峰关卡
      chipSup1: chipPeaks?.supportPeaks[0]?.price || 0,
      chipSup2: chipPeaks?.supportPeaks[1]?.price || 0,
      chipRes1: chipPeaks?.resistancePeaks[0]?.price || 0,
    };
    
    let primary = 0;
    let primaryLabel = '';
    let scaleIn = 0;
    let scaleInLabel = '';
    let sl = dynamicStopLoss;
    let slLabel = '动态止损';
    let target = recommendedSell;
    let targetLabel = '目标压力';
    let method = '';
    let urgency: NonNullable<PredatorSignal['smartEntry']>['urgency'] = 'NO_ENTRY';
    
    // ── SELL/高危信号 → 不给买点 ──
    if (signalType === 'SELL' || pipeline.trapDetected) {
      return {
        primary: 0, primaryLabel: '禁止买入',
        scaleIn: 0, scaleInLabel: '禁止加仓',
        stopLoss: sl, stopLossLabel: slLabel,
        target: recommendedSell, targetLabel: '止盈离场',
        method: '清仓', rrRatio: 0, urgency: 'NO_ENTRY'
      };
    }
    
    // ── Helper: 成交量加权支撑排序 ──
    // 每个候选支撑有 baseWeight(基础权重) × volumeConfidence(量能修正)
    // 缩量回踩的支撑权重更高,放量下杀的支撑权重更低
    type SupportCandidate = { price: number; label: string; valid: boolean; baseWeight: number };
    
    const scoredSort = (candidates: SupportCandidate[]): SupportCandidate[] => {
      return candidates.filter(c => c.valid).sort((a, b) => {
        // 综合评分 = 基础权重 × 量能修正 × 距离权重(越近越好)
        const distA = current > 0 ? 1 - Math.abs(current - a.price) / current : 0;
        const distB = current > 0 ? 1 - Math.abs(current - b.price) / current : 0;
        const scoreA = a.baseWeight * volumeConfidence * distA;
        const scoreB = b.baseWeight * volumeConfidence * distB;
        return scoreB - scoreA;
      });
    };
    
    const findNearestSupport = (): { price: number; label: string } => {
      // V60.1: 加入缺口支撑 + 成交量加权排序
      const volTag = volumeConfidence >= 1.1 ? '🔇缩量确认' : (volumeConfidence <= 0.85 ? '⚠️放量存疑' : '');
      const candidates: SupportCandidate[] = [
        { price: levels.vwap, label: '分时均价(VWAP)', valid: levels.vwap > 0 && levels.vwap < current, baseWeight: 1.0 },
        { price: levels.ma5, label: '5日均线(MA5)', valid: levels.ma5 > 0 && levels.ma5 < current, baseWeight: 0.9 },
        { price: levels.ma10, label: '10日均线(MA10)', valid: levels.ma10 > 0 && levels.ma10 < current, baseWeight: 0.85 },
        { price: levels.ma20, label: '20日均线(MA20)', valid: levels.ma20 > 0 && levels.ma20 < current, baseWeight: 0.8 },
        { price: levels.prevClose, label: '昨日收盘价', valid: levels.prevClose > 0 && levels.prevClose < current, baseWeight: 0.75 },
        { price: levels.todayLow, label: '今日最低价', valid: levels.todayLow > 0 && levels.todayLow < current, baseWeight: 0.7 },
        { price: levels.pivotS1, label: '枢轴支撑S1', valid: levels.pivotS1 > 0 && levels.pivotS1 < current, baseWeight: 0.65 },
        { price: levels.atrLowerSup, label: 'ATR下支撑', valid: levels.atrLowerSup > 0 && levels.atrLowerSup < current, baseWeight: 0.6 },
        // V60.1: 跳空缺口底部(未回补) = 超强支撑
        { price: levels.gapUpSupport, label: '跳空缺口底(未补)', valid: levels.gapUpSupport > 0 && levels.gapUpSupport < current, baseWeight: 1.3 },
        { price: levels.gapMidSupport, label: '缺口中位支撑', valid: levels.gapMidSupport > 0 && levels.gapMidSupport < current, baseWeight: 1.1 },
        // V60.2: 筹码峰支撑 — 密集成交区,天然支撑
        { price: levels.chipSup1, label: chipPeaks?.supportPeaks[0]?.label || '筹码峰S1', valid: levels.chipSup1 > 0 && levels.chipSup1 < current, baseWeight: 1.25 },
        { price: levels.chipSup2, label: chipPeaks?.supportPeaks[1]?.label || '筹码峰S2', valid: levels.chipSup2 > 0 && levels.chipSup2 < current, baseWeight: 1.05 },
      ];
      
      const sorted = scoredSort(candidates);
      const best = sorted[0];
      if (!best) return { price: current * 0.97, label: '现价-3%' };
      return { price: best.price, label: volTag ? `${best.label} ${volTag}` : best.label };
    };
    
    const findSecondSupport = (primaryPrice: number): { price: number; label: string } => {
      const candidates: SupportCandidate[] = [
        { price: levels.ma10, label: '10日均线(MA10)', valid: levels.ma10 > 0 && levels.ma10 < primaryPrice * 0.995, baseWeight: 0.9 },
        { price: levels.ma20, label: '20日均线(MA20)', valid: levels.ma20 > 0 && levels.ma20 < primaryPrice * 0.995, baseWeight: 0.85 },
        { price: levels.ma60, label: '60日均线(MA60)', valid: levels.ma60 > 0 && levels.ma60 < primaryPrice * 0.995, baseWeight: 0.8 },
        { price: levels.pivotS1, label: '枢轴支撑S1', valid: levels.pivotS1 > 0 && levels.pivotS1 < primaryPrice * 0.995, baseWeight: 0.7 },
        { price: levels.pivotS2, label: '枢轴支撑S2', valid: levels.pivotS2 > 0 && levels.pivotS2 < primaryPrice * 0.995, baseWeight: 0.65 },
        { price: levels.atrLowerRes, label: 'ATR强支撑', valid: levels.atrLowerRes > 0 && levels.atrLowerRes < primaryPrice * 0.995, baseWeight: 0.6 },
        // V60.1: 缺口底部作为二级支撑
        { price: levels.gapUpSupport, label: '跳空缺口底(未补)', valid: levels.gapUpSupport > 0 && levels.gapUpSupport < primaryPrice * 0.995, baseWeight: 1.2 },
        // V60.2: 筹码峰支撑
        { price: levels.chipSup1, label: chipPeaks?.supportPeaks[0]?.label || '筹码峰S1', valid: levels.chipSup1 > 0 && levels.chipSup1 < primaryPrice * 0.995, baseWeight: 1.15 },
        { price: levels.chipSup2, label: chipPeaks?.supportPeaks[1]?.label || '筹码峰S2', valid: levels.chipSup2 > 0 && levels.chipSup2 < primaryPrice * 0.995, baseWeight: 0.95 },
      ];
      
      const sorted = scoredSort(candidates);
      return sorted[0] || { price: primaryPrice * 0.97, label: '主买点-3%' };
    };
    
    // ── Signal-Specific Smart Entry Logic ──
    
    const titleLower = signalTitle;
    
    if (signalType === 'BUY') {
      // 弱转强 (WTS) → 盘中确认，分时均价上方介入
      if (titleLower.includes('弱转强') || titleLower.includes('WTS')) {
        // 弱转强的本质：昨日分歧，今日转强。买点在确认转强后的分时回踩
        primary = Math.max(vwap, levels.todayOpen);
        primaryLabel = `分时均价/开盘价(确认转强后回踩)`;
        const sup = findSecondSupport(primary);
        scaleIn = sup.price;
        scaleInLabel = sup.label;
        sl = Math.min(levels.todayLow, levels.prevClose * 0.97);
        slLabel = '今日低点/昨收-3%';
        target = levels.limitUp * 0.995;
        targetLabel = '涨停目标';
        method = '确认转强后，回踩分时均价挂买单';
        urgency = 'NOW';
      }
      // 回马枪 (RETURN/Boomerang) → 确认反包后，回踩昨日收盘价
      else if (titleLower.includes('回马枪') || titleLower.includes('RETURN')) {
        primary = levels.prevClose > 0 ? levels.prevClose : current * 0.98;
        primaryLabel = '昨日收盘价(反包确认位)';
        const sup = findNearestSupport();
        if (sup.price < primary * 0.995) {
          scaleIn = sup.price;
          scaleInLabel = sup.label;
        } else {
          scaleIn = levels.ma20 > 0 ? levels.ma20 : primary * 0.97;
          scaleInLabel = levels.ma20 > 0 ? '20日均线' : '主买点-3%';
        }
        sl = levels.todayLow * 0.99;
        slLabel = '今日最低价下方';
        target = levels.atrUpper;
        targetLabel = 'ATR上压力';
        method = '回踩昨收价附近挂买单，博弈反包';
        urgency = 'WAIT_DIP';
      }
      // 突击 (ASSAULT) → 趋势跟随，回踩MA5
      else if (titleLower.includes('突击') || titleLower.includes('ASSAULT')) {
        primary = levels.ma5 > 0 ? levels.ma5 : current * 0.98;
        primaryLabel = levels.ma5 > 0 ? '5日均线(趋势攻击线)' : '现价-2%';
        scaleIn = levels.ma10 > 0 ? levels.ma10 : (levels.ma20 > 0 ? levels.ma20 : primary * 0.97);
        scaleInLabel = levels.ma10 > 0 ? '10日均线' : (levels.ma20 > 0 ? '20日均线' : '主买点-3%');
        sl = levels.ma10 > 0 ? levels.ma10 * 0.98 : (levels.ma20 > 0 ? levels.ma20 : primary * 0.95);
        slLabel = levels.ma10 > 0 ? '10日均线下方' : '20日均线';
        target = levels.atrUpper;
        targetLabel = 'ATR上压力';
        method = '回踩5日线附近挂买单';
        urgency = 'WAIT_DIP';
      }
      // 低吸 (SUCK/Shakeout) → 缩量回踩，MA20附近
      else if (titleLower.includes('低吸') || titleLower.includes('SUCK')) {
        primary = levels.ma20 > 0 ? levels.ma20 : (levels.ma10 > 0 ? levels.ma10 : current * 0.95);
        primaryLabel = levels.ma20 > 0 ? '20日均线(生命线)' : '10日均线';
        scaleIn = levels.ma60 > 0 ? levels.ma60 : primary * 0.97;
        scaleInLabel = levels.ma60 > 0 ? '60日均线(半年线)' : '主买点-3%';
        sl = scaleIn * 0.97;
        slLabel = '加仓位下方3%';
        target = levels.ma5 > 0 ? levels.ma5 * 1.03 : current * 1.05;
        targetLabel = '反弹至5日线上方';
        method = '挂单20日均线附近，等待缩量企稳';
        urgency = 'WAIT_DIP';
      }
      // 狙击 (SNIPER) → 趋势共振，当前价附近
      else if (titleLower.includes('狙击') || titleLower.includes('SNIPER')) {
        const sup = findNearestSupport();
        primary = sup.price;
        primaryLabel = sup.label;
        const sup2 = findSecondSupport(primary);
        scaleIn = sup2.price;
        scaleInLabel = sup2.label;
        sl = levels.ma20 > 0 ? levels.ma20 * 0.98 : primary * 0.95;
        slLabel = '20日均线下方';
        target = levels.atrUpper;
        targetLabel = 'ATR上压力';
        method = '最近支撑位挂单，趋势共振确认';
        urgency = 'NOW';
      }
      // 伏击 (AMBUSH) → 底背离，左侧潜伏
      else if (titleLower.includes('伏击') || titleLower.includes('AMBUSH')) {
        primary = levels.todayLow > 0 ? levels.todayLow : current * 0.97;
        primaryLabel = '今日最低价附近(底背离确认)';
        scaleIn = levels.atrLowerRes > 0 ? levels.atrLowerRes : primary * 0.97;
        scaleInLabel = 'ATR强支撑';
        sl = scaleIn * 0.97;
        slLabel = '强支撑下方3%';
        target = levels.ma20 > 0 ? levels.ma20 : current * 1.08;
        targetLabel = '反弹至20日均线';
        method = '分批潜伏，今日低点附近建底仓';
        urgency = 'WAIT_DIP';
      }
      // 回封 (RESEAL) → 炸板回封，涨停价挂单
      else if (titleLower.includes('回封') || titleLower.includes('RESEAL')) {
        primary = levels.limitUp;
        primaryLabel = '涨停价(回封扫货)';
        scaleIn = 0;
        scaleInLabel = '不加仓';
        sl = current * 0.95;
        slLabel = '现价-5%';
        target = levels.limitUp * 1.1;
        targetLabel = '次日涨停';
        method = '涨停价挂买单，博弈回封';
        urgency = 'NOW';
      }
      // 金针 (NEEDLE) → 超跌反弹
      else if (titleLower.includes('金针') || titleLower.includes('NEEDLE')) {
        primary = levels.todayLow * 1.01;
        primaryLabel = '今日最低价上方1%(金针确认)';
        scaleIn = levels.todayLow;
        scaleInLabel = '今日最低价(极限位)';
        sl = levels.todayLow * 0.97;
        slLabel = '金针低点下方3%';
        target = levels.prevClose;
        targetLabel = '反弹至昨收';
        method = '金针确认后挂单，博弈超跌反弹';
        urgency = 'NEXT_DAY';
      }
      // 默认 BUY 信号
      else {
        const sup = findNearestSupport();
        primary = sup.price;
        primaryLabel = sup.label;
        const sup2 = findSecondSupport(primary);
        scaleIn = sup2.price;
        scaleInLabel = sup2.label;
        sl = dynamicStopLoss;
        slLabel = '动态止损';
        target = recommendedSell;
        targetLabel = '目标压力';
        method = '回踩支撑位挂单';
        urgency = 'WAIT_DIP';
      }
    }
    // ── HOLD 信号 → 给出加仓/做T买点 ──
    else if (signalType === 'HOLD') {
      if (titleLower.includes('主升') || titleLower.includes('MAIN') || titleLower.includes('锁仓') || titleLower.includes('LOCK')) {
        // 主升浪/锁仓 → 急跌做T点位
        primary = levels.ma5 > 0 ? levels.ma5 : current * 0.97;
        primaryLabel = levels.ma5 > 0 ? '5日均线(做T低吸)' : '现价-3%(急跌低吸)';
        scaleIn = levels.ma10 > 0 ? levels.ma10 : primary * 0.97;
        scaleInLabel = levels.ma10 > 0 ? '10日均线(深跌接回)' : '主买点-3%';
        sl = levels.ma20 > 0 ? levels.ma20 * 0.98 : scaleIn * 0.95;
        slLabel = '20日均线破位止损';
        // 目标：ATR上压力 或 前高+1ATR，而非激进的涨停价
        target = levels.atrUpper > 0 ? levels.atrUpper : current * 1.05;
        targetLabel = levels.atrUpper > 0 ? 'ATR上压力(做T目标)' : '现价+5%';
        method = '持股为主，急跌至MA5做T低吸';
        urgency = 'WAIT_DIP';
      } else {
        // 一般持有
        const sup = findNearestSupport();
        primary = sup.price;
        primaryLabel = `${sup.label}(做T低吸)`;
        const sup2 = findSecondSupport(primary);
        scaleIn = sup2.price;
        scaleInLabel = sup2.label;
        sl = dynamicStopLoss;
        slLabel = '动态止损';
        target = recommendedSell;
        targetLabel = '目标压力';
        method = '持股为主，回调至支撑做T';
        urgency = 'WAIT_DIP';
      }
    }
    // ── WAIT 信号 → 给出"变为买点"的触发条件 ──
    else {
      // 观望时也给出潜在买点，供用户预埋
      if (isAccelerating && !isDeepDrop) {
        // 上升趋势中观望 → 回踩MA5/MA10变买点
        primary = levels.ma5 > 0 ? levels.ma5 : current * 0.97;
        primaryLabel = levels.ma5 > 0 ? '5日均线(趋势回踩变买点)' : '现价-3%';
        scaleIn = levels.ma20 > 0 ? levels.ma20 : primary * 0.97;
        scaleInLabel = levels.ma20 > 0 ? '20日均线(深度回踩)' : '主买点-3%';
        sl = levels.ma20 > 0 ? levels.ma20 * 0.97 : scaleIn * 0.95;
        slLabel = '20日均线下方3%';
        target = levels.atrUpper;
        targetLabel = 'ATR上压力';
        method = '等待回踩5日线确认后介入';
        urgency = 'WAIT_DIP';
      } else if (isBottomDivergence || (stock.changePercent || 0) < -3) {
        // 下跌中观望 → 等企稳信号
        primary = levels.atrLowerSup > 0 ? levels.atrLowerSup : current * 0.95;
        primaryLabel = 'ATR下支撑(等待企稳)';
        scaleIn = levels.atrLowerRes > 0 ? levels.atrLowerRes : primary * 0.97;
        scaleInLabel = 'ATR强支撑';
        sl = scaleIn * 0.95;
        slLabel = '强支撑下方5%';
        target = levels.ma5 > 0 ? levels.ma5 : current * 1.05;
        targetLabel = '反弹至5日线';
        method = '等待止跌企稳信号，支撑位预埋';
        urgency = 'WAIT_DIP';
      } else {
        // 震荡/混沌 → 给出区间操作建议
        primary = levels.pivotS1;
        primaryLabel = '枢轴支撑S1';
        scaleIn = levels.pivotS2;
        scaleInLabel = '枢轴支撑S2';
        sl = levels.pivotS2 * 0.97;
        slLabel = 'S2下方3%';
        target = pivotPt + (pivotPt - levels.pivotS1);
        targetLabel = '枢轴阻力R1';
        method = '区间下沿预埋，等待方向选择';
        urgency = 'WAIT_DIP';
      }
    }
    
    // ── V60.1: 信号回测止损profile覆写 ──
    // 根据信号类型的历史最优止损距离,覆写原始止损
    if (primary > 0 && sl > 0) {
      const profileSl = primary - atrVal * stopProfile.atrMult;
      const maxSl = primary * (1 - stopProfile.maxPct);
      // 取profile止损和最大百分比止损中较窄的（偏保守）
      const backtestSl = Math.max(profileSl, maxSl);
      // 如果回测止损比原始止损更优（更接近买点但仍有安全距离），采用之
      if (backtestSl > sl * 0.98 && backtestSl < primary * 0.998) {
        sl = backtestSl;
        slLabel = stopProfile.label;
      }
    }
    
    // ── 资金面修正：止损宽度 ──
    // 高砸盘风险股 → 止损放宽(fundRiskMultiplier)，避免被主力洗出
    if (sl > 0 && primary > 0 && fundRiskMultiplier > 1.0) {
      const slDistance = primary - sl;
      sl = primary - slDistance * fundRiskMultiplier;
      slLabel += `(风险修正×${fundRiskMultiplier.toFixed(1)})`;
    }
    
    // ── 资金面修正：买点攻防调节 ──
    if (isDefensive && primary > 0 && signalType !== 'HOLD') {
      // 北向/机构重仓 → 买点更保守，等更深回踩
      primary *= 0.99;
      primaryLabel += '(防御修正)';
    } else if (isAggressive && primary > 0 && urgency === 'NOW') {
      // 游资/镰刀型资金 → 买点可适当上移，但止损必须更严
      primary = Math.min(primary * 1.005, current * 0.998);
      sl = Math.max(sl, primary * 0.95);
      primaryLabel += '(激进修正)';
    }
    
    // ── V60.1: 向下跳空缺口压制目标价 ──
    // 若存在未回补的向下跳空，目标价不应超过缺口顶部（阻力强）
    if (hasGapDownResistance && gapDownResistancePrice > 0 && target > gapDownResistancePrice) {
      target = gapDownResistancePrice * 0.995;
      targetLabel += '(缺口压制)';
    }
    
    // ── V60.2: 筹码峰阻力压制目标价 ──
    // 如果最近的筹码峰阻力位低于当前目标且密集度高(>30),需压制
    if (chipPeaks && levels.chipRes1 > 0 && levels.chipRes1 < target) {
      const chipResStrength = chipPeaks.resistancePeaks[0]?.strength || 0;
      if (chipResStrength > 30) {
        target = levels.chipRes1 * 0.995;
        targetLabel = `${chipPeaks.resistancePeaks[0]?.label || '筹码峰阻力'}(压制)`;
      }
    }
    
    // ── V60.2: 筹码集中度修正 ──
    // 筹码高度集中(>60) + 现价在集中区下方 = 上方抛压巨大,降级紧迫度
    if (chipPeaks && chipPeaks.chipConcentration > 60 && levels.chipRes1 > 0) {
      const distToChipRes = levels.chipRes1 > 0 ? (levels.chipRes1 - current) / current : 1;
      if (distToChipRes < 0.03 && urgency === 'NOW') {
        urgency = 'WAIT_DIP';
        method += ' [筹码密集区近在咫尺,等突破确认]';
      }
    }
    
    // ── V60.2: 回测负期望值警告 ──
    if (backtestResult && backtestResult.expectancy < -0.5) {
      // 历史上这种信号期望值为负 → 降为最低紧迫度
      if (urgency === 'NOW') urgency = 'WAIT_DIP';
      method += ` [回测期望${backtestResult.expectancy.toFixed(1)}%·历史负期望]`;
    }
    
    // ── V60.1: 成交量修正紧迫度 ──
    // 放量下杀时(volumeConfidence<0.8),即使信号是NOW也应降级
    if (volumeConfidence < 0.80 && urgency === 'NOW') {
      urgency = 'WAIT_DIP';
      method += ' [放量下杀,等企稳再入]';
    }
    
    // ── Safety Clamps ──
    primary = Math.max(0, primary);
    scaleIn = Math.max(0, scaleIn);
    sl = Math.max(0, sl);
    target = Math.max(primary * 1.01, target);
    
    // ── R/R Calculation ──
    const risk = primary > 0 && sl > 0 ? primary - sl : atrVal;
    const reward = target > 0 && primary > 0 ? target - primary : atrVal;
    const rr = risk > 0.01 ? reward / risk : 0;
    
    // ── 环境 & 风险收益比修正紧迫度 ──
    // 大盘冰点期：NOW → WAIT_DIP，不催促用户在恶劣环境下入场
    if (isMarketHostile && urgency === 'NOW') {
      urgency = 'WAIT_DIP';
      method += ' [大盘风险↑，等回踩再介入]';
    }
    // R/R < 1.5 时降级紧迫度，不值得追
    if (rr > 0 && rr < 1.5 && urgency === 'NOW') {
      urgency = 'WAIT_DIP';
      method += ` [盈亏比${rr.toFixed(1)}偏低，等更佳位置]`;
    }
    
    return {
      primary, primaryLabel,
      scaleIn, scaleInLabel,
      stopLoss: sl, stopLossLabel: slLabel,
      target, targetLabel,
      method, rrRatio: Math.max(0, Math.min(10, rr)),
      urgency,
      // V60.2: 附加数据
      backtest: backtestResult || undefined,
      chipPeaks: chipPeaks || undefined,
    };
  };
  
  const smartEntry = _calcSmartEntry();
  // Legacy branches sometimes stored downside conviction as the complement
  // (for example 30 meant 70% confidence in DOWN). Normalize the public field
  // to always mean confidence in the predicted direction.
  const rawDirectionalProbability = expectedDirection === 'DOWN' && prob < 50
    ? 100 - prob
    : prob;
  const calibratedPrediction = calibratePrediction({
    stock,
    phase,
    rawProbability: rawDirectionalProbability,
    direction: expectedDirection,
    signalType,
    trapDetected: pipeline.trapDetected,
    backtest: smartEntry?.backtest,
    marketContext,
  });

  const buySignalVetoReason = getBuySignalVetoReason({
    signalType,
    direction: expectedDirection,
    probability: calibratedPrediction.probability,
    trapDetected: pipeline.trapDetected,
    backtest: smartEntry?.backtest,
  });
  if (buySignalVetoReason) {
    signalType = 'WAIT';
    signalTitle = '风险校准否决 (WAIT)';
    adviceText = `[买入否决] ${buySignalVetoReason}。保持空仓，等待新的正期望证据。`;
    positionAdvice = '空仓观望 (Wait)';
    recommendedBuy = 0;
    trend = 'Neutral';
    if (smartEntry) {
      smartEntry.primary = 0;
      smartEntry.scaleIn = 0;
      smartEntry.urgency = 'NO_ENTRY';
      smartEntry.method = `暂停买入：${buySignalVetoReason}`;
    }
  }
  
  // V60.0: Update recommendedBuy to use smart entry primary price
  if (!buySignalVetoReason && smartEntry && smartEntry.primary > 0 && smartEntry.urgency !== 'NO_ENTRY') {
    recommendedBuy = smartEntry.primary;
  }

  return {
    signalType,
    signalTitle,
    adviceText,
    trend,
    summary: signalTitle.split(" ")[0],
    strategy: adviceText,
    positionAdvice: positionAdvice || (() => {
      if (signalType === "BUY")
        return `买入 <${recommendedBuy.toFixed(2)}`;
      if (signalType === "SELL")
        return `止盈 >${recommendedSell.toFixed(2)}`;
      if (signalType === "HOLD") {
        // V16.2: Context-Aware Hold Advice
        if (signalTitle.includes("锁仓"))
          return "持筹锁仓 | 严禁追高";
        if (
          signalTitle.includes("无限") ||
          signalTitle.includes("主升")
        )
          return "死守均线 | 急跌低吸";
        if (signalTitle.includes("趋势"))
          return "沿线持有 | 回踩关注";
        if (signalTitle.includes("护盘"))
          return "撤销卖单 | 暂时观望";
        return "持股待涨 (Hold)";
      }
      return "空仓观望 (Wait)";
    })(),
    score,
    buyPoint: recommendedBuy,
    sellPoint: recommendedSell,
    stopLoss: dynamicStopLoss,
    prediction: {
      targetHigh: nextDayHigh,
      targetLow: nextDayLow,
      probability: calibratedPrediction.probability,
      rawProbability: calibratedPrediction.rawProbability,
      dataQuality: calibratedPrediction.dataQuality,
      reliability: calibratedPrediction.reliability,
      dataReliability: calibratedPrediction.dataReliability,
      marketDataReliability: calibratedPrediction.marketDataReliability,
      marketDataStatus: calibratedPrediction.marketDataStatus,
      evidenceReliability: calibratedPrediction.evidenceReliability,
      calibrationStatus: calibratedPrediction.calibrationStatus,
      sampleSize: calibratedPrediction.sampleSize,
      marketRegime: calibratedPrediction.marketRegime,
      marketDataQuality: calibratedPrediction.marketDataQuality,
      confidenceLow: calibratedPrediction.confidenceLow,
      confidenceHigh: calibratedPrediction.confidenceHigh,
      warnings: calibratedPrediction.warnings,
      description: predictionDesc || (expectedDirection === "UP"
          ? "看涨 (Bullish)"
          : expectedDirection === "DOWN"
            ? "看跌 (Bearish)"
            : "震荡 (Chop)"),
      direction: expectedDirection,
      script: intradayScript,
    },
    stargate: {
      gateLevel: stargateResult.gateLevel,
      score: stargateResult.stargateScore,
      signals: stargateResult.signals,
    },
    smartEntry,
    boardTier: {
      tier: boardTier,
      boardHeight,
      priorBoardHeight,
      yesterdayVolHeavy,
      yesterdayVolShrink,
      t1Opening,
      t1Script,
      t1Action,
    },
  };
};

/**
 * Helper Function: Calculate Dynamic ATR
 * Adjusts ATR based on stock's current state and historical data.
 */
function calculateDynamicATR(
  stock: Stock,
  current: number,
): number {
  const high = stock.high || current;
  const low = stock.low || current;
  const prevClose = stock.prevClose || current;
  const tech = (stock.technicals || {}) as any;
  const ma20 = tech.ma20 || 0;
  const ma60 = tech.ma60 || 0;
  const ma250 = tech.ma250 || 0;

  // Calculate True Range
  const tr1 = high - low;
  const tr2 = Math.abs(high - prevClose);
  const tr3 = Math.abs(low - prevClose);
  const trueRange = Math.max(tr1, tr2, tr3);

  // Calculate ATR (14-period)
  const atr = tech.atr || current * 0.035;
  const atr14 = tech.atr14 || atr;

  // Adjust ATR based on trend and volatility
  if (current > ma20 && current > ma60 && current > ma250) {
    // Bullish Trend
    return atr14 * 1.1;
  } else if (
    current < ma20 &&
    current < ma60 &&
    current < ma250
  ) {
    // Bearish Trend
    return atr14 * 0.9;
  } else {
    // Neutral Trend
    return atr14;
  }
}
