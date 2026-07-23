import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert, AlertTriangle, Skull, X, ChevronDown, ChevronUp,
  TrendingDown, TrendingUp, Zap, ShieldOff, Activity, Siren, ArrowDown,
  Flame, Crown, Rocket, Lock
} from 'lucide-react';
import { cn } from './ui/utils';
import { useTrading } from '../context/Store';
import {
  detectBlackSwan,
  BlackSwanResult,
  CircuitBreakerLevel,
  EuphoriaLevel,
  BlackSwanTrigger,
  EmergencyAction,
} from '../utils/blackSwanDetector';

/**
 * BLACK SWAN & EUPHORIA OVERLAY V62.1
 * 
 * Bidirectional visual circuit breaker alert system.
 * - BEARISH: Red/Orange/Amber alerts for crashes
 * - BULLISH: Purple/Gold/Yellow alerts for euphoria/blow-off tops
 */

export const BlackSwanOverlay: React.FC = () => {
  const { stocks, marketIndices, metrics, phase } = useTrading();
  const [dismissedBear, setDismissedBear] = useState(false);
  const [dismissedBull, setDismissedBull] = useState(false);
  const [expandedBear, setExpandedBear] = useState(false);
  const [expandedBull, setExpandedBull] = useState(false);
  const [lastBearLevel, setLastBearLevel] = useState<CircuitBreakerLevel>(0);
  const [lastBullLevel, setLastBullLevel] = useState<EuphoriaLevel>(0);

  const result: BlackSwanResult = useMemo(() => {
    return detectBlackSwan(stocks, marketIndices, metrics, phase);
  }, [stocks, marketIndices, metrics, phase]);

  // Reset dismissed state when level escalates
  useEffect(() => {
    if (result.level > lastBearLevel) {
      setDismissedBear(false);
      setExpandedBear(true);
    }
    setLastBearLevel(result.level);
  }, [result.level, lastBearLevel]);

  useEffect(() => {
    if (result.euphoriaLevel > lastBullLevel) {
      setDismissedBull(false);
      setExpandedBull(true);
    }
    setLastBullLevel(result.euphoriaLevel);
  }, [result.euphoriaLevel, lastBullLevel]);

  // Auto-restore Level 3 dismissals after 60 seconds (safety net)
  useEffect(() => {
    if (dismissedBear && result.level === 3) {
      const timer = setTimeout(() => setDismissedBear(false), 60000);
      return () => clearTimeout(timer);
    }
  }, [dismissedBear, result.level]);

  useEffect(() => {
    if (dismissedBull && result.euphoriaLevel === 3) {
      const timer = setTimeout(() => setDismissedBull(false), 60000);
      return () => clearTimeout(timer);
    }
  }, [dismissedBull, result.euphoriaLevel]);

  const showBear = result.isActive && !dismissedBear;
  const showBull = result.isEuphoriaActive && !dismissedBull;

  if (!showBear && !showBull) return null;

  return (
    <AnimatePresence>
      <div className="fixed top-0 left-0 right-0 z-[100] flex flex-col">
        {/* BEARISH Alert (always on top if both active) */}
        {showBear && (
          <BearishAlert
            result={result}
            expanded={expandedBear}
            setExpanded={setExpandedBear}
            onDismiss={() => setDismissedBear(true)}
          />
        )}

        {/* BULLISH / Euphoria Alert */}
        {showBull && (
          <EuphoriaAlert
            result={result}
            expanded={expandedBull}
            setExpanded={setExpandedBull}
            onDismiss={() => setDismissedBull(true)}
          />
        )}
      </div>
    </AnimatePresence>
  );
};

// ═══════════════════════════════════════════════════════════════════
// BEARISH ALERT (Original V62.0 design)
// ═══════════════════════════════════════════════════════════════════

