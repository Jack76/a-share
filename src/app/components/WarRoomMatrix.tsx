import React from 'react';
import { useTrading } from '../context/Store';
import { calculateTacticalMatrix, TacticalDecision, calculateCrowdedness } from '../utils/scoring';
import { Crosshair, Shield, Eye, LogOut, TrendingUp, AlertTriangle, Target, Users, Zap, ShieldAlert, Rocket, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { Badge } from './ui/badge';
import { cn } from './ui/utils';

export const WarRoomMatrix: React.FC = () => {
    const { phase, metrics, stocks, themes } = useTrading();
    
    // 核心算法计算
    const decision: TacticalDecision = calculateTacticalMatrix(
        phase, 
        metrics.marketTemp || 50, 
        metrics.marketEntropy || 50, 
        metrics
    );

    // 计算当前最热题材的拥挤度
    const mainTheme = themes.sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
    const crowdedness = mainTheme ? calculateCrowdedness(mainTheme.name, stocks) : 0;

    // 拥挤度建议逻辑
    let crowdAdvice = '观察';
    let crowdAdviceColor = 'text-slate-400';
    if (decision.mode === 'Attack') {
        if (crowdedness > 85) {
            crowdAdvice = '过热⚠️谨防退潮';
            crowdAdviceColor = 'text-orange-500';
        } else if (crowdedness > 50) {
            crowdAdvice = '主升🔥聚焦核心';
            crowdAdviceColor = 'text-red-500';
        } else {
             crowdAdvice = '启动✨积极试错';
             crowdAdviceColor = 'text-emerald-500';
        }
    } else {
        if (crowdedness > 80) {
            crowdAdvice = '拥挤⛔建议回避';
             crowdAdviceColor = 'text-slate-500';
        } else {
            crowdAdvice = '等待新周期';
             crowdAdviceColor = 'text-slate-400';
        }
    }

    // 衍生信号 (从旧版 TacticalMatrix 迁移)
    const hasWeakToStrong = stocks.some(s => s.aiPrediction?.summary.includes('弱转强'));
    const isContagionActive = stocks.filter(s => (s.trapRiskScore || 0) > 70).length > 2;

    const getModeConfig = (mode: string) => {
        switch(mode) {
            case 'Attack': return { color: 'text-red-500', bg: 'bg-red-500/10', icon: Crosshair, label: '全面进攻' };
            case 'Defend': return { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Shield, label: '战术防御' };
            case 'Observe': return { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Eye, label: '观望等待' };
            case 'Retreat': return { color: 'text-gray-400', bg: 'bg-gray-500/10', icon: LogOut, label: '空仓撤离' };
            default: return { color: 'text-gray-400', bg: 'bg-gray-500/10', icon: Eye, label: '状态未知' };
        }
    };

    const config = getModeConfig(decision.mode);
    const Icon = config.icon;

    return (
        <div className="p-4 md:p-8 bg-white/70 border border-slate-200 rounded-[2rem] shadow-xl shadow-slate-200/40 backdrop-blur-md relative overflow-hidden group transition-all duration-300 hover:shadow-2xl hover:shadow-slate-300/50">
            {/* Background Accent - Adjusted for light theme */}
            <div className={cn("absolute -right-20 -top-20 w-64 h-64 rounded-full blur-[100px] opacity-10 transition-colors duration-1000", config.bg)} />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8 relative z-10">
                <div className="flex items-center gap-3 md:gap-4">
                    <div className="p-2 md:p-3 bg-red-500/10 rounded-2xl shrink-0">
                        <Target className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
                    </div>
                    <div>
                        <h2 className="text-lg md:text-xl font-black tracking-tighter text-slate-900 uppercase italic">战术决策矩阵 v27.0</h2>
                        <div className="text-[9px] md:text-[10px] text-slate-400 font-mono tracking-widest uppercase font-bold truncate max-w-[200px] md:max-w-none">Combat Command Matrix / Strategic Algo</div>
                    </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 self-end sm:self-auto">
                    <Badge variant="outline" className="text-[9px] md:text-[10px] border-slate-200 text-slate-500 font-mono px-2 md:px-3 py-1 bg-white/50 uppercase font-bold shrink-0">
                        Entropy: {metrics.marketEntropy?.toFixed(1)}
                    </Badge>
                    <div className={`px-3 md:px-5 py-1.5 rounded-full text-[9px] md:text-[10px] font-black border ${config.bg} ${config.color} border-current uppercase tracking-[0.2em] shadow-sm shrink-0`}>
                        {decision.mode} Mode
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 md:gap-8 relative z-10">
                {/* Main Action Card (Span 4) */}
                <div className={cn("lg:col-span-4 p-6 md:p-8 rounded-[1.5rem] border flex flex-col items-center justify-center text-center transition-all duration-500", 
                    config.bg, config.color, "border-current/10 shadow-sm")}>
                    <Icon className="w-12 h-12 md:w-16 md:h-16 mb-3 md:mb-5 drop-shadow-sm" />
                    <div className="text-3xl md:text-4xl font-black italic tracking-tighter mb-2 md:mb-3">【{config.label}】</div>
                    <div className="text-xs md:text-sm opacity-90 font-bold leading-relaxed max-w-[220px]">
                        {decision.tacticalFocus}
                    </div>
                    <div className="mt-6 md:mt-8 w-full pt-4 md:pt-6 border-t border-current/10 flex items-center justify-center gap-6">
                        <div className="text-center">
                            <div className="text-[9px] md:text-[10px] uppercase opacity-60 mb-1 font-black">风险评分</div>
                            <div className="text-xl md:text-2xl font-black font-mono">{(100 - decision.riskThreshold)}</div>
                        </div>
                        <div className="w-px h-8 md:h-10 bg-current/10" />
                        <div className="text-center">
                            <div className="text-[9px] md:text-[10px] uppercase opacity-60 mb-1 font-black">胜率预判</div>
                            <div className="text-xl md:text-2xl font-black font-mono">{(metrics.marketTemp || 50).toFixed(0)}%</div>
                        </div>
                    </div>
                </div>

                {/* Metrics & Analysis (Span 8) */}
                <div className="lg:col-span-8 grid grid-cols-2 gap-3 md:gap-6">
                    {/* Position Limit */}
                    <div className="p-4 md:p-6 rounded-[1.5rem] border border-slate-100 bg-slate-50/50 group/card hover:border-slate-200 transition-colors">
                        <div className="flex justify-between items-center mb-3 md:mb-5">
                            <span className="text-[8px] md:text-[10px] text-slate-500 uppercase font-black tracking-widest truncate">建议仓位</span>
                            <Zap className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-300 group-hover/card:text-red-500 transition-colors shrink-0" />
                        </div>
                        <div className="flex items-end gap-2 md:gap-3 mb-3 md:mb-4">
                            <span className="text-3xl md:text-5xl font-black font-mono text-slate-900 italic tracking-tighter">{decision.positionLimit}%</span>
                            <span className="text-[8px] md:text-[10px] text-slate-400 mb-1 md:mb-2 uppercase font-black hidden sm:inline">Max</span>
                        </div>
                        <div className="h-1.5 md:h-2 w-full bg-slate-200/50 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${decision.positionLimit}%` }}
                                className="h-full bg-gradient-to-r from-red-600 to-orange-500 shadow-sm"
                            />
                        </div>
                    </div>

                    {/* Crowdedness */}
                    <div className="p-4 md:p-6 rounded-[1.5rem] border border-slate-100 bg-slate-50/50 group/card hover:border-slate-200 transition-colors">
                        <div className="flex justify-between items-center mb-3 md:mb-5">
                            <span className="text-[8px] md:text-[10px] text-slate-500 uppercase font-black tracking-widest truncate max-w-[80px] md:max-w-none" title={mainTheme?.name}>拥挤度: {mainTheme?.name || '-'}</span>
                            <Users className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-300 group-hover/card:text-emerald-500 transition-colors shrink-0" />
                        </div>
                        <div className="flex flex-col gap-1 mb-3 md:mb-4">
                            <div className="flex items-end gap-2 md:gap-3">
                                <span className={cn("text-3xl md:text-5xl font-black font-mono italic tracking-tighter", crowdedness > 70 ? 'text-orange-600' : 'text-emerald-600')}>
                                    {crowdedness.toFixed(0)}%
                                </span>
                                <span className="text-[8px] md:text-[10px] text-slate-400 mb-1 md:mb-2 uppercase font-black hidden sm:inline">Density</span>
                            </div>
                            <span className={cn("text-[9px] font-black uppercase tracking-wider", crowdAdviceColor)}>{crowdAdvice}</span>
                        </div>
                        <div className="h-1.5 md:h-2 w-full bg-slate-200/50 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${crowdedness}%` }}
                                className={cn("h-full transition-all", crowdedness > 70 ? 'bg-orange-600' : 'bg-emerald-600')}
                            />
                        </div>
                    </div>

                    {/* Warning Radar */}
                    <div className="p-4 md:p-6 rounded-[1.5rem] border border-slate-100 bg-slate-50/50 flex flex-col justify-between min-h-[100px] md:min-h-[120px]">
                        <div className="text-[8px] md:text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 md:mb-3 flex items-center gap-2">
                            <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" /> 预警雷达
                        </div>
                        <div className="text-sm md:text-base font-black text-amber-600 leading-snug line-clamp-2 md:line-clamp-none">
                            {decision.warningSignal}
                        </div>
                        <div className="mt-2 md:mt-4 flex flex-wrap gap-1 md:gap-2">
                            {isContagionActive && (
                                <Badge className="bg-red-50 text-red-600 border-red-200 text-[8px] md:text-[9px] font-black uppercase px-1 py-0 h-4 md:h-auto">
                                    风险传染
                                </Badge>
                            )}
                            {hasWeakToStrong && (
                                <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[8px] md:text-[9px] font-black uppercase px-1 py-0 h-4 md:h-auto">
                                    弱转强
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Tactical Command */}
                    <div className="p-4 md:p-6 rounded-[1.5rem] border border-slate-100 bg-slate-50/50 flex flex-col justify-between">
                        <div className="text-[8px] md:text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 md:mb-3 flex items-center gap-2">
                            <Info className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" /> 战术指令
                        </div>
                        <div className="text-[10px] md:text-[12px] text-slate-600 font-bold leading-relaxed italic line-clamp-3 md:line-clamp-none">
                            {decision.mode === 'Attack' ? 
                                (phase === 'Startup' ? '试错期：聚焦低位首板及新题材前排（见下方战报列表）。' : '主升期：锚定板块核心龙头及其补涨（见下方战报列表）。') : 
                             decision.mode === 'Retreat' ? '严格防守，规避高位回撤，等待情绪冰点出尽。' :
                             '保持灵敏，寻找共振点，不参与无序轮动。'}
                        </div>
                        <div className="mt-2 md:mt-4 flex items-center justify-between">
                            <span className="text-[8px] md:text-[9px] font-mono text-slate-400 font-bold truncate">LU_RESONANCE_v2.1</span>
                            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Logic Bar */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500 relative z-10">
                <div className="flex gap-8">
                    <div className="flex items-center gap-2">
                        <span className="text-slate-400 uppercase font-black">Phase:</span>
                        <span className="text-slate-900 font-black">{phase}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-slate-400 uppercase font-black">Divergence:</span>
                        <span className={cn("font-black", Math.abs(metrics.divergenceIndex || 0) > 15 ? 'text-red-600' : 'text-slate-900')}>
                            {metrics.divergenceIndex?.toFixed(1)}
                        </span>
                    </div>
                    <div className="hidden sm:flex items-center gap-2">
                        <span className="text-slate-400 uppercase font-black">Hedge Factor:</span>
                        <span className="text-slate-900 font-black">{metrics.hedgeFactor?.toFixed(2)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="px-3 py-1 rounded-lg bg-slate-100 text-[9px] border border-slate-200 font-black text-slate-600">QUANT_ENGINE_V27.0</div>
                    <div className="text-slate-200">|</div>
                    <div className="text-emerald-600 font-black tracking-tighter">CORE_ALGO_SYNCHRONIZED</div>
                </div>
            </div>
        </div>
    );
};