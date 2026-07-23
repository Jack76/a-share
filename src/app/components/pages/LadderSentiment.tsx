import React, { useMemo } from 'react';
import { useTrading } from '../../context/Store';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { cn } from '../ui/utils';
import { Stock } from '../../types';
import { Layers, Activity, TrendingUp, AlertTriangle, Battery, BatteryCharging, Zap, BarChart3, ArrowUpRight } from 'lucide-react';

interface LadderSentimentProps {
  stocks: Stock[];
}

interface LadderGroup {
  height: string;     // e.g. "3板+", "2板", "首板"
  count: number;
  limitUpCount: number;
  avgChange: number;
  avgTurnover: number;
  sentimentScore: number; // 0-100
  riskLevel: 'Low' | 'Medium' | 'High' | 'Extreme';
}

export const LadderSentiment: React.FC<LadderSentimentProps> = ({ stocks }) => {
  const { marketIndices, phase, indexTechnicals } = useTrading();
  
  const ladderGroups = useMemo(() => {
    // 1. Group Stocks by Height
    const groups = {
      'high': [] as Stock[], // 3板+
      '2board': [] as Stock[],
      '1board': [] as Stock[],
      'trend': [] as Stock[], // 趋势核心
    };

    stocks.forEach(stock => {
      const notes = stock.notes || '';
      const consecutive = stock.consecutiveLimitUps || 0;
      
      // Extract height from notes if available (e.g. "3连板")
      const match = notes.match(/(\d+)连板/);
      const height = match ? parseInt(match[1]) : (consecutive > 0 ? consecutive : 0);
      
      if (height >= 3) {
        groups['high'].push(stock);
      } else if (height === 2) {
        groups['2board'].push(stock);
      } else if (stock.isLimitUp && height <= 1) {
        groups['1board'].push(stock);
      } else {
        // Only count positive trend stocks as "Trend Core" to avoid noise
        if ((stock.changePercent || 0) > 0) {
            groups['trend'].push(stock);
        }
      }
    });

    // 2. Calculate Metrics for each group
    const calcMetrics = (list: Stock[], label: string): LadderGroup => {
       if (list.length === 0) return {
           height: label, count: 0, limitUpCount: 0, avgChange: 0, avgTurnover: 0, sentimentScore: 0, riskLevel: 'Low'
       };

       const count = list.length;
       const limitUps = list.filter(s => s.isLimitUp).length;
       const totalChange = list.reduce((sum, s) => sum + (s.changePercent || 0), 0);
       const totalTurnover = list.reduce((sum, s) => sum + (s.turnoverRate || 0), 0);
       
       const avgChange = totalChange / count;
       const avgTurnover = totalTurnover / count;
       
       // Sentiment Score Calculation (T+1 Focus)
       // Base: Avg Change * 5 + LimitUp Ratio * 50
       let score = (avgChange * 5) + ((limitUps / count) * 50);
       
       // Turnover Penalty: If turnover is too high (>20%), sentiment is risky
       if (avgTurnover > 20) score -= 10;
       
       score = Math.min(100, Math.max(0, score));
       
       let risk: any = 'Low';
       if (score < 40) risk = 'High';
       else if (avgTurnover > 25) risk = 'Extreme';
       else if (score < 60) risk = 'Medium';

       return {
           height: label,
           count,
           limitUpCount: limitUps,
           avgChange,
           avgTurnover,
           sentimentScore: score,
           riskLevel: risk
       };
    };

    return [
        calcMetrics(groups['high'], '高标 (3板+)'),
        calcMetrics(groups['2board'], '晋级 (2板)'),
        calcMetrics(groups['1board'], '首板挖掘'),
        // calcMetrics(groups['trend'], '趋势容量'), // Optional
    ];

  }, [stocks]);

  // V16.1: Calculate "Market Core Index" (Proxy for Market Mood)
  // Based on the performance of "Main" (Capacity) stocks
  const marketMood = useMemo(() => {
      const mainStocks = stocks.filter(s => s.role === 'Main' || s.marketValue && s.marketValue > 300); // Main or Large Cap
      if (mainStocks.length === 0) return { label: '中性', color: 'text-slate-500', bg: 'bg-slate-100' };
      
      const avgChange = mainStocks.reduce((sum, s) => sum + (s.changePercent || 0), 0) / mainStocks.length;
      
      if (avgChange > 1.5) return { label: '🔥 核心进攻', color: 'text-red-600', bg: 'bg-red-50' };
      if (avgChange > 0) return { label: '📈 震荡偏多', color: 'text-red-400', bg: 'bg-red-50/50' };
      if (avgChange < -1.5) return { label: '❄️ 核心退潮', color: 'text-green-600', bg: 'bg-green-50' };
      return { label: '📉 震荡偏空', color: 'text-green-500', bg: 'bg-green-50/50' };
  }, [stocks]);

  // V16.2: Global Index Guidance (SHBS)
  // "If overall trend is strengthening, pullback is opportunity"
  const indexGuidance = useMemo(() => {
      const shIndex = marketIndices.find(i => i.code.includes('000001') || i.name.includes('上证'));
      const change = shIndex?.changePercent || 0;
      
      // Technical Analysis from V16.2
      const techBull = indexTechnicals?.isBull; // Price > MA20
      const techStrong = indexTechnicals?.isStrong; // Price > MA5

      // Strong Logic: Index > 0.3% OR Phase is strong OR Tech is Strong
      const isStrong = techStrong || change > 0.3 || phase === 'Climax' || phase === 'Startup';
      const isWeak = change < -0.5 || phase === 'Ebb'; // Ebb phase always risky
      
      if (isStrong) return {
          text: techBull ? "趋势主升：回调即买点 (BULL TREND)" : "大盘趋强：回调即买点 (BUY DIP)",
          sub: techBull ? "指数站稳 MA20 趋势向上。良性回踩是绝佳机会。" : "指数短期强势。分歧是加仓机会，切勿踏空。",
          color: "text-red-700",
          bg: "bg-gradient-to-r from-red-50 to-white",
          border: "border-red-100",
          icon: <TrendingUp className="w-3.5 h-3.5 text-red-600" />
      };
      
      if (isWeak) return {
          text: "大盘走弱：防守优先 (DEFENSE)",
          sub: "指数破位或退潮期。覆巢之下无完卵，严控仓位。",
          color: "text-green-700",
          bg: "bg-gradient-to-r from-green-50 to-white",
          border: "border-green-100",
          icon: <AlertTriangle className="w-3.5 h-3.5 text-green-600" />
      };
      
      return {
          text: "大盘震荡：重个股轻指数 (BALANCE)",
          sub: "指数窄幅波动。轻指数重个股，关注结构性机会。",
          color: "text-slate-700",
          bg: "bg-gradient-to-r from-slate-50 to-white",
          border: "border-slate-100",
          icon: <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
      };
  }, [marketIndices, phase]);

  return (
    <div className="mb-6 space-y-4">
        {/* V16.2 New Global Index Monitor */}
        <div className={cn("flex items-center justify-between p-3 rounded-2xl border shadow-sm", indexGuidance.bg, indexGuidance.border)}>
            <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-xl bg-white shadow-sm border", indexGuidance.border)}>
                    {indexGuidance.icon}
                </div>
                <div>
                    <div className={cn("text-xs font-black uppercase tracking-widest", indexGuidance.color)}>
                        {indexGuidance.text}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {indexGuidance.sub}
                    </div>
                </div>
            </div>
            <div className="text-right hidden sm:block">
                 <Badge variant="outline" className="bg-white/50 backdrop-blur text-[9px] text-slate-400 font-mono">
                    SH.000001
                 </Badge>
            </div>
        </div>

        <div>
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        核心梯队情绪 (CORE SENTIMENT)
                    </h3>
                    <Badge variant="outline" className="text-[9px] text-slate-400 border-slate-200 h-4 px-1.5">
                        样本: {stocks.length} (活跃龙头)
                    </Badge>
                </div>
                <Badge variant="outline" className={cn("text-[9px] font-bold h-5 border-none", marketMood.bg, marketMood.color)}>
                   环境: {marketMood.label}
                </Badge>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           {ladderGroups.map((group, idx) => (
           <Card key={idx} className={cn("p-4 border-l-4 shadow-sm bg-white/50 backdrop-blur-sm", 
               group.sentimentScore > 80 ? "border-l-red-500" : 
               group.sentimentScore > 50 ? "border-l-orange-400" : "border-l-green-500"
           )}>
               <div className="flex justify-between items-start mb-3">
                   <div className="flex items-center gap-2">
                       <div className={cn("p-1.5 rounded-lg", 
                           group.height.includes('高标') ? "bg-purple-100 text-purple-600" :
                           group.height.includes('2板') ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                       )}>
                           <Layers className="w-4 h-4" />
                       </div>
                       <div>
                           <div className="text-sm font-black text-slate-700">{group.height}</div>
                           <div className="text-[10px] text-slate-400 font-medium">样本: {group.count}</div>
                       </div>
                   </div>
                   <div className="text-right">
                       <div className={cn("text-lg font-black", group.avgChange > 0 ? "text-red-600" : "text-green-600")}>
                           {group.avgChange > 0 ? '+' : ''}{group.avgChange.toFixed(1)}%
                       </div>
                       <Badge variant="outline" className={cn("text-[8px] h-4 px-1 border-none",
                           group.riskLevel === 'Extreme' ? "bg-black text-red-500 animate-pulse" :
                           group.riskLevel === 'High' ? "bg-green-100 text-green-700" :
                           "bg-slate-100 text-slate-500"
                       )}>
                           {group.riskLevel === 'Extreme' ? '☠️ 死亡换手' : 
                            group.riskLevel === 'High' ? '风险释放' : '情绪稳定'}
                       </Badge>
                   </div>
               </div>

               <div className="space-y-3">
                   {/* Sentiment Bar */}
                   <div className="space-y-1">
                       <div className="flex justify-between text-[10px] text-slate-500">
                           <span>晋级/封板率</span>
                           <span className="font-mono font-bold">{((group.limitUpCount / (group.count || 1)) * 100).toFixed(0)}%</span>
                       </div>
                       <Progress value={(group.limitUpCount / (group.count || 1)) * 100} className="h-1 bg-slate-100" />
                   </div>
                   
                   {/* Turnover Bar */}
                   <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-500">
                           <span className="flex items-center gap-1">
                               {group.avgTurnover > 15 ? <AlertTriangle className="w-3 h-3 text-orange-500"/> : <Activity className="w-3 h-3"/>}
                               平均换手
                           </span>
                           <span className={cn("font-mono font-bold", group.avgTurnover > 15 ? "text-orange-600" : "text-slate-600")}>
                               {group.avgTurnover.toFixed(1)}%
                           </span>
                       </div>
                       {/* Max scale for turnover is 50% */}
                       <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className={cn("h-full transition-all", group.avgTurnover > 20 ? "bg-orange-500" : "bg-blue-400")} 
                                style={{ width: `${Math.min(100, group.avgTurnover * 2)}%` }}
                            />
                       </div>
                   </div>
               </div>
               
               {/* T+1 Insight */}
               <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                   <Zap className="w-3 h-3 text-slate-400" />
                   <span className="text-[9px] text-slate-500 font-medium">
                       {group.height.includes('高标') ? (
                           group.avgChange < -2 ? "高位退潮，只看不买" : "抱团核心，去弱留强"
                       ) : group.height.includes('2板') ? (
                           group.limitUpCount / group.count > 0.6 ? "晋级容易，积极试错" : "淘汰惨烈，谨慎接力"
                       ) : (
                           "首板套利，关注早盘标"
                       )}
                   </span>
               </div>
           </Card>
       ))}
    </div>
  </div>
  );
};