const BearishAlert: React.FC<{
  result: BlackSwanResult;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  onDismiss: () => void;
}> = ({ result, expanded, setExpanded, onDismiss }) => {
  const config = {
    1: {
      icon: AlertTriangle,
      gradient: 'from-amber-500/95 to-orange-600/95',
      border: 'border-amber-400',
      iconColor: 'text-amber-100',
      barColor: 'bg-amber-400',
      badgeClass: 'bg-amber-700 text-amber-100',
      label: 'LEVEL 1',
      labelFull: 'RISK ALERT',
    },
    2: {
      icon: ShieldAlert,
      gradient: 'from-orange-600/95 to-red-700/95',
      border: 'border-orange-400',
      iconColor: 'text-orange-100',
      barColor: 'bg-orange-400',
      badgeClass: 'bg-orange-800 text-orange-100',
      label: 'LEVEL 2',
      labelFull: 'CRISIS MODE',
    },
    3: {
      icon: Skull,
      gradient: 'from-red-700/95 to-red-900/95',
      border: 'border-red-500',
      iconColor: 'text-red-100',
      barColor: 'bg-red-500',
      badgeClass: 'bg-red-900 text-red-100 animate-pulse',
      label: 'LEVEL 3',
      labelFull: 'MELTDOWN',
    },
  }[result.level as 1 | 2 | 3];

  if (!config) return null;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className={cn('bg-gradient-to-r shadow-2xl', config.gradient, result.level === 3 && 'shadow-red-900/50')}>
        <div className={cn('h-1', config.barColor, result.level >= 2 && 'animate-pulse')} />
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={result.level === 3 ? { scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] } : { scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: result.level === 3 ? 0.8 : 2 }}
              >
                <Icon className={cn('w-6 h-6', config.iconColor)} />
              </motion.div>
              <div className="flex items-center gap-2">
                <span className={cn('px-2 py-0.5 rounded font-black text-xs tracking-widest', config.badgeClass)}>
                  {config.label}
                </span>
                <span className="text-white font-bold text-sm">{config.labelFull}</span>
                <span className="text-white/70 text-xs">| {result.levelName}</span>
              </div>
              <div className="hidden md:flex items-center gap-3 ml-4">
                {result.portfolioStats.totalHoldings > 0 && (
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" />
                    {result.portfolioStats.concurrentLosers}/{result.portfolioStats.totalHoldings}
                    <span className="text-white/50">下跌</span>
                  </span>
                )}
                {result.portfolioStats.avgHoldingChange < 0 && (
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" />
                    {result.portfolioStats.avgHoldingChange.toFixed(1)}%
                    <span className="text-white/50">均值</span>
                  </span>
                )}
                <span className="text-white/60 text-xs">{result.triggers.length} 触发因子</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setExpanded(!expanded)} className="text-white/70 hover:text-white transition-colors p-1 rounded">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button onClick={onDismiss} className="text-white/50 hover:text-white transition-colors p-1 rounded" title={result.level === 3 ? "临时关闭 (60秒后自动恢复)" : "临时关闭"}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-white/90 text-xs mt-2 leading-relaxed max-w-5xl">{result.globalAdvice}</p>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <DetailPanel
              triggers={result.triggers}
              actions={result.emergencyActions}
              stats={result.portfolioStats}
              borderClass={config.border}
              direction="BEARISH"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// EUPHORIA ALERT (V62.1 — Purple/Gold theme)
// ═══════════════════════════════════════════════════════════════════

