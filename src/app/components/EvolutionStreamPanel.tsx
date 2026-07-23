import React, { useMemo, useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import { useTrading } from '../context/Store';
import { MarketPhase, SentimentPoint } from '../types';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Zap, Flame, Snowflake, CloudRain, RefreshCw, Activity, Timer, TrendingUp, TrendingDown, Gauge } from 'lucide-react';
import { cn } from './ui/utils';
import { motion } from 'motion/react';

// V59.6 FIX: Extract all inline object/array props to stable module-level constants.
const DOMAIN_0_100: [number, number] = [0, 100];
const MARGIN_STREAM = { top: 20, right: 30, left: 0, bottom: 0 };
const XAXIS_TICK_STYLE = { fontSize: 9, fill: '#94a3b8', fontWeight: 600 };
const XAXIS_TICKS = ['09:30', '10:30', '11:30', '13:00', '14:00', '15:00'];
const TOOLTIP_CONTENT_STYLE = { 
    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
    borderRadius: '12px', 
    border: 'none', 
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' 
};
const TOOLTIP_ITEM_STYLE = { fontSize: '10px', fontWeight: 'bold' };
const TOOLTIP_LABEL_STYLE = { display: 'none' };
const BOILING_LABEL = { position: 'right' as const, value: 'Boiling', fontSize: 9, fill: '#ef4444' };
const FREEZING_LABEL = { position: 'right' as const, value: 'Freezing', fontSize: 9, fill: '#3b82f6' };

const PHASE_CONFIG: Record<MarketPhase, { label: string; color: string; icon: any; gradient: string }> = {
    'Ice': { label: '极寒冰点', color: 'text-blue-500', icon: Snowflake, gradient: 'from-blue-500 to-cyan-400' },
    'Repair': { label: '冰点修复', color: 'text-emerald-500', icon: RefreshCw, gradient: 'from-emerald-400 to-teal-500' },
    'Startup': { label: '新周启动', color: 'text-orange-500', icon: Zap, gradient: 'from-orange-500 to-yellow-400' },
    'Climax': { label: '情绪高潮', color: 'text-red-600', icon: Flame, gradient: 'from-red-600 to-rose-500' },
    'Ebb': { label: '退潮期', color: 'text-slate-500', icon: CloudRain, gradient: 'from-slate-500 to-gray-600' },
    'Chaos': { label: '混沌期', color: 'text-purple-500', icon: Activity, gradient: 'from-purple-500 to-indigo-500' }
};

// V67 FIX: Custom hook replaces ResponsiveContainer to eliminate both the 0x0 warning
// and the null-key SVG warning that ResponsiveContainer's internal Surface triggers.
function useContainerSize(ref: React.RefObject<HTMLDivElement | null>): { width: number; height: number } {
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // Measure immediately on mount
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
        }
        const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                const { width, height } = entry.contentRect;
                const w = Math.floor(width);
                const h = Math.floor(height);
                if (w > 0 && h > 0) {
                    setSize(prev => (prev.width === w && prev.height === h) ? prev : { width: w, height: h });
                }
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return size;
}

