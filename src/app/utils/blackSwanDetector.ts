import { Stock, MarketPhase, DailyMetrics, MarketIndex } from "../types";
import { getChinaTradingClock, type MarketTimestamp } from './marketClock';

/**
 * BLACK SWAN & EUPHORIA CIRCUIT BREAKER V62.1
 * 
 * Bidirectional portfolio-level risk management system:
 * - BEARISH side: Detects systemic crashes → emergency evacuation
 * - BULLISH side: Detects euphoria/blow-off tops → systematic profit-locking
 * 
 * Design Philosophy: "悲观风控" (Pessimistic Risk Control)
 * - Individual stock engines (Predator) optimize per-stock signals
 * - This module monitors the PORTFOLIO as a whole for extreme events
 * - When triggered, it overrides ALL held positions simultaneously
 * 
 * Crash Circuit Breaker Levels:
 *   Level 0 (NORMAL)   — 绿灯：正常交易
 *   Level 1 (ALERT)    — 黄灯：风险预警，压缩仓位
 *   Level 2 (CRITICAL) — 橙灯：危机模式，非核心清仓
 *   Level 3 (MELTDOWN) — 红灯：黑天鹅熔断，全线撤退
 * 
 * Euphoria Circuit Breaker Levels:
 *   E0 (NORMAL)    — 绿灯：正常交易
 *   E1 (OVERHEAT)  — 黄灯：过热预警，收紧追高，启动止盈保护
 *   E2 (MANIA)     — 橙灯：狂热模式，非核心止盈，龙头锁利
 *   E3 (BLOW_OFF)  — 紫灯：冲顶熔断，系统性止盈，准备迎接回调
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type CircuitBreakerLevel = 0 | 1 | 2 | 3;
export type EuphoriaLevel = 0 | 1 | 2 | 3;

export interface BlackSwanTrigger {
  id: string;
  severity: CircuitBreakerLevel;
  category: 'MARKET' | 'PORTFOLIO' | 'CONTAGION' | 'LIQUIDITY' | 'PATTERN';
  direction: 'BEARISH' | 'BULLISH';
  title: string;
  description: string;
  metric: string;
  threshold: string;
  timestamp: number;
}

export interface PortfolioStats {
  totalHoldings: number;
  concurrentLosers: number;
  concurrentLosersRatio: number;
  avgHoldingChange: number;
  worstHoldingChange: number;
  worstHoldingName: string;
  bestHoldingChange: number;
  bestHoldingName: string;
  portfolioDrawdown: number;
  leadersBroken: number;
  sectorContagion: Map<string, number>;
}

export interface EmergencyAction {
  stockId: string;
  stockName: string;
  stockCode: string;
  action: 'EMERGENCY_SELL' | 'REDUCE_50' | 'TIGHTEN_STOP' | 'HOLD_CORE'
    | 'LOCK_PROFIT' | 'TRAIL_TIGHT' | 'REDUCE_WINNER' | 'NO_CHASE';
  reason: string;
  priority: number;
  currentChange: number;
}

export interface BlackSwanResult {
  level: CircuitBreakerLevel;
  levelName: string;
  levelDescription: string;
  triggers: BlackSwanTrigger[];
  portfolioStats: PortfolioStats;
  emergencyActions: EmergencyAction[];
  globalAdvice: string;
  isActive: boolean;
  activatedAt: number | null;

  // V62.1: Euphoria Detection
  euphoriaLevel: EuphoriaLevel;
  euphoriaLevelName: string;
  euphoriaTriggers: BlackSwanTrigger[];
  euphoriaActions: EmergencyAction[];
  euphoriaAdvice: string;
  isEuphoriaActive: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const THRESHOLDS = {
  // ─── BEARISH: Market-Level ───
  INDEX_CRASH_L1: -1.5,
  INDEX_CRASH_L2: -3.0,
  INDEX_CRASH_L3: -5.0,
  LIMIT_DOWN_L1: 30,
  LIMIT_DOWN_L2: 80,
  LIMIT_DOWN_L3: 150,
  BREADTH_RATIO_L2: 10,

  // ─── BEARISH: Portfolio-Level ───
  CONCURRENT_LOSER_L1: 0.6,
  CONCURRENT_LOSER_L2: 0.8,
  AVG_DRAWDOWN_L1: -2.0,
  AVG_DRAWDOWN_L2: -4.0,
  AVG_DRAWDOWN_L3: -7.0,
  SINGLE_STOCK_NUKE: -8.0,

  // ─── BEARISH: Contagion ───
  SECTOR_CONTAGION_L1: 2,
  SECTOR_CONTAGION_L2: 3,
  LEADER_BREAK_L2: 2,

  // ─── BEARISH: Liquidity ───
  VOLUME_VACUUM: 0.3,

  // ═══ V62.1: EUPHORIA THRESHOLDS (狂热阈值) ═══
  // Market-Level Euphoria
  INDEX_SURGE_E1: 2.0,
  INDEX_SURGE_E2: 3.5,
  INDEX_SURGE_E3: 5.0,
  LIMIT_UP_WAVE_E1: 80,
  LIMIT_UP_WAVE_E2: 150,
  LIMIT_UP_WAVE_E3: 250,
  BREADTH_UP_RATIO_E2: 10,

  // Portfolio-Level Euphoria
  CONCURRENT_WINNER_E1: 0.8,
  CONCURRENT_WINNER_E2: 1.0,
  AVG_SURGE_E1: 3.0,
  AVG_SURGE_E2: 5.0,
  AVG_SURGE_E3: 8.0,
  SINGLE_STOCK_MOON: 15.0,

  // Height / Acceleration
  HEIGHT_ACCEL_E1: 7,
  HEIGHT_ACCEL_E2: 10,
  VOLUME_EXPLOSION: 3.0,

  // Sentiment Overheating
  TEMP_OVERHEAT_E1: 80,
  TEMP_OVERHEAT_E2: 92,
};

// ═══════════════════════════════════════════════════════════════════
// MAIN DETECTOR
// ═══════════════════════════════════════════════════════════════════

export function detectBlackSwan(
  stocks: Stock[],
  marketIndices: MarketIndex[],
  metrics: DailyMetrics,
  phase: MarketPhase,
  timestamp: MarketTimestamp = Date.now(),
): BlackSwanResult {
  const triggers: BlackSwanTrigger[] = [];
  const now = getChinaTradingClock(timestamp).timestampMs;

  // ── 1. Portfolio Stats Calculation ──
  const holdings = stocks.filter(s => s.status === 'Hold');
  const portfolioStats = calculatePortfolioStats(holdings);

  // ── 2. Market-Level Detection ──
  const shIndex = marketIndices.find(i => i.code?.includes('sh000001'));
  const indexChange = shIndex?.changePercent || 0;

  // 2A. Index Crash
  if (indexChange <= THRESHOLDS.INDEX_CRASH_L3) {
    triggers.push({
      id: 'idx_crash_l3', severity: 3, category: 'MARKET', direction: 'BEARISH',
      title: '指数崩盘',
      description: `上证指数暴跌 ${indexChange.toFixed(2)}%，触发最高级别熔断。A股历史上此级别跌幅极为罕见，属于黑天鹅事件。`,
      metric: `${indexChange.toFixed(2)}%`, threshold: `${THRESHOLDS.INDEX_CRASH_L3}%`,
      timestamp: now,
    });
  } else if (indexChange <= THRESHOLDS.INDEX_CRASH_L2) {
    triggers.push({
      id: 'idx_crash_l2', severity: 2, category: 'MARKET', direction: 'BEARISH',
      title: '指数重挫',
      description: `上证指数大跌 ${indexChange.toFixed(2)}%，市场恐慌情绪蔓延。非核心持仓应立即撤退。`,
      metric: `${indexChange.toFixed(2)}%`, threshold: `${THRESHOLDS.INDEX_CRASH_L2}%`,
      timestamp: now,
    });
  } else if (indexChange <= THRESHOLDS.INDEX_CRASH_L1) {
    triggers.push({
      id: 'idx_crash_l1', severity: 1, category: 'MARKET', direction: 'BEARISH',
      title: '指数下跌预警',
      description: `上证指数下跌 ${indexChange.toFixed(2)}%，需警惕系统性风险扩散。`,
      metric: `${indexChange.toFixed(2)}%`, threshold: `${THRESHOLDS.INDEX_CRASH_L1}%`,
      timestamp: now,
    });
  }

  // 2B. Limit Down Wave (跌停潮)
  const ldCount = metrics.limitDownCount || 0;
  if (ldCount >= THRESHOLDS.LIMIT_DOWN_L3) {
    triggers.push({
      id: 'ld_wave_l3', severity: 3, category: 'MARKET', direction: 'BEARISH',
      title: '千股跌停',
      description: `全市场跌停 ${ldCount} 家，流动性完全枯竭。这是2015年股灾级别的恐慌事件。`,
      metric: `${ldCount}家`, threshold: `${THRESHOLDS.LIMIT_DOWN_L3}家`,
      timestamp: now,
    });
  } else if (ldCount >= THRESHOLDS.LIMIT_DOWN_L2) {
    triggers.push({
      id: 'ld_wave_l2', severity: 2, category: 'MARKET', direction: 'BEARISH',
      title: '跌停潮',
      description: `全市场跌停 ${ldCount} 家，恐慌性抛售正在蔓延。流动性迅速恶化。`,
      metric: `${ldCount}家`, threshold: `${THRESHOLDS.LIMIT_DOWN_L2}家`,
      timestamp: now,
    });
  } else if (ldCount >= THRESHOLDS.LIMIT_DOWN_L1) {
    triggers.push({
      id: 'ld_wave_l1', severity: 1, category: 'MARKET', direction: 'BEARISH',
      title: '跌停家数异常',
      description: `全市场跌停 ${ldCount} 家，负反馈效应开始显现。`,
      metric: `${ldCount}家`, threshold: `${THRESHOLDS.LIMIT_DOWN_L1}家`,
      timestamp: now,
    });
  }

  // 2C. Extreme Breadth Collapse (涨跌比极端)
  const luCount = metrics.limitUpCount || 0;
  if (ldCount > 0 && luCount > 0) {
    const ratio = ldCount / Math.max(1, luCount);
    if (ratio > THRESHOLDS.BREADTH_RATIO_L2) {
      triggers.push({
        id: 'breadth_collapse', severity: 2, category: 'MARKET', direction: 'BEARISH',
        title: '涨跌比崩溃',
        description: `跌停/涨停比 = ${ratio.toFixed(1)}:1，市场多头全面溃败。`,
        metric: `${ratio.toFixed(1)}:1`, threshold: `${THRESHOLDS.BREADTH_RATIO_L2}:1`,
        timestamp: now,
      });
    }
  }

  // ── 3. Portfolio-Level Detection ──
  if (holdings.length > 0) {
    // 3A. Concurrent Losers
    if (portfolioStats.concurrentLosersRatio >= THRESHOLDS.CONCURRENT_LOSER_L2) {
      triggers.push({
        id: 'concurrent_l2', severity: 2, category: 'PORTFOLIO', direction: 'BEARISH',
        title: '持仓全线溃败',
        description: `${portfolioStats.concurrentLosers}/${portfolioStats.totalHoldings} 只持仓同时亏损(${(portfolioStats.concurrentLosersRatio * 100).toFixed(0)}%)，组合面临系统性风险。`,
        metric: `${(portfolioStats.concurrentLosersRatio * 100).toFixed(0)}%`,
        threshold: `${THRESHOLDS.CONCURRENT_LOSER_L2 * 100}%`,
        timestamp: now,
      });
    } else if (portfolioStats.concurrentLosersRatio >= THRESHOLDS.CONCURRENT_LOSER_L1) {
      triggers.push({
        id: 'concurrent_l1', severity: 1, category: 'PORTFOLIO', direction: 'BEARISH',
        title: '多数持仓亏损',
        description: `${portfolioStats.concurrentLosers}/${portfolioStats.totalHoldings} 只持仓同时下跌。`,
        metric: `${(portfolioStats.concurrentLosersRatio * 100).toFixed(0)}%`,
        threshold: `${THRESHOLDS.CONCURRENT_LOSER_L1 * 100}%`,
        timestamp: now,
      });
    }

    // 3B. Average Portfolio Drawdown
    if (portfolioStats.avgHoldingChange <= THRESHOLDS.AVG_DRAWDOWN_L3) {
      triggers.push({
        id: 'avg_dd_l3', severity: 3, category: 'PORTFOLIO', direction: 'BEARISH',
        title: '组合级"大面"',
        description: `持仓平均跌幅 ${portfolioStats.avgHoldingChange.toFixed(2)}%，组合遭遇毁灭性打击。这通常意味着您的持仓板块/风格遭到集体猎杀。`,
        metric: `${portfolioStats.avgHoldingChange.toFixed(2)}%`,
        threshold: `${THRESHOLDS.AVG_DRAWDOWN_L3}%`,
        timestamp: now,
      });
    } else if (portfolioStats.avgHoldingChange <= THRESHOLDS.AVG_DRAWDOWN_L2) {
      triggers.push({
        id: 'avg_dd_l2', severity: 2, category: 'PORTFOLIO', direction: 'BEARISH',
        title: '组合大幅回撤',
        description: `持仓平均跌幅 ${portfolioStats.avgHoldingChange.toFixed(2)}%，多头策略失效。`,
        metric: `${portfolioStats.avgHoldingChange.toFixed(2)}%`,
        threshold: `${THRESHOLDS.AVG_DRAWDOWN_L2}%`,
        timestamp: now,
      });
    } else if (portfolioStats.avgHoldingChange <= THRESHOLDS.AVG_DRAWDOWN_L1) {
      triggers.push({
        id: 'avg_dd_l1', severity: 1, category: 'PORTFOLIO', direction: 'BEARISH',
        title: '组合回撤预警',
        description: `持仓平均跌幅 ${portfolioStats.avgHoldingChange.toFixed(2)}%。`,
        metric: `${portfolioStats.avgHoldingChange.toFixed(2)}%`,
        threshold: `${THRESHOLDS.AVG_DRAWDOWN_L1}%`,
        timestamp: now,
      });
    }

    // 3C. Leader Cascade Failure
    if (portfolioStats.leadersBroken >= THRESHOLDS.LEADER_BREAK_L2) {
      triggers.push({
        id: 'leader_cascade', severity: 2, category: 'CONTAGION', direction: 'BEARISH',
        title: '龙头集体崩塌',
        description: `${portfolioStats.leadersBroken} 只龙头/领涨股同时大跌。龙头是情绪之锚，龙头崩则全线崩。`,
        metric: `${portfolioStats.leadersBroken}只`,
        threshold: `${THRESHOLDS.LEADER_BREAK_L2}只`,
        timestamp: now,
      });
    }

    // 3D. Sector Contagion
    portfolioStats.sectorContagion.forEach((count, sector) => {
      if (count >= THRESHOLDS.SECTOR_CONTAGION_L2) {
        triggers.push({
          id: `contagion_${sector}`, severity: 2, category: 'CONTAGION', direction: 'BEARISH',
          title: `板块传染: ${sector}`,
          description: `[${sector}] 板块下 ${count} 只持仓同时下跌，板块级别的系统性风险已确认。`,
          metric: `${count}只`, threshold: `${THRESHOLDS.SECTOR_CONTAGION_L2}只`,
          timestamp: now,
        });
      } else if (count >= THRESHOLDS.SECTOR_CONTAGION_L1) {
        triggers.push({
          id: `contagion_${sector}`, severity: 1, category: 'CONTAGION', direction: 'BEARISH',
          title: `板块联动下跌: ${sector}`,
          description: `[${sector}] 板块下 ${count} 只持仓同时下跌。`,
          metric: `${count}只`, threshold: `${THRESHOLDS.SECTOR_CONTAGION_L1}只`,
          timestamp: now,
        });
      }
    });
  }

  // ── 4. Liquidity Vacuum Detection ──
  const avgVolumeRatio = holdings.length > 0
    ? holdings.reduce((sum, s) => sum + (s.volumeRatio || 1), 0) / holdings.length
    : 1;
  if (avgVolumeRatio < THRESHOLDS.VOLUME_VACUUM && holdings.length >= 3) {
    triggers.push({
      id: 'liquidity_vacuum', severity: 2, category: 'LIQUIDITY', direction: 'BEARISH',
      title: '流动性真空',
      description: `持仓平均量比仅 ${avgVolumeRatio.toFixed(2)}，极度缩量。市场处于流动性枯竭状态，一旦恐慌将导致踩踏式下跌。`,
      metric: `${avgVolumeRatio.toFixed(2)}`, threshold: `${THRESHOLDS.VOLUME_VACUUM}`,
      timestamp: now,
    });
  }

  // ── 5. Pattern Detection (复合型黑天鹅模式) ──
  if (phase === 'Ice' && ldCount >= 50 && portfolioStats.leadersBroken >= 1) {
    triggers.push({
      id: 'triple_kill', severity: 3, category: 'PATTERN', direction: 'BEARISH',
      title: '三杀熔断',
      description: `冰点周期 + 跌停潮(${ldCount}家) + 龙头断崩 = 短线交易者的末日组合。所有短线仓位应无条件清仓。`,
      metric: '三因子共振', threshold: 'Ice + 50LD + Leader↓',
      timestamp: now,
    });
  }

  if (
    indexChange < -2 &&
    holdings.some(s =>
      (s.consecutiveLimitUps || 0) >= 3 &&
      (s.changePercent || 0) < -5
    )
  ) {
    triggers.push({
      id: 'high_flush', severity: 2, category: 'PATTERN', direction: 'BEARISH',
      title: '高位集体出逃',
      description: `大盘下跌${indexChange.toFixed(1)}%的同时，连板妖股出现断板暴跌。这是资金集体撤退的信号。`,
      metric: `指数${indexChange.toFixed(1)}% + 妖股断崩`,
      threshold: '指数-2% + 3板+股-5%',
      timestamp: now,
    });
  }

  // ── 6. Determine Final Circuit Breaker Level ──
  let level: CircuitBreakerLevel = 0;
  if (triggers.length > 0) {
    level = Math.max(...triggers.map(t => t.severity)) as CircuitBreakerLevel;
  }

  const l1Count = triggers.filter(t => t.severity === 1).length;
  if (level === 1 && l1Count >= 3) {
    level = 2;
    triggers.push({
      id: 'multi_l1_escalation', severity: 2, category: 'PATTERN', direction: 'BEARISH',
      title: '多因子共振升级',
      description: `${l1Count} 个独立风险因子同时触发L1预警，风险正在叠加共振，升级至L2。`,
      metric: `${l1Count}因子`, threshold: '3因子',
      timestamp: now,
    });
  }

  // ── 7. Generate Emergency Actions ──
  const emergencyActions = generateEmergencyActions(holdings, level, portfolioStats, indexChange);

  // ═══════════════════════════════════════════════════════════════════
  // V62.1: EUPHORIA DETECTION (狂热检测)
  // ═══════════════════════════════════════════════════════════════════
  const { euphoriaLevel, euphoriaTriggers, euphoriaActions, euphoriaAdvice } =
    detectEuphoria(stocks, holdings, marketIndices, metrics, phase, portfolioStats, now);

  // ── 8. Global Advice ──
  const globalAdvice = generateGlobalAdvice(level, triggers, portfolioStats, phase);

  // ── 9. Build Result ──
  const levelNames: Record<CircuitBreakerLevel, string> = {
    0: '正常', 1: '预警', 2: '危机', 3: '熔断',
  };

  const levelDescriptions: Record<CircuitBreakerLevel, string> = {
    0: '市场正常运行，按个股信号执行。',
    1: '检测到风险信号。压缩非核心仓位至50%，收紧止损线，禁止新开仓。',
    2: '多重风险共振！立即清仓所有非龙头持仓，龙头持仓减至底仓，全面转入防御模式。',
    3: '黑天鹅事件确认！无条件清仓所有持仓，现金为王。这不是普通的回调，是系统性崩溃。',
  };

  const euphoriaLevelNames: Record<EuphoriaLevel, string> = {
    0: '正常', 1: '过热', 2: '狂热', 3: '冲顶',
  };

  return {
    level,
    levelName: levelNames[level],
    levelDescription: levelDescriptions[level],
    triggers: triggers.sort((a, b) => b.severity - a.severity),
    portfolioStats,
    emergencyActions,
    globalAdvice,
    isActive: level >= 1,
    activatedAt: level >= 1 ? now : null,
    euphoriaLevel,
    euphoriaLevelName: euphoriaLevelNames[euphoriaLevel],
    euphoriaTriggers: euphoriaTriggers.sort((a, b) => b.severity - a.severity),
    euphoriaActions,
    euphoriaAdvice,
    isEuphoriaActive: euphoriaLevel >= 1,
  };
}

// ═══════════════════════════════════════════════════════════════════
// BEARISH HELPERS
// ═══════════════════════════════════════════════════════════════════

function calculatePortfolioStats(holdings: Stock[]): PortfolioStats {
  const totalHoldings = holdings.length;

  if (totalHoldings === 0) {
    return {
      totalHoldings: 0, concurrentLosers: 0, concurrentLosersRatio: 0,
      avgHoldingChange: 0, worstHoldingChange: 0, worstHoldingName: '-',
      bestHoldingChange: 0, bestHoldingName: '-',
      portfolioDrawdown: 0, leadersBroken: 0, sectorContagion: new Map(),
    };
  }

  const changes = holdings.map(s => s.changePercent || 0);
  const losers = holdings.filter(s => (s.changePercent || 0) < -0.5);
  const concurrentLosers = losers.length;
  const concurrentLosersRatio = concurrentLosers / totalHoldings;
  const avgHoldingChange = changes.reduce((a, b) => a + b, 0) / totalHoldings;

  const worstIdx = changes.indexOf(Math.min(...changes));
  const worstHoldingChange = changes[worstIdx] || 0;
  const worstHoldingName = holdings[worstIdx]?.name || '-';

  const bestIdx = changes.indexOf(Math.max(...changes));
  const bestHoldingChange = changes[bestIdx] || 0;
  const bestHoldingName = holdings[bestIdx]?.name || '-';

  const portfolioDrawdown = avgHoldingChange;

  const leadersBroken = holdings.filter(s =>
    (s.role === 'Dragon' || s.role === 'Leader') &&
    (s.changePercent || 0) < -3
  ).length;

  const sectorContagion = new Map<string, number>();
  losers.forEach(s => {
    if (s.concept) {
      sectorContagion.set(s.concept, (sectorContagion.get(s.concept) || 0) + 1);
    }
  });

  return {
    totalHoldings, concurrentLosers, concurrentLosersRatio, avgHoldingChange,
    worstHoldingChange, worstHoldingName, bestHoldingChange, bestHoldingName,
    portfolioDrawdown, leadersBroken, sectorContagion,
  };
}

function generateEmergencyActions(
  holdings: Stock[],
  level: CircuitBreakerLevel,
  stats: PortfolioStats,
  indexChange: number,
): EmergencyAction[] {
  if (level === 0 || holdings.length === 0) return [];

  const actions: EmergencyAction[] = [];

  for (const stock of holdings) {
    const chg = stock.changePercent || 0;
    const isLeader = stock.role === 'Dragon' || stock.role === 'Leader';
    const isIndependent = stock.role === 'Independent';

    if (level === 3) {
      actions.push({
        stockId: stock.id, stockName: stock.name, stockCode: stock.code,
        action: 'EMERGENCY_SELL',
        reason: `[L3熔断] 黑天鹅确认，无条件清仓所有持仓。`,
        priority: 1, currentChange: chg,
      });
    } else if (level === 2) {
      if (isLeader && chg > -5) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'REDUCE_50',
          reason: `[L2危机] 龙头保留底仓，减仓至50%。跌破-5%则无条件清仓。`,
          priority: 2, currentChange: chg,
        });
      } else if (isIndependent && chg > -3) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'TIGHTEN_STOP',
          reason: `[L2危机] 独立股暂时观察，收紧止损至-3%。`,
          priority: 3, currentChange: chg,
        });
      } else {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'EMERGENCY_SELL',
          reason: `[L2危机] 非核心持仓立即清仓，防止进一步损失。`,
          priority: 1, currentChange: chg,
        });
      }
    } else if (level === 1) {
      if (chg < THRESHOLDS.SINGLE_STOCK_NUKE) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'EMERGENCY_SELL',
          reason: `[单股熔断] 跌幅 ${chg.toFixed(1)}% 超过极限阈值(${THRESHOLDS.SINGLE_STOCK_NUKE}%)。`,
          priority: 1, currentChange: chg,
        });
      } else if (!isLeader && chg < -3) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'REDUCE_50',
          reason: `[L1预警] 非核心持仓下跌${chg.toFixed(1)}%，减仓至50%防御。`,
          priority: 2, currentChange: chg,
        });
      } else if (chg < -1) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'TIGHTEN_STOP',
          reason: `[L1预警] 收紧止损线，做好撤退准备。`,
          priority: 3, currentChange: chg,
        });
      } else if (isLeader) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'HOLD_CORE',
          reason: `[L1预警] 龙头核心仓位暂时保持，密切关注板块共振变化。`,
          priority: 4, currentChange: chg,
        });
      }
    }
  }

  return actions.sort((a, b) => a.priority - b.priority || a.currentChange - b.currentChange);
}

function generateGlobalAdvice(
  level: CircuitBreakerLevel,
  triggers: BlackSwanTrigger[],
  stats: PortfolioStats,
  phase: MarketPhase,
): string {
  if (level === 0) return '组合风控正常，按个股Predator信号执行。';

  const triggerSummary = triggers.slice(0, 3).map(t => t.title).join('、');

  if (level === 3) {
    return `🚨 黑天鹅熔断！触发因素: ${triggerSummary}。` +
      `持仓平均跌幅 ${stats.avgHoldingChange.toFixed(1)}%，最差: ${stats.worstHoldingName}(${stats.worstHoldingChange.toFixed(1)}%)。` +
      `第一原则：保命。全线清仓，不抄底、不补仓、不幻想。等待至少2个交易日的企稳信号后再考虑回场。` +
      `历史经验：黑天鹅次日大概率继续杀跌(-3%~-5%)，抄底者90%被埋。`;
  }

  if (level === 2) {
    return `⚠️ 危机模式！触发因素: ${triggerSummary}。` +
      `${stats.concurrentLosers}/${stats.totalHoldings}只持仓亏损，平均跌幅 ${stats.avgHoldingChange.toFixed(1)}%。` +
      `执行：非龙头持仓立即清仓，龙头减至底仓。禁止一切新开仓行为。` +
      `观察：若指数15:00前无法收回跌幅50%，则盘后升级至L3全清。`;
  }

  return `⚡ 风险预警！触发因素: ${triggerSummary}。` +
    `${stats.concurrentLosers}/${stats.totalHoldings}只持仓下跌。` +
    `建议：压缩仓位至50%，收紧止损线，今日禁止新开仓。密切关注午后走势变化。`;
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT: Utility for checking if a specific stock should be force-overridden
// ═══════════════════════════════════════════════════════════════════

export function shouldOverrideSignal(
  stockId: string,
  actions: EmergencyAction[],
): EmergencyAction | null {
  return actions.find(a => a.stockId === stockId) || null;
}

// ═══════════════════════════════════════════════════════════════════
// V62.1: EUPHORIA DETECTION ENGINE (狂热检测引擎)
// ═══════════════════════════════════════════════════════════════════
//
// "悲观风控"原则的另一面：暴涨不是利好，暴涨是赶顶。
//
// 核心逻辑：
//   - 市场暴涨 → 流动性最好的时候恰恰是卖出的最佳窗口
//   - 持仓全线暴涨 → 不是"赚到了"，而是"该锁了"
//   - 连板高度加速 → 最后的疯狂，接力者90%被埋
//   - 天量 → 分歧不是坏事，但天量见天价
//
// Euphoria Levels:
//   E0: 正常 — 按个股信号执行
//   E1: 过热 — 黄灯：收紧追高条件，启动止盈保护
//   E2: 狂热 — 橙灯：非核心止盈离场，龙头锁利
//   E3: 冲顶 — 紫灯：系统性止盈，准备迎接回调杀
// ═══════════════════════════════════════════════════════════════════

interface EuphoriaResult {
  euphoriaLevel: EuphoriaLevel;
  euphoriaTriggers: BlackSwanTrigger[];
  euphoriaActions: EmergencyAction[];
  euphoriaAdvice: string;
}

function detectEuphoria(
  allStocks: Stock[],
  holdings: Stock[],
  marketIndices: MarketIndex[],
  metrics: DailyMetrics,
  phase: MarketPhase,
  portfolioStats: PortfolioStats,
  now: number,
): EuphoriaResult {
  const euphoriaTriggers: BlackSwanTrigger[] = [];

  const shIndex = marketIndices.find(i => i.code?.includes('sh000001'));
  const indexChange = shIndex?.changePercent || 0;
  const luCount = metrics.limitUpCount || 0;
  const ldCount = metrics.limitDownCount || 0;
  const marketTemp = metrics.marketTemp || 50;
  const spaceHeight = metrics.spaceHeight || metrics.height || 0;

  // ── E-1: Market-Level Euphoria ──

  // E-1A: Index Surge (指数暴涨)
  if (indexChange >= THRESHOLDS.INDEX_SURGE_E3) {
    euphoriaTriggers.push({
      id: 'idx_surge_e3', severity: 3, category: 'MARKET', direction: 'BULLISH',
      title: '指数暴涨',
      description: `上证指数暴涨 +${indexChange.toFixed(2)}%。A股单日涨幅超5%极为罕见，往往是政策驱动的脉冲行情。历史统计：暴涨次日回落概率 > 70%，追高者多数被套。`,
      metric: `+${indexChange.toFixed(2)}%`, threshold: `+${THRESHOLDS.INDEX_SURGE_E3}%`,
      timestamp: now,
    });
  } else if (indexChange >= THRESHOLDS.INDEX_SURGE_E2) {
    euphoriaTriggers.push({
      id: 'idx_surge_e2', severity: 2, category: 'MARKET', direction: 'BULLISH',
      title: '指数大涨',
      description: `上证指数大涨 +${indexChange.toFixed(2)}%。市场情绪极度亢奋，流动性充裕但也意味着这是最佳的卖出窗口。不要被贪婪蒙蔽。`,
      metric: `+${indexChange.toFixed(2)}%`, threshold: `+${THRESHOLDS.INDEX_SURGE_E2}%`,
      timestamp: now,
    });
  } else if (indexChange >= THRESHOLDS.INDEX_SURGE_E1) {
    euphoriaTriggers.push({
      id: 'idx_surge_e1', severity: 1, category: 'MARKET', direction: 'BULLISH',
      title: '指数上涨偏热',
      description: `上证指数上涨 +${indexChange.toFixed(2)}%，市场进入亢奋区。需警惕冲高回落和尾盘跳水风险。`,
      metric: `+${indexChange.toFixed(2)}%`, threshold: `+${THRESHOLDS.INDEX_SURGE_E1}%`,
      timestamp: now,
    });
  }

  // E-1B: Limit Up Wave (涨停潮)
  if (luCount >= THRESHOLDS.LIMIT_UP_WAVE_E3) {
    euphoriaTriggers.push({
      id: 'lu_wave_e3', severity: 3, category: 'MARKET', direction: 'BULLISH',
      title: '全面疯牛',
      description: `全市场涨停 ${luCount} 家！这是2015年/2024年牛市级别的疯狂。记住：牛市顶部总是在最疯狂的时候形成。流动性最好 = 卖出最优。`,
      metric: `${luCount}家`, threshold: `${THRESHOLDS.LIMIT_UP_WAVE_E3}家`,
      timestamp: now,
    });
  } else if (luCount >= THRESHOLDS.LIMIT_UP_WAVE_E2) {
    euphoriaTriggers.push({
      id: 'lu_wave_e2', severity: 2, category: 'MARKET', direction: 'BULLISH',
      title: '百股涨停',
      description: `全市场涨停 ${luCount} 家，赚钱效应爆棚。但历史数据表明，百股涨停后1-3日内出现显著回调的概率超过60%。`,
      metric: `${luCount}家`, threshold: `${THRESHOLDS.LIMIT_UP_WAVE_E2}家`,
      timestamp: now,
    });
  } else if (luCount >= THRESHOLDS.LIMIT_UP_WAVE_E1) {
    euphoriaTriggers.push({
      id: 'lu_wave_e1', severity: 1, category: 'MARKET', direction: 'BULLISH',
      title: '涨停家数偏多',
      description: `全市场涨停 ${luCount} 家，赚钱效应较强。注意观察是否为主题炒作过热。`,
      metric: `${luCount}家`, threshold: `${THRESHOLDS.LIMIT_UP_WAVE_E1}家`,
      timestamp: now,
    });
  }

  // E-1C: Extreme Breadth Surge
  if (luCount > 0 && ldCount >= 0) {
    const upRatio = luCount / Math.max(1, ldCount || 1);
    if (upRatio > THRESHOLDS.BREADTH_UP_RATIO_E2) {
      euphoriaTriggers.push({
        id: 'breadth_surge', severity: 2, category: 'MARKET', direction: 'BULLISH',
        title: '涨跌比极端',
        description: `涨停/跌停比 = ${upRatio.toFixed(1)}:1，多头完全主导。但极端的一致性往往预示着反转即将到来。`,
        metric: `${upRatio.toFixed(1)}:1`, threshold: `${THRESHOLDS.BREADTH_UP_RATIO_E2}:1`,
        timestamp: now,
      });
    }
  }

  // ── E-2: Portfolio-Level Euphoria ──
  if (holdings.length > 0) {
    const winners = holdings.filter(s => (s.changePercent || 0) > 0.5);
    const winnerRatio = winners.length / holdings.length;

    // E-2A: Concurrent Winners
    if (winnerRatio >= THRESHOLDS.CONCURRENT_WINNER_E2) {
      euphoriaTriggers.push({
        id: 'concurrent_win_e2', severity: 2, category: 'PORTFOLIO', direction: 'BULLISH',
        title: '持仓全线暴涨',
        description: `${winners.length}/${holdings.length} 只持仓全部盈利(100%)！这种完美状态极不可持续。悲观风控第一原则：当你觉得一切完美时，就是该卖的时候。`,
        metric: `${(winnerRatio * 100).toFixed(0)}%`,
        threshold: `${THRESHOLDS.CONCURRENT_WINNER_E2 * 100}%`,
        timestamp: now,
      });
    } else if (winnerRatio >= THRESHOLDS.CONCURRENT_WINNER_E1) {
      euphoriaTriggers.push({
        id: 'concurrent_win_e1', severity: 1, category: 'PORTFOLIO', direction: 'BULLISH',
        title: '多数持仓盈利',
        description: `${winners.length}/${holdings.length} 只持仓盈利(${(winnerRatio * 100).toFixed(0)}%)。赚钱效应不错，但需收紧止盈线。`,
        metric: `${(winnerRatio * 100).toFixed(0)}%`,
        threshold: `${THRESHOLDS.CONCURRENT_WINNER_E1 * 100}%`,
        timestamp: now,
      });
    }

    // E-2B: Average Portfolio Surge
    if (portfolioStats.avgHoldingChange >= THRESHOLDS.AVG_SURGE_E3) {
      euphoriaTriggers.push({
        id: 'avg_surge_e3', severity: 3, category: 'PORTFOLIO', direction: 'BULLISH',
        title: '组合级"天地板"风险',
        description: `持仓平均涨幅 +${portfolioStats.avgHoldingChange.toFixed(2)}%！这种涨幅通常意味着"利好兑现"式的天量出货。次日大幅低开的概率极高。立即系统性止盈。`,
        metric: `+${portfolioStats.avgHoldingChange.toFixed(2)}%`,
        threshold: `+${THRESHOLDS.AVG_SURGE_E3}%`,
        timestamp: now,
      });
    } else if (portfolioStats.avgHoldingChange >= THRESHOLDS.AVG_SURGE_E2) {
      euphoriaTriggers.push({
        id: 'avg_surge_e2', severity: 2, category: 'PORTFOLIO', direction: 'BULLISH',
        title: '组合大幅盈利',
        description: `持仓平均涨幅 +${portfolioStats.avgHoldingChange.toFixed(2)}%。锁定利润，非核心持仓止盈离场。`,
        metric: `+${portfolioStats.avgHoldingChange.toFixed(2)}%`,
        threshold: `+${THRESHOLDS.AVG_SURGE_E2}%`,
        timestamp: now,
      });
    } else if (portfolioStats.avgHoldingChange >= THRESHOLDS.AVG_SURGE_E1) {
      euphoriaTriggers.push({
        id: 'avg_surge_e1', severity: 1, category: 'PORTFOLIO', direction: 'BULLISH',
        title: '组合盈利偏高',
        description: `持仓平均涨幅 +${portfolioStats.avgHoldingChange.toFixed(2)}%。收紧止盈线，做好锁利准备。`,
        metric: `+${portfolioStats.avgHoldingChange.toFixed(2)}%`,
        threshold: `+${THRESHOLDS.AVG_SURGE_E1}%`,
        timestamp: now,
      });
    }

    // E-2C: Single Stock Moon Shot (天地板风险)
    const moonShots = holdings.filter(s => (s.changePercent || 0) >= THRESHOLDS.SINGLE_STOCK_MOON);
    for (const ms of moonShots) {
      euphoriaTriggers.push({
        id: `moon_${ms.id}`, severity: 2, category: 'PORTFOLIO', direction: 'BULLISH',
        title: `个股冲天: ${ms.name}`,
        description: `[${ms.name}] 涨幅 +${(ms.changePercent || 0).toFixed(1)}%！单日涨幅过大，天地板风险极高。"涨停价买入"的人就是你的接盘侠 — 别让自己成为下一个。`,
        metric: `+${(ms.changePercent || 0).toFixed(1)}%`,
        threshold: `+${THRESHOLDS.SINGLE_STOCK_MOON}%`,
        timestamp: now,
      });
    }
  }

  // ── E-3: Height Acceleration & Volume ──

  if (spaceHeight >= THRESHOLDS.HEIGHT_ACCEL_E2) {
    euphoriaTriggers.push({
      id: 'height_accel_e2', severity: 2, category: 'MARKET', direction: 'BULLISH',
      title: '妖股极端高度',
      description: `市场最高连板达到 ${spaceHeight} 板！这是极端投机行情的标志。历史上10板以上的妖股，断板后平均回调超过30%。接力者血本无归。`,
      metric: `${spaceHeight}板`, threshold: `${THRESHOLDS.HEIGHT_ACCEL_E2}板`,
      timestamp: now,
    });
  } else if (spaceHeight >= THRESHOLDS.HEIGHT_ACCEL_E1) {
    euphoriaTriggers.push({
      id: 'height_accel_e1', severity: 1, category: 'MARKET', direction: 'BULLISH',
      title: '连板高度偏高',
      description: `市场最高连板达到 ${spaceHeight} 板。高位加速后断板的杀伤力极大，禁止追高连板股。`,
      metric: `${spaceHeight}板`, threshold: `${THRESHOLDS.HEIGHT_ACCEL_E1}板`,
      timestamp: now,
    });
  }

  // Volume Explosion
  if (holdings.length > 0) {
    const avgVolRatio = holdings.reduce((sum, s) => sum + (s.volumeRatio || 1), 0) / holdings.length;
    if (avgVolRatio >= THRESHOLDS.VOLUME_EXPLOSION) {
      euphoriaTriggers.push({
        id: 'vol_explosion', severity: 2, category: 'LIQUIDITY', direction: 'BULLISH',
        title: '天量见天价',
        description: `持仓平均量比 ${avgVolRatio.toFixed(2)}，成交量爆发式放大。"天量天价"是A股最经典的见顶信号之一。放量滞涨或放量冲高回落是确认信号。`,
        metric: `量比 ${avgVolRatio.toFixed(2)}`, threshold: `量比 ${THRESHOLDS.VOLUME_EXPLOSION}`,
        timestamp: now,
      });
    }
  }

  // ── E-4: Sentiment Overheating ──
  if (marketTemp >= THRESHOLDS.TEMP_OVERHEAT_E2) {
    euphoriaTriggers.push({
      id: 'temp_overheat_e2', severity: 2, category: 'PATTERN', direction: 'BULLISH',
      title: '极度贪婪',
      description: `市场情绪温度 ${marketTemp.toFixed(0)}°，处于极度贪婪区间。巴菲特说"别人贪婪时恐惧" — 在短线交易中，这意味着止盈。`,
      metric: `${marketTemp.toFixed(0)}°`, threshold: `${THRESHOLDS.TEMP_OVERHEAT_E2}°`,
      timestamp: now,
    });
  } else if (marketTemp >= THRESHOLDS.TEMP_OVERHEAT_E1) {
    euphoriaTriggers.push({
      id: 'temp_overheat_e1', severity: 1, category: 'PATTERN', direction: 'BULLISH',
      title: '情绪偏热',
      description: `市场情绪温度 ${marketTemp.toFixed(0)}°，偏热。历史上情绪温度>80时追高的胜率大幅下降。`,
      metric: `${marketTemp.toFixed(0)}°`, threshold: `${THRESHOLDS.TEMP_OVERHEAT_E1}°`,
      timestamp: now,
    });
  }

  // ── E-5: Composite Euphoria Patterns ──

  // "Climax + 百股涨停 + 高板" 三热组合
  if (phase === 'Climax' && luCount >= 100 && spaceHeight >= 6) {
    euphoriaTriggers.push({
      id: 'triple_heat', severity: 3, category: 'PATTERN', direction: 'BULLISH',
      title: '三热熔断',
      description: `高潮周期 + 百股涨停(${luCount}家) + 高连板(${spaceHeight}板) = 行情加速赶顶的经典组合。这通常是Climax→Ebb转换的前兆。所有持仓应启动止盈计划。`,
      metric: '三因子共振', threshold: 'Climax + 100LU + 6板+',
      timestamp: now,
    });
  }

  // "暴涨 + 高位巨量 + 妖股加速" = 最后的疯狂
  if (
    indexChange >= 2 &&
    holdings.some(s =>
      (s.consecutiveLimitUps || 0) >= 4 &&
      (s.volumeRatio || 1) >= 2.5
    )
  ) {
    euphoriaTriggers.push({
      id: 'final_frenzy', severity: 2, category: 'PATTERN', direction: 'BULLISH',
      title: '最后的疯狂',
      description: `大盘上涨+${indexChange.toFixed(1)}%的同时，高位连板妖股天量加速。这是资金最后的狂欢，聪明钱正在借暴涨出货。`,
      metric: `指数+${indexChange.toFixed(1)}% + 妖股天量加速`,
      threshold: '指数+2% + 4板+股量比2.5+',
      timestamp: now,
    });
  }

  // ── E-6: Determine Euphoria Level ──
  let euphoriaLevel: EuphoriaLevel = 0;
  if (euphoriaTriggers.length > 0) {
    euphoriaLevel = Math.max(...euphoriaTriggers.map(t => t.severity)) as EuphoriaLevel;
  }

  // Multi-trigger escalation: 3+ E1 → E2
  const e1Count = euphoriaTriggers.filter(t => t.severity === 1).length;
  if (euphoriaLevel === 1 && e1Count >= 3) {
    euphoriaLevel = 2;
    euphoriaTriggers.push({
      id: 'multi_e1_escalation', severity: 2, category: 'PATTERN', direction: 'BULLISH',
      title: '多热因子共振升级',
      description: `${e1Count} 个独立过热因子同时触发E1预警，狂热信号正在共振叠加，升级至E2。`,
      metric: `${e1Count}因子`, threshold: '3因子',
      timestamp: now,
    });
  }

  // ── E-7: Generate Euphoria Actions ──
  const euphoriaActions = generateEuphoriaActions(holdings, euphoriaLevel, portfolioStats, spaceHeight);

  // ── E-8: Generate Euphoria Advice ──
  const euphoriaAdvice = generateEuphoriaAdvice(euphoriaLevel, euphoriaTriggers, portfolioStats, phase);

  return { euphoriaLevel, euphoriaTriggers, euphoriaActions, euphoriaAdvice };
}

function generateEuphoriaActions(
  holdings: Stock[],
  level: EuphoriaLevel,
  stats: PortfolioStats,
  spaceHeight: number,
): EmergencyAction[] {
  if (level === 0 || holdings.length === 0) return [];

  const actions: EmergencyAction[] = [];

  for (const stock of holdings) {
    const chg = stock.changePercent || 0;
    const isLeader = stock.role === 'Dragon' || stock.role === 'Leader';
    const boards = stock.consecutiveLimitUps || 0;
    const volRatio = stock.volumeRatio || 1;

    if (level === 3) {
      if (isLeader && boards >= 3) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'LOCK_PROFIT',
          reason: `[E3冲顶] 龙头${boards}连板，系统性止盈锁定70%利润。保留30%观察仓追踪残余动能。`,
          priority: 1, currentChange: chg,
        });
      } else if (chg >= 8) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'LOCK_PROFIT',
          reason: `[E3冲顶] 涨幅+${chg.toFixed(1)}%，流动性最佳窗口。不要等明天！明天大概率低开。`,
          priority: 1, currentChange: chg,
        });
      } else {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'TRAIL_TIGHT',
          reason: `[E3冲顶] 收紧移动止盈至当日最高价-3%。一旦回落立即执行。`,
          priority: 2, currentChange: chg,
        });
      }
    } else if (level === 2) {
      if (boards >= 4 && volRatio >= 2) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'LOCK_PROFIT',
          reason: `[E2狂热] ${boards}连板+量比${volRatio.toFixed(1)}，高位天量是经典出货信号。立即锁定利润。`,
          priority: 1, currentChange: chg,
        });
      } else if (chg >= 7 && !isLeader) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'REDUCE_WINNER',
          reason: `[E2狂热] 非核心持仓涨幅+${chg.toFixed(1)}%，减仓50%锁定利润。`,
          priority: 2, currentChange: chg,
        });
      } else if (isLeader) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'TRAIL_TIGHT',
          reason: `[E2狂热] 龙头暂持，但收紧移动止盈至日内最高价-2%。`,
          priority: 3, currentChange: chg,
        });
      } else {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'TRAIL_TIGHT',
          reason: `[E2狂热] 收紧止盈线，做好止盈退出准备。`,
          priority: 3, currentChange: chg,
        });
      }
    } else if (level === 1) {
      if (chg >= THRESHOLDS.SINGLE_STOCK_MOON) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'LOCK_PROFIT',
          reason: `[E1过热] 涨幅+${chg.toFixed(1)}%超过天板警戒线。锁定利润。`,
          priority: 1, currentChange: chg,
        });
      } else if (boards >= 3 && chg >= 5) {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'TRAIL_TIGHT',
          reason: `[E1过热] ${boards}连板+当日涨${chg.toFixed(1)}%，收紧止盈保护利润。`,
          priority: 2, currentChange: chg,
        });
      } else {
        actions.push({
          stockId: stock.id, stockName: stock.name, stockCode: stock.code,
          action: 'NO_CHASE',
          reason: `[E1过热] 市场偏热，禁止加仓追高。已有仓位按止盈纪律执行。`,
          priority: 4, currentChange: chg,
        });
      }
    }
  }

  return actions.sort((a, b) => a.priority - b.priority || b.currentChange - a.currentChange);
}

function generateEuphoriaAdvice(
  level: EuphoriaLevel,
  triggers: BlackSwanTrigger[],
  stats: PortfolioStats,
  phase: MarketPhase,
): string {
  if (level === 0) return '';

  const triggerSummary = triggers.slice(0, 3).map(t => t.title).join('、');

  if (level === 3) {
    return `🟣 冲顶熔断！触发因素: ${triggerSummary}。` +
      `持仓平均涨幅 +${stats.avgHoldingChange.toFixed(1)}%，最佳: ${stats.bestHoldingName}(+${stats.bestHoldingChange.toFixed(1)}%)。` +
      `第一原则：流动性最好时卖出。全线启动止盈计划，龙头保留观察仓(30%)，其余锁定利润。` +
      `不追高、不加仓、不幻想。A股暴涨次日回调概率>65%，均值回归是铁律。准备现金，等回调后重新布局。`;
  }

  if (level === 2) {
    return `🟠 狂热模式！触发因素: ${triggerSummary}。` +
      `持仓平均涨幅 +${stats.avgHoldingChange.toFixed(1)}%。` +
      `执行：非龙头持仓锁定利润(减仓50%+)，龙头收紧移动止盈。禁止一切追高行为。` +
      `观察：若尾盘30分钟出现跳水或量能萎缩，则盘后升级至E3全面止盈。`;
  }

  return `🟡 过热预警！触发因素: ${triggerSummary}。` +
    `持仓平均涨幅 +${stats.avgHoldingChange.toFixed(1)}%。` +
    `建议：收紧所有止盈线，今日禁止追高加仓。已有利润的非核心仓位考虑部分止盈。`;
}
