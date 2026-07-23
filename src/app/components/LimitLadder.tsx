import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Layers, Crown, ArrowRight, Zap, Target } from 'lucide-react';
import { Stock } from '../types';
import { cn } from './ui/utils';

interface Props {
  stocks: Stock[];
  marketTemp?: number;
}

export const LimitLadder: React.FC<Props> = ({ stocks, marketTemp = 50 }) => {
  // Enhanced Logic for Tiers
  const getTierData = (stocks: Stock[]) => {
    // Current Limit Ups
    const limitUps = stocks.filter(s => s.isLimitUp);
    
    // Failed Promotions (Yesterday was X-board, today is not limit up)
    const failedPromotions = stocks.filter(s => !s.isLimitUp && s.notes?.match(/(\d+)连板/));
    
    // Sort into buckets based on notes (e.g. "3连板")
    const buckets: Record<string, { promoted: Stock[], failed: Stock[] }> = {
      'High': { promoted: [], failed: [] }, // 5+ 
      'Mid': { promoted: [], failed: [] },  // 3-4
      'Low': { promoted: [], failed: [] },  // 2
      'First': { promoted: [], failed: [] } // 1
    };

    limitUps.forEach(s => {
      const match = s.notes?.match(/(\d+)连板/);
      const count = match ? parseInt(match[1]) : 1;
      if (count >= 5) buckets['High'].promoted.push(s);
      else if (count >= 3) buckets['Mid'].promoted.push(s);
      else if (count === 2) buckets['Low'].promoted.push(s);
      else buckets['First'].promoted.push(s);
    });

    failedPromotions.forEach(s => {
      const match = s.notes?.match(/(\d+)连板/);
      const count = match ? parseInt(match[1]) : 1;
      // If it was X-board yesterday, it's a failed promotion for the next tier
      // But for simplicity in UI, we group by "yesterday's tier"
      if (count >= 5) buckets['High'].failed.push(s);
      else if (count >= 3) buckets['Mid'].failed.push(s);
      else if (count === 2) buckets['Low'].failed.push(s);
      // First board failures are not typically tracked in ladder but can be added
    });

    return [
      { tier: '5连板+', label: '空间博弈/信仰板', data: buckets['High'], color: 'bg-red-600', icon: Crown, alpha: 92 },
      { tier: '3-4连板', label: '核心中军/分歧板', data: buckets['Mid'], color: 'bg-orange-500', icon: Target, alpha: 78 },
      { tier: '2连板', label: '梯队承接/卡位板', data: buckets['Low'], color: 'bg-slate-900', icon: Zap, alpha: 45 },
      { tier: '首板', label: '先手试错/题材挖掘', data: buckets['First'], color: 'bg-slate-600', icon: Layers, alpha: 20 }
    ];
  };

  const ladder = getTierData(stocks);
  const totalLimitUps = stocks.filter(s => s.isLimitUp).length;
  
  // Health check: Are there promoted stocks in the top 2 tiers?
  const isHealthy = ladder[0].data.promoted.length > 0 && ladder[1].data.promoted.length > 0;
  
  // Promotion Rate calculation (simplified)
  const calculatePromoRate = (promoted: number, failed: number) => {
      if (promoted + failed === 0) return 0;
      return Math.round((promoted / (promoted + failed)) * 100);
  };

  return (
    <Card className="border border-slate-200 shadow-xl bg-white overflow-hidden rounded-3xl group/ladder transform-gpu">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900">
                <Layers className="w-4 h-4 text-red-600 group-hover/ladder:rotate-12 transition-transform" />
                连板梯队 & Alpha 背离 (Board Ladder v29.6)
            </div>
            <div className="flex items-center gap-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total: {totalLimitUps}</div>
                <Badge variant="outline" className="text-[9px] font-black border-red-200 text-red-600 bg-red-50 px-2 py-0.5 rounded-md">
                    WAR ROOM ENGINE
                </Badge>
            </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative">
            {/* Visual background gradient for hierarchy */}
            <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 via-orange-500 to-slate-300" />
            
            <div className="divide-y divide-slate-100">
                {ladder.map((tier, idx) => {
                    const TierIcon = tier.icon;
                    const promoRate = calculatePromoRate(tier.data.promoted.length, tier.data.failed.length);
                    const alphaValue = tier.alpha; // Alpha momentum index

                    return (
                        <div key={tier.tier} className="p-6 hover:bg-slate-50/80 transition-all flex flex-col md:flex-row md:items-center gap-6 group/tier relative">
                            {/* Failure indicator background for the tier */}
                            {promoRate < 30 && (tier.data.promoted.length + tier.data.failed.length > 0) && (
                                <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />
                            )}
                            
                            <div className="w-32 shrink-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={cn("p-1.5 rounded-lg text-white shadow-sm", tier.color)}>
                                        <TierIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="text-sm font-black text-slate-900 tabular-nums">{tier.tier}</div>
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-8">{tier.label}</div>
                                {tier.data.promoted.length + tier.data.failed.length > 0 && (
                                    <div className="ml-8 mt-2 space-y-1">
                                        <div className="text-[9px] font-bold text-slate-500">
                                            晋级率: <span className={cn(promoRate > 50 ? "text-green-600" : "text-red-600")}>{promoRate}%</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[8px] font-black text-slate-400 uppercase">Alpha:</span>
                                            <div className="h-1 w-12 bg-slate-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-red-500" style={{ width: `${alphaValue}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex-1 flex flex-wrap gap-2.5">
                                {/* Promoted Stocks */}
                                {tier.data.promoted.map(stock => (
                                    <div key={stock.id} className="relative group/stock">
                                        <div className={cn(
                                            "flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden",
                                            idx === 0 ? "bg-red-50 border-red-200 text-red-700" : 
                                            idx === 1 ? "bg-orange-50 border-orange-200 text-orange-700" : 
                                            "bg-white border-slate-200 text-slate-900 group-hover/stock:border-blue-400"
                                        )}>
                                            {/* Energy Pulse Background */}
                                            {idx === 0 && <div className="absolute inset-0 bg-red-600/5 animate-pulse" />}
                                            
                                            <div className="relative z-10 flex items-center gap-2">
                                                <span className="text-xs font-black tracking-tight">{stock.name}</span>
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black opacity-40 uppercase tracking-tighter leading-none">
                                                        {stock.theme?.slice(0, 4) || "题材扫描"}
                                                    </span>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <span className="text-[9px] font-mono font-bold opacity-60">+{stock.changePercent}%</span>
                                                        <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", 
                                                            idx === 0 ? "bg-red-500" : "bg-green-500")} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Hover Tooltip (Simulated) */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-slate-900 text-white rounded-2xl opacity-0 group-hover/stock:opacity-100 transition-opacity z-50 pointer-events-none shadow-2xl border border-white/10">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">量价质量</span>
                                                <span className="text-xs font-black text-red-400">{stock.moneyQualityScore?.toFixed(0) || '--'}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 mb-2">
                                                <div className="bg-white/5 p-1 rounded-lg">
                                                    <div className="text-[7px] text-white/30 uppercase font-black">分时能量</div>
                                                    <div className="text-[9px] font-black text-white">{(stock.volumeRatio || 1.2).toFixed(1)}x</div>
                                                </div>
                                                <div className="bg-white/5 p-1 rounded-lg">
                                                    <div className="text-[7px] text-white/30 uppercase font-black">换手博弈</div>
                                                    <div className="text-[9px] font-black text-white">{(stock.turnoverRate || 5.2).toFixed(1)}%</div>
                                                </div>
                                            </div>
                                            <p className="text-[8px] font-medium leading-relaxed italic text-slate-400 border-t border-white/5 pt-2">
                                                {stock.notes || "封板坚决，具备较强溢价预期，关注次日竞价强度。"}
                                            </p>
                                        </div>
                                    </div>
                                ))}

                                {/* Failed Stocks (Small/Ghostly) */}
                                {tier.data.failed.map(stock => (
                                    <div key={`fail-${stock.id}`} className="flex items-center gap-2 px-3 py-1.5 rounded-2xl border border-slate-200 bg-slate-50 opacity-40 hover:opacity-100 transition-opacity grayscale hover:grayscale-0 cursor-default">
                                        <span className="text-[10px] font-bold text-slate-400">{stock.name}</span>
                                        <span className="text-[8px] font-mono text-slate-400">{stock.changePercent}%</span>
                                        <Badge variant="outline" className="text-[7px] h-3 px-1 border-slate-200 text-slate-300">断板</Badge>
                                    </div>
                                ))}

                                {tier.data.promoted.length === 0 && tier.data.failed.length === 0 && (
                                    <div className="flex items-center gap-3 py-2 px-4 rounded-2xl bg-slate-100/50 border border-slate-200/50 border-dashed">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">该梯队出现断层 (Gap Detected)</span>
                                    </div>
                                )}
                            </div>

                            {idx < ladder.length - 1 && tier.data.promoted.length > 0 && (
                                <div className="hidden lg:flex items-center justify-center p-2 rounded-full bg-slate-50 text-slate-300 group-hover/tier:text-slate-900 group-hover/tier:translate-x-1 transition-all">
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
      </CardContent>
      <div className="p-5 bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-4">
              <div className={cn("p-1.5 rounded-lg", isHealthy ? "bg-green-500/20" : "bg-red-500/20")}>
                  <Zap className={cn("w-4 h-4", isHealthy ? "text-green-400" : "text-red-400")} />
              </div>
              <div className="flex flex-col">
                  <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                      天梯健康度: {isHealthy ? '良好 - 梯队完整' : '警戒 - 出现断层'}
                  </span>
                  <span className="text-[9px] font-bold text-white/40 italic mt-0.5">
                      {isHealthy ? '核心主轴情绪共振中，容错率较高' : '高位个股孤掌难鸣，谨防情绪性跳水'}
                  </span>
              </div>
          </div>
          <button className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 transition-all">
              同步全场数据
          </button>
      </div>
    </Card>
  );
};
