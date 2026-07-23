import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { useTrading } from '../context/Store';
import { Thermometer, Zap, TrendingUp, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from './ui/utils';

export const MarketSentiment: React.FC = () => {
  const { metrics } = useTrading();
  
  const factors = [
    { label: '昨曾涨停溢价', value: metrics.limitUpCount > 90 ? '+2.4%' : '-1.2%', status: metrics.limitUpCount > 90 ? 'pos' : 'neg' },
    { label: '连板晋级率', value: '34.2%', status: 'pos' },
    { label: '反包力度', value: '强', status: 'pos' },
    { label: '炸板率', value: '28%', status: 'neg' }
  ];

  return (
    <Card className="border-none shadow-sm bg-card overflow-hidden h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Thermometer className="w-3.5 h-3.5" />
            核心情绪因子 (Sentiment Factors)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
            {factors.map((f, i) => (
                <div key={i} className="p-3 rounded-xl bg-muted/30 border border-border/5 space-y-1">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase truncate">{f.label}</div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-black tracking-tight">{f.value}</span>
                        {f.status === 'pos' ? 
                            <ArrowUpRight className="w-3 h-3 text-red-500" /> : 
                            <ArrowDownRight className="w-3 h-3 text-green-600" />
                        }
                    </div>
                </div>
            ))}
        </div>
        
        <div className="mt-4 p-3 bg-primary/5 rounded-xl border border-primary/10">
            <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-black text-primary uppercase">实时诊断</span>
            </div>
            <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
                当前市场处于{metrics.marketTemp > 50 ? '活跃' : '分歧'}状态，{metrics.leaderStrong ? '龙头效应明显' : '龙头出现松动'}，建议聚焦核心品种。
            </p>
        </div>
      </CardContent>
    </Card>
  );
};