export const EvolutionStreamPanel: React.FC = () => {
    const { sentimentHistory, phase, metrics } = useTrading();

    const streamData = useMemo(() => {
        const timeline: any[] = [];
        const pad = (n: number) => n.toString().padStart(2, '0');

        // Generate Morning Session (09:30 - 11:30)
        for (let h = 9; h <= 11; h++) {
            for (let m = 0; m < 60; m++) {
                if (h === 9 && m < 30) continue;
                if (h === 11 && m > 30) continue;
                timeline.push({ time: `${pad(h)}:${pad(m)}` });
            }
        }

        // Generate Afternoon Session (13:00 - 15:00)
        for (let h = 13; h <= 15; h++) {
            for (let m = 0; m < 60; m++) {
                if (h === 15 && m > 0) continue;
                timeline.push({ time: `${pad(h)}:${pad(m)}` });
            }
        }

        const historyMap = new Map(sentimentHistory.map(pt => [pt.time, pt]));
        
        let lastValidScore = sentimentHistory.length > 0 ? sentimentHistory[0].score : 50;
        let lastValidTemp = sentimentHistory.length > 0 ? sentimentHistory[0].temp : 50;

        // V67 FIX: Truncate at last real data point to eliminate future undefined slots
        // that cause Recharts to generate SVG elements with null keys.
        const lastDataTime = sentimentHistory.length > 0 
            ? sentimentHistory[sentimentHistory.length - 1].time 
            : null;

        const result: any[] = [];
        for (const slot of timeline) {
            if (!lastDataTime) {
                // No data: fill full timeline with baseline so XAxis renders properly
                result.push({
                    time: slot.time,
                    scoreStream: 50,
                    tempStream: 50,
                    fearStream: 0,
                });
                continue;
            }

            // Stop after last real data point — no future undefined slots
            if (slot.time > lastDataTime) break;

            const historyPt = historyMap.get(slot.time);
            
            if (historyPt) {
                lastValidScore = historyPt.score;
                lastValidTemp = historyPt.temp;
                result.push({
                    time: slot.time,
                    scoreStream: historyPt.score,
                    tempStream: historyPt.temp,
                    fearStream: (metrics.limitDownCount || 0) * -1,
                });
            } else {
                result.push({
                    time: slot.time,
                    scoreStream: lastValidScore,
                    tempStream: lastValidTemp,
                    fearStream: (metrics.limitDownCount || 0) * -1,
                });
            }
        }

        return result.length > 0 ? result : [{ time: '09:30', scoreStream: 50, tempStream: 50, fearStream: 0 }];
    }, [sentimentHistory, metrics]);

    const momentum = useMemo(() => {
        if (streamData.length < 5) return 'Stable';
        const validData = streamData.filter((d: any) => typeof d.scoreStream === 'number');
        if (validData.length < 5) return 'Stable';
        const last5 = validData.slice(-5);
        const slope = (last5[4].scoreStream - last5[0].scoreStream) / 5;
        if (slope > 2) return 'Accelerating';
        if (slope < -2) return 'Decelerating';
        return 'Stable';
    }, [streamData]);

    const currentPhaseConfig = PHASE_CONFIG[phase] || PHASE_CONFIG['Chaos'];
    const PhaseIcon = currentPhaseConfig.icon;

    // V67 FIX: Use ResizeObserver instead of ResponsiveContainer.
    // The ref div is ALWAYS rendered so the observer can measure it.
    // The chart only renders when we have valid pixel dimensions.
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const { width: chartW, height: chartH } = useContainerSize(chartContainerRef);

    return (
        <Card className="bg-white border border-slate-200 rounded-[2rem] shadow-xl shadow-slate-200/40 overflow-hidden relative group">
            {/* Header Area */}
            <div className="p-6 border-b border-slate-100/50 bg-slate-50/30 flex justify-between items-center relative z-10">
                <div>
                    <h4 className="text-xs font-black flex items-center gap-2 uppercase tracking-[0.2em] text-slate-600">
                        <Activity className="size-4 text-red-600" />
                        情绪周期进化流 (Evolution Stream v4.0)
                    </h4>
                    <div className="flex items-center gap-2 mt-1 pl-6">
                         <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-white bg-gradient-to-r", currentPhaseConfig.gradient)}>
                            PHASE: {currentPhaseConfig.label}
                         </span>
                         <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tight flex items-center gap-1">
                            <Timer className="w-3 h-3" /> Momentum: {momentum}
                         </span>
                    </div>
                </div>
                
                {/* Mini Dashboard Right */}
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sentiment</div>
                        <div className={cn("text-lg font-black font-mono italic leading-none", 
                            (metrics.marketTemp || 50) > 80 ? "text-red-600" : "text-slate-700")}>
                            {metrics.marketTemp?.toFixed(0) || 50}°
                        </div>
                    </div>
                    <div className="h-8 w-px bg-slate-200" />
                    <div className="text-right">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Power</div>
                        <div className="text-lg font-black font-mono italic leading-none text-slate-900">
                            {metrics.limitUpCount} <span className="text-[9px] text-slate-400">UP</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content: Chart + Cycle Engine */}
            <div className="grid grid-cols-1 lg:grid-cols-4 h-auto lg:h-[360px]">
                
                {/* Left: The Stream Chart (3 cols) */}
                <div className="lg:col-span-3 h-[250px] lg:h-full relative p-4 pl-0">
                    {/* V67: This div is ALWAYS rendered so ResizeObserver can measure it */}
                    <div ref={chartContainerRef} className="w-full h-full">
                        {chartW > 0 && chartH > 0 && (
                            <AreaChart width={chartW} height={chartH} data={streamData} margin={MARGIN_STREAM}>
                                <defs key="chart-defs">
                                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid key="grid" strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                    key="xaxis"
                                    dataKey="time" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={XAXIS_TICK_STYLE}
                                    minTickGap={60}
                                    ticks={XAXIS_TICKS}
                                />
                                <YAxis key="yaxis" hide domain={DOMAIN_0_100} />
                                <Tooltip 
                                    key="tooltip"
                                    contentStyle={TOOLTIP_CONTENT_STYLE}
                                    itemStyle={TOOLTIP_ITEM_STYLE}
                                    labelStyle={TOOLTIP_LABEL_STYLE}
                                />
                                
                                <ReferenceLine key="ref-boiling" y={80} stroke="#fee2e2" strokeDasharray="3 3" label={BOILING_LABEL} />
                                <ReferenceLine key="ref-freezing" y={20} stroke="#e0f2fe" strokeDasharray="3 3" label={FREEZING_LABEL} />

                                <Area 
                                    key="area-score"
                                    type="monotone" 
                                    dataKey="scoreStream" 
                                    stroke="#ef4444" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorScore)" 
                                    animationDuration={1500}
                                    connectNulls
                                    isAnimationActive={false}
                                />

                                <Area 
                                    key="area-temp"
                                    type="monotone" 
                                    dataKey="tempStream" 
                                    stroke="#f97316" 
                                    strokeWidth={1}
                                    strokeDasharray="4 4"
                                    fillOpacity={1} 
                                    fill="url(#colorTemp)" 
                                    animationDuration={2000}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                                
                            </AreaChart>
                        )}
                    </div>

                    {/* Loading placeholder when chart hasn't measured yet */}
                    {(chartW === 0 || chartH === 0) && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Activity className="w-6 h-6 text-slate-200 animate-pulse" />
                        </div>
                    )}

                    {/* Overlay Tag */}
                    <div className="absolute top-4 left-6 pointer-events-none">
                        <Badge variant="outline" className="bg-white/50 backdrop-blur border-slate-200 text-[9px] text-slate-400 font-mono uppercase tracking-widest">
                            Real-time Sentiment Velocity
                        </Badge>
                    </div>
                </div>

                {/* Right: Cycle Engine (1 col) */}
                <div className="lg:col-span-1 h-full border-l border-slate-100 bg-slate-50/30 p-6 flex flex-col justify-between relative overflow-hidden">
                    {/* Background decoration */}
                    <div className={cn("absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20", currentPhaseConfig.color.replace('text-', 'bg-'))} />
                    
                    <div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Gauge className="w-3.5 h-3.5" />
                            Cycle Engine Status
                        </div>
                        
                        {/* Phase Indicator */}
                        <div className="relative w-full aspect-square max-w-[160px] mx-auto mb-4 flex items-center justify-center">
                            {/* Animated Rings */}
                            <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                            <motion.div 
                                className={cn("absolute inset-0 rounded-full border-4 border-t-transparent animate-spin-slow", currentPhaseConfig.color.replace('text-', 'border-'))}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                            />
                            <div className="flex flex-col items-center z-10">
                                <PhaseIcon className={cn("w-8 h-8 mb-2", currentPhaseConfig.color)} />
                                <span className={cn("text-lg font-black italic tracking-tighter", currentPhaseConfig.color)}>
                                    {currentPhaseConfig.label}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Limit Up Pressure</span>
                                <span className="text-[9px] font-black text-red-600">{metrics.limitUpCount}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-red-500" 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, metrics.limitUpCount * 1.2)}%` }}
                                />
                            </div>
                        </div>

                        <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Panic / Fear</span>
                                <span className="text-[9px] font-black text-blue-600">{metrics.limitDownCount}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-blue-500" 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, metrics.limitDownCount * 5)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};