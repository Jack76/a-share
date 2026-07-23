import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Zap, Activity, ShieldCheck, Flame, Target, TrendingUp, BarChart3 } from 'lucide-react';
import { cn } from './ui/utils';

interface Props {
  metrics: any;
  phase: string;
  stocks: any[];
}

export const QuantitativeBattleReport: React.FC<Props> = ({ metrics, phase, stocks }) => {
  const limitUpCount = stocks.filter(s => s.isLimitUp).length;
  const highPositionCount = stocks.filter(s => (s.limitLadder || 0) >= 3).length;
  // Adjusted for larger market size (5300+ stocks): Lower multiplier for limitUpCount
  const sentimentEnergy = Math.min(100, (limitUpCount * 1.2) + (highPositionCount * 10));
  
  const getPhaseColor = () => {
    switch(phase) {
      case 'Climax': return 'text-red-600';
      case 'Ebb': return 'text-blue-600';
      case 'Startup': return 'text-orange-600';
      case 'Ice': return 'text-cyan-500';
      default: return 'text-slate-900';
    }
  };

  const battleMetrics = [
    { label: '情绪能量 (SE)', value: `${sentimentEnergy}%`, icon: Flame, color: 'text-orange-500', description: '全市场追涨意愿强度' },
    { label: '连板梯队', value: `${highPositionCount}席`, icon: BarChart3, color: 'text-red-500', description: '3板及以上核心席位' },
    { label: '封板强度', value: `${(metrics.limitUpStrength || 75).toFixed(1)}%`, icon: Target, color: 'text-purple-500', description: '涨停未炸板比例' },
    { label: '背离指数', value: metrics.divergenceIndex || '0.0', icon: TrendingUp, color: 'text-blue-500', description: '指数与情绪背离程度' }
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {battleMetrics.map((m, i) => (
          <div key={i} className="glass p-6 rounded-[2rem] border border-white/50 shadow-xl relative overflow-hidden group">
            <div className={cn("absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity", m.color)}>
              <m.icon className="w-16 h-16" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <m.icon className={cn("w-4 h-4", m.color)} />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{m.label}</span>
            </div>
            <div className="text-3xl font-black text-slate-900 italic mb-1">{m.value}</div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight leading-none">{m.description}</p>
          </div>
        ))}
      </div>

      <Card className="border border-slate-200 shadow-2xl rounded-[2.5rem] overflow-hidden bg-white/40 backdrop-blur-md">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-600 rounded-2xl shadow-lg shadow-red-600/20">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-black text-slate-900 uppercase italic tracking-tight">量化战报摘要 (Quantum Battle Report)</CardTitle>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">实战博弈分析系统 V9.2</div>
              </div>
            </div>
            <Badge className={cn("px-4 py-2 font-black italic text-sm", 
              phase === 'Climax' ? 'bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.4)]' : 
              phase === 'Ebb' ? 'bg-blue-600' : 'bg-slate-900')}>
              {phase} PHASE
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div>
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-red-600" /> 情绪能量流监测
                </h4>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-black uppercase italic">
                      <span>核心博弈强度</span>
                      <span>{sentimentEnergy}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-600 transition-all duration-1000" style={{ width: `${sentimentEnergy}%` }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-black uppercase italic text-slate-500">
                      <span>市场混沌熵值</span>
                      <span>{(100 - (metrics.marketTemp || 50)).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-900 transition-all duration-1000" style={{ width: `${100 - (metrics.marketTemp || 50)}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 space-y-4">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4 text-emerald-500" /> 战术风控建议 (Risk Vector)
                </h4>
                <p className="text-xs font-bold text-slate-600 leading-relaxed">
                  当前处于 <span className={cn("font-black italic", getPhaseColor())}>{phase}</span> 周期。
                  {phase === 'Climax' ? '高位连板出现缩量一致性加速，次日分歧概率 85%，建议严格执行卖出指令。' : 
                   phase === 'Ebb' ? '亏钱效应在核心股蔓延，建议仓位控制在 2 成以下，防范补跌。' : 
                   '市场处于低位混沌期，试错成本较高，建议关注新题材的首板表现。'}
                </p>
              </div>
            </div>

            <div className="space-y-8">
               {(() => {
                  let listTitle = "核心标的";
                  let listIcon = Target;
                  let displayStocks = [];
                  let emptyMessage = "等待市场数据...";

                  // Strategy Logic based on Phase
                  if (phase === 'Startup') {
                      listTitle = "试错先锋";
                      listIcon = Flame;
                      emptyMessage = "等待首板试错信号...";
                      // Filter: Strong Potential stocks (Limit Up or >7%) that are NOT yet high-level Leaders
                      displayStocks = stocks
                          .filter(s => (s.isLimitUp || (s.changePercent || 0) > 7) && s.role !== 'Leader' && s.status !== 'Sold')
                          .sort((a, b) => (b.strengthScore || 0) - (a.strengthScore || 0))
                          .slice(0, 5);
                  } else if (phase === 'Climax') {
                      listTitle = "进攻龙头";
                      listIcon = Zap;
                      emptyMessage = "正在锁定核心龙头...";
                      // Filter: Leaders and Vices that are performing well
                      displayStocks = stocks
                          .filter(s => (s.role === 'Leader' || s.role === 'Vice') && (s.changePercent || 0) > 0)
                          .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
                          .slice(0, 5);
                  } else if (phase === 'Ebb') {
                      listTitle = "防守/反核";
                      listIcon = ShieldCheck;
                      emptyMessage = "寻找反核博弈点...";
                      // Filter: Rebound candidates or Resilience
                      displayStocks = stocks
                          .filter(s => s.aiPrediction?.trend === 'Rebound' || (s.changePercent || 0) > 0)
                          .sort((a, b) => (b.mainForceInflow || 0) - (a.mainForceInflow || 0))
                          .slice(0, 5);
                  } else {
                      // Default / Chaos
                      listTitle = "空间龙表现";
                      listIcon = Target;
                      displayStocks = stocks
                          .filter(s => s.role === 'Leader')
                          .slice(0, 3);
                  }

                  // Fallback if no specific stocks found in strategy
                  if (displayStocks.length === 0 && stocks.length > 0) {
                       displayStocks = stocks.filter(s => s.isLimitUp).slice(0, 3);
                  }

                  const Icon = listIcon;

                  return (
                    <>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                           <Icon className="w-4 h-4 text-red-600" /> {listTitle}
                        </h4>
                        <div className="space-y-4">
                          {displayStocks.map((s, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm group hover:shadow-md transition-shadow">
                              <div className="flex items-center gap-4">
                                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs", 
                                    s.role === 'Leader' ? "bg-red-600 shadow-red-200 shadow-sm" : "bg-slate-900")}>
                                  {s.name.substring(0, 1)}
                                </div>
                                <div>
                                  <div className="text-sm font-black text-slate-900 italic flex items-center gap-2">
                                      {s.name}
                                      {s.role === 'Leader' && <span className="flex w-2 h-2 rounded-full bg-red-600 animate-pulse" />}
                                  </div>
                                  <div className="text-[10px] font-mono font-bold text-slate-400">{s.code}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={cn("text-sm font-black italic", (s.changePercent || 0) > 0 ? "text-red-600" : "text-green-600")}>
                                  {s.changePercent > 0 ? '+' : ''}{s.changePercent}%
                                </div>
                                <div className="flex gap-1 justify-end mt-1">
                                    <Badge variant="outline" className="text-[8px] font-black uppercase border-slate-200 text-slate-500 px-1">{s.concept?.split(' ')[0] || s.notes?.split(' ')[0] || '关注'}</Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                          {displayStocks.length === 0 && (
                            <div className="h-32 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-3xl text-[10px] font-black text-slate-300 uppercase tracking-widest">
                               {emptyMessage}
                            </div>
                          )}
                        </div>
                    </>
                  );
               })()}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};