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
  const currentPrice = stock.currentPrice || 10;
  const history = stock.history || [];
  const profile = React.useMemo(() => {
    const bars = history.slice(-60).filter(bar =>
      Number.isFinite(bar.close) && Number.isFinite(bar.volume) && (bar.volume || 0) > 0
    );
    if (bars.length < 10) {
      return { data: [] as Array<{ price: string; volume: number; isCurrent: boolean; isPeak: boolean }>, concentration: undefined, range: undefined };
    }

    const minimum = Math.min(...bars.map(bar => bar.low || bar.close));
    const maximum = Math.max(...bars.map(bar => bar.high || bar.close));
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
      return { data: [], concentration: undefined, range: undefined };
    }

    const binCount = 15;
    const binSize = (maximum - minimum) / binCount;
    const volumes = Array.from({ length: binCount }, () => 0);
    bars.forEach(bar => {
      const lowIndex = Math.max(0, Math.min(binCount - 1, Math.floor(((bar.low || bar.close) - minimum) / binSize)));
      const highIndex = Math.max(lowIndex, Math.min(binCount - 1, Math.floor(((bar.high || bar.close) - minimum) / binSize)));
      const spread = highIndex - lowIndex + 1;
      for (let index = lowIndex; index <= highIndex; index++) {
        volumes[index] += (bar.volume || 0) / spread;
      }
    });

    const total = volumes.reduce((sum, value) => sum + value, 0);
    const average = total / binCount;
    const currentIndex = Math.max(0, Math.min(binCount - 1, Math.floor((currentPrice - minimum) / binSize)));
    const data = volumes.map((volume, index) => ({
      price: (minimum + (index + 0.5) * binSize).toFixed(2),
      volume,
      isCurrent: index === currentIndex,
      isPeak: volume >= average * 1.35,
    }));
    const concentration = total > 0
      ? volumes.slice().sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0) / total * 100
      : undefined;

    let cumulative = 0;
    let lower = minimum;
    let upper = maximum;
    let lowerFound = false;
    let upperFound = false;
    volumes.forEach((volume, index) => {
      cumulative += volume;
      if (total > 0 && cumulative / total >= 0.05 && !lowerFound) {
        lower = minimum + index * binSize;
        lowerFound = true;
      }
      if (total > 0 && cumulative / total >= 0.95 && !upperFound) {
        upper = minimum + (index + 1) * binSize;
        upperFound = true;
      }
    });
    return { data, concentration, range: [lower, upper] as [number, number] };
  }, [currentPrice, history]);
  const { data, concentration, range: cost90Range } = profile;

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-2 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                近60日成交分布 (Volume Profile)
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
                    {concentration === undefined ? '--' : `${concentration.toFixed(1)}%`}
                </div>
            </div>
            <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100">
                <div className="flex items-center gap-2 mb-1">
                    <Scale className="w-3 h-3 text-purple-600" />
                    <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest">90% 成本区间</span>
                </div>
                <div className="text-[11px] font-black font-mono tracking-tighter text-purple-900 leading-none mt-1.5">
                    {cost90Range ? `¥${cost90Range[0].toFixed(2)} - ¥${cost90Range[1].toFixed(2)}` : '--'}
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
                                        <p className="text-[9px] font-medium text-slate-400">成交量: {Number(payload[0].value || 0).toFixed(0)} 手</p>
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
                <Lock className="w-2.5 h-2.5" /> 样本: {Math.min(history.length, 60)}日
            </div>
        </div>
      </CardContent>
    </Card>
  );
};
