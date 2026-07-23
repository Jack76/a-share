import { useTrading } from '../../context/Store';
import { Badge } from '../ui/badge';
import { ShieldAlert, Thermometer, Activity, Sparkles, Rocket, Target, Layers, ShieldCheck, Skull } from 'lucide-react';
import { cn } from '../ui/utils';
import { motion, AnimatePresence } from 'motion/react';
// V65.1 PERF: Lazy load heavy sub-components to reduce initial bundle & parse time
import React from 'react';
const MarketBreadthIndicators = React.lazy(() => import('../MarketBreadthIndicators').then(m => ({ default: m.MarketBreadthIndicators })));
const BoardStairs = React.lazy(() => import('../BoardStairs').then(m => ({ default: m.BoardStairs })));
const ResonanceMonitor = React.lazy(() => import('../ResonanceMonitor').then(m => ({ default: m.ResonanceMonitor })));
const SectorRiskContagion = React.lazy(() => import('../SectorRiskContagion').then(m => ({ default: m.SectorRiskContagion })));
const DragonScanner = React.lazy(() => import('../DragonScanner').then(m => ({ default: m.DragonScanner })));
const StrategyPlanner = React.lazy(() => import('../StrategyPlanner').then(m => ({ default: m.StrategyPlanner })));
const EvolutionStreamPanel = React.lazy(() => import('../EvolutionStreamPanel').then(m => ({ default: m.EvolutionStreamPanel })));
const AuctionInsight = React.lazy(() => import('../AuctionInsight').then(m => ({ default: m.AuctionInsight })));
const QuantumBattleReport = React.lazy(() => import('../QuantumBattleReport').then(m => ({ default: m.QuantumBattleReport })));
const WarRoomMatrix = React.lazy(() => import('../WarRoomMatrix').then(m => ({ default: m.WarRoomMatrix })));
const PositionDragonPanel = React.lazy(() => import('../PositionDragonPanel').then(m => ({ default: m.PositionDragonPanel })));
// Eagerly loaded (lightweight or above the fold)
import { MarketTicker } from '../MarketTicker';
import { WarRoomTicker } from '../WarRoomTicker';
import { TacticalSentinel } from '../TacticalSentinel';
import { StockProfileCard } from '../StockProfileCard';
import { ExtremeAlert } from '../ExtremeAlert';
import { PositionAdvisor } from '../PositionAdvisor';
import { TrapGuardAlerts } from '../TrapGuardAlerts';
import { StockDiagnosisDialog } from './StockDiagnosisDialog';
import { BigDropList } from '../BigDropList';

// V65.1 PERF: Static fallback (no hooks needed at module scope)
const LazyFallback = (
    <div className="flex items-center justify-center h-32 opacity-30">
        <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-red-600 rounded-full" />
    </div>
);

const DeferredSection: React.FC<{
    children: React.ReactNode;
    minHeight?: number;
}> = ({ children, minHeight = 320 }) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const [visible, setVisible] = React.useState(false);

    React.useEffect(() => {
        if (visible) return;
        if (typeof IntersectionObserver === 'undefined') {
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setVisible(true);
                observer.disconnect();
            }
        }, { rootMargin: '600px 0px' });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [visible]);

    return (
        <div ref={ref} style={!visible ? { minHeight } : undefined}>
            {visible ? children : (
                <div className="h-full min-h-40 animate-pulse rounded-[2rem] border border-slate-200 bg-white/50" aria-hidden="true" />
            )}
        </div>
    );
};

// V64.0: Event Mode Config
const EVENT_MODE_CONFIG = {
  GEO_EVENT:       { icon: '🔥', label: '地缘事件模式', color: 'from-orange-600 to-red-700', border: 'border-orange-500/30', text: 'text-orange-100' },
  COMMODITY_SURGE: { icon: '📈', label: '大宗脉冲模式', color: 'from-amber-600 to-orange-700', border: 'border-amber-500/30', text: 'text-amber-100' },
  POLICY_SHOCK:    { icon: '⚡', label: '政策冲击模式', color: 'from-blue-600 to-indigo-700', border: 'border-blue-500/30', text: 'text-blue-100' },
} as const;

// Global War Room Style Constants
const WR_CARD_CLASS = "bg-white border border-slate-200 rounded-[2rem] shadow-xl shadow-slate-200/40 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-slate-300/50 transform-gpu";
const WR_DARK_CARD_CLASS = "bg-slate-900 border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden transition-all duration-300 transform-gpu";

