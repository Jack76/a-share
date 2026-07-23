import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Activity, ArrowUpCircle, ArrowDownCircle, Gauge, Layers, Info } from 'lucide-react';
import { Stock } from '../types';
import { cn } from './ui/utils';

interface Props {
  stock: Stock;
}

export const L2PressureGauge: React.FC<Props> = ({ stock }) => {
  // Logic: Calculate simulated Buy/Sell pressure based on v29.0 metrics
  // Using volumeRatio, changePercent, and turnoverRate as proxies
  const pressure = React.useMemo(() => {
    const volRatio = stock.volumeRatio || 1;
    const change = stock.changePercent || 0;
    const turnover = stock.turnoverRate || 5;
    
    // Simulating Bid/Ask balance (Total 100)
    let buyBase = 50 + (change * 2);
    if (volRatio > 1.5 && change > 0) buyBase += 15;
    if (volRatio < 0.8 && change > 0) buyBase -= 10; // Exhaustion
    
    const buyPressure = Math.max(10, Math.min(90, buyBase));
    const sellPressure = 100 - buyPressure;
    
    // Order Density: Simulated based on turnover
    const density = Math.min(100, turnover * 4);
    
    return { buy: buyPressure, sell: sellPressure, density };
  }, [stock]);

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden group/l2">
      <CardHeader className="pb-2 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5 text-blue-600" />
                L2 盘口细节仿真 (Order Flow Pressure)
            </div>
            <Info className="w-3.5 h-3.5 text-slate-300 cursor-help" />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col">
                <div className="flex items-center gap-1.5 mb-1">
                    <ArrowUpCircle className="w-3 h-3 text-red-500" />
                    <span className="text-[9px] font-black text-red-600 uppercase tracking-widest">主买盘力道</span>
                </div>
                <div className="text-2xl font-black font-mono tracking-tighter text-red-600">
                    {pressure.buy.toFixed(1)}%
                </div>
            </div>
            <div className="text-center px-4">
                <div className="h-10 w-px bg-slate-100 mx-auto mb-2" />
                <Layers className="w-4 h-4 text-slate-300 mx-auto" />
            </div>
            <div className="flex flex-col items-end">
                <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">主卖盘压制</span>
                    <ArrowDownCircle className="w-3 h-3 text-slate-400" />
                </div>
                <div className="text-2xl font-black font-mono tracking-tighter text-slate-400">
                    {pressure.sell.toFixed(1)}%
                </div>
            </div>
        </div>

        {/* Pressure Balance Bar */}
        <div className="h-2 w-full bg-slate-100 rounded-full flex overflow-hidden mb-8">
            <div 
                className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-700 ease-out"
                style={{ width: `${pressure.buy}%` }}
            />
            <div 
                className="h-full bg-slate-300 transition-all duration-700 ease-out"
                style={{ width: `${pressure.sell}%` }}
            />
        </div>

        {/* Order Density Metric */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3 relative z-10">
                <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">订单流密度 (Density)</span>
                </div>
                <span className="text-[10px] font-black font-mono text-blue-600">{pressure.density.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden relative z-10">
                <div 
                    className="h-full bg-blue-600 transition-all duration-1000"
                    style={{ width: `${pressure.density}%` }}
                />
            </div>
            <p className="text-[9px] text-slate-400 mt-2 italic relative z-10 leading-tight">
                反映当前价位附近的资金活跃度。密度越高，说明此处换手越激烈，是多空博弈的关键位。
            </p>
            
            {/* Background scan effect */}
            <div className="absolute inset-y-0 left-0 w-1 bg-blue-400/30 animate-pulse" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-red-500" /> 
                资金诚意度: {stock.moneyQualityScore || 0}%
            </div>
            <div className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1.5 justify-end text-right">
                流动性熵值: {stock.liquidityEntropy?.toFixed(1) || 0}
                <div className="w-1 h-1 rounded-full bg-blue-500" />
            </div>
        </div>
      </CardContent>
    </Card>
  );
};
