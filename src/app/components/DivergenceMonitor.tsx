import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, ReferenceLine } from 'recharts';
import { Unplug, Zap, TriangleAlert, TrendingUp, Compass } from 'lucide-react';
import { Stock, MarketIndex } from '../types';
import { cn } from './ui/utils';

// V59.6 FIX: Stable prop references for recharts 3.x
const DOMAIN_X: [string, string] = ['dataMin - 2', 'dataMax + 2'];
const MARGIN_DIV = { left: 20, right: 30 };
const YAXIS_TICK_STYLE = { fontSize: 9, fontWeight: 900, fill: '#64748b' };

interface Props {
  stock: Stock;
  index: MarketIndex;
}

export const DivergenceMonitor: React.FC<Props> = ({ stock, index }) => {
  // Simulate sector performance (avg of similar stocks)
  const sectorChange = (stock.changePercent || 0) * 0.7 - 1.5; // Dummy logic
  
  const data = [
    { name: 'Market (沪深)', value: index.changePercent, color: '#94a3b8' },
    { name: 'Sector (所属)', value: sectorChange, color: '#6366f1' },
    { name: 'Target (标的)', value: stock.changePercent, color: '#dc2626' }
  ];

  const alpha = (stock.changePercent || 0) - index.changePercent;
  const independence = (stock.changePercent || 0) - sectorChange;

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-2 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Unplug className="w-3.5 h-3.5 text-orange-600" />
                背离指数监测 (Divergence)
            </div>
            <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                <span className="text-[9px] font-black text-slate-900 uppercase">Alpha Focus</span>
            </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%" minHeight={100} minWidth={100}>
                <BarChart data={data} layout="vertical" margin={MARGIN_DIV}>
                    <XAxis type="number" hide domain={DOMAIN_X} />
                    <YAxis dataKey="name" type="category" width={80} tick={YAXIS_TICK_STYLE} axisLine={false} tickLine={false} />
                    <ReferenceLine x={0} stroke="#e2e8f0" />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Alpha 收益</div>
                <div className={cn("text-lg font-black font-mono tracking-tighter", alpha > 0 ? "text-red-600" : "text-green-600")}>
                    {alpha > 0 ? '+' : ''}{alpha.toFixed(2)}%
                </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">独立性溢价</div>
                <div className={cn("text-lg font-black font-mono tracking-tighter", independence > 0 ? "text-purple-600" : "text-slate-600")}>
                    {independence > 0 ? '+' : ''}{independence.toFixed(2)}%
                </div>
            </div>
        </div>

        {/* Tactical Status */}
        <div className="mt-4 p-3 rounded-xl border border-dashed border-slate-200">
            {alpha > 3 && independence > 2 ? (
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-50 rounded-lg shrink-0">
                        <TrendingUp className="w-4 h-4 text-red-600" />
                    </div>
                    <p className="text-[10px] font-bold text-red-700 leading-tight">
                        核心独立性确认！该股无视大盘波动，属于当前绝对龙头。
                    </p>
                </div>
            ) : alpha < -2 ? (
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-50 rounded-lg shrink-0">
                        <TriangleAlert className="w-4 h-4 text-green-600" />
                    </div>
                    <p className="text-[10px] font-bold text-green-700 leading-tight">
                        负背离严重。标的跑输大盘及板块，面临补跌风险。
                    </p>
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg shrink-0">
                        <Compass className="w-4 h-4 text-slate-500" />
                    </div>
                    <p className="text-[10px] font-bold text-slate-600 leading-tight">
                        随波逐流态势。属于跟风补涨，关注领涨板块动向。
                    </p>
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
};