import React, { useState, useEffect, useRef } from 'react';
import { Stock } from '../types';
import { ArrowUp, ArrowDown, Zap, ShieldAlert, CircleDot, Activity } from 'lucide-react';
import { cn } from './ui/utils';
import { motion, AnimatePresence } from 'motion/react';
import { fetchStockTicks } from '../services/marketData';

interface Transaction {
    id: string;
    time: string;
    price: number;
    size: number; // In lots (手)
    type: 'Buy' | 'Sell';
    isLarge: boolean;
}

interface Props {
    stock: Stock;
}

export const L2OrderFlow: React.FC<Props> = ({ stock }) => {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [buyPressure, setBuyPressure] = useState(50); // 0-100
    const [isLoading, setIsLoading] = useState(true);

    // Real-time L2 Fetch Logic (v29.8 - Anti-Flicker)
    useEffect(() => {
        if (!stock?.code) return;

        let isMounted = true;
        const loadTicks = async () => {
            try {
                const rawTicks = await fetchStockTicks(stock.code);
                if (!isMounted) return;

                if (!Array.isArray(rawTicks)) {
                    setTransactions([]);
                    setIsLoading(false);
                    return;
                }

                // Transform & Deduplicate
                const mappedTicks: Transaction[] = rawTicks.map((tick: any) => {
                    // Create a stable unique ID based on transaction content
                    // Sina ticks usually return time, price, volume. 
                    // We use these together to create a unique fingerprint.
                    const id = `${tick.time}-${tick.price}-${tick.volume}-${tick.type}`;
                    return {
                        id,
                        time: tick.time,
                        price: parseFloat(tick.price),
                        size: Math.round(parseFloat(tick.volume) / 100),
                        type: tick.type === '买盘' || tick.type === 'UP' ? 'Buy' : 'Sell',
                        isLarge: parseFloat(tick.volume) >= 100000
                    };
                });

                setTransactions(prev => {
                    // Merge logic: Only add items that don't already exist in the previous state
                    // This prevents re-animating existing items
                    const existingIds = new Set(prev.map(t => t.id));
                    const newItems = mappedTicks.filter(t => !existingIds.has(t.id));
                    
                    if (newItems.length === 0) return prev; // No changes, skip update to prevent re-render flicker
                    
                    // Combine and take the most recent 40
                    const combined = [...newItems, ...prev].slice(0, 40);
                    return combined;
                });
                
                // Pressure update
                if (mappedTicks.length > 0) {
                    const buyVol = mappedTicks.filter(t => t.type === 'Buy').reduce((sum, t) => sum + t.size, 0);
                    const totalVol = mappedTicks.reduce((sum, t) => sum + t.size, 0);
                    const pressure = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
                    setBuyPressure(pressure);
                }
                
                setIsLoading(false);
            } catch (error) {
                console.error("Failed to load real ticks", error);
            }
        };

        loadTicks();
        const interval = setInterval(loadTicks, 5000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [stock.code]);

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[500px] transform-gpu">
            {/* Header: Pressure Gauge */}
            <div className="p-4 border-b border-white/5 bg-white/5 backdrop-blur-md">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        <span className="text-[10px] font-black text-white/70 uppercase tracking-widest">逐笔委托流量 (L2 Flow)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                        <span className="text-[10px] font-black text-red-500 uppercase">Live Stream</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                        <span className="text-red-500">主力买盘 {buyPressure.toFixed(0)}%</span>
                        <span className="text-green-500">抛压 { (100 - buyPressure).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex shadow-inner">
                        <motion.div 
                            className="h-full bg-red-600" 
                            animate={{ width: `${buyPressure}%` }}
                            transition={{ type: "spring", stiffness: 50, damping: 20 }}
                        />
                        <motion.div 
                            className="h-full bg-green-600" 
                            animate={{ width: `${100 - buyPressure}%` }}
                            transition={{ type: "spring", stiffness: 50, damping: 20 }}
                        />
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-2">
                <div className="grid grid-cols-4 px-3 py-2 text-[8px] font-black text-white/30 uppercase tracking-widest border-b border-white/5 sticky top-0 bg-slate-900/90 backdrop-blur-sm z-10">
                    <span>时间</span>
                    <span>价格</span>
                    <span className="text-right">成交量(手)</span>
                    <span className="text-right">性质</span>
                </div>
                
                {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 h-full opacity-40">
                        <Activity className="w-8 h-8 text-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">正在同步真实 L2 数据...</span>
                    </div>
                ) : (
                    <div className="space-y-0.5 mt-1">
                        <AnimatePresence mode="popLayout">
                            {transactions.map((tx) => (
                                <motion.div 
                                    key={tx.id}
                                    layout="position"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className={cn(
                                        "grid grid-cols-4 px-3 py-1.5 rounded-lg text-[10px] font-mono transition-colors overflow-hidden",
                                        tx.isLarge ? (tx.type === 'Buy' ? "bg-red-950/40 border border-red-900/50" : "bg-green-950/40 border border-green-900/50") : "hover:bg-white/5"
                                    )}
                                >
                                    <span className="text-white/40">{tx.time}</span>
                                    <span className={cn("font-black", tx.type === 'Buy' ? "text-red-500" : "text-green-500")}>
                                        {tx.price.toFixed(2)}
                                    </span>
                                    <span className={cn("text-right font-black", tx.isLarge ? "text-white" : "text-white/70")}>
                                        {tx.size.toLocaleString()}
                                    </span>
                                    <span className="text-right flex justify-end items-center gap-1">
                                        {tx.isLarge && <Zap className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />}
                                        <span className={cn("font-black px-1 rounded-sm", 
                                            tx.type === 'Buy' ? "text-red-500 bg-red-500/10" : "text-green-500 bg-green-500/10")}>
                                            {tx.type === 'Buy' ? 'B' : 'S'}
                                        </span>
                                    </span>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Footer: Tactical Summary */}
            <div className="p-3 bg-black/40 border-t border-white/5">
                <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-lg", buyPressure > 55 ? "bg-red-500/20 text-red-500" : "bg-green-500/20 text-green-500")}>
                        {buyPressure > 55 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1">
                        <div className="text-[9px] font-black text-white/50 uppercase tracking-widest">实时动能分析</div>
                        <div className="text-[10px] font-black text-white italic">
                            {buyPressure > 65 ? "资金疯狂扫筹，核心进攻期" : 
                             buyPressure > 55 ? "买盘承接有力，建议持筹" :
                             buyPressure > 45 ? "多空博弈焦灼，观望分时均线" :
                             "抛压显著增强，警惕诱多反杀"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};