import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ShieldAlert, Fingerprint, SearchSlash, TriangleAlert, Eye, ArrowRight, MousePointer2, Zap, BarChart3, TrendingDown, Crosshair } from 'lucide-react';
import { Stock } from '../types';
import { cn } from './ui/utils';

interface Props {
  stocks: Stock[];
}

export const TrapGuard: React.FC<Props> = ({ stocks }) => {
  // Logic to identify stocks with "Trap" signals
  // We prioritize High risk and stocks with actual trapSignals data
  const suspiciousStocks = stocks
    .filter(s => (s.trapSignals && s.trapSignals.length > 0) || (s.trapRiskScore !== undefined && s.trapRiskScore > 60))
    .sort((a, b) => (b.trapRiskScore || 0) - (a.trapRiskScore || 0));

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'High': return 'text-red-600 bg-red-50 border-red-200';
      case 'Medium': return 'text-orange-600 bg-orange-50 border-orange-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getTrapIcon = (type: string) => {
    switch (type) {
        case 'VolumeDivergence': return <SearchSlash className="w-3.5 h-3.5" />;
        case 'LateDayPull': return <Fingerprint className="w-3.5 h-3.5" />;
        case 'FakeBreakthrough': return <MousePointer2 className="w-3.5 h-3.5" />;
        case 'Exhaustion': return <BarChart3 className="w-3.5 h-3.5" />;
        case 'Divergence': return <TrendingDown className="w-3.5 h-3.5" />;
        default: return <TriangleAlert className="w-3.5 h-3.5" />;
    }
  };

  const getTrapLabel = (type: string) => {
    switch (type) {
        case 'VolumeDivergence': return '量价背离';
        case 'LateDayPull': return '尾盘偷鸡';
        case 'FakeBreakthrough': return '假突破';
        case 'Exhaustion': return '高位派发';
        case 'Divergence': return '指数背离';
        default: return type;
    }
  };

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            TrapGuard™ 反诱多监测系统
          </div>
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-2 border-red-200 text-red-600 bg-red-50">
            Real-time Logic v4.2
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {suspiciousStocks.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center gap-4 bg-slate-50/30">
            <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse" />
                <div className="relative w-16 h-16 rounded-full bg-white shadow-xl flex items-center justify-center border border-emerald-50">
                    <Crosshair className="w-8 h-8 text-emerald-600 opacity-60 animate-[spin_4s_linear_infinite]" />
                </div>
            </div>
            <div className="space-y-1">
                <p className="text-[11px] text-slate-900 font-black uppercase tracking-[0.2em]">主力和弦算法监控中</p>
                <p className="text-[9px] text-slate-400 font-medium tracking-wider">未发现异常筹码派发或逆向诱多行为</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {suspiciousStocks.map(stock => (
              <div key={stock.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] font-black text-white">
                            {stock.name.substring(0, 1)}
                        </div>
                        <div>
                            <div className="font-black text-sm text-slate-900">{stock.name}</div>
                            <div className="text-[10px] font-mono text-slate-400">{stock.code}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Risk Score</div>
                            <div className="flex items-center gap-2">
                                <span className={cn("text-sm font-black font-mono", 
                                    (stock.trapRiskScore || 0) > 75 ? "text-red-600" : "text-orange-600")}>
                                    {stock.trapRiskScore || 0}%
                                </span>
                                <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className={cn("h-full transition-all duration-1000", (stock.trapRiskScore || 0) > 75 ? "bg-red-500" : "bg-orange-500")} 
                                        style={{ width: `${stock.trapRiskScore || 0}%` }} 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="space-y-2">
                    {/* Explicit signals if they exist */}
                    {stock.trapSignals?.map((trap, idx) => (
                        <div key={idx} className="flex items-start gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                            <div className={cn("mt-0.5 p-1.5 rounded-lg shrink-0", 
                                trap.severity === 'High' ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600")}>
                                {getTrapIcon(trap.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                                        {getTrapLabel(trap.type)}
                                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                                    </span>
                                    <Badge className={cn("px-2 py-0.5 text-[8px] font-black border rounded-md shadow-sm", getSeverityColor(trap.severity))}>
                                        {trap.severity} ALERT
                                    </Badge>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 leading-relaxed mb-3 italic">
                                    {trap.description}
                                </p>
                                
                                {/* Interactive Logic Box */}
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                                        <span className="text-[9px] font-black text-slate-400 uppercase">实时决策</span>
                                        <span className="text-[10px] font-black text-red-600">{trap.severity === 'High' ? '执行清仓' : '强制减筹'}</span>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2">
                                        <TrendingDown className="w-3 h-3 text-slate-400" />
                                        <span className="text-[9px] font-black text-slate-400 uppercase">筹码松动</span>
                                        <span className="text-[10px] font-black text-slate-900">
                                            {(stock.moneyQualityScore ? (100 - stock.moneyQualityScore) : (stock.trapRiskScore || 10)).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>

                                <button className="w-full py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 group">
                                    查看分时背离详图 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Fallback for score-only alerts */}
                    {(!stock.trapSignals || stock.trapSignals.length === 0) && (stock.trapRiskScore || 0) > 60 && (
                        <div className="flex items-start gap-3 bg-orange-50/30 p-3 rounded-xl border border-orange-100/50">
                            <div className="mt-0.5 p-1.5 rounded-lg bg-orange-100 text-orange-600 shrink-0">
                                <TriangleAlert className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1">
                                <div className="text-[10px] font-black uppercase tracking-widest text-orange-800 mb-1">逻辑综合预警 (System Alert)</div>
                                <p className="text-[11px] font-medium text-orange-700/80 leading-snug">
                                    系统监测到筹码分布与价格走势出现隐性背离，算法判定风险等级较高，建议密切关注盘中分时承接。
                                </p>
                            </div>
                        </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                主力和弦算法监测中: 筹码派发 · 逆向诱多 · 缩量顶
              </span>
          </div>
          <ArrowRight className="w-4 h-4 text-white/30" />
      </div>
    </Card>
  );
};