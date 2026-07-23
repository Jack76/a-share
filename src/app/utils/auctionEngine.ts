import { Stock, MarketPhase, Theme } from '../types';
import {
  getChinaTradingClock,
  isChinaAuctionPhase,
  isChinaAuctionRelevant,
  type MarketTimestamp,
} from './marketClock';

/**
 * AUCTION BATTLE ENGINE V63.0 (P1)
 * 竞价博弈引擎 — 09:15~09:25 竞价阶段信号盲区攻克
 *
 * 核心设计原则（悲观风控）：
 * 1. 竞价量比 > 一切：量是资金意愿的唯一证据
 * 2. 预期差优先：超预期 vs 低于预期是竞价博弈的灵魂
 * 3. 抢跑惩罚：竞价高开但量能配合不上 = 诱多
 * 4. 角色分层：龙头竞价弱可容忍，跟风竞价弱 = 核按钮
 *
 * 输入：Stock[] (含 auctionData, history, role, concept, consecutiveLimitUps 等)
 * 输出：AuctionBattleResult (per-stock signals + global auction temperature)
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type AuctionSignalType = 'AUCTION_BUY' | 'AUCTION_SELL' | 'AUCTION_WATCH' | 'AUCTION_NUKE';

export interface AuctionSignal {
  stockId: string;
  stockCode: string;
  stockName: string;
  concept: string;
  role: string;

  // Signal
  signal: AuctionSignalType;
  signalTitle: string;           // e.g. "竞价抢筹 (RUSH)", "竞价核按钮 (NUKE)"
  advice: string;                // Detailed action advice
  confidence: number;            // 0-100

  // Auction Metrics
  openGapPct: number;            // 竞价高开幅度 (%)
  auctionVolRatio: number;       // 竞价量比
  auctionAmount: number;         // 竞价成交额 (万)
  auctionStrength: number;       // 综合竞价强度 (0-100)

  // Expectation Gap
  expectation: 'EXCEED' | 'MEET' | 'BELOW' | 'FAR_BELOW';
  expectationLabel: string;
  expectationDetail: string;

  // Board context (V61 integration)
  boardHeight: number;
  boardTier: string;
  priorBoardHeight: number;      // 断板次日有效

  // Tags
  tags: string[];                // e.g. ["龙头", "缩量加速", "天量分歧"]
}

export interface AuctionBattleResult {
  // Global market auction temperature
  auctionTemp: number;           // 0-100 竞价温度
  auctionTempLabel: string;      // "冰点" | "低迷" | "正常" | "活跃" | "火爆"
  
  // Signal counts
  buyCount: number;
  sellCount: number;
  nukeCount: number;
  watchCount: number;
  
  // Grouped signals
  signals: AuctionSignal[];
  
  // Theme-level insights
  themeAuctionMap: Record<string, {
    avgOpenGap: number;
    avgVolRatio: number;
    stockCount: number;
    hotLevel: 'COLD' | 'WARM' | 'HOT' | 'FIRE';
  }>;
  
  // Global advice
  globalAdvice: string;
  
  // Timestamp
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// CORE ENGINE
// ═══════════════════════════════════════════════════════════════

export function analyzeAuctionBattle(
  stocks: Stock[],
  phase: MarketPhase,
  themes: Theme[] = [],
  timestamp: MarketTimestamp = Date.now(),
): AuctionBattleResult {
  const signals: AuctionSignal[] = [];
  const themeAuctionMap: AuctionBattleResult['themeAuctionMap'] = {};

  // Filter stocks with auction-relevant data
  const auctionStocks = stocks.filter(s => {
    // Must have some price data to analyze
    return (s.auctionData || s.open) && s.currentPrice;
  });

  for (const stock of auctionStocks) {
    const signal = analyzeStockAuction(stock, phase, stocks);
    if (signal) {
      signals.push(signal);
      
      // Aggregate by theme
      const concept = stock.concept || '未分类';
      if (!themeAuctionMap[concept]) {
        themeAuctionMap[concept] = { avgOpenGap: 0, avgVolRatio: 0, stockCount: 0, hotLevel: 'COLD' };
      }
      themeAuctionMap[concept].avgOpenGap += signal.openGapPct;
      themeAuctionMap[concept].avgVolRatio += signal.auctionVolRatio;
      themeAuctionMap[concept].stockCount++;
    }
  }

  // Finalize theme averages
  for (const key of Object.keys(themeAuctionMap)) {
    const t = themeAuctionMap[key];
    if (t.stockCount > 0) {
      t.avgOpenGap /= t.stockCount;
      t.avgVolRatio /= t.stockCount;
      t.hotLevel = t.avgOpenGap > 5 && t.avgVolRatio > 2 ? 'FIRE'
        : t.avgOpenGap > 3 && t.avgVolRatio > 1.5 ? 'HOT'
        : t.avgOpenGap > 1 ? 'WARM'
        : 'COLD';
    }
  }

  // Sort signals: AUCTION_BUY first (by confidence desc), then AUCTION_SELL, then NUKE, then WATCH
  const signalOrder: Record<AuctionSignalType, number> = {
    'AUCTION_BUY': 0,
    'AUCTION_SELL': 1,
    'AUCTION_NUKE': 2,
    'AUCTION_WATCH': 3,
  };
  signals.sort((a, b) => {
    const orderDiff = signalOrder[a.signal] - signalOrder[b.signal];
    if (orderDiff !== 0) return orderDiff;
    return b.confidence - a.confidence;
  });

  // Calculate global auction temperature
  const buyCount = signals.filter(s => s.signal === 'AUCTION_BUY').length;
  const sellCount = signals.filter(s => s.signal === 'AUCTION_SELL').length;
  const nukeCount = signals.filter(s => s.signal === 'AUCTION_NUKE').length;
  const watchCount = signals.filter(s => s.signal === 'AUCTION_WATCH').length;
  
  const avgOpenGap = signals.length > 0
    ? signals.reduce((acc, s) => acc + s.openGapPct, 0) / signals.length
    : 0;
  const avgVolRatio = signals.length > 0
    ? signals.reduce((acc, s) => acc + s.auctionVolRatio, 0) / signals.length
    : 0;

  const auctionTemp = Math.min(100, Math.max(0, 
    50 
    + buyCount * 8 
    - nukeCount * 12 
    - sellCount * 5 
    + avgOpenGap * 5 
    + (avgVolRatio - 1) * 10
    + (phase === 'Climax' ? 10 : 0)
    + (phase === 'Ice' ? -15 : 0)
  ));

  const auctionTempLabel = auctionTemp >= 80 ? '火爆'
    : auctionTemp >= 60 ? '活跃'
    : auctionTemp >= 40 ? '正常'
    : auctionTemp >= 20 ? '低迷'
    : '冰点';

  // Global advice
  let globalAdvice = '';
  if (nukeCount > 0) {
    globalAdvice = `⚠️ ${nukeCount}只票触发竞价核按钮，优先处理持仓风险！`;
  }
  if (buyCount > 3 && auctionTemp > 60) {
    globalAdvice += ` ${buyCount}只票竞价强势，市场情绪回暖，关注量能持续性。`;
  }
  if (sellCount > buyCount && auctionTemp < 40) {
    globalAdvice += ` 竞价整体偏弱，多数票低于预期，建议控制仓位。`;
  }
  if (!globalAdvice) {
    globalAdvice = `竞价温度 ${auctionTemp.toFixed(0)}°，${auctionTempLabel}。${
      buyCount > 0 ? `${buyCount}只可操作` : '暂无明确机会'
    }。`;
  }

  return {
    auctionTemp,
    auctionTempLabel,
    buyCount,
    sellCount,
    nukeCount,
    watchCount,
    signals,
    themeAuctionMap,
    globalAdvice,
    timestamp: getChinaTradingClock(timestamp).timestampMs,
  };
}

// ═══════════════════════════════════════════════════════════════
// PER-STOCK AUCTION ANALYSIS
// ═══════════════════════════════════════════════════════════════

function analyzeStockAuction(
  stock: Stock,
  phase: MarketPhase,
  allStocks: Stock[],
): AuctionSignal | null {
  const auction = stock.auctionData;
  const prevClose = stock.prevClose || 0;
  const current = stock.currentPrice || 0;
  const open = stock.open || current;
  
  if (prevClose <= 0) return null;

  // ── Compute auction metrics ──
  const openGapPct = auction?.openGap ?? ((open - prevClose) / prevClose * 100);
  const auctionVolRatio = auction?.volumeRatio ?? (stock.volumeRatio || 1.0);
  const auctionAmount = auction?.auctionVolume ?? 0;
  const auctionStrength = auction?.strength ?? computeAuctionStrength(openGapPct, auctionVolRatio, stock);

  // ── Board context (V61 integration) ──
  const boardHeight = stock.consecutiveLimitUps || 0;
  const history = stock.history || [];
  
  let yesterdayWasLimitUp = false;
  let priorBoardHeight = 0;
  let yesterdayVolHeavy = false;
  let yesterdayVolShrink = false;
  
  if (history.length >= 2) {
    const yBar = history[history.length - 1];
    const y2Bar = history[history.length - 2];
    if (y2Bar.close > 0) {
      yesterdayWasLimitUp = (yBar.close - y2Bar.close) / y2Bar.close >= 0.095;
    }
    if (history.length >= 6) {
      const volSlice = history.slice(-6, -1);
      const avgVol = volSlice.reduce((s, h) => s + (h.volume || 0), 0) / 5;
      if (avgVol > 0 && yBar.volume) {
        const ratio = yBar.volume / avgVol;
        yesterdayVolHeavy = ratio > 2.5;
        yesterdayVolShrink = ratio < 0.7;
      }
    }
    // 回溯连板高度
    if (yesterdayWasLimitUp) {
      priorBoardHeight = 1;
      for (let i = history.length - 2; i >= 1; i--) {
        const d = history[i];
        const dPrev = history[i - 1];
        if (dPrev.close > 0 && (d.close - dPrev.close) / dPrev.close >= 0.095) {
          priorBoardHeight++;
        } else break;
      }
    }
  }

  const isLimitUp = stock.isLimitUp;
  const isPostBreak = yesterdayWasLimitUp && !isLimitUp;
  const isDragonOrLeader = stock.role === 'Dragon' || stock.role === 'Leader';
  const isFollower = stock.role === 'Follower' || stock.role === 'Normal';

  const boardTier = isPostBreak ? 'POST_BREAK'
    : isLimitUp && boardHeight <= 1 ? 'FIRST'
    : isLimitUp && boardHeight === 2 ? 'SECOND'
    : isLimitUp && boardHeight === 3 ? 'THIRD'
    : isLimitUp && boardHeight >= 4 ? 'DRAGON_HIGH'
    : 'NONE';

  // ── Expectation Gap Analysis ──
  // 核心：根据昨日状态推算"市场预期"，与今日竞价实际做比较
  let expectedOpenGap = 0;
  let expectationLabel = '正常';
  
  if (yesterdayWasLimitUp) {
    // 昨日涨停，市场预期高开
    if (priorBoardHeight >= 4) expectedOpenGap = 5;      // 4板+ 期望一字/大幅高开
    else if (priorBoardHeight === 3) expectedOpenGap = 4; // 3板 期望高开加速
    else if (priorBoardHeight === 2) expectedOpenGap = 3; // 2板 期望高开
    else expectedOpenGap = 2;                              // 首板 期望小幅高开
    
    // 缩量板期望更高，天量板期望降低
    if (yesterdayVolShrink) expectedOpenGap += 1.5;
    if (yesterdayVolHeavy) expectedOpenGap -= 2;
    
    // 龙头角色加成
    if (isDragonOrLeader) expectedOpenGap += 1;
    if (isFollower) expectedOpenGap -= 1;
  } else if ((stock.changePercent || 0) > 5) {
    // 昨日大涨但未涨停
    expectedOpenGap = 1;
  } else if ((stock.changePercent || 0) < -3) {
    // 昨日大跌
    expectedOpenGap = -1;
  }

  const gapDiff = openGapPct - expectedOpenGap;
  let expectation: AuctionSignal['expectation'];
  let expectationDetail: string;

  if (gapDiff > 2) {
    expectation = 'EXCEED';
    expectationLabel = '超预期';
    expectationDetail = `竞价高开${openGapPct.toFixed(1)}%，超出预期${gapDiff.toFixed(1)}pp。资金竞价抢筹意愿强烈。`;
  } else if (gapDiff > -1) {
    expectation = 'MEET';
    expectationLabel = '符合预期';
    expectationDetail = `竞价开盘${openGapPct.toFixed(1)}%，基本符合市场预期。观察开盘后量能确认。`;
  } else if (gapDiff > -3) {
    expectation = 'BELOW';
    expectationLabel = '低于预期';
    expectationDetail = `竞价开盘${openGapPct.toFixed(1)}%，低于预期${Math.abs(gapDiff).toFixed(1)}pp。资金分歧明显。`;
  } else {
    expectation = 'FAR_BELOW';
    expectationLabel = '大幅低于预期';
    expectationDetail = `竞价开盘${openGapPct.toFixed(1)}%，严重低于预期${Math.abs(gapDiff).toFixed(1)}pp。主力可能已撤退。`;
  }

  // ── Signal Generation (9 scenarios) ──
  let signal: AuctionSignalType = 'AUCTION_WATCH';
  let signalTitle = '竞价观望 (WATCH)';
  let advice = '竞价信号不明确，等待开盘后确认。';
  let confidence = 50;
  const tags: string[] = [];

  // === Scenario A: 连板股竞价核按钮 ===
  // 断板次日 + 竞价严重低于预期 + 跟风角色
  if (isPostBreak && expectation === 'FAR_BELOW' && isFollower) {
    signal = 'AUCTION_NUKE';
    signalTitle = '竞价核按钮 (NUKE)';
    advice = `[竞价预警] ${priorBoardHeight}板跟风股竞价大幅低于预期(${openGapPct.toFixed(1)}%)。主力已在竞价阶段撤单逃跑，09:25集合竞价直接挂跌停价出局！`;
    confidence = 90;
    tags.push('断板核按钮', '跟风');
  }
  // === Scenario B: 天量板次日竞价核按钮 ===
  // 昨日天量涨停 + 今日竞价低于预期
  else if (isPostBreak && yesterdayVolHeavy && openGapPct < expectedOpenGap * 0.5) {
    signal = 'AUCTION_NUKE';
    signalTitle = '天量出货 (VOL_NUKE)';
    advice = `[竞价预警] 昨日天量涨停(主力借板出货)，今日竞价高开不足(${openGapPct.toFixed(1)}%)。天量+断板是经典的"顶部信号"，竞价直接出局。`;
    confidence = 88;
    tags.push('天量断板', '出货');
  }
  // === Scenario C: 龙头竞价超预期 → 排板信号 ===
  // 龙头/领涨 + 连板中 + 竞价超预期 + 缩量
  else if (isDragonOrLeader && yesterdayWasLimitUp && expectation === 'EXCEED' && auctionVolRatio < 1.5) {
    signal = 'AUCTION_BUY';
    signalTitle = '竞价排板 (RUSH)';
    advice = `[竞价机会] ${priorBoardHeight}板龙头竞价超预期高开${openGapPct.toFixed(1)}%且缩量(量比${auctionVolRatio.toFixed(2)})！一致加速信号，建议09:25竞价直接挂涨停价排板扫货。`;
    confidence = 85;
    tags.push('龙头', '缩量加速', '竞价排板');
  }
  // === Scenario D: 连板股竞价强确认 ===
  // 连板 + 竞价高开 + 量比合理(1-2.5) → 持有/加仓
  else if (yesterdayWasLimitUp && openGapPct > 3 && auctionVolRatio >= 0.8 && auctionVolRatio <= 2.5) {
    signal = 'AUCTION_BUY';
    signalTitle = '竞价确认 (CONFIRM)';
    advice = `[竞价确认] ${priorBoardHeight}板竞价高开${openGapPct.toFixed(1)}%，量比${auctionVolRatio.toFixed(2)}，预期兑现。持仓者锁仓不动；空仓者可在开盘回踩时介入。`;
    confidence = 75;
    tags.push('连板确认');
    if (yesterdayVolShrink) tags.push('缩量加速');
  }
  // === Scenario E: 弱转强竞价买点 ===
  // 断板次日 + 竞价高开(>2%) + 龙头 + 量能可控
  else if (isPostBreak && isDragonOrLeader && openGapPct > 2 && priorBoardHeight >= 3 && auctionVolRatio < 2) {
    signal = 'AUCTION_BUY';
    signalTitle = '弱转强 (WTS)';
    advice = `[竞价博弈] ${priorBoardHeight}板龙头断板后竞价高开${openGapPct.toFixed(1)}%，出现"弱转强"信号！这是经典的二波启动买点。关注开盘10分钟内能否回封涨停确认。`;
    confidence = 72;
    tags.push('龙头弱转强', '二波启动');
  }
  // === Scenario F: 竞价放量分歧 ===
  // 连板 + 竞价量比爆表(>3) → 分歧风险
  else if (yesterdayWasLimitUp && auctionVolRatio > 3) {
    signal = 'AUCTION_SELL';
    signalTitle = '竞价分歧 (SPLIT)';
    advice = `[竞价预警] ${priorBoardHeight}板竞价量比爆表(${auctionVolRatio.toFixed(2)})，大量筹码在竞价阶段换手。这是多空剧烈分歧的信号，${openGapPct > 0 ? '冲高即卖' : '直接出局'}。`;
    confidence = 78;
    tags.push('竞价分歧', '量比异常');
  }
  // === Scenario G: 竞价低于预期 → 减仓/出局 ===
  else if (yesterdayWasLimitUp && expectation === 'BELOW') {
    if (isDragonOrLeader && priorBoardHeight >= 3) {
      // 龙头容忍度高
      signal = 'AUCTION_WATCH';
      signalTitle = '竞价偏弱 (WEAK)';
      advice = `[竞价观察] ${priorBoardHeight}板龙头竞价略低于预期(${openGapPct.toFixed(1)}%)。龙头可容忍一定分歧，观察开盘30分钟承接力再决定。若10:00前不能翻红，考虑止盈。`;
      confidence = 55;
      tags.push('龙头观察');
    } else {
      signal = 'AUCTION_SELL';
      signalTitle = '竞价减仓 (CUT)';
      advice = `[竞价减仓] ${priorBoardHeight}板竞价低于预期(${openGapPct.toFixed(1)}%)，资金承接不足。非龙头票竞价不达标=丧失溢价空间，建议竞价出一半、开盘破均线全清。`;
      confidence = 70;
      tags.push('低预期减仓');
    }
  }
  // === Scenario H: 非连板股竞价异动 ===
  // 非连板 + 竞价放量高开(>3%) → 新题材/事件驱动
  else if (!yesterdayWasLimitUp && openGapPct > 3 && auctionVolRatio > 2) {
    signal = 'AUCTION_WATCH';
    signalTitle = '竞价异动 (ALERT)';
    advice = `[竞价异动] 非连板股竞价放量高开${openGapPct.toFixed(1)}%(量比${auctionVolRatio.toFixed(2)})，可能有新消息或题材驱动。关注是否属于当日热点板块，确认后再介入。`;
    confidence = 60;
    tags.push('异动', '新题材');
    
    // 如果是热门板块 → 升级为买入
    const themeSignals = allStocks.filter(s => s.concept === stock.concept && s.isLimitUp);
    if (themeSignals.length >= 2) {
      signal = 'AUCTION_BUY';
      signalTitle = '板块跟风 (FOLLOW)';
      advice += ` 同板块已有${themeSignals.length}只涨停，板块效应确认。`;
      confidence = 68;
      tags.push('板块效应');
    }
  }
  // === Scenario I: 持仓股竞价大幅低开 ===
  else if (stock.status === 'Hold' && openGapPct < -3) {
    signal = 'AUCTION_SELL';
    signalTitle = '持仓预警 (ALERT)';
    advice = `[持仓预警] 持仓股竞价大幅低开${openGapPct.toFixed(1)}%！检查是否有利空消息。若无明确利空且是龙头，可等开盘企稳；若有利空或非核心持仓，竞价直接减仓。`;
    confidence = 65;
    tags.push('持仓低开');
  }
  // Fallback
  else {
    // Default watch with basic info
    advice = `竞价开盘${openGapPct > 0 ? '+' : ''}${openGapPct.toFixed(1)}%，量比${auctionVolRatio.toFixed(2)}。${expectationDetail}`;
    
    // Phase-based adjustment
    if (phase === 'Ice' || phase === 'Ebb') {
      advice += ' 当前处于退潮/冰点期，竞价信号可靠性降低，建议观望为主。';
      confidence = Math.min(confidence, 40);
    }
  }

  return {
    stockId: stock.id,
    stockCode: stock.code,
    stockName: stock.name,
    concept: stock.concept || '未分类',
    role: stock.role || 'Normal',
    signal,
    signalTitle,
    advice,
    confidence,
    openGapPct,
    auctionVolRatio,
    auctionAmount: auctionAmount / 10000, // 转万
    auctionStrength,
    expectation,
    expectationLabel,
    expectationDetail,
    boardHeight,
    boardTier,
    priorBoardHeight,
    tags,
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function computeAuctionStrength(openGapPct: number, volRatio: number, stock: Stock): number {
  let strength = 50;
  
  // Open gap contribution
  strength += openGapPct * 5;
  
  // Volume ratio contribution
  strength += (volRatio - 1) * 15;
  
  // Role bonus
  if (stock.role === 'Dragon' || stock.role === 'Leader') strength += 10;
  if (stock.role === 'Follower') strength -= 5;
  
  // Limit up streak bonus
  const boards = stock.consecutiveLimitUps || 0;
  if (boards >= 3) strength += 10;
  
  return Math.min(100, Math.max(0, strength));
}

/**
 * 判断当前时间是否在竞价时段 (09:15-09:30)
 */
export function isAuctionPhase(timestamp: MarketTimestamp = Date.now()): boolean {
  return isChinaAuctionPhase(timestamp);
}

/**
 * 判断当前是否在竞价博弈有效时段 (09:15-10:00)
 * 竞价信号在开盘后30分钟内仍有参考价值
 */
export function isAuctionRelevant(timestamp: MarketTimestamp = Date.now()): boolean {
  return isChinaAuctionRelevant(timestamp);
}
