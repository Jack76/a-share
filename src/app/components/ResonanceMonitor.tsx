import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { useTrading } from '../context/Store';
import { Network, Zap, TrendingUp, TrendingDown, Layers, Crown, ChevronRight, ShieldAlert } from 'lucide-react';
import { cn } from './ui/utils';

export const ResonanceMonitor: React.FC = () => {
  const { themes, marketThemes, stocks } = useTrading();
  
  // v7.2 Update: Prioritize full-market data for accuracy
  const activeThemes = ((marketThemes && marketThemes.length > 0) ? marketThemes : themes)
    .filter(t => t.name !== '自动发现' && t.name !== '自动扫描' && t.name !== 'Auto-Discovered');

  // Refined Sorting Algorithm for Mainline Confirmation
  const sortedThemes = [...activeThemes].map(theme => {
        // Try to enrich with local data if available
        // V43.0 Fix: Use fuzzy matching to catch multi-tag stocks
        const sectorStocks = stocks.filter(s => s.concept?.includes(theme.name));
        const hasLocalData = sectorStocks.length > 0;
        const localLimitUps = hasLocalData ? sectorStocks.filter(s => s.isLimitUp).length : 0;
        
        // Use max of local vs market limit ups for display
        // Note: theme.stockCount is now enriched in Store.tsx via MarketStats
        const displayLimitUps = Math.floor(Math.max(localLimitUps, theme.stockCount || 0));
        
        // Calculate dynamic strength if missing
        let calculatedStrength = theme.strength || 0;
        if (calculatedStrength === 0 && displayLimitUps > 0) {
            calculatedStrength = Math.min(99, displayLimitUps * 15);
        }

        return {
            ...theme,
            strength: calculatedStrength,
            stockCount: displayLimitUps
        };
  }).sort((a, b) => {
      // Primary Sort: Strength
      if ((b.strength || 0) !== (a.strength || 0)) return (b.strength || 0) - (a.strength || 0);
      // Secondary Sort: Limit Up Count
      return (b.stockCount || 0) - (a.stockCount || 0);
  });

  return (
    <Card className="border border-slate-200 shadow-2xl bg-white/40 backdrop-blur-xl overflow-hidden rounded-3xl group/resonance">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-red-600 group-hover/resonance:rotate-90 transition-transform duration-500" />
                板块共振监测 (Resonance Engine)
            </div>
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Cluster v8.0</span>
            </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
            {sortedThemes.slice(0, 6).map((theme, idx) => {
                const strength = theme.strength || 0;
                const isMain = theme.type === 'Main';
                const isPreLaunch = theme.type === 'PreLaunch';
                const isDecline = theme.type === 'Decline'; // New: 退潮状态
                
                // Risk Check
                // V43.0 Fix: Fuzzy Match
                const sectorStocks = stocks.filter(s => s.concept?.includes(theme.name));
                const hasNegativeContagion = sectorStocks.some(s => s.notes?.includes('负反馈') || s.notes?.includes('大面'));
                const leader = sectorStocks.find(s => s.role === 'Leader' || s.role === 'Main') 
                    || (theme.leaderName ? { name: theme.leaderName, isLimitUp: true, changePercent: 10 } as any : undefined);
                
                const isLeaderBroken = leader && !leader.isLimitUp && (leader.changePercent || 0) < -2;

                return (
                    <div key={theme.id} className="p-6 flex items-center justify-between hover:bg-slate-50/80 transition-all group/item relative">
                        {/* Contagion Indicator */}
                        {(hasNegativeContagion || isLeaderBroken || isDecline) && (
                            <div className="absolute top-0 right-0 p-2">
                                <ShieldAlert className={cn("w-3.5 h-3.5", isDecline ? "text-slate-900" : "text-red-500 animate-pulse")} />
                            </div>
                        )}
                        
                        <div className="flex items-center gap-5">
                            <div className={cn(
                                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-sm border",
                                isMain ? "bg-red-600 text-white border-red-400 shadow-red-200" : 
                                isPreLaunch ? "bg-amber-500 text-white border-amber-400 shadow-amber-200" : 
                                isDecline ? "bg-slate-800 text-white border-slate-600 shadow-slate-400" : // Decline Style
                                "bg-white text-slate-400 border-slate-100"
                            )}>
                                {idx === 0 ? <Crown className="w-6 h-6" /> : 
                                 isPreLaunch ? <Zap className="w-6 h-6 animate-pulse" /> : 
                                 isDecline ? <TrendingDown className="w-6 h-6" /> : // Decline Icon
                                 <Layers className="w-6 h-6" />}
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-1.5">
                                    <span className="text-base font-black tracking-tight text-slate-900 italic">{theme.name}</span>
                                    {isMain && (
                                        <Badge className="bg-red-50 text-red-600 border-red-100 text-[9px] font-black px-1.5 py-0">核心主轴</Badge>
                                    )}
                                    {isPreLaunch && (
                                        <Badge className="bg-amber-50 text-amber-600 border-amber-100 text-[9px] font-black px-1.5 py-0 animate-pulse">蓄势待发</Badge>
                                    )}
                                    {isDecline && (
                                        <Badge className="bg-slate-200 text-slate-700 border-slate-300 text-[9px] font-black px-1.5 py-0">退潮预警</Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <div className={cn("w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-black text-white", 
                                            isPreLaunch ? "bg-amber-500" : isDecline ? "bg-slate-700" : "bg-slate-900")}>
                                            {isPreLaunch ? '先' : isDecline ? '警' : '龙'}
                                        </div>
                                        <span className="text-[11px] font-black text-slate-600 uppercase">{theme.leaderName || '寻找中'}</span>
                                    </div>
                                    <div className="w-px h-3 bg-slate-200" />
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">梯队:</span>
                                        <span className="text-[11px] font-black text-slate-900">{theme.stockCount} 涨停</span>
                                        {isLeaderBroken && (
                                            <Badge variant="outline" className="text-[8px] font-black border-red-200 text-red-600 bg-red-50 px-1 py-0 h-3.5">龙头断板</Badge>
                                        )}
                                    </div>
                                </div>
                                {/* 显示战术文案 */}
                                {theme.logic && (
                                    <div className={cn("mt-2 text-[10px] truncate max-w-[200px] italic", 
                                        isDecline ? "text-slate-600 font-bold" : "text-slate-400")}>
                                        "{theme.logic}"
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-3">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    {isPreLaunch ? '潜伏动能' : isDecline ? '风险指数' : '共振能级'}
                                </span>
                                <span className={cn("text-xl font-black font-mono tracking-tighter italic", 
                                    isMain ? "text-red-600" : isPreLaunch ? "text-amber-500" : 
                                    isDecline ? "text-slate-800" : "text-slate-900")}>
                                    {strength.toFixed(0)}%
                                </span>
                            </div>
                            <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5 shadow-inner">
                                <div 
                                    className={cn("h-full rounded-full transition-all duration-1000", 
                                        isMain ? "bg-gradient-to-r from-red-600 to-red-400" : 
                                        isPreLaunch ? "bg-gradient-to-r from-amber-500 to-yellow-400" : 
                                        isDecline ? "bg-slate-800" : // Dark bar for decline
                                        "bg-slate-400")}
                                    style={{ width: `${strength}%` }}
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>

        {sortedThemes.length === 0 && (
             <div className="p-20 text-center flex flex-col items-center gap-4">
                <Network className="w-12 h-12 text-slate-100 animate-spin-slow" />
                <div className="space-y-1">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">同步核心板块共振中...</p>
                    <p className="text-[9px] font-medium text-slate-300 italic">正在扫描 56 个细分行业及 382 个概念题材</p>
                </div>
             </div>
        )}

        <div className="p-5 bg-slate-900 flex items-center justify-between group-hover/resonance:bg-red-950 transition-colors duration-700">
            <div className="flex items-center gap-3">
                <div className="p-1.5 bg-white/10 rounded-lg">
                    <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                        算法逻辑: 多维时空共振 (Cluster Analysis)
                    </span>
                    <span className="text-[9px] font-bold text-white/40 italic mt-0.5">
                        基于个股封单额、换手韧性及题材爆发连续性判定
                    </span>
                </div>
            </div>
            <button className="text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-2 group/btn">
                查看全景拓扑 <ChevronRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
            </button>
        </div>
      </CardContent>
    </Card>
  );
};