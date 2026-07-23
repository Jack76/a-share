import React from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Thermometer, Layers, Zap, ShieldAlert, Activity, ArrowUpRight, ArrowDownRight, Compass, Target, Hash, BarChart3, Globe } from 'lucide-react';
import { cn } from './ui/utils';
import { DailyMetrics, MarketPhase } from '../types';
import { useTrading } from '../context/Store';

interface Props {
  metrics: DailyMetrics;
  phase: MarketPhase;
}

export const MarketBreadthIndicators: React.FC<Props> = ({ metrics, phase }) => {
  const { marketStats } = useTrading();
  const yesterdayProfit = metrics.yesterdayLimitUpEffect || 0;
  const isProfitPositive = yesterdayProfit > 0;
  const marketTemp = metrics.marketTemp || 50;
  const entropy = metrics.marketEntropy || 50; // Integrated from Chaos Meter
  const marketDataUnavailable = !marketStats && (
    metrics.marketDataStatus === 'UNAVAILABLE' ||
    metrics.marketDataStatus === undefined
  );
  const rawLimitUps = marketStats?.limitUpCount ?? (marketDataUnavailable ? null : metrics.limitUpCount);
  const rawLimitDowns = marketStats?.limitDownCount ?? (marketDataUnavailable ? null : metrics.limitDownCount);
  const displayedLimitUps = typeof rawLimitUps === 'number' && Number.isFinite(rawLimitUps) ? rawLimitUps : null;
  const displayedLimitDowns = typeof rawLimitDowns === 'number' && Number.isFinite(rawLimitDowns) ? rawLimitDowns : null;

  // Debug: Log market stats to check limit down count
  React.useEffect(() => {
    if (marketStats) {
      console.log('[MarketBreadth Debug] MarketStats:', {
        limitUpCount: marketStats.limitUpCount,
        limitDownCount: marketStats.limitDownCount,
        totalCount: marketStats.totalCount
      });
    }
  }, [marketStats]);

  const getTempStatus = (t: number) => {
    // v7.1 优化：更细致的温度分级
    if (t >= 90) return { color: 'text-purple-600', bg: 'bg-purple-600', label: '极度亢奋/撤退' };
    if (t >= 80) return { color: 'text-rose-600', bg: 'bg-rose-500', label: '疯狂/锁仓止盈' };
    if (t >= 70) return { color: 'text-red-600', bg: 'bg-red-500', label: '燥热/高风险' };
    if (t >= 60) return { color: 'text-orange-500', bg: 'bg-orange-500', label: '活跃/谨慎博弈' };
    if (t >= 50) return { color: 'text-amber-500', bg: 'bg-amber-500', label: '温和/适宜' };
    if (t >= 35) return { color: 'text-yellow-500', bg: 'bg-yellow-500', label: '偏冷/分歧' };
    if (t >= 20) return { color: 'text-sky-600', bg: 'bg-sky-500', label: '冰冷/潜伏' };
    return { color: 'text-blue-700', bg: 'bg-blue-600', label: '极寒/绝境反击' };
  };

  const status = getTempStatus(marketTemp);

  // v7.2 全市场数据计算
  const marketMakingMoneyRatio = marketStats 
    ? ((marketStats.upCount / marketStats.totalCount) * 100).toFixed(1)
    : null;
  const marketLimitUpRatio = marketStats
    ? ((marketStats.limitUpCount / marketStats.totalCount) * 100).toFixed(2) 
    : null;

  return (
    <div className="space-y-4">
      {marketDataUnavailable && (
        <div role="alert" className="flex items-center gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <div>
            <div className="text-sm font-bold">全市场行情暂不可用</div>
            <div className="text-xs text-amber-700">涨跌停与市场宽度不会按 0 处理，当前预测可靠性已自动降级。</div>
          </div>
        </div>
      )}
      {/* v7.2 NEW: 全市场赚钱效应总览 */}
      {marketStats && (
        <Card className="relative overflow-hidden border-2 border-blue-200/50 shadow-xl bg-gradient-to-br from-blue-50 to-white rounded-3xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500" />
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">沪深全市场实时统计 (5000+ 标的)</h3>
              <Badge className="bg-blue-600 text-white text-[8px] px-1.5 py-0.5 animate-pulse">LIVE</Badge>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 md:gap-4">
              {/* 上涨家数 */}
              <div className="p-3 rounded-xl bg-red-50/50 border border-red-100">
                <div className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">上涨</div>
                <div className="flex items-baseline gap-1">
                  <div className="text-2xl font-black text-red-600">{marketStats.upCount}</div>
                  <div className="text-[9px] font-bold text-red-400">家</div>
                </div>
                <div className="text-[8px] text-slate-400 mt-0.5">{((marketStats.upCount/marketStats.totalCount)*100).toFixed(1)}%</div>
              </div>

              {/* 下跌家数 */}
              <div className="p-3 rounded-xl bg-green-50/50 border border-green-100">
                <div className="text-[9px] font-black text-green-400 uppercase tracking-widest mb-1">下跌</div>
                <div className="flex items-baseline gap-1">
                  <div className="text-2xl font-black text-green-600">{marketStats.downCount}</div>
                  <div className="text-[9px] font-bold text-green-400">家</div>
                </div>
                <div className="text-[8px] text-slate-400 mt-0.5">{((marketStats.downCount/marketStats.totalCount)*100).toFixed(1)}%</div>
              </div>

              {/* 涨停数 */}
              <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-100">
                <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">涨停</div>
                <div className="flex items-baseline gap-1">
                  <div className="text-2xl font-black text-rose-600">{marketStats.limitUpCount}</div>
                  <div className="text-[9px] font-bold text-rose-400">只</div>
                </div>
                <div className="text-[8px] text-slate-400 mt-0.5">{marketLimitUpRatio}%</div>
              </div>

              {/* 跌停数 */}
              <div className="p-3 rounded-xl bg-cyan-50/50 border border-cyan-100">
                <div className="text-[9px] font-black text-cyan-400 uppercase tracking-widest mb-1">跌停</div>
                <div className="flex items-baseline gap-1">
                  <div className="text-2xl font-black text-cyan-600">{marketStats.limitDownCount}</div>
                  <div className="text-[9px] font-bold text-cyan-400">只</div>
                </div>
                <div className="text-[8px] text-slate-400 mt-0.5">{((marketStats.limitDownCount/marketStats.totalCount)*100).toFixed(2)}%</div>
              </div>

              {/* 平均涨幅 */}
              <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-100">
                <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">均涨幅</div>
                <div className="flex items-baseline gap-1">
                  <div className={cn("text-2xl font-black", marketStats.avgChange > 0 ? "text-red-600" : "text-green-600")}>
                    {marketStats.avgChange > 0 ? '+' : ''}{marketStats.avgChange}%
                  </div>
                </div>
                <div className="text-[8px] text-slate-400 mt-0.5">全场平均</div>
              </div>

              {/* 总成交额 */}
              <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100">
                <div className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-1">成交额</div>
                <div className="flex items-baseline gap-1">
                  <div className="text-2xl font-black text-purple-600">
                      {(() => {
                          const amt = marketStats.totalAmount; // Unit: Yuan
                          const vol = marketStats.totalVolume; // Unit: Billions (Yi)
                          
                          if (amt && amt > 0) return (amt / 100000000).toFixed(0);
                          if (vol && vol > 0) return vol; // Already in Billions
                          return '-'; 
                      })()}
                  </div>
                  <div className="text-[9px] font-bold text-purple-400">亿</div>
                </div>
                <div className="text-[8px] text-slate-400 mt-0.5">今日总量</div>
              </div>

              {/* 赚钱效应 */}
              <div className={cn("p-3 rounded-xl border", 
                parseFloat(marketMakingMoneyRatio || '0') > 50 ? "bg-red-50/50 border-red-200" : "bg-slate-50/50 border-slate-200")}>
                <div className="text-[9px] font-black uppercase tracking-widest mb-1" 
                  style={{ color: parseFloat(marketMakingMoneyRatio || '0') > 50 ? '#dc2626' : '#64748b' }}>
                  赚钱率
                </div>
                <div className="flex items-baseline gap-1">
                  <div className={cn("text-2xl font-black", 
                    parseFloat(marketMakingMoneyRatio || '0') > 50 ? "text-red-600" : "text-slate-600")}>
                    {marketMakingMoneyRatio}%
                  </div>
                </div>
                <div className="text-[8px] text-slate-400 mt-0.5">
                  {parseFloat(marketMakingMoneyRatio || '0') > 50 ? '普涨行情' : '普跌退潮'}
                </div>
              </div>

              {/* 市场温度对比 */}
              <div className="p-3 rounded-xl bg-slate-50/50 border border-slate-200">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">池子温度</div>
                <div className="flex items-baseline gap-1">
                  <div className={cn("text-2xl font-black", status.color)}>
                    {marketTemp.toFixed(0)}
                  </div>
                  <div className="text-[9px] font-bold text-slate-400">°</div>
                </div>
                <div className="text-[8px] text-slate-400 mt-0.5">vs 全场涨停{marketStats.limitUpCount}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Original 4-column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Market Temperature Gauge */}
        <Card className="relative overflow-hidden border border-slate-200/50 shadow-lg bg-white/40 backdrop-blur-md rounded-2xl group hover:shadow-xl transition-all">
          <div className={cn("absolute top-0 left-0 w-full h-1", status.bg)} />
          <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                  <span className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400">Market Temp</span>
                  <Activity className={cn("w-4 h-4", status.color)} />
              </div>
              <div className="flex items-baseline gap-1">
                  <div className={cn("text-4xl font-black tracking-tighter italic", status.color)}>
                      {marketTemp.toFixed(0)}
                  </div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">/100</span>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner">
                      <div 
                          className={cn("h-full rounded-full transition-all duration-1000 ease-out", status.bg)}
                          style={{ width: `${marketTemp}%` }}
                      />
                  </div>
                  <div className="flex flex-col items-center">
                      <div className={cn("text-[9px] font-black uppercase tracking-widest text-center", status.color)}>
                          {status.label}
                      </div>
                      <div className="text-[8px] font-medium text-slate-400 mt-1 scale-90">
                          {marketTemp > 75 ? "风险积聚，只出不进" : 
                           marketTemp > 55 ? "资金活跃，积极博弈" : 
                           marketTemp > 35 ? "分歧震荡，局部机会" : "冰点极致，反转在即"}
                      </div>
                  </div>
              </div>
          </CardContent>
        </Card>

        {/* 2. Quantum Entropy (Merged from Chaos Meter) */}
        <Card className="relative overflow-hidden border border-slate-200/50 shadow-lg bg-white/40 backdrop-blur-md rounded-2xl group hover:shadow-xl transition-all">
          <div className={cn("absolute top-0 left-0 w-full h-1", entropy < 40 ? "bg-emerald-500" : (entropy < 70 ? "bg-amber-500" : "bg-rose-500"))} />
          <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                  <span className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400">Quantum Entropy</span>
                  <Compass className={cn("w-4 h-4", entropy < 40 ? "text-emerald-500" : (entropy < 70 ? "text-amber-500" : "text-rose-500"))} />
              </div>
              <div className="flex items-baseline gap-1">
                  <div className={cn("text-4xl font-black tracking-tighter italic", 
                      entropy < 40 ? "text-emerald-600" : (entropy < 70 ? "text-amber-600" : "text-rose-600"))}>
                      {entropy.toFixed(0)}
                  </div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">%</span>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                   <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase tracking-widest">
                      <span>Order</span>
                      <span>Chaos</span>
                   </div>
                   <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner flex">
                      <div className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 w-full relative">
                          <div className="absolute top-0 bottom-0 w-1 bg-white border border-slate-300 shadow-sm" style={{ left: `${entropy}%` }} />
                      </div>
                   </div>
                   <div className="text-[8px] font-medium text-slate-500 text-center mt-1">
                      {entropy > 70 ? "混沌无序，空仓防守" : (entropy > 40 ? "题材轮动，去弱留强" : "主线清晰，全力做多")}
                   </div>
              </div>
          </CardContent>
        </Card>

        {/* 3. Market Phase Dynamic Card */}
        <Card className="relative overflow-hidden border border-slate-200/50 shadow-lg bg-white/40 backdrop-blur-md rounded-2xl group hover:shadow-xl transition-all">
          <div className={cn("absolute top-0 left-0 w-full h-1", 
              phase === 'Climax' ? "bg-red-500" : (phase === 'Ebb' ? "bg-orange-500" : "bg-emerald-500"))} />
          <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                  <span className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400">Tactical Phase</span>
                  <Compass className="w-4 h-4 text-slate-400 group-hover:rotate-180 transition-transform duration-700" />
              </div>
              <div className={cn("text-lg font-black tracking-tight mb-1 italic", 
                  phase === 'Climax' ? "text-red-600" : (phase === 'Ebb' ? "text-orange-600" : "text-slate-900"))}>
                  {phase === 'Climax' ? '情绪高潮' : 
                   phase === 'Startup' ? '情绪启动' : 
                   phase === 'Ice' ? '极端冰点' : 
                   phase === 'Ebb' ? '退潮避险' : 
                   phase === 'Repair' ? '冰点修复' : '混沌博弈'}
              </div>
              <div className="text-[9px] font-bold text-slate-500 mb-2">
                   {phase === 'Climax' ? '一致性强，持仓锁利' : 
                    phase === 'Startup' ? '新周期，大胆试错' : 
                    phase === 'Ice' ? '否极泰来，博弈穿越' : 
                    phase === 'Ebb' ? '亏钱效应，严控回撤' : 
                    phase === 'Repair' ? '情绪回暖，做多错杀' : '无主线，轻仓防守'}
              </div>
              <div className="flex items-center gap-2 py-1.5 px-2 bg-slate-50 rounded-lg border border-slate-100">
                  <div className={cn("w-1.5 h-1.5 rounded-full", 
                      metrics.sentimentDivergence === 'Positive' ? "bg-red-500" : "bg-slate-300")} />
                  <span className="text-[9px] font-black uppercase tracking-tighter text-slate-500">
                      背离: {metrics.sentimentDivergence === 'Positive' ? '正向' : (metrics.sentimentDivergence === 'Negative' ? '负向' : '无')}
                  </span>
              </div>
          </CardContent>
        </Card>

        {/* 3. Space Height (The Ceiling) */}
        <Card className="relative overflow-hidden border border-slate-200/50 shadow-lg bg-white/40 backdrop-blur-md rounded-2xl group hover:shadow-xl transition-all">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
          <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                  <span className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400">Ceiling Height</span>
                  <Layers className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2">
                  <div className="text-4xl font-black tracking-tighter text-amber-600 italic">
                      {metrics.spaceHeight || 0}
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] font-black text-amber-600 uppercase">Board</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">连板高度</span>
                  </div>
              </div>
              <div className="mt-2 text-[8px] font-medium text-slate-500">
                  {(metrics.spaceHeight || 0) >= 7 ? "空间打开，接力良性" : "高度压制，谨慎追高"}
              </div>
              <div className="mt-3 flex items-center justify-between py-1.5 px-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">全市场涨停数</span>
                  <span className="text-xs font-black text-amber-600 tabular-nums">
                    {displayedLimitUps === null ? '-' : `${displayedLimitUps}只`}
                  </span>
               </div>
               <div className="text-[7px] text-slate-400 text-center mt-1">
                 最高连板:{metrics.spaceHeight || 0}板 | 涨停家数:{displayedLimitUps ?? '-'}
               </div>
              <div className="mt-2 flex items-center gap-1.5">
                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400" style={{ width: `${(metrics.spaceHeight || 0) * 10}%` }} />
                  </div>
              </div>
          </CardContent>
        </Card>

        {/* 4. Board Relay Success Rate (NEW v27.0) */}
        <Card className="relative overflow-hidden border border-slate-200/50 shadow-lg bg-white/40 backdrop-blur-md rounded-2xl group hover:shadow-xl transition-all">
          <div className={cn("absolute top-0 left-0 w-full h-1", (metrics.relaySuccessRate || 0) > 60 ? "bg-red-500" : "bg-orange-500")} />
          <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                  <span className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400">Relay Success</span>
                  <Target className={cn("w-4 h-4", (metrics.relaySuccessRate || 0) > 60 ? "text-red-500" : "text-orange-500")} />
              </div>
              <div className="flex items-baseline gap-1">
                  <div className={cn("text-4xl font-black tracking-tighter italic", (metrics.relaySuccessRate || 0) > 60 ? "text-red-600" : "text-orange-600")}>
                      {(metrics.relaySuccessRate || 42).toFixed(0)}%
                  </div>
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">连板成功率</p>
              <div className="text-[8px] font-medium text-slate-500 mt-1 mb-2">
                  {(metrics.relaySuccessRate || 0) > 60 ? "情绪高涨，可打板" : "接力坑多，少出手"}
              </div>
              <div className="grid grid-cols-4 gap-0.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className={cn("h-1 rounded-full", 
                          i < (metrics.relaySuccessRate || 40) / 12 ? "bg-red-500" : "bg-slate-100")} />
                  ))}
              </div>
          </CardContent>
        </Card>

        {/* 5. Dragon Survival Probability (Replaces Theme Density) */}
        <Card className="relative overflow-hidden border border-slate-200/50 shadow-lg bg-white/40 backdrop-blur-md rounded-2xl group hover:shadow-xl transition-all">
          <div className={cn("absolute top-0 left-0 w-full h-1", (metrics.leaderSurvivalProb || 0) > 70 ? "bg-red-500" : "bg-slate-300")} />
          <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                  <span className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400">Dragon Survival</span>
                  <Target className={cn("w-4 h-4", (metrics.leaderSurvivalProb || 0) > 70 ? "text-red-500" : "text-slate-400")} />
              </div>
              <div className="flex items-baseline gap-1">
                  <div className={cn("text-4xl font-black tracking-tighter italic", (metrics.leaderSurvivalProb || 0) > 70 ? "text-red-600" : "text-slate-900")}>
                      {(metrics.leaderSurvivalProb || 0).toFixed(0)}%
                  </div>
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">龙头晋级概率</p>
              <div className="mt-2 flex gap-1 flex-col">
                  <Badge variant="outline" className={cn("w-fit text-[8px] font-black", (metrics.leaderSurvivalProb || 0) > 70 ? "border-red-100 text-red-600" : "border-slate-100 text-slate-500")}>
                      {(metrics.leaderSurvivalProb || 0) > 70 ? '极高概率' : '风险未知'}
                  </Badge>
                  <span className="text-[8px] font-medium text-slate-500">
                      {(metrics.leaderSurvivalProb || 0) > 70 ? '市场合力，大概率晋级' : '分歧较大，谨慎接力'}
                  </span>
              </div>
          </CardContent>
        </Card>

        {/* 6. Alpha Divergence Index (NEW v27.0) */}
        <Card className="relative overflow-hidden border border-slate-200/50 shadow-lg bg-white/40 backdrop-blur-md rounded-2xl group hover:shadow-xl transition-all">
          <div className={cn("absolute top-0 left-0 w-full h-1", Math.abs(metrics.alphaDivergence || 0) > 15 ? "bg-red-600" : "bg-slate-300")} />
          <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                  <span className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400">Alpha Divergence</span>
                  <BarChart3 className={cn("w-4 h-4", Math.abs(metrics.alphaDivergence || 0) > 15 ? "text-red-600" : "text-slate-400")} />
              </div>
              <div className="flex items-baseline gap-1">
                  <div className={cn("text-4xl font-black tracking-tighter italic", 
                      (metrics.alphaDivergence || 0) > 0 ? "text-red-600" : ((metrics.alphaDivergence || 0) < 0 ? "text-green-600" : "text-slate-900"))}>
                      {(metrics.alphaDivergence || -5.2).toFixed(1)}
                  </div>
              </div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Alpha 背离指数</p>
              <div className="mt-2 text-[8px] font-black uppercase text-slate-400 flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                      {Math.abs(metrics.alphaDivergence || 0) > 15 ? (
                          <><ShieldAlert className="w-2.5 h-2.5 text-red-500" /> 警惕量价背离</>
                      ) : '量价匹配正常'}
                  </div>
                  <span className="text-[8px] font-medium text-slate-500 normal-case">
                      {Math.abs(metrics.alphaDivergence || 0) > 15 ? "缩量诱多，随时崩盘" : "量价健康，趋势向上"}
                  </span>
              </div>
          </CardContent>
        </Card>

        {/* 7. Risk Signals (Limit Downs - Global Market Data) */}
        <Card className="relative overflow-hidden border border-slate-200/50 shadow-lg bg-white/40 backdrop-blur-md rounded-2xl group hover:shadow-xl transition-all">
          <div className={cn("absolute top-0 left-0 w-full h-1", (marketStats?.limitDownCount || metrics.limitDownCount || 0) > 0 ? "bg-rose-600" : "bg-slate-300")} />
          <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                  <span className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400">Risk Signals</span>
                  <ShieldAlert className={cn("w-4 h-4", (marketStats?.limitDownCount || metrics.limitDownCount || 0) > 0 ? "text-rose-600" : "text-slate-400")} />
              </div>
              <div className="flex items-baseline gap-2">
                  <div className={cn("text-4xl font-black tracking-tighter italic", (marketStats?.limitDownCount || metrics.limitDownCount || 0) > 3 ? "text-rose-600 animate-pulse" : "text-slate-900")}>
                      {displayedLimitDowns ?? '-'}
                  </div>
                  <div className="flex flex-col">
                      <span className="text-[10px] font-black text-rose-600 uppercase">Limit-Down</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">全市场跌停</span>
                  </div>
              </div>
              <div className="text-[8px] font-medium text-slate-500 mt-2 mb-2">
                  {displayedLimitDowns === null ? "行情数据不可用，风险等级未知" :
                   (marketStats?.limitDownCount || metrics.limitDownCount || 0) > 10 ? "亏钱效应显著，退潮警报" : 
                   (marketStats?.limitDownCount || metrics.limitDownCount || 0) > 5 ? "局部风险释放，谨慎追高" : "市场情绪良性，无恐慌"}
              </div>
              <div className="mt-auto p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex gap-0.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} className={cn("flex-1 h-1 rounded-full", 
                              i < Math.min(10, (marketStats?.limitDownCount || metrics.limitDownCount || 0)) ? "bg-rose-500" : "bg-slate-200")} />
                      ))}
                  </div>
              </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
