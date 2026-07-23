import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { 
    Activity, 
    ShieldCheck, 
    TrendingUp, 
    TrendingDown, 
    AlertCircle, 
    BarChart, 
    Zap,
    Scale,
    Target,
    ShieldAlert,
    Rocket,
    Flame,
    TriangleAlert
} from 'lucide-react';
import { DailyMetrics, MarketPhase } from '../types';
import { useTrading } from '../context/Store';
import { cn } from './ui/utils';
import { calculateTacticalMatrix, calculateMarketEntropy, TacticalDecision } from '../utils/scoring';

interface Props {
  metrics: DailyMetrics;
  phase: MarketPhase;
}

export const TacticalMatrix: React.FC<Props> = ({ metrics, phase }) => {
  const { stocks, themes } = useTrading();
  
  // 1. Calculate Context Data
  const entropy = useMemo(() => calculateMarketEntropy(stocks), [stocks]);
  
  const trapContext = useMemo(() => {
      const highRiskStocks = stocks.filter(s => (s.trapRiskScore || 0) > 60);
      const criticalRiskStocks = stocks.filter(s => (s.trapRiskScore || 0) > 80);
      
      let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
      if (criticalRiskStocks.length > 3) riskLevel = 'Critical';
      else if (highRiskStocks.length > 8) riskLevel = 'High';
      else if (highRiskStocks.length > 3) riskLevel = 'Medium';
      
      return {
          riskLevel,
          riskCount: highRiskStocks.length
      };
  }, [stocks]);

  const resonanceContext = useMemo(() => {
      const mainThemes = themes.filter(t => t.type === 'Main');
      const strongest = Math.max(...themes.map(t => t.strength || 0), 0);
      
      return {
          mainThemeCount: mainThemes.length,
          strongestThemeScore: strongest
      };
  }, [themes]);

  // 2. Compute Tactical Decision (Centralized Logic v41.2)
  const decision = useMemo(() => calculateTacticalMatrix(
      phase,
      metrics.marketTemp || 50,
      entropy,
      metrics,
      trapContext,
      resonanceContext
  ), [phase, metrics, entropy, trapContext, resonanceContext]);

  // 3. Map Decision to UI
  const uiConfig = useMemo(() => {
      switch (decision.mode) {
          case 'Attack':
              return {
                  title: '进攻模式 (Attack)',
                  icon: <Zap className="w-6 h-6 text-rose-600" />,
                  color: 'from-rose-500 to-rose-700',
                  riskClass: 'bg-rose-600 text-white'
              };
          case 'Defend':
              return {
                  title: '防守模式 (Defend)',
                  icon: <ShieldCheck className="w-6 h-6 text-indigo-600" />,
                  color: 'from-indigo-500 to-indigo-700',
                  riskClass: 'bg-indigo-600 text-white'
              };
          case 'Retreat':
              return {
                  title: '撤退模式 (Retreat)',
                  icon: <TrendingDown className="w-6 h-6 text-slate-600" />,
                  color: 'from-slate-600 to-slate-800',
                  riskClass: 'bg-slate-900 text-white'
              };
          case 'Observe':
          default:
              return {
                  title: '观察模式 (Observe)',
                  icon: <AlertCircle className="w-6 h-6 text-amber-600" />,
                  color: 'from-amber-500 to-amber-700',
                  riskClass: 'bg-amber-600 text-white'
              };
      }
  }, [decision.mode]);

  const hasWeakToStrong = stocks.some(s => s.aiPrediction?.summary.includes('弱转强'));
  const divergence = metrics.divergenceIndex || 0;

  return (
    <Card className="border border-slate-200 shadow-2xl bg-white/40 backdrop-blur-xl overflow-hidden rounded-3xl group/matrix">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <BarChart className="w-4 h-4 text-red-600 group-hover/matrix:scale-110 transition-transform" />
            战术决策矩阵 (War Room Matrix)
          </div>
          <Badge className={cn("px-2 py-0.5 text-[9px] font-black uppercase tracking-widest border-none shadow-sm", uiConfig.riskClass)}>
            MODE: {decision.mode.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex items-start gap-6 mb-8 p-4 rounded-2xl bg-white shadow-sm border border-slate-100">
            <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shrink-0 bg-gradient-to-br text-white", uiConfig.color)}>
                {uiConfig.icon}
            </div>
            <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xl font-black text-slate-900 italic tracking-tight">{uiConfig.title}</h4>
                    <span className="text-[10px] font-black text-slate-300 uppercase">Algo v41.2</span>
                </div>
                <p className="text-xs text-slate-500 font-semibold leading-relaxed mb-4 italic">
                    " {decision.warningSignal} "
                </p>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="flex items-center gap-1 text-[9px] font-black border-slate-200 text-slate-500 bg-slate-50 uppercase tracking-widest">
                        <Target className="w-3 h-3" /> 聚焦: {decision.tacticalFocus}
                    </Badge>
                    {resonanceContext.mainThemeCount > 0 && (
                        <Badge className="flex items-center gap-1 bg-rose-500 text-white border-none text-[9px] font-black uppercase tracking-widest animate-pulse">
                            <Flame className="w-3 h-3" /> 题材共振强化
                        </Badge>
                    )}
                    {trapContext.riskLevel !== 'Low' && (
                         <Badge className="flex items-center gap-1 bg-red-600 text-white border-none text-[9px] font-black uppercase tracking-widest">
                            <TriangleAlert className="w-3 h-3" /> 诱多风险: {trapContext.riskLevel}
                        </Badge>
                    )}
                </div>
            </div>
        </div>

        {/* Dynamic Situation Alerts */}
        {(hasWeakToStrong || trapContext.riskLevel === 'Critical') && (
            <div className="mb-8 space-y-3">
                {hasWeakToStrong && decision.mode === 'Attack' && (
                    <div className="p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-center gap-3">
                        <Rocket className="w-4 h-4 text-orange-600" />
                        <span className="text-[10px] font-black text-orange-800 uppercase leading-none">
                            战术提示：检测到分歧转一致信号，关注龙头二次加速机会。
                        </span>
                    </div>
                )}
                {trapContext.riskLevel === 'Critical' && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
                        <ShieldAlert className="w-4 h-4 text-red-600" />
                        <span className="text-[10px] font-black text-red-800 uppercase leading-none">
                            TrapGuard 红色警报：全市场诱多信号爆发，建议立即防守。
                        </span>
                    </div>
                )}
            </div>
        )}

        <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-xl group/item">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">背离指数</span>
                    <TrendingUp className={cn("w-3.5 h-3.5", divergence > 5 ? "text-red-500" : divergence < -5 ? "text-emerald-500" : "text-slate-700")} />
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                    <div className={cn("text-3xl font-black font-mono tracking-tighter italic", 
                        divergence > 5 ? "text-red-500" : (divergence < -5 ? "text-emerald-500" : "text-white"))}>
                        {divergence > 0 ? '+' : ''}{divergence}
                    </div>
                    <span className="text-[10px] font-black text-white/20 uppercase">Units</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                        className={cn("h-full transition-all duration-1000", divergence > 0 ? "bg-red-500" : "bg-emerald-500")}
                        style={{ width: `${Math.min(100, Math.abs(divergence) * 4)}%` }}
                    />
                </div>
                <div className="text-[8px] font-bold text-white/40 mt-3 uppercase tracking-tighter">
                    {entropy > 70 ? '市场极度混沌 (High Entropy)' : '市场秩序井然 (Low Entropy)'}
                </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm group/item">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">建议仓位</span>
                    <Scale className="w-3.5 h-3.5 text-slate-300" />
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                    <div className="text-3xl font-black font-mono tracking-tighter text-red-600 italic">
                        {decision.positionLimit}%
                    </div>
                </div>
                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-red-600 transition-all duration-1000"
                        style={{ width: `${decision.positionLimit}%` }}
                    />
                </div>
                <div className="text-[8px] font-black text-slate-400 mt-3 uppercase tracking-tighter italic">
                    根据「四维空间」自动匹配的最佳博弈权重
                </div>
            </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Quantum Strategic Engine v41.2 Active</span>
            </div>
            <button className="px-4 py-2 rounded-xl bg-slate-50 text-[10px] font-black text-slate-900 uppercase tracking-widest hover:bg-slate-100 border border-slate-200 transition-all">
                导出指令集
            </button>
        </div>
      </CardContent>
    </Card>
  );
};