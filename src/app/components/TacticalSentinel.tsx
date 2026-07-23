import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { ShieldAlert, Zap, TrendingUp, TrendingDown, AlertCircle, Activity, Waves } from 'lucide-react';
import { Stock, MarketPhase } from '../types';
import { cn } from './ui/utils';

interface Props {
  stocks: Stock[];
  phase: MarketPhase;
  marketTemp: number;
}

export const TacticalSentinel: React.FC<Props> = React.memo(({ stocks, phase, marketTemp }) => {
  // Logic: Filter stocks with specific v29.0 signals
  const alerts = React.useMemo(() => {
    const list: any[] = [];

    stocks.forEach(s => {
      // 1. Weak-to-Strong (弱转强)
      if (s.aiPrediction?.summary?.includes('弱转强') || (s.volumeRatio || 0) > 2 && (s.changePercent || 0) > 3) {
        list.push({
          id: `${s.id}-wts`,
          type: 'WTS',
          priority: 'High',
          stockName: s.name,
          title: '弱转强确立',
          description: '竞价量能突围，成功卡位板块核心，建议关注封板瞬间。',
          time: new Date().toLocaleTimeString().slice(0, 5)
        });
      }

      // 2. Divergence (量价背离)
      if (s.trapSignals?.some(sig => sig.type === 'VolumeDivergence' || sig.type === 'Divergence')) {
        list.push({
          id: `${s.id}-div`,
          type: 'DIV',
          priority: 'Critical',
          stockName: s.name,
          title: '量价严重背离',
          description: '价格拉升但资金强度衰减，警惕主力高位对倒出货陷阱。',
          time: new Date().toLocaleTimeString().slice(0, 5)
        });
      }

      // 3. Theme Dropout (题材掉队)
      if (s.isThemeDropout) {
        list.push({
          id: `${s.id}-dro`,
          type: 'DRO',
          priority: 'Critical',
          stockName: s.name,
          title: '题材掉队警告',
          description: '板块整体转弱，该标的孤龙难支，防范回马枪下杀。',
          time: new Date().toLocaleTimeString().slice(0, 5)
        });
      }
    });

    return list.sort((a, b) => (a.priority === 'Critical' ? -1 : 1));
  }, [stocks]);

  return (
    <Card className="border-none shadow-2xl bg-slate-950 text-white overflow-hidden relative group">
      {/* Background Cyber Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(220,38,38,0.15),transparent)] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 animate-pulse" />
      
      <CardHeader className="pb-2 border-b border-white/5 bg-white/5 backdrop-blur-md">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />
                Tactical Sentinel v29.0
            </div>
            <div className="flex items-center gap-2">
                <span className="text-[8px] text-slate-300 font-bold">MODE: REAL-TIME SCAN</span>
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
            </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0 max-h-[400px] overflow-y-auto custom-scrollbar">
        <div className="divide-y divide-white/5">
            {/* Market Liquidity Warning (Global) */}
            {marketTemp < 30 && (
                <div className="p-4 bg-red-950/30 border-l-4 border-red-600">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-red-600/20 text-red-400">
                            <Waves className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-[11px] font-black uppercase text-red-400 tracking-wider">全场流动性枯竭警报 (Global)</div>
                            <p className="text-[10px] text-red-100/70 leading-relaxed mt-1">
                                市场成交极速萎缩，冰点期“杀高标”概率达 85%。严格控制仓位，禁止接力中位股。
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {alerts.length > 0 ? alerts.map(alert => (
                <div key={alert.id} className={cn(
                    "p-4 transition-colors hover:bg-white/5 group/item",
                    alert.priority === 'Critical' ? "bg-red-500/10" : ""
                )}>
                    <div className="flex justify-between items-start mb-1.5">
                        <div className="flex items-center gap-2">
                            <span className={cn(
                                "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                                alert.type === 'WTS' ? "bg-orange-500/20 text-orange-400" :
                                alert.type === 'DIV' ? "bg-red-500/20 text-red-400" :
                                "bg-purple-500/20 text-purple-400"
                            )}>
                                {alert.type}
                            </span>
                            <span className="text-xs font-black text-white group-hover/item:text-red-400 transition-colors">{alert.stockName}</span>
                        </div>
                        <span className="text-[9px] font-mono text-slate-400">{alert.time}</span>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="mt-1">
                            {alert.type === 'WTS' ? <Zap className="w-3.5 h-3.5 text-orange-400" /> :
                             alert.type === 'DIV' ? <TrendingDown className="w-3.5 h-3.5 text-red-400" /> :
                             <AlertCircle className="w-3.5 h-3.5 text-purple-400" />}
                        </div>
                        <div>
                            <h4 className="text-[11px] font-black text-slate-100">{alert.title}</h4>
                            <p className="text-[10px] text-slate-300 leading-relaxed mt-0.5">{alert.description}</p>
                        </div>
                    </div>
                </div>
            )) : (
                <div className="p-12 text-center">
                    <Activity className="w-10 h-10 text-slate-800 mx-auto mb-3" />
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">环境扫描中... 暂无战术冲突</p>
                </div>
            )}
        </div>
      </CardContent>
      
      <div className="p-3 border-t border-white/5 bg-slate-900/50">
          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-400">
              <div className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-green-500" />
                  Quantum Core: Online
              </div>
              <div className="flex items-center gap-2">
                  Divergence Index: <span className="text-white">Active</span>
              </div>
          </div>
      </div>
    </Card>
  );
});