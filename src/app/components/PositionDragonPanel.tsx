import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import {
  Crown, Target, Zap, ArrowUp, ArrowRight, Shield,
  BarChart3, Layers, TrendingUp, RefreshCw, Swords
} from 'lucide-react';
import { cn } from './ui/utils';
import { useTrading } from '../context/Store';
import { 
  identifyPositionDragons, 
  DragonCandidate, 
  DragonType,
  PositionDragonResult 
} from '../utils/positionDragon';

/**
 * POSITION DRAGON PANEL V63.0 (P2)
 * 卡位龙识别面板 — 展示空间龙、板块龙、卡位龙候选
 */

export const PositionDragonPanel: React.FC = () => {
  const { stocks, phase, themes } = useTrading();

  const result: PositionDragonResult = useMemo(() => {
    return identifyPositionDragons(stocks, phase, themes);
  }, [stocks, phase, themes]);

  const typeConfig: Record<DragonType, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
    'SPACE_DRAGON': { 
      icon: <Crown className="w-3.5 h-3.5" />, 
      color: 'text-amber-700', 
      bg: 'bg-amber-50', 
      border: 'border-amber-300' 
    },
    'SECTOR_DRAGON': { 
      icon: <Layers className="w-3.5 h-3.5" />, 
      color: 'text-blue-700', 
      bg: 'bg-blue-50', 
      border: 'border-blue-300' 
    },
    'POSITION_DRAGON': { 
      icon: <Target className="w-3.5 h-3.5" />, 
      color: 'text-red-700', 
      bg: 'bg-red-50', 
      border: 'border-red-300' 
    },
    'RELAY_CANDIDATE': { 
      icon: <ArrowRight className="w-3.5 h-3.5" />, 
      color: 'text-purple-700', 
      bg: 'bg-purple-50', 
      border: 'border-purple-300' 
    },
    'SECOND_WAVE': { 
      icon: <RefreshCw className="w-3.5 h-3.5" />, 
      color: 'text-orange-700', 
      bg: 'bg-orange-50', 
      border: 'border-orange-300' 
    },
    'ROTATION_DRAGON': { 
      icon: <Swords className="w-3.5 h-3.5" />, 
      color: 'text-emerald-700', 
      bg: 'bg-emerald-50', 
      border: 'border-emerald-300' 
    },
  };

  // Combine all displayable candidates
  const allCandidates = [
    ...(result.spaceDragon ? [result.spaceDragon] : []),
    ...result.positionDragons.slice(0, 5),
    ...result.relayCandidates.slice(0, 3),
  ];

  return (
    <Card className="border border-slate-200 shadow-2xl bg-white/40 backdrop-blur-xl overflow-hidden rounded-3xl">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900">
            <Crown className="w-4 h-4 text-amber-600" />
            卡位龙雷达 (Position Dragon V63.0)
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              "px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-widest",
              result.isLadderHealthy ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
            )}>
              {result.isLadderHealthy ? '梯队健康' : '梯队异常'}
            </div>
            <div className="px-2 py-0.5 rounded-md bg-slate-900 text-[8px] font-black text-white uppercase tracking-widest">
              MAX {result.maxBoardHeight}板
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Board Ladder Visualization */}
        <div className="px-5 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">连板梯队分布</span>
          </div>
          {Object.keys(result.boardLadder).length > 0 ? (
            <div className="flex items-end gap-1.5 h-14">
              {Array.from({ length: Math.max(1, result.maxBoardHeight) }, (_, i) => i + 1).map(height => {
                const count = result.boardLadder[height] || 0;
                const maxCount = Math.max(1, ...Object.values(result.boardLadder));
                const heightPct = count > 0 ? Math.max(15, (count / maxCount) * 100) : 5;
                const isSpaceDragonHeight = height === result.maxBoardHeight && count > 0;
                
                return (
                  <div key={height} className="flex-1 flex flex-col items-center gap-1">
                    <span className={cn(
                      "text-[9px] font-black font-mono",
                      count > 0 ? "text-white" : "text-slate-600"
                    )}>
                      {count}
                    </span>
                    <div 
                      className={cn(
                        "w-full rounded-t transition-all",
                        isSpaceDragonHeight ? "bg-gradient-to-t from-amber-600 to-amber-400" :
                        count > 0 ? "bg-gradient-to-t from-slate-600 to-slate-400" :
                        "bg-slate-800"
                      )}
                      style={{ height: `${heightPct}%`, minHeight: '3px' }}
                    />
                    <span className={cn(
                      "text-[8px] font-bold",
                      isSpaceDragonHeight ? "text-amber-400" : "text-slate-500"
                    )}>
                      {height}板
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-4 text-slate-500 text-[10px]">当日无涨停</div>
          )}
          <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">{result.ladderAdvice}</p>
        </div>

        {/* Global Advice */}
        <div className="px-5 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
          <p className="text-[10px] font-bold text-amber-800 leading-relaxed">{result.globalAdvice}</p>
        </div>

        {/* Candidates List */}
        <div className="divide-y divide-slate-100">
          {allCandidates.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
                <Target className="w-6 h-6 text-slate-200" />
              </div>
              <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">未发现卡位龙候选</p>
              <p className="text-[9px] text-slate-400">需要市场最高板 ≥ 3板才能识别卡位结构</p>
            </div>
          ) : (
            allCandidates.map(candidate => {
              const config = typeConfig[candidate.dragonType];
              const stock = candidate.stock;
              
              return (
                <div key={`${candidate.dragonType}-${stock.id}`} className="p-4 hover:bg-slate-50/80 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Position score circle */}
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex flex-col items-center justify-center font-black border shadow-sm",
                        candidate.positionScore >= 80 ? "bg-red-600 text-white border-red-400" :
                        candidate.positionScore >= 60 ? "bg-orange-600 text-white border-orange-400" :
                        "bg-white text-slate-900 border-slate-200"
                      )}>
                        <span className="text-[11px]">{candidate.positionScore}</span>
                        <span className="text-[5px] uppercase tracking-tighter opacity-70">SCR</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-sm text-slate-900">{stock.name}</span>
                          <Badge className={cn("text-[7px] font-black px-1.5 py-0 border gap-0.5 flex items-center", config.bg, config.color, config.border)}>
                            {config.icon}
                            {candidate.dragonLabel}
                          </Badge>
                          {candidate.boardHeight > 0 && (
                            <span className="text-[9px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                              {candidate.boardHeight}板
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                          {stock.code}
                          <span className="text-slate-900 font-black">{candidate.concept}</span>
                          {candidate.relatedDragon && (
                            <span className="text-amber-600">
                              → {candidate.relatedDragon}({candidate.relatedDragonHeight}板)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-sm font-black font-mono",
                        (stock.changePercent || 0) > 0 ? "text-red-600" : "text-green-600"
                      )}>
                        {(stock.changePercent || 0) > 0 ? '+' : ''}{(stock.changePercent || 0).toFixed(2)}%
                      </div>
                      {candidate.relayProbability > 0 && (
                        <div className="text-[9px] text-slate-400 mt-0.5">
                          接力率 <span className="font-black font-mono text-slate-700">{candidate.relayProbability}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quality badges */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {candidate.sealQuality === 'HARD' && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-bold border border-red-200">
                        <Shield className="w-2.5 h-2.5 inline mr-0.5" />硬板
                      </span>
                    )}
                    {candidate.volumePattern === 'SHRINK' && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-bold border border-blue-200">
                        缩量
                      </span>
                    )}
                    {candidate.volumePattern === 'HEAVY' && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-bold border border-orange-200">
                        放量
                      </span>
                    )}
                    {candidate.tags.filter(t => !['卡位龙', '空间龙', '板块龙', '缩量', '放量', '硬板'].includes(t)).map((tag, i) => (
                      <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Strategy */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[10px] text-slate-700 leading-relaxed">{candidate.strategy}</p>
                    {candidate.entryTiming && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200">
                        <Zap className="w-3 h-3 text-orange-500 shrink-0" />
                        <span className="text-[9px] text-slate-500">
                          <span className="font-bold text-slate-700">介入: </span>
                          {candidate.entryTiming}
                        </span>
                      </div>
                    )}
                    {candidate.stopLoss && (
                      <div className="flex items-center gap-2 mt-1">
                        <Shield className="w-3 h-3 text-red-400 shrink-0" />
                        <span className="text-[9px] text-slate-500">
                          <span className="font-bold text-red-600">止损: </span>
                          {candidate.stopLoss}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sector Dragons Summary */}
        {result.sectorDragons.length > 0 && (
          <div className="p-4 border-t border-slate-100">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Layers className="w-3 h-3" />
              板块龙头一览
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.sectorDragons.map(sd => (
                <div key={sd.stock.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200">
                  <span className="text-[9px] font-bold text-blue-700">{sd.concept}</span>
                  <span className="text-[9px] font-black text-slate-900">{sd.stock.name}</span>
                  <span className="text-[8px] font-mono text-orange-600">{sd.boardHeight}板</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="w-4 h-4 text-slate-400" />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            识龙·卡位·接力
          </span>
        </div>
        <div className="text-[9px] font-black text-slate-300">PREDATOR-X V63</div>
      </div>
    </Card>
  );
};