const EuphoriaAlert: React.FC<{
  result: BlackSwanResult;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  onDismiss: () => void;
}> = ({ result, expanded, setExpanded, onDismiss }) => {
  const config = {
    1: {
      icon: Flame,
      gradient: 'from-yellow-500/95 to-amber-600/95',
      border: 'border-yellow-400',
      iconColor: 'text-yellow-100',
      barColor: 'bg-yellow-400',
      badgeClass: 'bg-yellow-700 text-yellow-100',
      label: 'E1',
      labelFull: 'OVERHEAT',
    },
    2: {
      icon: Rocket,
      gradient: 'from-amber-600/95 to-purple-700/95',
      border: 'border-purple-400',
      iconColor: 'text-purple-100',
      barColor: 'bg-gradient-to-r from-amber-400 to-purple-400',
      badgeClass: 'bg-purple-800 text-purple-100',
      label: 'E2',
      labelFull: 'MANIA',
    },
    3: {
      icon: Crown,
      gradient: 'from-purple-700/95 to-fuchsia-900/95',
      border: 'border-fuchsia-500',
      iconColor: 'text-fuchsia-100',
      barColor: 'bg-gradient-to-r from-purple-500 to-fuchsia-500',
      badgeClass: 'bg-fuchsia-900 text-fuchsia-100 animate-pulse',
      label: 'E3',
      labelFull: 'BLOW-OFF TOP',
    },
  }[result.euphoriaLevel as 1 | 2 | 3];

  if (!config) return null;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className={cn('bg-gradient-to-r shadow-2xl', config.gradient, result.euphoriaLevel === 3 && 'shadow-fuchsia-900/50')}>
        <div className={cn('h-1', config.barColor, result.euphoriaLevel >= 2 && 'animate-pulse')} />
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={result.euphoriaLevel === 3
                  ? { scale: [1, 1.3, 1], y: [0, -3, 0] }
                  : { scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: result.euphoriaLevel === 3 ? 1 : 2 }}
              >
                <Icon className={cn('w-6 h-6', config.iconColor)} />
              </motion.div>
              <div className="flex items-center gap-2">
                <span className={cn('px-2 py-0.5 rounded font-black text-xs tracking-widest', config.badgeClass)}>
                  {config.label}
                </span>
                <span className="text-white font-bold text-sm">{config.labelFull}</span>
                <span className="text-white/70 text-xs">| {result.euphoriaLevelName}</span>
              </div>
              <div className="hidden md:flex items-center gap-3 ml-4">
                {result.portfolioStats.totalHoldings > 0 && (
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    +{result.portfolioStats.avgHoldingChange.toFixed(1)}%
                    <span className="text-white/50">均值</span>
                  </span>
                )}
                {result.portfolioStats.bestHoldingChange > 0 && (
                  <span className="text-white/80 text-xs flex items-center gap-1">
                    <Rocket className="w-3.5 h-3.5" />
                    {result.portfolioStats.bestHoldingName}
                    <span className="text-white/50">+{result.portfolioStats.bestHoldingChange.toFixed(1)}%</span>
                  </span>
                )}
                <span className="text-white/60 text-xs">{result.euphoriaTriggers.length} 过热因子</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setExpanded(!expanded)} className="text-white/70 hover:text-white transition-colors p-1 rounded">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button onClick={onDismiss} className="text-white/50 hover:text-white transition-colors p-1 rounded" title={result.euphoriaLevel === 3 ? "临时关闭 (60秒后自动恢复)" : "临时关闭"}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-white/90 text-xs mt-2 leading-relaxed max-w-5xl">{result.euphoriaAdvice}</p>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <DetailPanel
              triggers={result.euphoriaTriggers}
              actions={result.euphoriaActions}
              stats={result.portfolioStats}
              borderClass={config.border}
              direction="BULLISH"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// SHARED DETAIL PANEL
// ═══════════════════════════════════════════════════════════════════

