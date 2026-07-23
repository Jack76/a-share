import React from 'react';
import { Stock } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Skull, TrendingDown, AlertOctagon, ArrowDown, Sparkles, Gem, Activity } from 'lucide-react';
import { cn } from './ui/utils';
import { assessCapitalFlow } from '../utils/capitalFlow';
import { isActionableBullishPrediction } from '../utils/predictionCalibration';

interface Props {
  stocks: Stock[];
  onSelect?: (stock: Stock) => void;
}

export const BigDropList: React.FC<Props> = React.memo(({ stocks, onSelect }) => {
  // Filter for stocks with significant drops (e.g. < -3%) or Limit Down
  // Only show stocks that are part of the Dragon Pool (Manually Added / Core)
  const dropStocks = stocks
    .filter(s => {
       const isAutoDiscovered = s.tags?.includes('Auto-Discovered') || s.concept === '自动发现' || s.concept === '自动扫描';
       const isBigDrop = (s.changePercent || 0) < -3 || s.isLimitDown; // Relaxed to -3% to catch dips
       return isBigDrop && !isAutoDiscovered;
    })
    .sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0))
    .slice(0, 6); // Show top 6

  // Helper: Detect "Golden Pit" (Left-Side Buy Opportunity)
  const isGoldenPit = (stock: Stock) => {
      // 1. Must be Important (Leader/Vice/Main)
      const isCore = ['Leader', 'Vice', 'Main'].includes(stock.role);
      
      // 2. Trend Protection (Optional check if tech exists)
      // Assuming trend is generally up if it's a Leader
      
      // 3. Divergence must be supported by a vendor-reported large-order inflow.
      const capitalFlow = assessCapitalFlow(stock);
      const isMoneyIn =
        capitalFlow.signal === 'DIRECT_INFLOW' ||
        capitalFlow.signal === 'CONFIRMED_INFLOW';
      
      // 4. Shrinking Volume (Turnover < 10% for a Leader is considered 'locking')
      const isShrinking = (stock.turnoverRate || 0) < 15 && (stock.turnoverRate || 0) > 0;
      
      const hasEvidence = isActionableBullishPrediction(stock.aiPrediction?.prediction);
      return isCore && isMoneyIn && isShrinking && hasEvidence && !stock.isLimitDown;
  };

  const hasGoldenPit = dropStocks.some(s => isGoldenPit(s));

  return (
    <Card className="border border-slate-200 shadow-xl bg-white/40 backdrop-blur-xl overflow-hidden rounded-3xl group/abyss h-full flex flex-col">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50 shrink-0">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            {hasGoldenPit ? (
                <Gem className="w-4 h-4 text-amber-500 animate-pulse" />
            ) : (
                <Skull className="w-4 h-4 text-green-700 group-hover/abyss:scale-110 transition-transform" />
            )}
            <span className="font-black italic">
                {hasGoldenPit ? '低吸博弈 (Dragon Back)' : '大面核按钮 (Big Noodles)'}
            </span>
          </div>
          <Badge variant="outline" className={cn("text-[9px] font-mono px-2 py-0.5 rounded-full border-none", 
              hasGoldenPit ? "bg-amber-100 text-amber-700" : "bg-green-50 text-green-700")}>
             {hasGoldenPit ? 'OPPORTUNITY' : `WORST ${dropStocks.length}`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto no-scrollbar">
        <div className="divide-y divide-slate-100">
            {dropStocks.length > 0 ? dropStocks.map(stock => {
                const isPit = isGoldenPit(stock);
                return (
                    <div key={stock.id} className={cn("p-4 transition-all cursor-pointer flex items-center justify-between group/item", 
                        isPit ? "hover:bg-amber-50/50 bg-amber-50/10" : "hover:bg-green-50/30")} 
                        onClick={() => onSelect?.(stock)}>
                        
                        <div className="flex items-center gap-3">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border font-bold text-xs transition-colors",
                                isPit ? "bg-amber-100 border-amber-200 text-amber-700" : "bg-slate-100 border-slate-200 text-slate-400 group-hover/item:bg-green-100 group-hover/item:text-green-700")}>
                                {stock.changePercent?.toFixed(0)}%
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-black text-slate-900">{stock.name}</h4>
                                    {stock.isLimitDown && <Badge className="h-3 px-1 text-[7px] bg-green-600 hover:bg-green-700 text-white border-none">跌停</Badge>}
                                    {isPit && <Badge className="h-3 px-1 text-[7px] bg-amber-500 hover:bg-amber-600 text-white border-none flex items-center"><Sparkles className="w-2 h-2 mr-0.5" />黄金坑</Badge>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-mono text-slate-400">{stock.code}</span>
                                    {isPit && (
                                        <span className="text-[8px] font-bold text-amber-600 bg-amber-50 px-1 rounded scale-90 origin-left">
                                            大单净流入 · 证据通过
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className="text-right">
                            <div className={cn("text-sm font-black font-mono flex items-center justify-end gap-1", 
                                isPit ? "text-amber-600" : "text-green-600")}>
                                {stock.changePercent?.toFixed(2)}%
                                <ArrowDown className="w-3 h-3" />
                            </div>
                            <div className="text-[8px] font-bold text-slate-400 uppercase">
                                {stock.turnoverRate && stock.turnoverRate > 15 ? '放量' : '缩量'}
                            </div>
                        </div>
                    </div>
                );
            }) : (
                <div className="p-8 text-center flex flex-col items-center gap-2">
                    <TrendingDown className="w-8 h-8 text-slate-200" />
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">今日暂无核按钮</p>
                </div>
            )}
        </div>
      </CardContent>
      {dropStocks.length > 0 && (
          <div className={cn("p-3 border-t text-center shrink-0", 
              hasGoldenPit ? "bg-amber-50/50 border-amber-100" : "bg-slate-50 border-slate-100")}>
              <span className={cn("text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2",
                  hasGoldenPit ? "text-amber-600" : "text-slate-400")}>
                  {hasGoldenPit ? (
                      <><Activity className="w-3 h-3 animate-pulse" /> 发现左侧博弈机会</>
                  ) : (
                      <><AlertOctagon className="w-3 h-3" /> 切勿轻易抄底</>
                  )}
              </span>
          </div>
      )}
    </Card>
  );
});
