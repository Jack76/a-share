import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { Layers, Target, Lock, Activity, Scale } from 'lucide-react';
import { Stock } from '../types';
import { cn } from './ui/utils';

// V59.6 FIX: Stable prop references for recharts 3.x
const VP_MARGIN = { left: -20, right: 10, top: 0, bottom: 0 };

interface Props {
  stock: Stock;
}

export const VolumeProfileChart: React.FC<Props> = ({ stock }) => {
  // Use stock data to derive a more realistic volume profile
  const currentPrice = stock.currentPrice || 10;
  const history = stock.history || [];
  
  // Logic: Identify actual price peaks/valleys from history to place "chip" concentrations
  const historicalHighs = history.length > 0 ? history.map(h => h.high) : [currentPrice * 1.05];
  const historicalLows = history.length > 0 ? history.map(h => h.low) : [currentPrice * 0.95];
  
  // Create 15 buckets around current price
  const data = Array.from({ length: 15 }, (_, i) => {
    const price = currentPrice * (0.9 + i * 0.015);
    const relativePrice = i - 7; // 0 is current price index
    
    // Base volume follows a bell curve centered at current price (simulating recent accumulation)
    const baseVolume = 100 * Math.exp(-Math.pow(relativePrice, 2) / 30);
    
    // Add "peaks" where historical price action occurred (Support/Resistance)
    let peakEffect = 0;
    historicalHighs.forEach(h => {
        if (Math.abs(price - h) < currentPrice * 0.01) peakEffect += 30;
    });
    historicalLows.forEach(l => {
        if (Math.abs(price - l) < currentPrice * 0.01) peakEffect += 20;
    });

    return {
      price: price.toFixed(2),
      volume: Math.max(10, baseVolume + Math.min(60, peakEffect)),
      isCurrent: i === 7,
      isPeak: peakEffect > 25
    };
  });

  const concentrationIndex = ((stock.moneyQualityScore || 80) / 8).toFixed(1); 
  const cost90Range = [currentPrice * 0.94, currentPrice * 1.06];

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-2 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                筹码分布模拟 (Volume Profile)
            </div>
            <Target className="w-3.5 h-3.5 text-slate-300" />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-3 h-3 text-blue-600" />
                    <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">筹码集中度</span>
                </div>
                <div className="text-lg font-black font-mono tracking-tighter text-blue-900">
                    {concentrationIndex}%
                </div>
            </div>
            <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100">
                <div className="flex items-center gap-2 mb-1">
                    <Scale className="w-3 h-3 text-purple-600" />
                    <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest">90% 成本区间</span>
                </div>
                <div className="text-[11px] font-black font-mono tracking-tighter text-purple-900 leading-none mt-1.5">
                    ¥{cost90Range[0].toFixed(2)} - ¥{cost90Range[1].toFixed(2)}
                </div>
            </div>
        </div>

        <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%" minHeight={100} minWidth={100}>
                <BarChart data={data} layout="vertical" margin={VP_MARGIN}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="price" type="category" hide />
                    <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-slate-900 text-white p-2 rounded shadow-xl border border-slate-800">
                                        <p className="text-[10px] font-black">Price: ¥{payload[0].payload.price}</p>
                                        <p className="text-[9px] font-medium text-slate-400">Chip Conc: {payload[0].value.toFixed(0)}%</p>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Bar dataKey="volume" radius={[0, 4, 4, 0]}>
                        {data.map((entry, index) => (
                            <Cell 
                                key={`cell-${index}`} 
                                fill={entry.isCurrent ? '#dc2626' : entry.isPeak ? '#3b82f6' : '#e2e8f0'} 
                                fillOpacity={entry.isCurrent ? 1 : entry.isPeak ? 0.8 : 0.6}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
        
        <div className="mt-4 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded bg-red-600" />
                <span className="text-[9px] font-black text-slate-500 uppercase">Current</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded bg-blue-600" />
                <span className="text-[9px] font-black text-slate-500 uppercase">Support/Res</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] font-black text-slate-400 italic">
                <Lock className="w-2.5 h-2.5" /> Stability: {((stock.strengthScore || 70) * 0.9 + 10).toFixed(0)}%
            </div>
        </div>
      </CardContent>
    </Card>
  );
};