export const Dashboard: React.FC = () => {
    const { stocks = [], metrics = {} as any, phase, marketIndices = [], sentimentHistory = [], isMarketOpen, themes = [], marketThemes = [], eventDrivenMode } = useTrading();
    const [selectedStock, setSelectedStock] = React.useState<any>(null);

    // V65.1 PERF: Memoize all derived data to prevent re-computation on every render
    const momentumLeaders = React.useMemo(() => 
        stocks.length > 0 
            ? [...stocks].sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0, 3)
            : []
    , [stocks]);
        
    const activeThemes = React.useMemo(() => {
        const source = (marketThemes && marketThemes.length > 0) ? marketThemes : themes;
        return [...source]
            .filter(t => t.name !== '自动发现' && t.name !== '自动扫描' && t.name !== 'Auto-Discovered')
            .sort((a, b) => (b.strength || 0) - (a.strength || 0));
    }, [themes, marketThemes]);

    const topDragon = React.useMemo(() => 
        [...stocks].sort((a, b) => (b.strengthScore || 0) - (a.strengthScore || 0))[0]
    , [stocks]);

    const latestSentiment = React.useMemo(() => 
        sentimentHistory.length > 0 ? sentimentHistory[sentimentHistory.length - 1].score : 0
    , [sentimentHistory]);

    return (
        <div className="relative min-h-screen bg-slate-50">
            <ExtremeAlert phase={phase} temp={metrics.marketTemp || 50} hedgeFactor={metrics.hedgeFactor} />

            {/* 1. Global Ticker & War Room - Sticks to top, simplified background to prevent flickering during scroll */}
            <div className="sticky top-0 z-40 bg-white/95 border-b border-slate-200 shadow-lg">
                <MarketTicker indices={marketIndices} sentimentScore={latestSentiment} isMarketOpen={isMarketOpen} />
                <WarRoomTicker />
            </div>

            {/* V64.0: Event-Driven Transmission Speed Alert Banner */}
            <AnimatePresence>
                {eventDrivenMode && eventDrivenMode.mode !== 'NONE' && (() => {
                    const cfg = EVENT_MODE_CONFIG[eventDrivenMode.mode];
                    return (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            className={cn("relative z-30 overflow-hidden border-b", cfg.border)}
                        >
                            <div className={cn("bg-gradient-to-r py-2.5 px-4 md:px-6", cfg.color)}>
                                <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-lg flex-shrink-0">{cfg.icon}</span>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={cn("text-[11px] md:text-xs font-black uppercase tracking-wider", cfg.text)}>
                                                    {cfg.label}
                                                </span>
                                                <Badge className="bg-white/20 text-white text-[9px] border-none font-mono h-4 px-1.5">
                                                    DIV {eventDrivenMode.divergence.toFixed(1)}%
                                                </Badge>
                                            </div>
                                            <p className={cn("text-[9px] md:text-[10px] opacity-80 truncate", cfg.text)}>
                                                {eventDrivenMode.description}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <div className="hidden md:flex items-center gap-4 text-[10px] font-mono text-white/80">
                                            <span>Instant {eventDrivenMode.instantAvg > 0 ? '+' : ''}{eventDrivenMode.instantAvg.toFixed(1)}%</span>
                                            <span className="opacity-40">|</span>
                                            <span>Annual {eventDrivenMode.annualAvg > 0 ? '+' : ''}{eventDrivenMode.annualAvg.toFixed(1)}%</span>
                                        </div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

            {/* Main Content Area with clear gutters/padding */}
            <React.Suspense fallback={LazyFallback}>
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="max-w-[1600px] mx-auto px-4 py-6 md:px-6 md:py-10 lg:px-10 lg:py-16 space-y-8 md:space-y-12 lg:space-y-16"
            >
                
                {/* ZONE 1: COMMAND CENTER (Decision & Context) */}
                <div className="space-y-6 md:space-y-8">
                    {/* A. War Room Matrix (The Brain) */}
                    <WarRoomMatrix />

                    {/* B. Market Breadth (The Battlefield) - Moved Up */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <h3 className="text-lg md:text-xl font-black tracking-tight flex items-center gap-2 text-slate-900 uppercase italic">
                                <Activity className="w-4 h-4 md:w-5 md:h-5 text-red-600" />
                                <span className="hidden md:inline">全景态势感知 (Arena)</span>
                                <span className="md:hidden">态势感知</span>
                            </h3>
                        </div>
                        <MarketBreadthIndicators metrics={metrics} phase={phase} />
                    </div>
                </div>

                {/* ZONE 2: SIGNAL RADAR (Real-time Detection) - Adjusted to 2 cols for better visibility */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
                     {/* 1. Sentiment Thermometer */}
                     <div className="space-y-3 md:space-y-4">
                         <div className="flex items-center justify-between">
                             <h3 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2 text-slate-900 uppercase italic">
                                 <Thermometer className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
                                 <span className="hidden sm:inline">情绪哨兵</span>
                                 <span className="sm:hidden">情绪</span>
                             </h3>
                         </div>
                         <TacticalSentinel stocks={stocks} phase={phase} marketTemp={metrics.marketTemp || 50} />
                     </div>

                     {/* 2. Height Ladder */}
                     <div className="space-y-3 md:space-y-4">
                         <div className="flex items-center justify-between">
                             <h3 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2 text-slate-900 uppercase italic">
                                 <Layers className="w-4 h-4 md:w-5 md:h-5 text-red-600" />
                                 <span className="hidden sm:inline">高度博弈</span>
                                 <span className="sm:hidden">高度</span>
                             </h3>
                             <Badge variant="outline" className="text-[9px] md:text-[10px] font-mono border-red-200 text-red-600 animate-pulse">
                                 LIVE
                             </Badge>
                         </div>
                         <BoardStairs stocks={stocks} />
                     </div>

                     {/* 3. Abyss/Big Drop */}
                     <div className="space-y-3 md:space-y-4">
                         <div className="flex items-center justify-between">
                             <h3 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2 text-slate-900 uppercase italic">
                                 <Skull className="w-4 h-4 md:w-5 md:h-5 text-green-700" />
                                 <span className="hidden sm:inline">大面核按钮</span>
                                 <span className="sm:hidden">大面</span>
                             </h3>
                             <Badge variant="outline" className="text-[9px] md:text-[10px] font-mono border-green-200 text-green-700 bg-green-50">
                                 RISK
                             </Badge>
                         </div>
                         <BigDropList stocks={stocks} onSelect={(s) => setSelectedStock(s)} />
                     </div>

                     {/* 4. Trap Guard */}
                     <div className="space-y-3 md:space-y-4">
                         <div className="flex items-center justify-between">
                            <h3 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2 text-slate-900 uppercase italic">
                                <ShieldAlert className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
                                <span className="hidden sm:inline">陷阱预警</span>
                                <span className="sm:hidden">预警</span>
                            </h3>
                            <Badge variant="outline" className="text-[9px] md:text-[10px] font-mono border-orange-200 text-orange-600">
                                SAFETY
                            </Badge>
                         </div>
                         <TrapGuardAlerts stocks={stocks} onSelect={(s) => setSelectedStock(s)} />
                     </div>
                </div>

                {/* ZONE 3: SECTOR INTELLIGENCE (Resonance & Contagion) - PROMOTED */}
                <DeferredSection minHeight={420}>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
                    {/* Resonance Monitor (2/3 Width) */}
                    <div className="xl:col-span-2 space-y-4">
                         <div className="flex items-center gap-3 px-1">
                            <Target className="size-5 text-red-600" />
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight italic">
                                核心板块共振 (Resonance)
                            </h3>
                        </div>
                        <div className={WR_CARD_CLASS}>
                            <ResonanceMonitor />
                        </div>
                    </div>

                    {/* Risk Contagion (1/3 Width) */}
                    <div className="xl:col-span-1 space-y-4">
                         <div className="flex items-center gap-3 px-1">
                            <ShieldAlert className="size-5 text-orange-500" />
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight italic">
                                风险传染监测 (Contagion)
                            </h3>
                        </div>
                        <div className={WR_CARD_CLASS}>
                           <SectorRiskContagion />
                        </div>
                    </div>
                </div>
                </DeferredSection>

                {/* ZONE 4: TIME & EXECUTION (Stream & Report) */}
                <DeferredSection minHeight={720}>
                <div className="space-y-8">
                    {/* A. Auction Battle Engine + Position Dragon (New V63.0) */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
                        <AuctionInsight />
                        <PositionDragonPanel />
                    </div>

                    {/* B. Evolution Stream */}
                    <div className="space-y-4">
                        <EvolutionStreamPanel />
                    </div>

                    {/* C. Strategic Briefing */}
                    <div className="space-y-4 md:space-y-6">
                        <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity px-1">
                            <h3 className="text-sm md:text-base font-black tracking-tight flex items-center gap-2 text-slate-900 uppercase italic">
                                <ShieldCheck className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400" />
                                <span className="hidden sm:inline">战略指挥简报</span>
                                <span className="sm:hidden">战略简报</span>
                            </h3>
                        </div>
                        <QuantumBattleReport stocks={stocks} metrics={metrics} phase={phase} />
                    </div>
                </div>
                </DeferredSection>

                {/* ZONE 5: DRAGON CORE (The List) */}
                <DeferredSection minHeight={480}>
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3 uppercase italic">
                            <Rocket className="size-5 text-red-600" />
                            龙头雷达核心池 (Dragon Core)
                        </h3>
                        <div className="h-px flex-1 mx-6 bg-slate-200/50" />
                    </div>
                    <div className={WR_CARD_CLASS}>
                        <DragonScanner />
                    </div>
                </div>
                </DeferredSection>

                {/* ZONE 6: TACTICAL OPERATIONS (Profile & Holdings) - Adjusted to 2 cols */}
                <DeferredSection minHeight={560}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 1. Featured Stock Profile */}
                    {topDragon && (
                        <div className={WR_DARK_CARD_CLASS}>
                            <StockProfileCard stock={topDragon} />
                        </div>
                    )}

                    {/* 2. Tactical Command Center */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-1">仓位管理</h4>
                        <div className="h-full">
                            <PositionAdvisor phase={phase} marketTemp={metrics.marketTemp || 50} />
                        </div>
                    </div>

                    {/* 3. Active Holdings */}
                    <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-1">当前持仓</h4>
                            {stocks.some(s => s.status === 'Hold') ? (
                            <div className={WR_CARD_CLASS}>
                                <div className="p-4 bg-green-50/20 border-b border-green-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="w-3 h-3 text-green-600" />
                                        <span className="text-[10px] font-black text-green-700 uppercase">实盘监控</span>
                                    </div>
                                    <Badge className="bg-green-600 text-white text-[9px] h-4 px-1.5 border-none shadow-sm shadow-green-200">{stocks.filter(s => s.status === 'Hold').length}</Badge>
                                </div>
                                <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto no-scrollbar">
                                    {stocks.filter(s => s.status === 'Hold').map(s => (
                                        <div key={s.id} className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-slate-100 hover:border-green-200 transition-all cursor-default">
                                            <div>
                                                <div className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                                                    {s.name}
                                                    {s.isLimitUp && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                                                </div>
                                                <div className="text-[9px] text-slate-400 font-mono">{s.code}</div>
                                            </div>
                                            <div className="text-right">
                                                    <div className={cn("text-[11px] font-black font-mono", (s.changePercent||0) > 0 ? "text-red-600" : "text-green-600")}>
                                                        {(s.changePercent||0) > 0 ? '+' : ''}{s.changePercent}%
                                                    </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            ) : (
                            <div className={cn(WR_CARD_CLASS, "p-8 flex flex-col items-center justify-center text-center text-slate-400 gap-2 min-h-[150px]")}>
                                <ShieldCheck className="w-8 h-8 opacity-20" />
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">空仓避险</span>
                            </div>
                            )}
                    </div>

                    {/* 4. Strategy Focus */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pl-1">作战计划</h4>
                        <StrategyPlanner />
                    </div>
                </div>
                </DeferredSection>

                {/* ZONE 7: FOOTER INTELLIGENCE (Active Theme Tags) */}
                <div className="border-t border-slate-200 pt-8">
                     <div className="flex items-center gap-3 mb-4 opacity-60">
                         <Sparkles className="size-4 text-slate-400" />
                         <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">活跃题材云图</h4>
                     </div>
                     <div className="flex flex-wrap gap-2">
                         {activeThemes.slice(0, 15).map(t => (
                             <Badge key={t.id} variant="outline" className={cn("text-[9px] font-black border-slate-200 text-slate-500", 
                                 t.type === 'Main' && "border-red-200 text-red-600 bg-red-50")}>
                                 {t.name}
                             </Badge>
                         ))}
                     </div>
                </div>

            </motion.div>
            </React.Suspense>

            <StockDiagnosisDialog 
                isOpen={!!selectedStock} 
                onOpenChange={(open) => !open && setSelectedStock(null)} 
                stock={selectedStock}
                phase={phase}
            />
        </div>
    );
};
