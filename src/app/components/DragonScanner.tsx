import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { MarketEvent, Stock } from "../types";
import { useTrading } from "../context/Store";
import { AlertCircle, TrendingUp, Zap, Target, ArrowRight, Rocket, Star, ChevronRight, Fingerprint, ShieldCheck, AlertTriangle, Droplet, Anchor, ShieldPlus, TrendingDown, Activity, DollarSign, Eye, Crosshair, Skull, FileWarning, SearchX } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "./ui/utils";
import { Progress } from "./ui/progress";
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

// V67.3: Board type detection for risk awareness (20% limit boards)
function getBoardType(code: string): { label: string; color: string } | null {
    if (!code) return null;
    const c = code.replace(/\D/g, ''); // strip exchange prefix like "sz" "sh"
    if (c.startsWith('300') || c.startsWith('301')) return { label: '创', color: 'bg-orange-500 text-white' };
    if (c.startsWith('688')) return { label: '科', color: 'bg-blue-500 text-white' };
    return null;
}

export function DragonScanner() {
    const { stocks, updateStock } = useTrading();
    const [signalValidations, setSignalValidations] = useState<Record<string, any>>({});

    // Debug: 打印股票数据
    React.useEffect(() => {
        console.log('🐉 DragonScanner - Total stocks:', stocks.length);
        console.log('🐉 DragonScanner - Stocks with realtimeMetrics:', stocks.filter(s => s.realtimeMetrics).length);
        const topStocks = stocks.filter(s => (s.strengthScore || 0) > 70).slice(0, 8);
        console.log('🐉 DragonScanner - Top stocks (strength>70):', topStocks.length);
        topStocks.forEach(s => {
            console.log(`  - ${s.name} (${s.code}): strength=${s.strengthScore}, hasRealtime=${!!s.realtimeMetrics}`);
        });
    }, [stocks]);

    // 过滤出 AI 建议为"主升"或"博弈/试错"且具有明确买入点的标的
    const tacticalOpportunities = stocks.filter(s => {
        const trend = s.aiPrediction?.trend;
        const isWeakToStrong = s.aiPrediction?.summary.includes('弱转强');
        return (trend === 'Accelerate' || trend === 'Rebound' || isWeakToStrong) && 
               s.status === 'Watch' && 
               s.aiPrediction?.buyPoint;
    }).sort((a, b) => {
        // Prioritize Weak to Strong signals
        const aWts = a.aiPrediction?.summary.includes('弱转强') ? 1 : 0;
        const bWts = b.aiPrediction?.summary.includes('弱转强') ? 1 : 0;
        if (aWts !== bWts) return bWts - aWts;
        return (b.strengthScore || 0) - (a.strengthScore || 0);
    });

    // v5.8.2 Signal Decorator Integration
    useEffect(() => {
        const validateSignals = async () => {
            const validations: Record<string, any> = {};
            // Only validate the top 4 to save bandwidth
            for (const stock of tacticalOpportunities.slice(0, 4)) {
                try {
                    const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-545d7fd7/market/validate-signal`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${publicAnonKey}`
                        },
                        body: JSON.stringify({
                            signalType: "ASSAULT",
                            winRate: stock.strengthScore || 50,
                            alpha: (stock.moneyQualityScore || 50) - 50, // Approx Alpha from score center 50
                            trapGuard: (stock.trapSignals?.length || 0) * 15, // Approx trap probability
                            volumeRatio: stock.volumeRatio || 1.0
                        })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        validations[stock.id] = data;
                    }
                } catch (e) {
                    console.error("Signal Validation Error:", e);
                }
            }
            setSignalValidations(validations);
        };

        if (tacticalOpportunities.length > 0) {
            validateSignals();
        }
    }, [stocks]); // Depend on stocks to re-validate when data updates

    // v5.9: Add stocks in Dragon Pool to Watchlist automatically if they are strong
    useEffect(() => {
         const topDragons = stocks.filter(s => (s.strengthScore || 0) > 85 && s.status === 'Normal');
         if (topDragons.length > 0) {
             topDragons.forEach(dragon => {
                 updateStock(dragon.id, { status: 'Watch' });
             });
         }
    }, [stocks]);

    return (
        <div className="space-y-4">
            {/* 顶置战术机会区 - 仅在有高胜率标的时显示 */}
            <AnimatePresence>
                {tacticalOpportunities.length > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-red-50 border border-red-200 rounded-xl p-4 mb-2 shadow-sm"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="relative">
                                <Target className="w-5 h-5 text-red-600" />
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full animate-ping"></span>
                            </div>
                            <h3 className="text-sm font-black text-red-600 uppercase tracking-wider">实时战术进攻机会</h3>
                            <Badge variant="outline" className="ml-auto text-[10px] border-red-200 text-red-600 bg-white">
                                AI 信号触发
                            </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {tacticalOpportunities.slice(0, 4).map(stock => {
                                const validation = signalValidations[stock.id];
                                const isRisk = validation?.display?.style === 'critical' || validation?.display?.style === 'warning';
                                const displayLabel = validation?.display?.label || (stock.aiPrediction?.summary.includes('弱转强') ? "弱转强" : "突击");
                                const displaySubText = validation?.display?.subText;

                                return (
                                <motion.div 
                                    key={`op-${stock.id}`}
                                    whileHover={{ scale: 1.01 }}
                                    className={cn("bg-white border rounded-lg p-3 flex items-center justify-between group cursor-pointer shadow-sm transition-colors", 
                                        isRisk ? "border-purple-200 hover:border-purple-400 shadow-purple-50" :
                                        stock.aiPrediction?.summary.includes('弱转强') ? "border-orange-200 hover:border-orange-400 shadow-orange-50" : "border-red-100 hover:border-red-300 shadow-red-50")}
                                    onClick={(e) => {
                                        // Toggle SelfSelect Tag
                                        const tags = stock.tags || [];
                                        const isSelfSelect = tags.includes('SelfSelect');
                                        const newTags = isSelfSelect ? tags.filter(t => t !== 'SelfSelect') : [...tags, 'SelfSelect'];
                                        updateStock(stock.id, { tags: newTags });
                                    }}
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold">{stock.name}</span>
                                            
                                            {/* V67.3: Board type badge (创业板/科创板 = 20% limit) */}
                                            {getBoardType(stock.code) && (
                                                <Badge className={cn("text-[8px] h-3.5 px-1 border-none font-bold", getBoardType(stock.code)!.color)}>
                                                    {getBoardType(stock.code)!.label}
                                                </Badge>
                                            )}

                                            {/* Dynamic Signal Badge */}
                                            <Badge className={cn("text-[8px] h-3.5 px-1 font-black animate-pulse", 
                                                validation?.display?.style === 'critical' ? "bg-purple-600 text-white hover:bg-purple-700" :
                                                validation?.display?.style === 'warning' ? "bg-amber-500 text-white hover:bg-amber-600" :
                                                validation?.display?.style === 'neutral' ? "bg-slate-500 text-white hover:bg-slate-600" :
                                                stock.aiPrediction?.summary.includes('弱转强') ? "bg-orange-500 text-white" :
                                                "bg-red-600 text-white"
                                            )}>
                                                {displayLabel}
                                            </Badge>

                                            {!isRisk && (
                                                <Badge className={cn("text-[9px] h-4 border-none px-2 rounded-full", 
                                                    stock.role === 'Leader' ? "bg-red-600 text-white" : 
                                                    stock.role === 'Follower' ? "bg-blue-600 text-white" :
                                                    "bg-slate-900 text-white")}>
                                                    {stock.role === 'Leader' ? '空间龙' : (stock.role === 'Follower' ? '补涨龙' : '强势股')}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                                            {isRisk ? (
                                                <span className="flex items-center gap-1 text-purple-600 font-bold">
                                                    <Skull className="w-3 h-3" /> {displaySubText || "风险提示"}
                                                </span>
                                            ) : (
                                                <>
                                                    <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-yellow-500" /> 强度: {stock.strengthScore?.toFixed(0)}</span>
                                                    {stock.independenceScore && stock.independenceScore > 70 && (
                                                        <span className="flex items-center gap-1 text-purple-600 font-bold"><Fingerprint className="w-3 h-3" /> 独立性: {stock.independenceScore.toFixed(0)}</span>
                                                    )}
                                                    <span className="text-red-400 font-mono">买点: {stock.aiPrediction?.buyPoint}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={cn("text-xs font-black", isRisk ? "text-purple-600" : "text-red-500")}>+{stock.changePercent?.toFixed(2)}%</div>
                                        {isRisk ? (
                                             <div className="text-[9px] text-purple-400 font-bold">建议观望</div>
                                        ) : (
                                             <div className="text-[9px] opacity-60">预期溢价: +{stock.premiumExpectation}%</div>
                                        )}
                                    </div>
                                    <ArrowRight className={cn("w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity ml-2", isRisk ? "text-purple-500" : "text-red-500")} />
                                </motion.div>
                            )})}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-4">
                <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
                    <CardHeader className="pb-2 border-b border-slate-100 bg-slate-50/50">
                        <CardTitle className="text-sm flex items-center justify-between">
                            <div className="flex items-center gap-2 text-slate-900">
                                <Rocket className="w-4 h-4 text-red-600" />
                                核心龙头池 (Dragon Core)
                            </div>
                            <Badge variant="outline" className="text-[10px] font-black border-red-200 text-red-600 bg-red-50 px-2">
                                高辨识度核心
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-y divide-slate-100">
                            {stocks.filter(s => (s.strengthScore || 0) > 70).slice(0, 8).map((stock) => (
                                <div key={stock.id} className="p-4 hover:bg-slate-50 transition-all group cursor-pointer relative overflow-hidden">
                                    {/* v27.0: Exhaustion Alert Overlay */}
                                    {stock.exhaustionSignal?.isExhausted && (
                                        <div className="absolute inset-0 bg-amber-500/5 pointer-events-none z-0" />
                                    )}

                                    {/* Background Glow */}
                                    <div className={cn("absolute -right-4 -bottom-4 w-16 h-16 rounded-full blur-2xl transition-colors", 
                                        stock.role === 'Independent' ? "bg-purple-500/5 group-hover:bg-purple-500/10" : "bg-red-500/5 group-hover:bg-red-500/10")} />
                                    
                                    <div className="flex justify-between items-start relative z-10">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-slate-900 tracking-tight cursor-pointer hover:underline decoration-red-500/30 underline-offset-4"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Fallback logic to add to SelfSelect tag
                                                        const tags = stock.tags || [];
                                                        const isSelfSelect = tags.includes('SelfSelect');
                                                        const newTags = isSelfSelect ? tags.filter(t => t !== 'SelfSelect') : [...tags, 'SelfSelect'];
                                                        updateStock(stock.id, { tags: newTags });
                                                    }}
                                                >{stock.name}</span>
                                                {stock.trapSignals?.some(sig => sig.description.includes('风险传染')) && (
                                                    <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-black border-red-500 text-red-600 bg-red-50 animate-bounce">风险传染</Badge>
                                                )}
                                            <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1 font-black", 
                                                stock.role === 'Leader' ? "border-red-200 text-red-600 bg-red-50" : 
                                                stock.role === 'Vice' ? "border-orange-200 text-orange-600 bg-orange-50" :
                                                "border-slate-200 text-slate-400")}>
                                                {stock.role === 'Leader' ? '核心龙头' : 
                                                 stock.role === 'Vice' ? '强力副龙' : 
                                                 stock.role === 'Main' ? '中军容量' : '核心补涨'}
                                            </Badge>
                                                <span className="text-[10px] font-mono text-slate-400">{stock.code}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                <Badge className="text-[8px] h-3.5 px-1 bg-red-50 text-red-600 border border-red-100 font-bold">
                                                    强度 {stock.strengthScore?.toFixed(0)}
                                                </Badge>
                                                {stock.moneyQualityScore && stock.moneyQualityScore > 75 && (
                                                    <Badge className="text-[8px] h-3.5 px-1 bg-blue-50 text-blue-600 border border-blue-100 font-bold">
                                                        Alpha买入 {stock.moneyQualityScore.toFixed(0)}
                                                    </Badge>
                                                )}
                                                {stock.sealIntensity && stock.sealIntensity > 80 && (
                                                    <Badge className="text-[8px] h-3.5 px-1 bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold">
                                                        封单强 {stock.sealIntensity.toFixed(0)}
                                                    </Badge>
                                                )}
                                                {stock.boardResilience && stock.boardResilience > 70 && (
                                                    <Badge className="text-[8px] h-3.5 px-1 bg-orange-50 text-orange-600 border border-orange-100 font-bold">
                                                        高韧性 {stock.boardResilience.toFixed(0)}
                                                    </Badge>
                                                )}
                                                {stock.isThemeDropout && (
                                                    <Badge className="text-[8px] h-3.5 px-1 bg-zinc-500 text-white border-none font-bold">
                                                        题材掉队
                                                    </Badge>
                                                )}
                                                {stock.exhaustionSignal?.isExhausted && (
                                                    <Badge className="text-[8px] h-3.5 px-1 bg-amber-500 text-white border-none font-bold animate-pulse">
                                                        动能衰减
                                                    </Badge>
                                                )}
                                                {getBoardType(stock.code) && (
                                                    <Badge className={cn("text-[8px] h-3.5 px-1 border-none font-bold", getBoardType(stock.code)!.color)}>
                                                        {getBoardType(stock.code)!.label}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={cn("text-base font-black tracking-tighter", (stock.changePercent || 0) > 0 ? "text-red-600" : "text-green-600")}>
                                                {stock.changePercent && stock.changePercent > 0 ? '+' : ''}{stock.changePercent}%
                                            </div>
                                            <div className="flex items-center justify-end gap-1 mt-1">
                                                {stock.tags?.includes('SelfSelect') && (
                                                    <Badge className="text-[8px] h-3 px-1 bg-yellow-500 text-white border border-yellow-400 font-bold uppercase shadow-sm">自选</Badge>
                                                )}
                                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[80px]">
                                                    {stock.concept?.split('/')[0]}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center justify-between relative z-10">
                                        <div className="flex gap-4">
                                            <div className="flex -space-x-1">
                                                {[1,2,3].map(i => (
                                                    <Star key={i} className={cn("w-3 h-3 fill-current", 
                                                        (stock.strengthScore || 0) > (i * 25) ? "text-orange-400" : "text-slate-200")} />
                                                ))}
                                            </div>
                                            {/* Visual indicators for seal and resilience */}
                                            <div className="flex items-center gap-2">
                                                {stock.sealIntensity && (
                                                    <div className="flex items-center gap-0.5" title="封单强度">
                                                        <Anchor className={cn("w-2.5 h-2.5", stock.sealIntensity > 80 ? "text-emerald-500" : "text-slate-300")} />
                                                        <span className="text-[8px] font-mono font-bold text-slate-400">{stock.sealIntensity.toFixed(0)}</span>
                                                    </div>
                                                )}
                                                {stock.boardResilience && (
                                                    <div className="flex items-center gap-0.5" title="炸板回封韧性">
                                                        <ShieldPlus className={cn("w-2.5 h-2.5", stock.boardResilience > 70 ? "text-orange-500" : "text-slate-300")} />
                                                        <span className="text-[8px] font-mono font-bold text-slate-400">{stock.boardResilience.toFixed(0)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {stock.exhaustionSignal?.isExhausted && (
                                            <div className="text-[8px] font-black text-amber-600 flex items-center gap-1 uppercase">
                                                <AlertTriangle className="w-2.5 h-2.5" /> {stock.exhaustionSignal.reason.split('：')[0]}
                                            </div>
                                        )}
                                    </div>


                                </div>
                            ))}
                        </div>
                        
                        {stocks.length === 0 && (
                            <div className="p-10 text-center text-slate-300 text-xs font-bold uppercase tracking-[0.2em]">
                                正在检索符合条件的龙头...
                            </div>
                        )}

                        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Target className="w-3 h-3" /> 筛选逻辑: 市场辨识度强度 &gt; 70 (显示前8名)
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};