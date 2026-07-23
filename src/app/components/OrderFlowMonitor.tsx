import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Activity, ArrowUpCircle, ArrowDownCircle, Zap, ShieldCheck, ChevronRight } from 'lucide-react';
import { Stock } from '../types';
import { cn } from './ui/utils';

interface Props {
  stock: Stock;
}

export const OrderFlowMonitor: React.FC<Props> = ({ stock }) => {
  // Simulate order flow data based on turnover and volumeRatio
  const buyPressure = Math.min(100, (stock.volumeRatio || 1) * 20 + (stock.changePercent || 0) * 5 + 30);
  const sellPressure = 100 - buyPressure;

  const largeOrderBuy = Math.floor(buyPressure * 0.4);
  const largeOrderSell = Math.floor(sellPressure * 0.3);

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-2 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-red-600" />
                资金流向监控 (Order Flow)
            </div>
            <Badge variant="outline" className="text-[9px] font-mono">{stock.name}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {/* Main Pressure Meter */}
        <div className="space-y-3">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">
                <span className="text-red-600 flex items-center gap-1"><ArrowUpCircle className="w-3 h-3" /> Buy Force</span>
                <span className="text-green-600 flex items-center gap-1">Sell Force <ArrowDownCircle className="w-3 h-3" /></span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
                <div 
                    className="h-full bg-red-500 transition-all duration-1000 relative group" 
                    style={{ width: `${buyPressure}%` }}
                >
                    <div className="absolute inset-0 bg-white/20 animate-pulse opacity-0 group-hover:opacity-100" />
                </div>
                <div 
                    className="h-full bg-green-500 transition-all duration-1000 relative group" 
                    style={{ width: `${sellPressure}%` }}
                >
                    <div className="absolute inset-0 bg-white/20 animate-pulse opacity-0 group-hover:opacity-100" />
                </div>
            </div>
            <div className="flex justify-between text-[12px] font-mono font-black italic">
                <span className="text-red-600">{buyPressure.toFixed(1)}%</span>
                <span className="text-green-600">{sellPressure.toFixed(1)}%</span>
            </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-red-50/50 border border-red-100 space-y-2">
                <div className="text-[9px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1">
                    <Zap className="w-3 h-3" /> 主力大单 (Large)
                </div>
                <div className="text-lg font-black font-mono text-red-700 tracking-tighter">
                    {largeOrderBuy}%
                </div>
                <div className="h-1 w-full bg-red-100 rounded-full">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${largeOrderBuy}%` }} />
                </div>
            </div>
            <div className="p-3 rounded-xl bg-green-50/50 border border-green-100 space-y-2">
                <div className="text-[9px] font-black text-green-600 uppercase tracking-widest flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" /> 散户跟风 (Retail)
                </div>
                <div className="text-lg font-black font-mono text-green-700 tracking-tighter">
                    {largeOrderSell}%
                </div>
                <div className="h-1 w-full bg-green-100 rounded-full">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${largeOrderSell}%` }} />
                </div>
            </div>
        </div>

        {/* AI Insight */}
        <div className="p-3 rounded-xl bg-slate-900 text-white space-y-2">
            <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-3 h-3 text-red-500" /> AI Flow Analysis
            </h5>
            <p className="text-[10px] font-medium leading-relaxed text-slate-300 italic">
                {buyPressure > 65 ? "主力资金持续抢筹，封板意愿强烈，注意炸板回补机会。" : 
                 buyPressure < 35 ? "资金流出显著，属于派发期，切勿盲目接盘。" : 
                 "处于分歧博弈期，需关注后续量能能否持续放大。"}
            </p>
        </div>
      </CardContent>
    </Card>
  );
};
