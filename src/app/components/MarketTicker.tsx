import React from 'react';
import { MarketIndex } from '../types';
import { TrendingUp, TrendingDown, Activity, Clock } from 'lucide-react';
import { cn } from './ui/utils';

interface Props {
  indices?: MarketIndex[];
  sentimentScore?: number;
  isMarketOpen?: boolean;
}

export const MarketTicker: React.FC<Props> = ({ indices = [], sentimentScore = 0, isMarketOpen = true }) => {
  const getSentimentLabel = (score: number) => {
    if (score > 10) return "情绪狂热";
    if (score > 3) return "情绪活跃";
    if (score > -3) return "情绪平稳";
    if (score > -10) return "情绪低迷";
    return "恐慌冰点";
  };

  const sentimentLabel = getSentimentLabel(sentimentScore);

  return (
    <div className="bg-white border-b border-slate-200 overflow-hidden shadow-sm relative">
      <div className="max-w-[1600px] mx-auto flex items-center h-12 px-6 overflow-x-auto no-scrollbar">
        {/* Sentiment Heartbeat */}
        <div className="flex items-center gap-4 pr-8 border-r border-slate-100 shrink-0">
          <div className="relative">
            <Activity className={cn("w-5 h-5", sentimentScore > 0 ? "text-red-600" : (sentimentScore < 0 ? "text-green-600" : "text-slate-500"))} />
            {isMarketOpen && (
                <div className={cn("absolute inset-0 rounded-full animate-ping opacity-20", sentimentScore > 0 ? "bg-red-600" : (sentimentScore < 0 ? "bg-green-600" : "bg-slate-400"))} />
            )}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none">市场心率</span>
                <span className={cn("text-[8px] font-black px-1 rounded uppercase", 
                    sentimentScore > 3 ? "bg-red-50 text-red-600" : (sentimentScore < -3 ? "bg-green-50 text-green-600" : "bg-slate-50 text-slate-500"))}>
                    {sentimentLabel}
                </span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className={cn("text-lg font-black font-mono tracking-tighter", sentimentScore > 0 ? "text-red-600" : (sentimentScore < 0 ? "text-green-600" : "text-slate-500"))}>
                    {sentimentScore > 0 ? '+' : ''}{(sentimentScore || 0).toFixed(1)}
                </span>
                <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">Alpha 得分</span>
            </div>
          </div>
        </div>

        {/* Indices */}
        <div className="flex items-center gap-10 ml-8">
          {indices && indices.length > 0 ? (
            <div className="flex items-center gap-10">
                {indices.map(idx => {
                    const isUp = (idx.changePercent || 0) > 0;
                    return (
                        <div key={idx.code} className="flex items-center gap-3 shrink-0 group border-l border-slate-100 pl-6 first:border-l-0 first:pl-0">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">{idx.name}</span>
                                    {!isMarketOpen && (
                                        <span className="text-[8px] font-black text-slate-300 border border-slate-200 px-1 rounded bg-slate-50 uppercase">Close</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black font-mono tracking-tighter text-slate-900">
                                        {(idx.current || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <div className={cn("flex items-center text-[10px] font-black px-1.5 py-0.5 rounded-md", 
                                        isUp ? "text-red-600 bg-red-50" : "text-green-600 bg-green-50")}>
                                        {isUp ? <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5" />}
                                        {isUp ? '+' : ''}{(idx.changePercent || 0).toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
          ) : !isMarketOpen ? (
            <div className="flex items-center gap-3 text-slate-400">
                <Clock className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">数据加载中...</span>
            </div>
          ) : (
            <div className="flex items-center gap-8">
                {[1, 2, 3].map(i => (
                    <div key={i} className="flex flex-col gap-1.5 animate-pulse">
                        <div className="h-2 w-12 bg-slate-100 rounded" />
                        <div className="h-4 w-20 bg-slate-100 rounded" />
                    </div>
                ))}
            </div>
          )}
        </div>

        {/* Real-time Status */}
        <div className="ml-auto flex items-center gap-6 shrink-0">
             <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full border transition-colors", 
                isMarketOpen ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-200")}>
                <div className={cn("w-1.5 h-1.5 rounded-full", isMarketOpen ? "bg-red-600 animate-pulse" : "bg-slate-300")} />
                <span className={cn("text-[10px] font-black uppercase tracking-widest", isMarketOpen ? "text-red-600" : "text-slate-400")}>
                    {isMarketOpen ? '实时行情连接中' : '休市中'}
                </span>
             </div>
        </div>
      </div>
    </div>
  );
};