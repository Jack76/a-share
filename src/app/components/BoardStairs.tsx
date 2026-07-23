import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Stock } from '../types';
import { Layers, ChevronRight, TrendingUp, AlertCircle } from 'lucide-react';
import { cn } from './ui/utils';

interface Props {
  stocks: Stock[];
}

export const BoardStairs: React.FC<Props> = ({ stocks }) => {
  // Group stocks by their limit-up height
  // Priority: consecutiveLimitUps > notes parsing > isLimitUp default
  const getBoardHeight = (stock: Stock) => {
    if (stock.consecutiveLimitUps && stock.consecutiveLimitUps > 0) return stock.consecutiveLimitUps;
    
    const match = stock.notes?.match(/(\d+)连板/);
    if (match) return parseInt(match[1]);
    
    if (stock.isLimitUp) return 1;
    return 0;
  };

  const limitUpStocks = stocks.filter(s => getBoardHeight(s) > 0 && (s.isLimitUp || s.changePercent! > 9));

  const stairs: Record<number, Stock[]> = {};
  limitUpStocks.forEach(s => {
    const h = getBoardHeight(s);
    if (h > 0) {
      if (!stairs[h]) stairs[h] = [];
      stairs[h].push(s);
    }
  });

  const sortedHeights = Object.keys(stairs)
    .map(Number)
    .sort((a, b) => b - a);

  if (sortedHeights.length === 0) {
    return (
      <Card className="border-dashed border-2 bg-muted/5 min-h-[200px] flex items-center justify-center">
        <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
            <Layers className="w-8 h-8 opacity-20" />
            <p className="text-xs font-bold uppercase tracking-widest">暂无连板数据 (No Limit-Up Chains)</p>
            <p className="text-[10px] opacity-50">Waiting for market data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm bg-card overflow-hidden">
      <CardHeader className="pb-2 border-b border-border/10 bg-muted/20">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-orange-500" />
            连板梯队分布 (Board Stairs)
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter">
            {limitUpStocks.length} Active Limit-Ups
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/10">
          {sortedHeights.map((h) => (
            <div key={h} className="p-4 flex items-start gap-4 hover:bg-muted/5 transition-colors">
              <div className="flex-shrink-0 w-16 flex flex-col items-center justify-center">
                <div className={cn("text-2xl font-black tracking-tighter italic", 
                    h >= 5 ? "text-red-600" : h >= 3 ? "text-orange-500" : "text-slate-400")}>
                    {h} <span className="text-[10px] font-bold not-italic">板</span>
                </div>
                {h === sortedHeights[0] && (
                    <Badge className="mt-1 bg-red-600 text-[8px] h-3.5 px-1 font-bold animate-pulse border-none">
                        空间板
                    </Badge>
                )}
              </div>
              <div className="flex-1 flex flex-wrap gap-2 pt-1">
                {stairs[h].map(s => (
                  <div key={s.id} className="group relative">
                    <Badge variant="outline" className={cn("pl-2 pr-1 py-1 font-bold text-xs gap-2 border-border/50 bg-background hover:border-primary/50 transition-all",
                        s.role === 'Leader' ? "border-red-200 bg-red-50/30 text-red-700" : "")}>
                      {s.name}
                      <span className="text-[10px] text-muted-foreground font-mono">{s.code}</span>
                      {s.alerts?.includes('broken') && (
                          <AlertCircle className="w-3 h-3 text-orange-500 animate-pulse" />
                      )}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <div className="p-3 bg-muted/10 border-t border-border/10 text-[9px] text-muted-foreground flex justify-between items-center font-bold uppercase tracking-widest px-6">
          <span>梯队断层分析: {sortedHeights.length < 3 ? '风险较大 (Gap Detected)' : '梯队完整 (Stable)'}</span>
          <TrendingUp className="w-3 h-3 opacity-50" />
      </div>
    </Card>
  );
};
