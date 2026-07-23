import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { useTrading } from '../context/Store';
import { Activity, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from './ui/utils';

export const MarketMetricsDisplay: React.FC = () => {
  const { metrics } = useTrading();

  const data = [
    { label: '涨停', count: metrics.limitUpCount || 0, color: 'text-red-600', bg: 'bg-red-50' },
    { label: '跌停', count: metrics.limitDownCount || 0, color: 'text-green-600', bg: 'bg-green-50' },
    { label: '上涨', count: metrics.upCount || 0, color: 'text-red-500', bg: 'bg-slate-50' },
    { label: '下跌', count: metrics.downCount || 0, color: 'text-green-500', bg: 'bg-slate-50' }
  ];

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-2 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-red-600" />
            盘面数据 (Market Metrics)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid grid-cols-2 gap-2">
            {data.map((item, i) => (
                <div key={i} className={cn("py-3 px-2 rounded-lg flex flex-col justify-center items-center transition-all border border-transparent hover:border-slate-100", item.bg)}>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">{item.label}</div>
                    <div className={cn("text-lg font-black font-mono tracking-tighter", item.color)}>
                        {item.count}
                    </div>
                </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
};