const DetailPanel: React.FC<{
  triggers: BlackSwanTrigger[];
  actions: EmergencyAction[];
  stats: PortfolioStats;
  borderClass: string;
  direction: 'BEARISH' | 'BULLISH';
}> = ({ triggers, actions, stats, borderClass, direction }) => {
  const isBull = direction === 'BULLISH';
  
  return (
    <div className={cn('bg-slate-900/95 backdrop-blur-xl border-b shadow-inner', borderClass)}>
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Triggers */}
          <div>
            <h3 className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
              {isBull ? <Flame className="w-3.5 h-3.5" /> : <Siren className="w-3.5 h-3.5" />}
              {isBull ? '过热因子' : '触发因子'} ({triggers.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scroll">
              {triggers.map((trigger, idx) => (
                <TriggerCard key={trigger.id + idx} trigger={trigger} />
              ))}
            </div>
          </div>
          {/* Right: Actions */}
          <div>
            <h3 className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
              {isBull ? <Lock className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
              {isBull ? '止盈指令' : '紧急操作指令'} ({actions.length})
            </h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 custom-scroll">
              {actions.length === 0 ? (
                <p className="text-white/40 text-xs">无持仓，无需操作。</p>
              ) : (
                actions.map((action, idx) => (
                  <ActionCard key={action.stockId + idx} action={action} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Portfolio Summary Bar */}
        {stats.totalHoldings > 0 && (
          <div className="mt-4 pt-3 border-t border-white/10">
            <div className="flex flex-wrap gap-4 text-xs">
              <StatPill label="持仓数" value={`${stats.totalHoldings}`} danger={false} bullish={false} />
              {isBull ? (
                <>
                  <StatPill label="平均涨幅" value={`+${stats.avgHoldingChange.toFixed(2)}%`} danger={false} bullish={stats.avgHoldingChange > 3} />
                  <StatPill label="最佳持仓" value={`${stats.bestHoldingName} +${stats.bestHoldingChange.toFixed(1)}%`} danger={false} bullish={stats.bestHoldingChange > 8} />
                </>
              ) : (
                <>
                  <StatPill label="亏损占比" value={`${(stats.concurrentLosersRatio * 100).toFixed(0)}%`} danger={stats.concurrentLosersRatio > 0.6} bullish={false} />
                  <StatPill label="平均涨跌" value={`${stats.avgHoldingChange.toFixed(2)}%`} danger={stats.avgHoldingChange < -3} bullish={false} />
                  <StatPill label="最差持仓" value={`${stats.worstHoldingName} ${stats.worstHoldingChange.toFixed(1)}%`} danger={stats.worstHoldingChange < -5} bullish={false} />
                  {stats.leadersBroken > 0 && (
                    <StatPill label="龙头断崩" value={`${stats.leadersBroken}只`} danger={true} bullish={false} />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENTS (shared for both directions)
// ═══════════════════════════════════════════════════════════════════

const TriggerCard: React.FC<{ trigger: BlackSwanTrigger }> = ({ trigger }) => {
  const isBull = trigger.direction === 'BULLISH';

  const bearColors = {
    1: 'border-amber-500/30 bg-amber-900/20',
    2: 'border-orange-500/30 bg-orange-900/20',
    3: 'border-red-500/30 bg-red-900/20',
  };
  const bullColors = {
    1: 'border-yellow-500/30 bg-yellow-900/20',
    2: 'border-purple-500/30 bg-purple-900/20',
    3: 'border-fuchsia-500/30 bg-fuchsia-900/20',
  };
  const colors = isBull ? bullColors : bearColors;

  const bearBadge = {
    1: 'bg-amber-600/50 text-amber-200',
    2: 'bg-orange-600/50 text-orange-200',
    3: 'bg-red-600/50 text-red-200',
  };
  const bullBadge = {
    1: 'bg-yellow-600/50 text-yellow-200',
    2: 'bg-purple-600/50 text-purple-200',
    3: 'bg-fuchsia-600/50 text-fuchsia-200',
  };
  const badges = isBull ? bullBadge : bearBadge;

  const categoryIcons: Record<string, React.ReactNode> = {
    MARKET: isBull ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />,
    PORTFOLIO: <Activity className="w-3 h-3" />,
    CONTAGION: <Zap className="w-3 h-3" />,
    LIQUIDITY: isBull ? <Flame className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />,
    PATTERN: isBull ? <Crown className="w-3 h-3" /> : <Skull className="w-3 h-3" />,
  };

  return (
    <div className={cn('rounded-lg border px-3 py-2', colors[trigger.severity as 1 | 2 | 3] || colors[1])}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-white/50">{categoryIcons[trigger.category]}</span>
          <span className="text-white/90 text-xs font-semibold">{trigger.title}</span>
        </div>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold', badges[trigger.severity as 1 | 2 | 3] || badges[1])}>
          {isBull ? 'E' : 'L'}{trigger.severity}
        </span>
      </div>
      <p className="text-white/60 text-[11px] leading-relaxed">{trigger.description}</p>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-white/40 text-[10px]">实际: <span className="text-white/70 font-mono">{trigger.metric}</span></span>
        <span className="text-white/40 text-[10px]">阈值: <span className="text-white/70 font-mono">{trigger.threshold}</span></span>
      </div>
    </div>
  );
};

const ActionCard: React.FC<{ action: EmergencyAction }> = ({ action }) => {
  const actionColors: Record<string, string> = {
    EMERGENCY_SELL: 'bg-red-600/20 border-red-500/40 text-red-300',
    REDUCE_50: 'bg-orange-600/20 border-orange-500/40 text-orange-300',
    TIGHTEN_STOP: 'bg-amber-600/20 border-amber-500/40 text-amber-300',
    HOLD_CORE: 'bg-blue-600/20 border-blue-500/40 text-blue-300',
    LOCK_PROFIT: 'bg-fuchsia-600/20 border-fuchsia-500/40 text-fuchsia-300',
    TRAIL_TIGHT: 'bg-purple-600/20 border-purple-500/40 text-purple-300',
    REDUCE_WINNER: 'bg-violet-600/20 border-violet-500/40 text-violet-300',
    NO_CHASE: 'bg-yellow-600/20 border-yellow-500/40 text-yellow-300',
  };

  const actionLabels: Record<string, string> = {
    EMERGENCY_SELL: '紧急清仓',
    REDUCE_50: '减仓50%',
    TIGHTEN_STOP: '收紧止损',
    HOLD_CORE: '保留核心',
    LOCK_PROFIT: '锁定利润',
    TRAIL_TIGHT: '收紧止盈',
    REDUCE_WINNER: '止盈减仓',
    NO_CHASE: '禁止追高',
  };

  return (
    <div className={cn(
      'rounded border px-3 py-2 flex items-center justify-between gap-3',
      actionColors[action.action] || 'bg-slate-600/20 border-slate-500/40 text-slate-300'
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white/80 text-xs font-semibold truncate">{action.stockName}</span>
          <span className="text-white/40 text-[10px] font-mono">{action.stockCode}</span>
          <span className={cn('text-[10px] font-mono', action.currentChange < 0 ? 'text-red-400' : 'text-green-400')}>
            {action.currentChange > 0 ? '+' : ''}{action.currentChange.toFixed(1)}%
          </span>
        </div>
        <p className="text-white/50 text-[10px] mt-0.5 truncate">{action.reason}</p>
      </div>
      <span className={cn(
        'shrink-0 px-2 py-1 rounded text-[10px] font-bold border',
        actionColors[action.action] || 'bg-slate-600/20 border-slate-500/40 text-slate-300'
      )}>
        {actionLabels[action.action] || action.action}
      </span>
    </div>
  );
};

const StatPill: React.FC<{ label: string; value: string; danger: boolean; bullish: boolean }> = ({ label, value, danger, bullish }) => (
  <div className={cn(
    'flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
    danger ? 'border-red-500/30 bg-red-900/20' :
    bullish ? 'border-fuchsia-500/30 bg-fuchsia-900/20' :
    'border-white/10 bg-white/5'
  )}>
    <span className="text-white/40">{label}:</span>
    <span className={cn(
      'font-mono font-bold',
      danger ? 'text-red-400' : bullish ? 'text-fuchsia-400' : 'text-white/80'
    )}>
      {value}
    </span>
  </div>
);

// Re-export types for convenience
import type { PortfolioStats } from '../utils/blackSwanDetector';