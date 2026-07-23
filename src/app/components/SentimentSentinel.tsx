import React from 'react';
import { useTrading } from '../context/Store';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { 
    AlertCircle, 
    Zap, 
    Skull, 
    TrendingDown, 
    Flame, 
    ShieldAlert, 
    History,
    Ghost,
    Target
} from 'lucide-react';
import { cn } from './ui/utils';

export const SentimentSentinel: React.FC = () => {
    const { marketEvents, metrics, stocks } = useTrading();

    // Calculate real-time "Slap" count (大面统计)
    const bigSlaps = stocks.filter(s => {
        const change = s.changePercent || 0;
        // Simplified Slap: High intraday (>5%) to Low (< -2%)
        return change < -2 && (s.open || 0) > (s.currentPrice || 0) * 1.05;
    });

    return (
        <Card className="border-none shadow-2xl bg-slate-900 text-white rounded-[2rem] overflow-hidden group/sentinel">
            <CardHeader className="pb-2 border-b border-white/5 bg-white/5 backdrop-blur-md">
                <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />
                        <span className="font-black tracking-widest uppercase italic italic text-[11px]">
                            战术哨兵 (Tactical Sentinel)
                        </span>
                    </div>
                    <Badge variant="outline" className="text-[9px] border-white/10 text-white/40 uppercase">
                        Real-time AI Feed
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {/* Critical Stats Bar */}
                <div className="grid grid-cols-3 divide-x divide-white/5 bg-white/5 py-4">
                    <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5 text-red-500">
                            <Skull className="w-3 h-3" />
                            <span className="text-[10px] font-black uppercase">大面值</span>
                        </div>
                        <span className="text-lg font-black font-mono">{bigSlaps.length}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5 text-yellow-500">
                            <Zap className="w-3 h-3" />
                            <span className="text-[10px] font-black uppercase">炸板数</span>
                        </div>
                        <span className="text-lg font-black font-mono">
                            {stocks.filter(s => s.notes?.includes('炸板')).length}
                        </span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5 text-blue-400">
                            <Ghost className="w-3 h-3" />
                            <span className="text-[10px] font-black uppercase">背离度</span>
                        </div>
                        <span className="text-lg font-black font-mono">
                            {metrics.divergenceIndex?.toFixed(1) || '0.0'}
                        </span>
                    </div>
                </div>

                {/* Event Feed */}
                <div className="max-h-[320px] overflow-y-auto no-scrollbar p-4 space-y-4">
                    {marketEvents.length === 0 ? (
                        <div className="py-10 text-center space-y-2 opacity-30">
                            <History className="w-8 h-8 mx-auto" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">等待战场信号...</p>
                        </div>
                    ) : (
                        marketEvents.map((event, idx) => (
                            <div 
                                key={event.id} 
                                className={cn(
                                    "p-4 rounded-2xl border transition-all duration-500 flex gap-4 items-start",
                                    event.type === 'Danger' ? "bg-red-500/10 border-red-500/20" : 
                                    event.type === 'Warning' ? "bg-orange-500/10 border-orange-500/20" : 
                                    "bg-white/5 border-white/10"
                                )}
                            >
                                <div className={cn(
                                    "mt-1 p-2 rounded-xl",
                                    event.type === 'Danger' ? "bg-red-500 text-white" : 
                                    event.type === 'Warning' ? "bg-orange-500 text-white" : 
                                    "bg-white/10 text-white/60"
                                )}>
                                    {event.type === 'Danger' ? <AlertCircle className="w-4 h-4" /> : 
                                     event.type === 'Warning' ? <Zap className="w-4 h-4" /> : 
                                     <Target className="w-4 h-4" />}
                                </div>
                                <div className="space-y-1.5 flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-white/40">{event.time}</span>
                                        {event.stockName && (
                                            <Badge className="text-[8px] h-3.5 bg-white/10 text-white/80 border-none">
                                                {event.stockName}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs font-bold leading-relaxed text-white/90">
                                        {event.message}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Insight */}
                <div className="p-4 border-t border-white/5 bg-black/20 text-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 italic">
                        算法哨兵已启动：正在实时监控 5000+ 标的之分时异动及负反馈传染
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};