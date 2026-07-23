import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Stock } from '../types';
import { fetchStockTicks } from '../services/marketData';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ComposedChart, Line } from 'recharts';
import { Activity, Zap, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { cn } from './ui/utils';

// V59.6 FIX: Stable prop references for recharts 3.x
const CVD_TOOLTIP_CONTENT_STYLE = { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' };
const CVD_TOOLTIP_ITEM_STYLE = { fontSize: '10px', fontWeight: 'bold' };
const CVD_TOOLTIP_LABEL_STYLE = { color: '#94a3b8', fontSize: '10px', marginBottom: '4px' };

interface Props {
  stock: Stock;
}

interface CVDPoint {
  time: string;
  price: number;
  cvd: number;
  delta: number;
  buyVol: number;
  sellVol: number;
}

export const MicroStructureCVD: React.FC<Props> = ({ stock }) => {
  const [data, setData] = useState<CVDPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const processedTicks = useRef<Set<string>>(new Set());
  const lastCVD = useRef<number>(0);
  
  // Keep track of the latest processed price to avoid flat lines if no ticks
  const lastPrice = useRef<number>(stock.currentPrice || 0);

  // Initialize from session storage if available to persist across dialog closes
  const [isMounted, setIsMounted] = React.useState(false);
  useEffect(() => {
    setIsMounted(true);
    const key = `cvd_v1_${stock.code}`;
    try {
        const saved = sessionStorage.getItem(key);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Only keep data from today (simple check)
            if (parsed.length > 0 && parsed[parsed.length - 1].time) {
                setData(parsed);
                lastCVD.current = parsed[parsed.length - 1].cvd;
                processedTicks.current = new Set(parsed.map((p: any) => p.id).filter((id: string) => id));
            }
        }
    } catch (e) {
        console.warn("Failed to load CVD session", e);
    }
  }, [stock.code]);

  // Persist to session
  useEffect(() => {
    if (data.length > 0) {
        const key = `cvd_v1_${stock.code}`;
        // Limit to last 500 points to save memory
        const toSave = data.slice(-500);
        sessionStorage.setItem(key, JSON.stringify(toSave));
    }
  }, [data, stock.code]);

  useEffect(() => {
    let isMounted = true;
    const loadTicks = async () => {
        try {
            const rawTicks = await fetchStockTicks(stock.code);
            if (!isMounted) return;

            if (!Array.isArray(rawTicks)) return;

            // Sort by time ascending (API usually returns descending)
            // Need to handle time crossing hours (e.g. 09:59 -> 10:00)
            // Simple reverse is usually enough for Sina
            const sortedTicks = [...rawTicks].reverse();

            const newPoints: CVDPoint[] = [];
            
            sortedTicks.forEach((tick: any) => {
                // Unique ID for tick
                const id = `${tick.time}-${tick.price}-${tick.volume}-${tick.type}`;
                
                if (processedTicks.current.has(id)) return;
                processedTicks.current.add(id);

                const price = parseFloat(tick.price);
                const volume = Math.round(parseFloat(tick.volume) / 100); // Hand (100 shares)
                const isBuy = tick.type === '买盘' || tick.type === 'UP';
                
                // Delta Logic
                const delta = isBuy ? volume : -volume;
                lastCVD.current += delta;
                lastPrice.current = price;

                newPoints.push({
                    time: tick.time,
                    price: price,
                    cvd: lastCVD.current,
                    delta: delta,
                    buyVol: isBuy ? volume : 0,
                    sellVol: !isBuy ? volume : 0
                });
            });

            if (newPoints.length > 0) {
                setData(prev => {
                    const combined = [...prev, ...newPoints];
                    // Keep roughly last 30 minutes of high freq data (approx 600 points)
                    return combined.slice(-600); 
                });
            }
            
            setIsLoading(false);
        } catch (error) {
            console.error("CVD fetch error", error);
        }
    };

    loadTicks();
    const interval = setInterval(loadTicks, 3000); // 3s polling for granularity

    return () => {
        isMounted = false;
        clearInterval(interval);
    };
  }, [stock.code]);

  // Derived stats
  const stats = useMemo(() => {
    if (data.length < 10) return { divergence: 'Neutral', signal: 'Wait', strength: 0 };
    
    // Calculate simple divergence
    // Price Trend (Slope of last 20 points)
    const recent = data.slice(-20);
    const startP = recent[0].price;
    const endP = recent[recent.length - 1].price;
    const priceChg = (endP - startP) / startP;

    // CVD Trend
    const startCVD = recent[0].cvd;
    const endCVD = recent[recent.length - 1].cvd;
    const cvdChg = endCVD - startCVD;

    let signal = 'Wait';
    let divergence = 'Neutral';
    
    // Logic:
    // Price Up, CVD Down -> Bearish Divergence (Trap)
    // Price Down, CVD Up -> Bullish Divergence (Absorption)
    
    if (priceChg > 0.001 && cvdChg < 0) {
        divergence = 'Bearish';
        signal = 'Sell';
    } else if (priceChg < -0.001 && cvdChg > 0) {
        divergence = 'Bullish';
        signal = 'Buy';
    } else if (priceChg > 0 && cvdChg > 0) {
        divergence = 'Resonance Up';
        signal = 'Hold';
    } else if (priceChg < 0 && cvdChg < 0) {
        divergence = 'Resonance Down';
        signal = 'Avoid';
    }

    return { divergence, signal, cvdChg };
  }, [data]);

  if (isLoading && data.length === 0) {
    return (
        <div className="h-[240px] flex flex-col items-center justify-center bg-slate-900/50 rounded-3xl border border-slate-800 p-8 text-center animate-pulse">
            <RefreshCw className="w-8 h-8 text-slate-600 mb-3 animate-spin" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">
                正在初始化资金博弈流 (CVD Stream)...
            </span>
        </div>
    );
  }

  // V59.6 FIX: Memoize priceDomain to prevent recharts 3.x infinite loop
  const priceDomain = useMemo(() => {
    if (data.length === 0) return [0, 1];
    return [
      Math.min(...data.map(d => d.price)) * 0.999,
      Math.max(...data.map(d => d.price)) * 1.001
    ];
  }, [data]);

  return (
    <div className="space-y-4">
        {/* Header Stats */}
        <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
                 <Zap className="w-4 h-4 text-yellow-500" />
                 <span className="text-xs font-black text-white uppercase tracking-wider">CVD 资金博弈线</span>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right">
                    <span className="text-[9px] font-black text-slate-500 uppercase block">Net Flow</span>
                    <span className={cn("text-xs font-mono font-black", stats.cvdChg > 0 ? "text-red-500" : "text-green-500")}>
                        {stats.cvdChg > 0 ? '+' : ''}{stats.cvdChg}手
                    </span>
                </div>
                <div className="text-right">
                    <span className="text-[9px] font-black text-slate-500 uppercase block">Signal</span>
                    <span className={cn("text-xs font-black px-2 py-0.5 rounded", 
                        stats.signal === 'Buy' ? "bg-red-500 text-white" : 
                        stats.signal === 'Sell' ? "bg-green-500 text-white" : 
                        "bg-slate-700 text-slate-300")}>
                        {stats.signal}
                    </span>
                </div>
            </div>
        </div>

        {/* Chart */}
        <div className="h-[240px] w-full bg-slate-900 rounded-xl border border-slate-800 relative overflow-hidden" style={{ minWidth: 300 }}>
             {data.length < 5 && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900/80 backdrop-blur-sm">
                    <span className="text-xs text-slate-500 font-bold">正在积累足够的 Tick 数据...</span>
                </div>
             )}
             
             {/* VISUAL ALERT OVERLAY (HUNTER V4.5) */}
             {stats.divergence === 'Bearish' && (
                 <div className="absolute top-4 left-4 z-20 bg-red-900/90 border border-red-500 text-red-100 px-4 py-2 rounded-lg backdrop-blur-sm shadow-xl shadow-red-900/50 animate-pulse">
                     <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                         <TrendingDown className="w-4 h-4" />
                         TRAP DETECTED
                     </div>
                     <div className="text-[9px] text-red-300 font-mono mt-1">Price ↑ but Money Flow ↓</div>
                 </div>
             )}
             {stats.divergence === 'Bullish' && (
                 <div className="absolute top-4 left-4 z-20 bg-emerald-900/90 border border-emerald-500 text-emerald-100 px-4 py-2 rounded-lg backdrop-blur-sm shadow-xl shadow-emerald-900/50 animate-pulse">
                     <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                         <Zap className="w-4 h-4 text-yellow-400" />
                         HIDDEN ENTRY
                     </div>
                     <div className="text-[9px] text-emerald-300 font-mono mt-1">Price ↓ but Money Flow ↑</div>
                 </div>
             )}
             
             {isMounted && (
               <>
                 {/* V67.4 FIX: Move gradient defs outside chart to avoid null-key collision with Recharts internal defs */}
                 <svg width={0} height={0} className="absolute">
                   <defs>
                     <linearGradient id="cvdGradient" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                       <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                     </linearGradient>
                     <linearGradient id="cvdGradientPos" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                       <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                 </svg>
                 <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <ComposedChart data={data}>
                        <XAxis dataKey="time" hide />
                        
                        {/* Price Axis (Left) */}
                        <YAxis 
                            yAxisId="price" 
                            domain={priceDomain} 
                            orientation="left" 
                            hide
                        />
                        
                        {/* CVD Axis (Right) */}
                        <YAxis 
                            yAxisId="cvd" 
                            orientation="right" 
                            hide
                        />
                        
                        <Tooltip 
                            contentStyle={CVD_TOOLTIP_CONTENT_STYLE}
                            itemStyle={CVD_TOOLTIP_ITEM_STYLE}
                            labelStyle={CVD_TOOLTIP_LABEL_STYLE}
                            formatter={(value: any, name: string) => {
                                if (name === 'price') return [value.toFixed(2), '价格'];
                                if (name === 'cvd') return [value, 'CVD累积'];
                                return [value, name];
                            }}
                        />

                        {/* CVD Area */}
                        <Area 
                            yAxisId="cvd"
                            type="monotone"
                            dataKey="cvd"
                            stroke={stats.cvdChg > 0 ? "#ef4444" : "#10b981"}
                            fill={stats.cvdChg > 0 ? "url(#cvdGradientPos)" : "url(#cvdGradient)"}
                            strokeWidth={2}
                        />

                        {/* Price Line */}
                        <Line 
                            yAxisId="price"
                            type="monotone"
                            dataKey="price"
                            stroke="#fbbf24"
                            strokeWidth={2}
                            dot={false}
                        />
                        
                    </ComposedChart>
                 </ResponsiveContainer>
               </>
             )}
        </div>
        
        {/* Legend */}
        <div className="flex items-center justify-center gap-6 text-[9px] uppercase font-black text-slate-500">
            <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-yellow-400" />
                <span>Price Action</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500/20 border border-red-500 rounded-sm" />
                <span>CVD (Aggressive Flow)</span>
            </div>
        </div>
    </div>
  );
};