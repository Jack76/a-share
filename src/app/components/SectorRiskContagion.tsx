import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { useTrading } from '../context/Store';
import { ShieldAlert, AlertTriangle, ArrowDownRight, ZapOff, Activity } from 'lucide-react';
import { cn } from './ui/utils';

export const SectorRiskContagion: React.FC = () => {
  const { stocks, themes } = useTrading();

  // Logic: Identify sectors where the leader is failing or has high trap risk
  const contagionData = themes
    .filter(t => t.name !== '自动发现' && t.name !== '自动扫描' && t.name !== 'Auto-Discovered')
    .map(theme => {
    const sectorStocks = stocks.filter(s => s.concept === theme.name);
    const leader = sectorStocks.find(s => s.role === 'Leader' || s.role === 'Main');
    
    // Risk conditions:
    // 1. Leader is breaking (断板)
    // 2. Leader has high trap risk (> 60)
    // 3. Negative change percent in leader
    const leaderFailing = leader && (!leader.isLimitUp || (leader.trapRiskScore || 0) > 60 || (leader.changePercent || 0) < -3);
    const followersFalling = sectorStocks.filter(s => s.id !== leader?.id && (s.changePercent || 0) < -4).length;
    const fallRatio = sectorStocks.length > 0 ? followersFalling / sectorStocks.length : 0;

    // Severity calculation
    let severity: 'None' | 'Low' | 'Medium' | 'High' = 'None';
    let riskScore = 0;
    if (leaderFailing) riskScore += 50;
    riskScore += fallRatio * 50;

    if (riskScore > 70) severity = 'High';
    else if (riskScore > 40) severity = 'Medium';
    else if (riskScore > 10) severity = 'Low';

    return {
      ...theme,
      leader,
      severity,
      riskScore,
      fallRatio: Math.round(fallRatio * 100),
      isLeaderBroken: leader && !leader.isLimitUp && (leader.changePercent || 0) < 0
    };
  }).filter(t => t.severity !== 'None').sort((a, b) => b.riskScore - a.riskScore);

  if (contagionData.length === 0) {
    return (
      <Card className="border border-emerald-100 bg-emerald-50/10 shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-8 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <Activity className="w-6 h-6 text-emerald-600" />
          </div>
          <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest mb-1">风险场稳定 (Stable Field)</h4>
          <p className="text-[10px] font-bold text-emerald-600/60 uppercase">未检测到显著的板块风险传染信号</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200 shadow-xl bg-white/40 backdrop-blur-xl overflow-hidden rounded-3xl">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldAlert className="w-4 h-4 text-red-600 animate-pulse" />
            风险传染分析 (Risk Contagion)
          </div>
          <Badge variant="outline" className="text-[9px] font-black border-red-200 text-red-600 bg-red-50 uppercase">
            Live Contagion Map
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {contagionData.slice(0, 4).map((item) => (
          <div key={item.id} className="p-4 rounded-2xl border border-slate-100 bg-white/60 shadow-sm relative overflow-hidden group">
            {/* Risk Intensity Bar */}
            <div className={cn(
                "absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5",
                item.severity === 'High' ? "bg-red-600" : "bg-orange-500"
            )} />
            
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-black text-slate-900 italic">{item.name}</span>
                  <Badge className={cn("text-[8px] h-3.5 px-1 border-none font-black uppercase", 
                    item.severity === 'High' ? "bg-red-600 text-white" : "bg-orange-500 text-white")}>
                    {item.severity} Risk
                  </Badge>
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  {item.isLeaderBroken ? (
                    <span className="text-red-500 flex items-center gap-1">
                      <ZapOff className="w-3 h-3" /> 龙头崩塌: {item.leader?.name}
                    </span>
                  ) : (
                    <span>核心标的: {item.leader?.name || '未知'}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-black text-slate-900">{item.riskScore.toFixed(0)}</div>
                <div className="text-[8px] font-black text-slate-400 uppercase">传染指数</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-tighter">
                <span className="text-slate-500">板块补跌率 (Follower Drop)</span>
                <span className={cn(item.fallRatio > 50 ? "text-red-600" : "text-slate-600")}>{item.fallRatio}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                 <div 
                    className={cn("h-full transition-all duration-1000", 
                        item.severity === 'High' ? "bg-red-600" : "bg-orange-500")}
                    style={{ width: `${item.riskScore}%` }}
                 />
              </div>
            </div>

            {item.severity === 'High' && (
              <div className="mt-3 flex items-center gap-2 p-2 bg-red-50 rounded-xl border border-red-100">
                <AlertTriangle className="w-3 h-3 text-red-600" />
                <span className="text-[9px] font-black text-red-700 uppercase leading-none">
                  警告：板块负反馈正在共振，建议规避该题材所有跟风标的。
                </span>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};