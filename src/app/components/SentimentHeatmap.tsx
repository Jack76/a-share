import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { useTrading } from '../context/Store';
import { Gauge, Target, Info, Flame, ShieldCheck, AlertCircle } from 'lucide-react';
import { cn } from './ui/utils';

export const SentimentHeatmap: React.FC = () => {
  const { metrics, phase } = useTrading();
  
  // Calculate a "Risk Score" 0-100 based on metrics
  const calculateRiskScore = () => {
    let score = 50; // Neutral starting point
    
    if (metrics.limitUpCount) score += 10;
    if (metrics.leaderStrong) score += 15;
    if (metrics.yesterdayLimitUpEffect && metrics.yesterdayLimitUpEffect > 5) score += 15;
    
    if (metrics.bigLosses) score -= 20;
    if (metrics.limitDownCount && metrics.limitDownCount > 5) score -= 25;
    if (metrics.sentimentDivergence === 'Negative') score -= 15;

    return Math.max(0, Math.min(100, score));
  };

  const riskScore = calculateRiskScore();
  
  // Determine recommendation
  const getRec = () => {
    if (phase === 'Climax') return { label: '全力出击', desc: '情绪主升浪，专注龙头抱团。', color: 'text-red-500', bg: 'bg-red-50' };
    if (phase === 'Startup') return { label: '积极试错', desc: '新周期启动，寻找共振板块。', color: 'text-orange-500', bg: 'bg-orange-50' };
    if (phase === 'Ebb') return { label: '空仓回避', desc: '大亏效应显现，保住本金。', color: 'text-green-600', bg: 'bg-green-50' };
    if (phase === 'Ice') return { label: '静待转机', desc: '极端冰点，寻找先手反抽。', color: 'text-blue-500', bg: 'bg-blue-50' };
    return { label: '轻仓观望', desc: '混沌期方向不明，多看少动。', color: 'text-slate-500', bg: 'bg-slate-50' };
  };

  const rec = getRec();

  return (
    <Card className="border-none shadow-sm bg-card overflow-hidden">
      <CardHeader className="pb-2 border-b border-border/10">
        <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                智能仓位热力建议 (Position Heatmap)
            </div>
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-tighter">
                Dynamic Algo v4
            </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
            {/* The Gauge */}
            <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                    <circle
                        cx="64" cy="64" r="58"
                        fill="none" stroke="currentColor" strokeWidth="12"
                        className="text-muted/20"
                    />
                    <circle
                        cx="64" cy="64" r="58"
                        fill="none" stroke="currentColor" strokeWidth="12"
                        strokeDasharray={364.4}
                        strokeDashoffset={364.4 - (364.4 * riskScore) / 100}
                        strokeLinecap="round"
                        className={cn("transition-all duration-1000 ease-out", 
                            riskScore > 70 ? "text-red-500" : riskScore > 40 ? "text-orange-500" : "text-green-500")}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black tracking-tighter">{riskScore}</span>
                    <span className="text-[9px] font-bold uppercase text-muted-foreground opacity-50">Risk Index</span>
                </div>
            </div>

            {/* Recommendations */}
            <div className="flex-1 space-y-4">
                <div className={cn("p-4 rounded-2xl border flex items-start gap-4", rec.bg)}>
                    <div className={cn("p-2 rounded-xl bg-white shadow-sm", rec.color)}>
                        {phase === 'Climax' ? <Flame className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div>
                        <div className={cn("text-lg font-black tracking-tight mb-0.5 uppercase", rec.color)}>
                            {rec.label}
                        </div>
                        <p className="text-xs font-bold text-slate-600 leading-tight">
                            {rec.desc}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border border-border/10 bg-muted/5 flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">最高总仓位 (Max Pos)</span>
                        <span className="text-xl font-black tracking-tighter">
                            {riskScore > 70 ? '80-100%' : riskScore > 40 ? '30-50%' : '0-10%'}
                        </span>
                    </div>
                    <div className="p-3 rounded-xl border border-border/10 bg-muted/5 flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">操盘核心 (Focus)</span>
                        <span className="text-base font-bold tracking-tight">
                            {phase === 'Climax' ? '高位核心龙头' : phase === 'Startup' ? '一进二/共振首板' : '观望/轻仓试错'}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border/10 flex items-center justify-between">
            <div className="flex gap-2">
                <Badge variant="outline" className="text-[9px] font-bold px-1.5 h-4 gap-1">
                    <Target className="w-2.5 h-2.5" /> 目标: 龙头主升
                </Badge>
                <Badge variant="outline" className="text-[9px] font-bold px-1.5 h-4 gap-1">
                    <AlertCircle className="w-2.5 h-2.5" /> 禁忌: 杂毛轮动
                </Badge>
            </div>
            <div className="text-[9px] text-muted-foreground font-bold flex items-center gap-1 opacity-50">
                <Info className="w-3 h-3" />
                基于 AI 多维数据建模
            </div>
        </div>
      </CardContent>
    </Card>
  );
};
