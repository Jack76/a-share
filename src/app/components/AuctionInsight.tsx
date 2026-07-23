import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { 
  Zap, Rocket, BarChart3, TrendingUp, TrendingDown, Search, Info, 
  ArrowRight, Target, ShieldAlert, Flame, AlertTriangle, Clock 
} from 'lucide-react';
import { Stock } from '../types';
import { cn } from './ui/utils';
import { 
  analyzeAuctionBattle, 
  AuctionSignal, 
  AuctionSignalType,
  isAuctionRelevant 
} from '../utils/auctionEngine';
import { useTrading } from '../context/Store';

/**
 * AUCTION INSIGHT V63.0
 * 竞价博弈引擎 UI — 接入 auctionEngine.ts 的完整竞价信号面板
 */

export const AuctionInsight: React.FC<{ stocks?: Stock[] }> = ({ stocks: propStocks }) => {
  const { stocks: contextStocks, phase, themes } = useTrading();
  const stocks = propStocks || contextStocks;

  const result = useMemo(() => {
    return analyzeAuctionBattle(stocks, phase, themes);
  }, [stocks, phase, themes]);

  const auctionActive = isAuctionRelevant();

  const signalConfig: Record<AuctionSignalType, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
    'AUCTION_BUY': { 
      color: 'text-red-600', 
      bg: 'bg-red-50', 
      border: 'border-red-200',
      icon: <Target className="w-3.5 h-3.5 text-red-600" />
    },
    'AUCTION_SELL': { 
      color: 'text-green-600', 
      bg: 'bg-green-50', 
      border: 'border-green-200',
      icon: <TrendingDown className="w-3.5 h-3.5 text-green-600" />
    },
    'AUCTION_NUKE': { 
      color: 'text-orange-600', 
      bg: 'bg-orange-50', 
      border: 'border-orange-300',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-orange-600" />
    },
    'AUCTION_WATCH': { 
      color: 'text-slate-500', 
      bg: 'bg-slate-50', 
      border: 'border-slate-200',
      icon: <Clock className="w-3.5 h-3.5 text-slate-500" />
    },
  };

  const signalLabels: Record<AuctionSignalType, string> = {
    'AUCTION_BUY': '买入',
    'AUCTION_SELL': '卖出',
    'AUCTION_NUKE': '核按钮',
    'AUCTION_WATCH': '观望',
  };

  // Only show actionable signals (buy/sell/nuke), plus top 3 watch
  const actionableSignals = result.signals.filter(s => s.signal !== 'AUCTION_WATCH');
  const watchSignals = result.signals.filter(s => s.signal === 'AUCTION_WATCH').slice(0, 3);
  const displaySignals = [...actionableSignals, ...watchSignals];

  return (
    <Card className="border border-slate-200 shadow-2xl bg-white/40 backdrop-blur-xl overflow-hidden rounded-3xl group/auction">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <Rocket className="w-4 h-4 text-orange-600 group-hover/auction:translate-y-[-2px] transition-transform" />
            竞价博弈引擎 (Auction Engine V63.0)
          </div>
          <div className="flex items-center gap-3">
            {/* Auction Temperature Badge */}
            <div className={cn(
              "px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-widest flex items-center gap-1.5",
              result.auctionTemp >= 80 ? "bg-red-100 text-red-700" :
              result.auctionTemp >= 60 ? "bg-orange-100 text-orange-700" :
              result.auctionTemp >= 40 ? "bg-slate-100 text-slate-700" :
              "bg-blue-100 text-blue-700"
            )}>
              <Flame className="w-3 h-3" />
              {result.auctionTemp.toFixed(0)}° {result.auctionTempLabel}
            </div>
            {auctionActive && (
              <div className="px-2 py-0.5 rounded-md bg-red-600 text-[8px] font-black text-white uppercase tracking-widest animate-pulse">
                LIVE
              </div>
            )}
            {!auctionActive && (
              <div className="px-2 py-0.5 rounded-md bg-slate-300 text-[8px] font-black text-slate-600 uppercase tracking-widest">
                CACHED
              </div>
            )}
          </div>
        </CardTitle>
        {/* Signal summary bar */}
        <div className="flex items-center gap-4 mt-2">
          {result.buyCount > 0 && (
            <span className="text-[10px] font-bold text-red-600 flex items-center gap-1">
              <Target className="w-3 h-3" /> {result.buyCount}买入
            </span>
          )}
          {result.nukeCount > 0 && (
            <span className="text-[10px] font-bold text-orange-600 flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-3 h-3" /> {result.nukeCount}核按钮
            </span>
          )}
          {result.sellCount > 0 && (
            <span className="text-[10px] font-bold text-green-600 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> {result.sellCount}卖出
            </span>
          )}
          <span className="text-[10px] text-slate-400">{result.watchCount}观望</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Global Advice */}
        <div className="px-5 py-3 bg-slate-900 text-white">
          <p className="text-[10px] font-bold leading-relaxed">{result.globalAdvice}</p>
        </div>

        <div className="divide-y divide-slate-100">
          {displaySignals.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center animate-pulse">
                <Search className="w-6 h-6 text-slate-200" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">等待竞价数据</p>
                <p className="text-[9px] font-medium text-slate-400">系统将在 09:15-09:25 捕捉全场竞价异动</p>
              </div>
            </div>
          ) : (
            displaySignals.map(sig => {
              const config = signalConfig[sig.signal];
              return (
                <div key={sig.stockId} className="p-5 hover:bg-slate-50/80 transition-all group/item">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Signal strength indicator */}
                      <div className={cn(
                        "w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black border transition-all shadow-sm relative overflow-hidden",
                        sig.signal === 'AUCTION_BUY' ? "bg-red-600 text-white border-red-400" :
                        sig.signal === 'AUCTION_NUKE' ? "bg-orange-600 text-white border-orange-400" :
                        sig.signal === 'AUCTION_SELL' ? "bg-green-600 text-white border-green-400" :
                        "bg-white text-slate-900 border-slate-200"
                      )}>
                        <span className="text-xs">{sig.auctionStrength}</span>
                        <span className="text-[6px] uppercase tracking-tighter opacity-70">PWR</span>
                        {sig.confidence > 80 && (
                          <div className="absolute inset-0 bg-white/20 animate-[ping_2s_infinite] pointer-events-none" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-900 leading-none">{sig.stockName}</span>
                          <Badge className={cn("text-[8px] font-black px-1.5 py-0 border", config.bg, config.color, config.border)}>
                            {sig.signalTitle}
                          </Badge>
                          <Badge className={cn("text-[7px] px-1 py-0",
                            sig.expectation === 'EXCEED' ? "bg-red-50 text-red-600 border-red-200" :
                            sig.expectation === 'FAR_BELOW' ? "bg-orange-50 text-orange-600 border-orange-200" :
                            sig.expectation === 'BELOW' ? "bg-blue-50 text-blue-600 border-blue-200" :
                            "bg-slate-50 text-slate-500 border-slate-200"
                          )}>
                            {sig.expectationLabel}
                          </Badge>
                        </div>
                        <div className="text-[10px] font-mono font-bold text-slate-400 mt-1 flex items-center gap-2">
                          {sig.stockCode}
                          <div className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="text-slate-900 font-black">{sig.concept}</span>
                          {sig.boardHeight > 0 && (
                            <>
                              <div className="w-1 h-1 rounded-full bg-slate-300" />
                              <span className="text-orange-600 font-black">{sig.boardHeight}板</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-lg font-black font-mono tracking-tighter leading-none mb-1",
                        sig.openGapPct > 0 ? "text-red-600" : "text-green-600")}>
                        {sig.openGapPct > 0 ? '+' : ''}{sig.openGapPct.toFixed(2)}%
                      </div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">高开幅度</div>
                    </div>
                  </div>

                  {/* Metrics bar */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 text-center">
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">量比</div>
                      <div className={cn("text-xs font-black font-mono",
                        sig.auctionVolRatio > 2 ? "text-red-600" : sig.auctionVolRatio > 1.5 ? "text-orange-600" : "text-slate-900"
                      )}>
                        {sig.auctionVolRatio.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 text-center">
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">信心</div>
                      <div className="w-full h-1 bg-slate-200 rounded-full mt-0.5 overflow-hidden">
                        <div className={cn("h-full rounded-full",
                          sig.confidence > 80 ? "bg-red-500" : sig.confidence > 60 ? "bg-orange-500" : "bg-slate-400"
                        )} style={{ width: `${sig.confidence}%` }} />
                      </div>
                      <div className="text-[9px] font-black font-mono text-slate-900 mt-0.5">{sig.confidence}%</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 text-center">
                      <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">角色</div>
                      <div className="text-[9px] font-black text-slate-700">{sig.role}</div>
                    </div>
                  </div>

                  {/* Tags */}
                  {sig.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {sig.tags.map((tag, i) => (
                        <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action advice */}
                  <div className={cn(
                    "p-3 rounded-xl flex items-start gap-3 transition-colors duration-500",
                    sig.signal === 'AUCTION_NUKE' ? "bg-orange-950 text-white" :
                    sig.signal === 'AUCTION_BUY' ? "bg-red-950 text-white" :
                    sig.signal === 'AUCTION_SELL' ? "bg-green-950 text-white" :
                    "bg-slate-900 text-white"
                  )}>
                    <div className="p-1.5 bg-white/10 rounded-lg shrink-0 mt-0.5">
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest block mb-1">
                        {signalLabels[sig.signal]}指令
                      </span>
                      <span className="text-[10px] font-medium leading-relaxed text-white/80 block">
                        {sig.advice}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Theme auction heatmap */}
        {Object.keys(result.themeAuctionMap).length > 0 && (
          <div className="p-4 border-t border-slate-100">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">板块竞价热度</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(result.themeAuctionMap) as Array<[string, (typeof result.themeAuctionMap)[string]]>)
                .sort((a, b) => b[1].avgOpenGap - a[1].avgOpenGap)
                .slice(0, 8)
                .map(([name, data]) => (
                  <div key={name} className={cn(
                    "px-2 py-1 rounded-lg text-[9px] font-bold border",
                    data.hotLevel === 'FIRE' ? "bg-red-50 text-red-700 border-red-200" :
                    data.hotLevel === 'HOT' ? "bg-orange-50 text-orange-700 border-orange-200" :
                    data.hotLevel === 'WARM' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                    "bg-slate-50 text-slate-500 border-slate-200"
                  )}>
                    {name}
                    <span className="ml-1 font-mono">
                      {data.avgOpenGap > 0 ? '+' : ''}{data.avgOpenGap.toFixed(1)}%
                    </span>
                    <span className="ml-1 text-[8px] opacity-60">({data.stockCount})</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </CardContent>
      <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-4 h-4 text-slate-400" />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            竞价定龙头 · 预期差决定去留
          </span>
        </div>
        <div className="text-[9px] font-black text-slate-300">PREDATOR-X V63</div>
      </div>
    </Card>
  );
};
