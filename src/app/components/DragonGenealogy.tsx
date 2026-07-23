import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { GitBranch, Crown, Star, ArrowDownRight, Zap, Target } from 'lucide-react';
import { Stock, Theme } from '../types';
import { cn } from './ui/utils';

interface Props {
  theme: Theme;
  stocks: Stock[];
}

export const DragonGenealogy: React.FC<Props> = ({ theme, stocks }) => {
  const sectorStocks = stocks.filter(s => s.concept && (s.concept.includes(theme.name) || theme.name.includes(s.concept)));
  
  // 1. Find Space Dragon (The absolute leader in terms of height)
  const spaceDragon = sectorStocks.find(s => s.role === 'Leader') || sectorStocks.sort((a,b) => (b.changePercent || 0) - (a.changePercent || 0))[0];
  
  // 2. Find Substitute Dragon (補漲龍) - Usually low height but strong limit up when leader is peaking/stalling
  const substituteDragon = sectorStocks.find(s => s.role === 'Substitute');
  
  // 3. Followers (excluding dragons)
  const followers = sectorStocks.filter(s => s.id !== spaceDragon?.id && s.id !== substituteDragon?.id).slice(0, 4);

  if (!spaceDragon) return null;

  return (
    <Card className="border border-slate-200 shadow-xl bg-white overflow-hidden rounded-[2rem] h-full">
      <CardHeader className="pb-2 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-red-600" />
                板块龙头谱系 (Sector Genealogy)
            </div>
            <Badge variant="outline" className="text-[9px] font-mono border-slate-200">{theme.name}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-col items-center">
            {/* The Dragon Head (Space Dragon) */}
            <div className="relative group mb-8">
                <div className="absolute -inset-4 bg-gradient-to-r from-red-600/20 to-orange-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex flex-col items-center">
                    <div className="p-4 rounded-full bg-red-600 shadow-2xl shadow-red-600/40 border-4 border-white mb-2 transform transition-transform group-hover:scale-110 duration-300">
                        <Crown className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-sm font-black text-slate-900">{spaceDragon.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="text-[9px] font-black text-red-600 uppercase tracking-widest bg-red-50 px-2 py-0.5 rounded-full">
                            Space Dragon
                        </div>
                        <span className={cn("text-[9px] font-mono font-bold", (spaceDragon.changePercent || 0) < 0 ? "text-green-600" : "text-red-600")}>{(spaceDragon.changePercent || 0) > 0 ? '+' : ''}{spaceDragon.changePercent}%</span>
                    </div>
                </div>
            </div>

            {/* Connecting Lines (CSS based) */}
            <div className="w-px h-8 bg-slate-200 relative">
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-48 h-px bg-slate-200" />
            </div>

            {/* Branches Grid */}
            <div className="grid grid-cols-2 gap-8 mt-4 w-full">
                {/* Branch 1: Followers (The Tribe) */}
                <div className="flex flex-col items-center gap-4">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <Star className="w-2.5 h-2.5" /> 板块伴随
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                        {followers.map(f => (
                            <div key={f.id} className="flex items-center justify-between px-3 py-1.5 rounded-xl border border-slate-100 bg-slate-50 hover:border-red-200 transition-all group/item w-full">
                                <div className="flex items-center gap-2">
                                    <ArrowDownRight className="w-3 h-3 text-slate-300 group-hover/item:text-red-400" />
                                    <span className="text-[10px] font-black text-slate-600">{f.name}</span>
                                </div>
                                <span className={cn("text-[9px] font-mono font-bold", (f.changePercent || 0) < 0 ? "text-green-600" : "text-red-500")}>{(f.changePercent || 0) > 0 ? '+' : ''}{f.changePercent}%</span>
                            </div>
                        ))}
                        {followers.length === 0 && (
                             <div className="text-[9px] text-slate-300 text-center italic py-2">无明显跟风</div>
                        )}
                    </div>
                </div>

                {/* Branch 2: Substitute Dragon (The Vice) */}
                <div className="flex flex-col items-center gap-4">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5" /> 核心补涨
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                        {substituteDragon ? (
                             <div className="flex flex-col gap-2 w-full">
                                <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-purple-100 bg-purple-50/50 hover:border-purple-200 transition-all group/item w-full shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <Target className="w-3 h-3 text-purple-400 group-hover/item:text-purple-600" />
                                        <span className="text-[10px] font-black text-slate-700">{substituteDragon.name}</span>
                                    </div>
                                    <span className={cn("text-[9px] font-mono font-bold", (substituteDragon.changePercent || 0) < 0 ? "text-green-600" : "text-purple-600")}>{(substituteDragon.changePercent || 0) > 0 ? '+' : ''}{substituteDragon.changePercent}%</span>
                                </div>
                                <div className="text-[8px] text-purple-400/80 text-center font-bold px-2">
                                    "高低切换首选"
                                </div>
                             </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center p-3 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 w-full h-full min-h-[50px]">
                                <div className="text-[8px] text-slate-300 font-bold uppercase tracking-widest">寻找补涨中...</div>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-[9px] font-black text-slate-400 uppercase italic">
            <span>Structure: 1+N Model</span>
            <span className={cn("flex items-center gap-1", spaceDragon.isLimitUp ? "text-red-600" : "text-slate-400")}>
                <div className={cn("w-1 h-1 rounded-full animate-ping", spaceDragon.isLimitUp ? "bg-red-600" : "bg-slate-400")} />
                Strength: {spaceDragon.strengthScore || 50}
            </span>
        </div>
      </CardContent>
    </Card>
  );
};