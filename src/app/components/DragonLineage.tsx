import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { GitBranch, Crown, Star, ArrowDownRight, Zap, Target } from 'lucide-react';
import { Stock } from '../types';
import { cn } from './ui/utils';

interface Props {
  stocks: Stock[];
}

export const DragonLineage: React.FC<Props> = ({ stocks }) => {
  // Logic: Identify Dragon (Main Leader) and Subsidiary/Follower stocks
  const lineage = React.useMemo(() => {
    // 1. Find the Absolute Leader (Highest strength score + limit up)
    const sorted = [...stocks].sort((a, b) => (b.strengthScore || 0) - (a.strengthScore || 0));
    const leader = sorted.find(s => s.isLimitUp);
    
    if (!leader) return null;

    // 2. Find Followers (Same theme, also strong or limit up)
    const followers = stocks.filter(s => 
        s.id !== leader.id && 
        s.theme && leader.theme && // Ensure both have valid themes
        s.theme === leader.theme && 
        ((s.changePercent || 0) > 3 || s.isLimitUp)
    ).sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));

    // 3. Find Subsidiary/Sub-theme Leaders (Other themes that are strong)
    const otherThemeLeaders = stocks.filter(s => 
        s.theme !== leader.theme && 
        s.isLimitUp
    ).slice(0, 2);

    return { leader, followers, otherThemeLeaders };
  }, [stocks]);

  if (!lineage) return null;

  return (
    <Card className="border border-slate-200 shadow-xl bg-white overflow-hidden rounded-[2rem]">
      <CardHeader className="pb-2 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-red-600" />
                市场龙脉谱系 (Dragon Head Lineage)
            </div>
            <Crown className="w-3.5 h-3.5 text-yellow-500" />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-col items-center">
            {/* The Dragon Head */}
            <div className="relative group mb-8">
                <div className="absolute -inset-4 bg-gradient-to-r from-red-600/20 to-orange-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex flex-col items-center">
                    <div className="p-4 rounded-full bg-red-600 shadow-2xl shadow-red-600/40 border-4 border-white mb-2">
                        <Crown className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-sm font-black text-slate-900">{lineage.leader.name}</div>
                    <div className="text-[9px] font-black text-red-600 uppercase tracking-widest bg-red-50 px-2 py-0.5 rounded-full mt-1">
                        {lineage.leader.theme || "主线核心"}
                    </div>
                </div>
            </div>

            {/* Connecting Lines (CSS based) */}
            <div className="w-px h-8 bg-slate-200 relative">
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-48 h-px bg-slate-200" />
            </div>

            {/* Followers Grid */}
            <div className="grid grid-cols-2 gap-12 mt-4">
                {/* Branch 1: The Tribe */}
                <div className="flex flex-col items-center gap-4">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <Star className="w-2.5 h-2.5" /> 板块伴随
                    </div>
                    <div className="flex flex-col gap-2">
                        {lineage.followers.slice(0, 3).map(f => (
                            <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-100 bg-slate-50 hover:border-red-200 transition-all group/item">
                                <ArrowDownRight className="w-3 h-3 text-slate-300 group-hover/item:text-red-400" />
                                <span className="text-[10px] font-black text-slate-600">{f.name}</span>
                                <span className="text-[9px] font-mono font-bold text-red-500">{(f.changePercent || 0) > 0 ? '+' : ''}{f.changePercent}%</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Branch 2: Side Themes */}
                <div className="flex flex-col items-center gap-4">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5" /> 侧翼共振
                    </div>
                    <div className="flex flex-col gap-2">
                        {lineage.otherThemeLeaders.map(l => (
                            <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-100 bg-slate-50 hover:border-blue-200 transition-all group/item">
                                <Target className="w-3 h-3 text-slate-300 group-hover/item:text-blue-400" />
                                <span className="text-[10px] font-black text-slate-600">{l.name}</span>
                                <div className="text-[8px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 uppercase">
                                    {l.theme?.slice(0, 2) || "分支"}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
        
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase italic">
            <span>Lineage Depth: 2-Tiers</span>
            <span className="text-red-600 flex items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-red-600 animate-ping" />
                共振度: 88%
            </span>
        </div>
      </CardContent>
    </Card>
  );
};
