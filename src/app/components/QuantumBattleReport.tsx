import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Zap, ShieldAlert, Crosshair, TrendingUp, TrendingDown, Terminal, Activity, Flame, Target, ShieldCheck, Sword } from 'lucide-react';
import { Stock } from '../types';
import { cn } from './ui/utils';
import { getDirectLargeOrderNetYuan } from '../utils/capitalFlow';

interface BattleEvent {
    id: string;
    type: 'ATTACK' | 'DEFENSE' | 'SNEAK' | 'RETREAT';
    priority: 'CRITICAL' | 'NORMAL' | 'LOW';
    source: string;
    target: string;
    description: string;
    time: string;
}

interface Props {
    stocks: Stock[];
    metrics?: any;
    phase?: string;
}

export const QuantumBattleReport: React.FC<Props> = ({ stocks, metrics, phase = 'Chaos' }) => {
  // Strategy Targets Logic
  const strategyTargets = React.useMemo(() => {
      let title = "核心标的 (Core Targets)";
      let icon = Target;
      let list: Stock[] = [];
      let message = "等待市场数据...";
      let color = "text-cyan-400";

      if (phase === 'Startup') {
          title = "试错先锋 (Vanguard Trial)";
          icon = Flame;
          message = "等待首板试错信号...";
          color = "text-orange-400";
          list = stocks
              .filter(s => (s.isLimitUp || (s.changePercent || 0) > 7) && s.role !== 'Leader' && s.status !== 'Sold')
              .sort((a, b) => (b.strengthScore || 0) - (a.strengthScore || 0))
              .slice(0, 4);
      } else if (phase === 'Climax') {
          title = "进攻龙头 (Assault Leaders)";
          icon = Sword;
          message = "正在锁定核心龙头...";
          color = "text-red-400";
          list = stocks
              .filter(s => (s.role === 'Leader' || s.role === 'Vice') && (s.changePercent || 0) > 0)
              .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
              .slice(0, 4);
      } else if (phase === 'Ebb') {
          title = "防守/反核 (Defense/Reversal)";
          icon = ShieldCheck;
          message = "寻找反核博弈点...";
          color = "text-emerald-400";
          list = stocks
              .filter(s => s.aiPrediction?.trend === 'Rebound' || (s.changePercent || 0) > 0)
              .sort((a, b) => (getDirectLargeOrderNetYuan(b) || 0) - (getDirectLargeOrderNetYuan(a) || 0))
              .slice(0, 4);
      } else {
          title = "空间龙表现 (Dragon Performance)";
          icon = Target;
          color = "text-blue-400";
          list = stocks
              .filter(s => s.role === 'Leader')
              .slice(0, 3);
      }

      if (list.length === 0 && stocks.length > 0) {
           list = stocks.filter(s => s.isLimitUp).slice(0, 3);
      }

      return { title, icon, list, message, color };
  }, [stocks, phase]);

  const events = React.useMemo(() => {
    const list: BattleEvent[] = [];
    const now = new Date();
    
    // Derive event labels from observed stock metrics.
    stocks.forEach(s => {
        if ((s.volumeRatio || 0) > 3 && (s.changePercent || 0) > 5) {
            list.push({
                id: `${s.id}-atk`,
                type: 'ATTACK',
                priority: 'CRITICAL',
                source: '量价突破',
                target: s.name,
                description: `点火成功！分时放量突破关键压力位，多头攻势猛烈。`,
                time: now.toLocaleTimeString().slice(0, 8)
            });
        }
        
        if (s.trapSignals?.some(t => t.type === 'VolumeDivergence')) {
            list.push({
                id: `${s.id}-ret`,
                type: 'RETREAT',
                priority: 'CRITICAL',
                source: '量价背离',
                target: s.name,
                description: `检测到 Alpha 背离：价格上涨但量能支持不足，回落风险上升。`,
                time: now.toLocaleTimeString().slice(0, 8)
            });
        }

        if (s.isLimitUp && (s.moneyQualityScore || 0) < 60) {
            list.push({
                id: `${s.id}-snk`,
                type: 'SNEAK',
                priority: 'NORMAL',
                source: '游资尝试',
                target: s.name,
                description: `烂板预警！封单力道偏弱，警惕尾盘炸板偷袭。`,
                time: now.toLocaleTimeString().slice(0, 8)
            });
        }
    });

    return list.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 10);
  }, [stocks]);

  const Icon = strategyTargets.icon;

  return (
    <Card className="border-none shadow-2xl bg-slate-900 text-slate-100 overflow-hidden relative border border-white/5">
      {/* Scanline effect */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none z-20" />
      
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
          
          {/* LEFT PANEL: STRATEGY TARGETS (Tactical List) */}
          <div className="lg:col-span-5 bg-slate-950/50 p-5 relative">
              <div className="flex items-center gap-3 mb-4">
                  <div className={cn("p-2 rounded bg-white/5", strategyTargets.color)}>
                      <Icon className="w-4 h-4" />
                  </div>
                  <div>
                      <h4 className={cn("text-[10px] font-black uppercase tracking-[0.2em]", strategyTargets.color)}>
                          {strategyTargets.title}
                      </h4>
                      <div className="text-[8px] text-slate-500 font-mono mt-0.5">TARGET ACQUISITION :: AUTO</div>
                  </div>
              </div>

              <div className="space-y-3">
                  {strategyTargets.list.length > 0 ? (
                      strategyTargets.list.map((s, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 hover:bg-white/10 transition-colors rounded group cursor-pointer">
                              <div className="flex items-center gap-3">
                                  <div className={cn("w-8 h-8 flex items-center justify-center text-[10px] font-black bg-slate-800 rounded text-slate-300", 
                                      s.role === 'Leader' && "bg-red-900/50 text-red-200 shadow-[0_0_10px_rgba(220,38,38,0.2)]")}>
                                      {s.name[0]}
                                  </div>
                                  <div>
                                      <div className={cn("text-xs font-bold flex items-center gap-2", 
                                          (s.changePercent || 0) > 0 ? "text-red-300" : "text-green-300")}>
                                          {s.name}
                                          {s.isLimitUp && <Zap className="w-2 h-2 text-yellow-400 fill-yellow-400 animate-pulse" />}
                                      </div>
                                      <div className="text-[9px] text-slate-500 font-mono">{s.code}</div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="text-xs font-mono font-bold text-slate-200">
                                      {(s.changePercent || 0) > 0 ? '+' : ''}{s.changePercent}%
                                  </div>
                                  <div className="text-[8px] text-slate-500 uppercase tracking-wider font-black">
                                      {s.concept?.split(' ')[0] || '关注'}
                                  </div>
                              </div>
                          </div>
                      ))
                  ) : (
                      <div className="h-32 flex flex-col items-center justify-center border border-dashed border-white/10 rounded text-slate-600 gap-2">
                          <Activity className="w-6 h-6 opacity-20" />
                          <span className="text-[9px] font-black uppercase tracking-widest">{strategyTargets.message}</span>
                      </div>
                  )}
              </div>
          </div>

          {/* RIGHT PANEL: REAL-TIME LOGS */}
          <div className="lg:col-span-7 flex flex-col h-full">
            <CardHeader className="pb-2 border-b border-white/10 bg-black/40 backdrop-blur-md pt-4 px-4">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 animate-pulse" />
                        Battle Log (实战情报)
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[8px] text-slate-500">AES-256</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-ping" />
                    </div>
                </CardTitle>
            </CardHeader>

            <CardContent className="p-0 max-h-[300px] overflow-y-auto custom-scrollbar font-mono flex-1">
                <div className="divide-y divide-white/5">
                    {events.length > 0 ? events.map(event => (
                        <div key={event.id} className={cn(
                            "p-3 transition-all hover:bg-white/5 relative group",
                            event.priority === 'CRITICAL' ? "border-l-2 border-red-500 bg-red-500/5" : "border-l-2 border-cyan-500/50"
                        )}>
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "text-[8px] font-black px-1 py-0.5 rounded uppercase tracking-tighter",
                                        event.type === 'ATTACK' ? "bg-red-900/50 text-red-200" :
                                        event.type === 'RETREAT' ? "bg-orange-900/50 text-orange-200" :
                                        event.type === 'SNEAK' ? "bg-yellow-900/50 text-yellow-200" : "bg-slate-800 text-slate-300"
                                    )}>
                                        {event.type}
                                    </span>
                                    <span className="text-[10px] font-black text-cyan-400 group-hover:text-white transition-colors">[{event.target}]</span>
                                </div>
                                <span className="text-[8px] text-slate-500 tabular-nums">{event.time}</span>
                            </div>
                            
                            <div className="flex items-start gap-2 pl-1">
                                <p className="text-[9px] text-slate-300 leading-relaxed font-medium">
                                    <span className="text-slate-500 mr-1 opacity-50">&gt;</span>
                                    {event.description}
                                </p>
                            </div>
                        </div>
                    )) : (
                        <div className="p-12 text-center opacity-50">
                            <Crosshair className="w-8 h-8 text-slate-700 mx-auto mb-3 animate-spin-slow" />
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">雷达扫描中...</p>
                        </div>
                    )}
                </div>
            </CardContent>
          </div>
      </div>
      
      <div className="p-2 bg-black/60 border-t border-white/5">
          <div className="flex justify-between items-center">
              <div className="flex items-center gap-4 text-[8px] font-black uppercase text-slate-400">
                  <span className="flex items-center gap-1"><Zap className="w-2 h-2 text-yellow-500" /> 延迟: 12ms</span>
                  <span className="flex items-center gap-1"><ShieldAlert className="w-2 h-2 text-red-500" /> 警报: ACTIVE</span>
              </div>
              <div className="text-[8px] font-mono text-cyan-400/60">SYSTEM READY :: v29.6.2</div>
          </div>
      </div>
    </Card>
  );
};
