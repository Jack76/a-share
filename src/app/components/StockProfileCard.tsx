import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Stock } from '../types';
import { ChipsDistribution } from './ChipsDistribution';
import { TrendingUp, ShieldCheck, Zap, Activity, Info, BarChart, ShieldAlert, Target, Users, AlertTriangle } from 'lucide-react';
import { cn } from './ui/utils';
import { useTrading } from '../context/Store';
import { detectFundIdentity, predictSmashRisk } from '../utils/fundIntelligence';

interface Props {
  stock: Stock;
}

export const StockProfileCard: React.FC<Props> = ({ stock }) => {
  const { phase, metrics } = useTrading();
  if (!stock) return null;

  const trapScore = stock.trapRiskScore || 0;
  const isTrap = trapScore > 60;
  const isWarning = trapScore > 40 && trapScore <= 60;
  // Ambush (Lurk) is ONLY valid if not a trap and not high risk
  const isAmbush = stock.aiPrediction?.trend === 'Rebound' && !isTrap && !isWarning;
  
  // V8.0 Fund Intelligence
  const { profile: fundProfile, detectedName: fundName } = detectFundIdentity(stock);
  const { riskScore: smashRisk, warning: smashWarning } = predictSmashRisk(stock, phase);
  const isHighRiskFund = smashRisk > 70;

  let dragonType = '趋势穿越';
  if (stock.role === 'Leader') dragonType = '核心龙头';
  else if (stock.role === 'Vice') dragonType = '强力副龙';
  else if (stock.role === 'Substitute') dragonType = '中位补涨';
  else if (stock.role === 'Independent') dragonType = '独立妖股';
  else if (stock.role === 'Main') dragonType = '中军容量';
  else if (stock.role === 'Follower') dragonType = '跟风杂毛';
  else if (stock.role === 'Potential') dragonType = '潜力潜伏';
  else if (isTrap) dragonType = '诱多陷阱'; // Priority Override
  else if (isAmbush) dragonType = '潜伏蓄势';

  return (
    <Card className={cn("border shadow-xl bg-white overflow-hidden rounded-3xl transition-all", 
        isTrap ? "border-red-200 shadow-red-100" :
        isAmbush ? "border-indigo-200 shadow-indigo-100" : "border-slate-200")}>
      <CardHeader className={cn("pb-3 border-b", 
        isTrap ? "bg-red-50/50 border-red-50" :
        isAmbush ? "bg-indigo-50/50 border-indigo-50" : "bg-slate-50/50 border-slate-50")}>
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            {isTrap ? <ShieldAlert className="w-4 h-4 text-red-600" /> : 
             isAmbush ? <BarChart className="w-4 h-4 text-indigo-600" /> : 
             <Activity className="w-4 h-4 text-red-600" />}
            {isTrap ? "TrapGuard: 风险阻断" : 
             isAmbush ? "Silent Hunter: 潜伏猎手" : "龙战于野：深度解析 (Dragon Insight)"}
          </div>
          <Badge className={cn("border-none text-[9px] px-2 py-0.5 font-black uppercase tracking-widest rounded-full", 
            stock.role === 'Leader' ? "bg-red-600 text-white shadow-[0_0_10px_rgba(220,38,38,0.3)]" : 
            stock.role === 'Vice' ? "bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.3)]" :
            stock.role === 'Independent' ? "bg-purple-600 text-white shadow-[0_0_10px_rgba(147,51,234,0.3)]" :
            stock.role === 'Main' ? "bg-emerald-600 text-white shadow-[0_0_10px_rgba(5,150,105,0.3)]" :
            isTrap ? "bg-red-500 text-white" :
            isAmbush ? "bg-indigo-600 text-white shadow-[0_0_10px_rgba(79,70,229,0.3)]" : "bg-slate-900 text-white")}>
            {dragonType}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white font-black text-xl shadow-xl ring-4 ring-slate-50">
                    {stock.name.substring(0, 1)}
                </div>
                <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1.5 italic">{stock.name}</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400">{stock.code}</span>
                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stock.concept?.split('/')[0]}</span>
                    </div>
                </div>
            </div>
            <div className="text-right">
                <div className={cn("text-3xl font-black font-mono tracking-tighter leading-none mb-1", 
                    (stock.changePercent || 0) > 0 ? "text-red-600" : "text-green-600")}>
                    {stock.changePercent && stock.changePercent > 0 ? '+' : ''}{stock.changePercent}%
                </div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">¥{stock.currentPrice}</div>
            </div>
        </div>

        {/* Dynamic Position Advice for THIS stock */}
        <div className="mb-4 grid grid-cols-1 gap-4">
            <div className={cn("p-4 rounded-2xl border flex items-center gap-4 transition-all", 
                isTrap ? "bg-red-50 border-red-200" : isWarning ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200")}>
                <div className={cn("p-2 rounded-xl shrink-0 text-white", isTrap ? "bg-red-600" : isWarning ? "bg-orange-500" : "bg-green-600")}>
                    {isTrap ? <ShieldAlert className="w-5 h-5" /> : isWarning ? <Info className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", isTrap ? "text-red-600" : isWarning ? "text-orange-600" : "text-green-600")}>
                            {isTrap ? 'TrapGuard 诱多警告' : isWarning ? 'TrapGuard 风险预警' : 'AI 安全评级: 稳健'}
                        </span>
                        <span className="text-[10px] font-black text-slate-400">P:{metrics.marketTemp}%</span>
                    </div>
                    <p className="text-[11px] font-bold text-slate-700 leading-tight italic">
                        {stock.trapSignals && stock.trapSignals.length > 0 ? 
                         stock.trapSignals[0].description : 
                         isTrap ? '筹码高位松动，算法监测到主力虚假申报诱多。' : 
                         isWarning ? '监测到量价背离信号，谨防假突破风险。' :
                         '当前情绪周期下，核心资产具备较强支撑位。'}
                    </p>
                </div>
            </div>
        </div>

        {/* Fund Intelligence Radar (V8.0) */}
        <div className="mb-8">
            <div className={cn("p-4 rounded-2xl border flex flex-col gap-2 transition-all", 
                isHighRiskFund ? "bg-red-50 border-red-200" : "bg-indigo-50 border-indigo-200")}>
                <div className="flex items-center justify-between border-b border-black/5 pb-2">
                     <div className="flex items-center gap-2">
                        <Users className={cn("w-4 h-4", isHighRiskFund ? "text-red-600" : "text-indigo-600")} />
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", isHighRiskFund ? "text-red-700" : "text-indigo-700")}>
                            资金对手盘情报 (Fund Intel)
                        </span>
                     </div>
                     {isHighRiskFund && (
                         <Badge className="bg-red-600 text-white text-[9px] px-1.5 h-4 border-none animate-pulse">
                            High Risk
                         </Badge>
                     )}
                </div>
                <div className="flex items-start gap-3 pt-1">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-black text-slate-900">{fundName}</span>
                            <span className="text-[9px] text-slate-500 font-bold px-1.5 py-0.5 bg-white rounded border border-slate-200 uppercase">
                                {fundProfile.style}
                            </span>
                        </div>
                        <p className={cn("text-[10px] font-medium leading-relaxed", isHighRiskFund ? "text-red-600 font-bold" : "text-slate-600")}>
                           {smashWarning}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner group hover:bg-white transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">博弈强度</span>
                    <Zap className="w-3.5 h-3.5 text-orange-400 group-hover:scale-125 transition-transform" />
                </div>
                <div className="text-2xl font-black text-slate-900 italic">{(stock.strengthScore || 50).toFixed(0)}%</div>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner group hover:bg-white transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">穿越指数</span>
                    <Target className="w-3.5 h-3.5 text-red-600 group-hover:scale-125 transition-transform" />
                </div>
                <div className="text-2xl font-black text-slate-900 italic">{(stock.independenceScore || 30).toFixed(0)}%</div>
            </div>
        </div>

        {/* Chips Distribution Component */}
        <ChipsDistribution stock={stock} />

        <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-2">
                    <Activity className={cn("w-3.5 h-3.5", isAmbush ? "text-indigo-600" : "text-red-600")} />
                    战术决策指令 (Tactical Order)
                </span>
                <Badge variant="outline" className="text-[9px] font-black border-slate-200 uppercase px-2">Mode: {isTrap ? "Defense" : isAmbush ? "Stealth" : "Alpha"}</Badge>
            </div>
            <div className={cn("p-5 rounded-3xl relative overflow-hidden group transition-colors", 
                isTrap ? "bg-red-950" : 
                isAmbush ? "bg-indigo-900" : "bg-slate-900")}>
                <div className={cn("absolute top-0 right-0 w-24 h-24 blur-3xl rounded-full -mr-12 -mt-12 transition-all", 
                    isTrap ? "bg-red-500/20 group-hover:bg-red-500/30" :
                    isAmbush ? "bg-indigo-500/30 group-hover:bg-indigo-500/40" : "bg-red-600/10 group-hover:bg-red-600/20")} />
                
                <p className={cn("text-xs font-bold leading-relaxed mb-4 relative z-10 italic", 
                    isTrap ? "text-red-100" :
                    isAmbush ? "text-indigo-100" : "text-slate-300")}>
                    " {isTrap ? "TrapGuard 触发：监测到主力高位派发迹象，当前上涨极大可能为诱多。建议立即降低仓位，切勿追高。" : 
                       (stock.aiPrediction?.strategy || "基于当前情绪周期与筹码锁定度，建议在分时均线附近低吸介入，严控止损位。")} "
                </p>
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2 text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">
                        <div className={cn("w-1 h-1 rounded-full animate-pulse", isTrap ? "bg-red-500" : isAmbush ? "bg-indigo-400" : "bg-red-500")} />
                        Execute: {isTrap ? '清仓/止盈' : (stock.aiPrediction?.positionAdvice || '20% 试错')}
                    </div>
                    <Badge className={cn("text-white border-none text-[8px] font-black tracking-widest px-2.5 py-0.5 rounded-full shadow-lg", 
                        isTrap ? "bg-red-600" :
                        isAmbush ? "bg-indigo-500" : "bg-red-600")}>
                        {isTrap ? "ESCAPE" : (stock.aiPrediction?.trend || "WATCH")}
                    </Badge>
                </div>
            </div>
        </div>
      </CardContent>
      <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Quantum Data Stream Synced</span>
          </div>
          <div className="text-[10px] font-black text-slate-400">V5.0.12</div>
      </div>
    </Card>
  );
};