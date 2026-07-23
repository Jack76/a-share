import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { BookOpen, Target, CircleCheck, CircleX, BrainCircuit } from 'lucide-react';
import { useTrading } from '../context/Store';
import { cn } from './ui/utils';

export const TacticalReview: React.FC = () => {
  const { phase, metrics } = useTrading();

  const getDaySummary = () => {
    if (phase === 'Climax') return "情绪高潮，龙头缩量加速，注意明日分歧风险。";
    if (phase === 'Ebb') return "退潮期，高位杀跌严重，切记保住本金。";
    if (phase === 'Startup') return "新周期启动，关注一进二及核心龙头的确认。";
    if (phase === 'Ice') return "极度冰点，黎明前的黑暗，寻找强势抗跌品种。";
    return "混沌期，主线不明，轻仓参与。";
  };

  const tacticalPoints = [
    { 
        title: "市场广度 (Breadth)", 
        value: metrics.limitUpCount ? "良" : "差", 
        detail: `最高连板: ${metrics.spaceHeight || 0} | 跌停: ${metrics.limitDownCount || 0}`,
        status: (metrics.spaceHeight || 0) > 3 ? 'positive' : 'negative'
    },
    { 
        title: "赚钱效应 (Profit)", 
        value: (metrics.yesterdayLimitUpEffect || 0) > 0 ? "正向" : "负向", 
        detail: `昨日涨停溢价: ${metrics.yesterdayLimitUpEffect || 0}%`,
        status: (metrics.yesterdayLimitUpEffect || 0) > 0 ? 'positive' : 'negative'
    },
    { 
        title: "博弈重点 (Key Focus)", 
        value: "龙头抱团", 
        detail: phase === 'Ebb' ? "关注逆势走强个股" : "关注连板核心梯队",
        status: 'neutral'
    }
  ];

  return (
    <Card className="border-none shadow-sm bg-card h-full">
      <CardHeader className="pb-2 border-b border-border/10">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          每日战术复盘 (Daily Tactical Review)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <BrainCircuit className="w-24 h-24" />
            </div>
            <div className="flex items-center gap-2 mb-2">
                <Badge className="bg-primary/20 text-primary border-none text-[9px] uppercase tracking-widest font-bold">AI Strategy Note</Badge>
            </div>
            <p className="text-sm font-bold leading-relaxed tracking-tight">
                {getDaySummary()}
            </p>
        </div>

        <div className="space-y-4">
            {tacticalPoints.map((point, idx) => (
                <div key={idx} className="flex items-start gap-4">
                    <div className={cn("p-2 rounded-lg shrink-0 transition-colors", 
                        point.status === 'positive' ? "bg-red-50 text-red-600" : 
                        point.status === 'negative' ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground")}>
                        {point.status === 'positive' ? <CircleCheck className="w-4 h-4" /> : 
                         point.status === 'negative' ? <CircleX className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{point.title}</span>
                            <span className={cn("text-xs font-bold", 
                                point.status === 'positive' ? "text-red-500" : 
                                point.status === 'negative' ? "text-green-500" : "")}>{point.value}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight font-medium">{point.detail}</p>
                    </div>
                </div>
            ))}
        </div>

        <div className="pt-4 border-t border-border/10">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">操盘禁忌 (Trading Don'ts)</div>
            <ul className="space-y-2">
                <li className="flex items-center gap-2 text-[11px] font-medium text-destructive/80">
                    <div className="w-1 h-1 rounded-full bg-destructive" />
                    退潮期禁忌追高缩量板
                </li>
                <li className="flex items-center gap-2 text-[11px] font-medium text-destructive/80">
                    <div className="w-1 h-1 rounded-full bg-destructive" />
                    严禁向下摊平亏损仓位
                </li>
            </ul>
        </div>
      </CardContent>
    </Card>
  );
};