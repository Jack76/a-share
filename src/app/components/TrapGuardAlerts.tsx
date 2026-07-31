import React from 'react';
import { Stock } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ShieldAlert, TriangleAlert, Fingerprint, ArrowRight, Zap, Target } from 'lucide-react';
import { cn } from './ui/utils';

interface Props {
  stocks: Stock[];
  onSelect?: (stock: Stock) => void;
}

export const TrapGuardAlerts: React.FC<Props> = React.memo(({ stocks, onSelect }) => {
  const highRiskStocks = stocks
    .filter(s => (s.trapRiskScore || 0) > 60 || (s.trapSignals && s.trapSignals.length > 0))
    .sort((a, b) => (b.trapRiskScore || 0) - (a.trapRiskScore || 0))
    .slice(0, 4);

  return (
    <Card className="border border-slate-200 shadow-2xl bg-white/40 backdrop-blur-xl overflow-hidden rounded-3xl group/trap">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldAlert className="w-4 h-4 text-red-600 group-hover/trap:scale-110 transition-transform" />
            TrapGuard 诱多预警 (Risk Feed)
          </div>
          <Badge className="bg-red-600 text-[9px] font-black uppercase tracking-widest border-none px-2 py-0.5 rounded-full animate-pulse">
            Active Scanning
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
            {highRiskStocks.length > 0 ? highRiskStocks.map(stock => (
                <div key={stock.id} className="p-5 hover:bg-red-50/50 transition-all group/item cursor-pointer" onClick={() => onSelect?.(stock)}>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex flex-col items-center justify-center text-white shadow-lg border border-slate-800">
                                <span className="text-xs font-black italic">{stock.name.substring(0, 1)}</span>
                                <span className="text-[7px] font-black text-white/40 uppercase">Dragon</span>
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-900 tracking-tight italic mb-1">{stock.name}</h4>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono font-bold text-slate-400">{stock.code}</span>
                                    <div className="w-1 h-1 rounded-full bg-slate-300" />
                                    <Badge variant="outline" className="text-[8px] font-black border-red-200 text-red-600 bg-red-50 px-1 py-0">{stock.concept?.split('/')[0]}</Badge>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-black font-mono text-red-600 leading-none mb-1">{stock.trapRiskScore}%</div>
                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Risk Score</div>
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        {stock.trapSignals?.slice(0, 2).map((signal, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-2 rounded-xl bg-white border border-red-100 shadow-sm">
                                <div className="p-1 bg-red-600 rounded-md shrink-0">
                                    <Zap className="w-3 h-3 text-white" />
                                </div>
                                <div>
                                    <div className="text-[9px] font-black text-red-600 uppercase tracking-widest">{signal.type === 'LateDayPull' ? '尾盘偷鸡' : '量价背离'}</div>
                                    <p className="text-[10px] font-medium text-slate-500 leading-tight italic line-clamp-1">{signal.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between opacity-0 group-hover/item:opacity-100 transition-opacity">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">查看分时背离详图</span>
                        <ArrowRight className="w-3.5 h-3.5 text-red-600" />
                    </div>
                </div>
            )) : (
                <div className="p-16 text-center flex flex-col items-center gap-4">
                    <Fingerprint className="w-12 h-12 text-slate-100 animate-pulse" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">全场筹码监测中... 暂无高危诱多</p>
                </div>
            )}
        </div>
      </CardContent>
      <div className="p-4 bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">规则识别挂单与成交背离风险</span>
          </div>
          <span className="text-[9px] font-black text-red-500 uppercase tracking-widest italic">
              实时更新中
          </span>
      </div>
    </Card>
  );
});
