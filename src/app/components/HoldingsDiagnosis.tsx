import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { useTrading } from '../context/Store';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Input } from './ui/input';
import { ShieldCheck, ShieldAlert, TrendingDown, TrendingUp, Save, BrainCircuit, TriangleAlert, Target, ArrowRight, Settings2, Lock, Activity, Zap, BarChart3, AlertTriangle, Layers, Timer, Trash2, Scissors, Siren, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from './ui/utils';
import { Flame } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

export const HoldingsDiagnosis: React.FC = () => {
  const { stocks, phase, updateStock, removeStock } = useTrading();
  const heldStocks = stocks.filter(s => s.status === 'Hold');
  
  const [editingStockData, setEditingStockData] = useState<Record<string, { stop?: string, cost?: string }>>({});
  const [harvestAdvice, setHarvestAdvice] = useState<Record<string, any>>({});

  // v6.1 Sector Correlation Risk Analysis (板块联动风控)
  // Calculate which sectors are currently "Failing" based on held positions
  const riskySectors = React.useMemo(() => {
    const sectors = new Set<string>();
    heldStocks.forEach(s => {
        const current = s.currentPrice || 0;
        const stop = s.trailingStopPrice || 0;
        const isCrashing = (s.changePercent || 0) < -7; // Deep drop
        const isBroken = stop > 0 && current <= stop;    // Stop loss hit
        
        // If a stock is fundamentally broken, mark its sector as risky
        if ((isCrashing || isBroken) && s.concept) {
            sectors.add(s.concept);
        }
    });
    return sectors;
  }, [heldStocks]);

  // v5.9 Harvest Protocol Integration
  useEffect(() => {
    const fetchHarvestProtocol = async () => {
        const adviceMap: Record<string, any> = {};
        
        for (const stock of heldStocks) {
            try {
                const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-545d7fd7/trade/harvest-protocol`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${publicAnonKey}`
                    },
                    body: JSON.stringify({
                        code: stock.code,
                        cost: stock.costPrice || 0,
                        current: stock.currentPrice || 0,
                        high: stock.high || stock.currentPrice, // Assuming high is available or fallback to current
                        isLimitUp: stock.changePercent ? stock.changePercent > 9.8 : false, // Approx check
                        alpha: stock.moneyQualityScore ? stock.moneyQualityScore - 50 : 0, // Approx Alpha from score
                        volumeRatio: stock.volumeRatio || 1.0,
                        daysHeld: stock.buyDate ? Math.ceil((new Date().getTime() - new Date(stock.buyDate).getTime()) / (1000 * 3600 * 24)) : 0
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    adviceMap[stock.id] = data;
                }
            } catch (e) {
                console.error("Harvest Protocol Error:", e);
            }
        }
        setHarvestAdvice(adviceMap);
    };

    if (heldStocks.length > 0) {
        fetchHarvestProtocol();
    }
  }, [heldStocks.length, stocks]); // Re-run when stocks change

  const handleRemoveStock = (id: string, name: string) => {
      if (confirm(`确认结束 ${name} 的持仓吗？\n该标的将保留在龙头池中继续观察。`)) {
          updateStock(id, { 
              status: 'Watch',
              costPrice: undefined,
              trailingStopPrice: undefined,
              buyDate: undefined,
              trailingStopMode: 'Manual'
          });
          toast.success(`${name} 已转为观察状态`);
      }
  };

  const handleUpdateStockData = (id: string) => {
    const data = editingStockData[id];
    const newStop = parseFloat(data?.stop || '');
    const newCost = parseFloat(data?.cost || '');
    
    const updates: any = {};
    if (!isNaN(newStop)) {
        updates.trailingStopPrice = newStop;
        updates.trailingStopMode = 'Manual';
    }
    if (!isNaN(newCost)) {
        updates.costPrice = newCost;
    }

    if (Object.keys(updates).length > 0) {
        updateStock(id, updates);
        setEditingStockData(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        toast.success("持仓数据已更新");
    }
  };

  const toggleMode = (id: string, currentMode: string) => {
    const nextMode = currentMode === 'Manual' ? 'Auto' : 'Manual';
    updateStock(id, { trailingStopMode: nextMode as any });
    toast.info(`已切换至 ${nextMode === 'Auto' ? 'AI 自动' : '手动'} 保卫模式`);
  };

  const getDiagnosis = (stock: any) => {
    const current = stock.currentPrice || 0;
    const stop = stock.trailingStopPrice || 0;
    const cost = stock.costPrice || 0;
    const profit = cost > 0 ? ((current - cost) / cost) * 100 : 0;
    const distToStop = stop > 0 ? ((current - stop) / stop) * 100 : 0;
    const profitFromStop = stop > 0 && cost > 0 ? ((stop - cost) / cost) * 100 : 0;

    // v5.9 Profit Taking Logic (Target Analysis)
    const prediction = stock.aiPrediction || {};
    let sellTarget = 0;
    // Handle both number and string formats from different engine versions
    if (typeof prediction.sellPoint === 'number') {
        sellTarget = prediction.sellPoint;
    } else if (typeof prediction.sellPoint === 'string') {
        sellTarget = parseFloat(prediction.sellPoint.replace(/[^0-9.]/g, '')) || 0;
    }
    const distToTarget = (sellTarget > 0 && current > 0) ? ((sellTarget - current) / current) * 100 : null;

    // v9.3 Momentum Synergy Check (动能共振校验)
    // Check if the stock is currently in a high-momentum state (Stargate or Accelerate)
    // to prevent premature profit-taking advice.
    const isStargate = stock.stargate?.gateLevel !== undefined && stock.stargate.gateLevel >= 2;
    const isAccelerating = prediction.trend === 'Accelerate';
    const isLockState = stock.isLimitUp || prediction.summary?.includes('锁仓') || prediction.summary?.includes('LOCK');

    let level: 'Normal' | 'Warning' | 'Critical' | 'Success' = 'Normal';
    let message = "";
    let action = "";

    // 1. Critical Stop Loss (Priority: Highest)
    if (stop > 0 && current <= stop) {
        level = 'Critical';
        message = "【破位】击穿防守线";
        action = "机械执行，无条件离场";
    } 
    // 2. Near Death Warning
    else if (stop > 0 && distToStop < 2) {
        level = 'Warning';
        message = "【警报】逼近生死线";
        action = "手指放在卖键上，破位即斩";
    } 
    // 3. Sector Correlation Risk (Priority: High)
    // If I'm fine, but my sector peer is dying -> Risk Contagion
    else if (stock.concept && riskySectors.has(stock.concept) && profit > -5) {
        level = 'Warning';
        message = "【联动】同袍落难";
        action = `板块内出现破位，建议 ${stock.name} 跟随减仓`;
    }
    // 4. Stargate / Momentum Synergy (New Priority: Higher than simple profit targets)
    else if (isStargate || isLockState) {
        level = 'Success';
        message = isStargate ? "【星门】维度加速中" : "【锁仓】强势封板中";
        action = "主升浪加速态，暂不建议分批止盈，建议锁仓持股";
    }
    // 5. Rule target exit (Priority: Medium)
    else if (sellTarget > 0 && current >= sellTarget) {
        if (profit > 0) {
            level = 'Success';
            message = "【止盈】到达目标位";
            action = "规则目标达成，建议分批兑现";
        } else {
            level = 'Warning'; 
            message = "【反抽】到达压力位";
            action = "触及阻力，建议减亏离场";
        }
    } 
    // 6. Tiered Exit Strategy (Hard Rules)
    else if (profit > 30) {
        level = 'Success';
        message = "【妖股】利润奔跑";
        action = isAccelerating ? "趋势极佳，建议继续持仓锁筹" : "利润 >30%，移动止损至成本+20%，放飞梦想";
    }
    else if (profit > 20) {
        level = 'Success';
        message = "【二阶】大肉落袋";
        action = "利润 >20%，建议再减 1/3，锁定胜局";
    }
    else if (profit > 10) {
        level = 'Success';
        message = "【一阶】首充安全垫";
        action = isAccelerating ? "动能充沛，建议暂缓止盈，紧盯 5日线" : "利润 >10%，建议先减 1/3，降低持仓成本";
    }
    // 7. Approaching Target
    else if (distToTarget !== null && distToTarget < 3 && distToTarget > 0) {
        if (profit > 0) {
            level = 'Success'; 
            message = "【提示】接近目标价";
            action = `距目标仅 ${distToTarget.toFixed(1)}%，准备止盈`;
        } else {
            level = 'Warning';
            message = "【警示】接近压力位";
            action = `距阻力仅 ${distToTarget.toFixed(1)}%，准备减仓`;
        }
    } 
    // 8. Phase Based Logic
    else if (phase === 'Ebb' && profit > 5) {
        level = 'Warning';
        message = "【退潮】获利盘兑现中";
        action = "落袋为安，不坐电梯";
    } else if (phase === 'Climax' && profit > 0) {
        message = "【主升】情绪加速中";
        action = "只看不动，让利润奔跑";
    } else {
        message = "【洗盘】良性分歧";
        action = "低换手锁仓特征，持有并紧盯退出条件";
    }

    return { level, message, action, profit, distToStop, profitFromStop, distToTarget, sellTarget };
  };

  if (heldStocks.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-8 text-center text-muted-foreground italic flex flex-col items-center gap-2">
            <BrainCircuit className="w-12 h-12 opacity-20" />
            当前账户无持仓，规则诊断模块待命中...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              持仓诊断与利润保卫 (Profit Guard)
          </h2>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-primary/5 text-[10px] uppercase font-black tracking-tighter">
                Active Positions: {heldStocks.length}
            </Badge>
          </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {heldStocks.map(stock => {
          const diag = getDiagnosis(stock);
          const isEditing = editingStockData[stock.id] !== undefined;
          const current = stock.currentPrice || 0;
          const stop = stock.trailingStopPrice || 0;
          const cost = stock.costPrice || 0;
          
          // Technical indicators
          const turnover = stock.turnoverRate || 0;
          const volRatio = stock.volumeRatio || 1;
          const chipPressure = stock.technicals?.chipPressure || 0;
          const mfi = stock.technicals?.mfi || 50;
          const prediction = stock.aiPrediction || { summary: '暂无数据', strategy: '观察中', sellPoint: '--', buyPoint: '--' };
          
          // Harvest Protocol Data
          const harvest = harvestAdvice[stock.id];
          const harvestAction = harvest?.decision?.action || 'HOLD';
          const harvestMessage = harvest?.decision?.message || diag.message;
          const harvestStyle = harvest?.decision?.style || 'neutral';
          const harvestReason = harvest?.decision?.reason || 'NORMAL';

          // Helper to parse T+1 Strategy
          const fullStrategy = diag.level === 'Success' ? diag.action : prediction.strategy;
          const t1Split = fullStrategy.split('【T+1 实战推演】');
          const mainStrategy = t1Split[0];
          const t1Strategy = t1Split.length > 1 ? t1Split[1] : null;

          return (
            <Card key={stock.id} className={cn("overflow-hidden border-none shadow-md group transition-all hover:shadow-xl relative", 
                diag.level === 'Success' ? "ring-2 ring-green-500" :
                diag.level === 'Critical' || harvestStyle === 'destructive' ? "ring-2 ring-destructive" : "")}>
              <div className={cn("h-1.5 w-full", 
                diag.level === 'Success' ? "bg-green-500" :
                harvestStyle === 'destructive' ? "bg-destructive animate-pulse" : 
                harvestStyle === 'success' ? "bg-green-500" :
                harvestStyle === 'warning' ? "bg-amber-500" : "bg-primary")} />
              
              {/* Background Glow for High Risk/Opportunity */}
              {(chipPressure > 80 || harvestStyle === 'destructive') && <div className={cn("absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -z-10", harvestStyle === 'destructive' ? "bg-red-500/10" : "bg-orange-500/5")} />}

              <CardHeader className="p-5 pb-2">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <CardTitle className="text-xl font-black tracking-tight flex items-center gap-2">
                            {stock.name} 
                            <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{stock.code}</span>
                            {stock.buyDate && (
                                <span className="text-[9px] font-normal text-slate-400 flex items-center gap-0.5">
                                    <Timer className="w-3 h-3" />
                                    {Math.ceil((new Date().getTime() - new Date(stock.buyDate).getTime()) / (1000 * 3600 * 24))}d
                                </span>
                            )}
                        </CardTitle>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1 cursor-pointer hover:text-primary transition-colors" onClick={() => setEditingStockData({...editingStockData, [stock.id]: { cost: cost.toString(), stop: stop.toString() }})}>
                                成本 ¥{cost.toFixed(2)}
                                <Settings2 className="w-2.5 h-2.5 opacity-40" />
                            </span>
                            <div className="flex items-center gap-1">
                                <span className={cn("text-sm font-black", diag.profit > 0 ? "text-red-500" : "text-green-600")}>
                                    {diag.profit > 0 ? '+' : ''}{diag.profit.toFixed(2)}%
                                </span>
                                {diag.profit > 10 && <Flame className="w-3.5 h-3.5 text-red-500 animate-pulse" />}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                             <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full hover:bg-destructive/10 hover:text-destructive text-slate-300" onClick={() => handleRemoveStock(stock.id, stock.name)} title="删除持仓">
                                <Trash2 className="w-3 h-3" />
                             </Button>
                             {harvestAction !== 'HOLD' && (
                                 <Badge className={cn("text-[10px] font-black py-1 animate-pulse", 
                                     harvestStyle === 'destructive' ? "bg-destructive text-destructive-foreground hover:bg-destructive" :
                                     harvestStyle === 'success' ? "bg-green-600 text-white hover:bg-green-600" :
                                     "bg-amber-500 text-white hover:bg-amber-500"
                                 )}>
                                     {harvestAction === 'CLEAR' ? '清仓离场' : harvestAction === 'TRIM' ? '分批止盈' : '减仓防守'}
                                 </Badge>
                             )}
                             <Badge variant={diag.level === 'Critical' ? 'destructive' : diag.level === 'Success' ? 'default' : 'secondary'} className={cn("text-[10px] font-bold py-1", diag.level === 'Success' ? "bg-green-600 hover:bg-green-700" : "")}>
                                {stock.role}
                            </Badge>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-bold border-primary/20 bg-primary/5 flex items-center gap-1 px-1.5 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => toggleMode(stock.id, stock.trailingStopMode)}>
                            {stock.trailingStopMode === 'Manual' ? <Lock className="w-2.5 h-2.5" /> : <BrainCircuit className="w-2.5 h-2.5" />}
                            {stock.trailingStopMode === 'Manual' ? '手动模式' : 'AI 保卫'}
                        </Badge>
                    </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-5 pt-2 space-y-4">
                
                {/* 0. Harvest Protocol Alert (New v5.9) */}
                {harvestAction !== 'HOLD' && (
                    <div className={cn("p-3 rounded-lg flex items-start gap-3 border shadow-sm",
                        harvestStyle === 'destructive' ? "bg-red-50 border-red-200 text-red-800" :
                        harvestStyle === 'success' ? "bg-green-50 border-green-200 text-green-800" :
                        "bg-amber-50 border-amber-200 text-amber-800"
                    )}>
                        {harvestStyle === 'destructive' ? <Siren className="w-5 h-5 shrink-0 animate-bounce" /> :
                         harvestStyle === 'success' ? <PartyPopper className="w-5 h-5 shrink-0" /> :
                         <Scissors className="w-5 h-5 shrink-0" />}
                        <div>
                            <div className="text-xs font-black uppercase tracking-wider mb-0.5">Harvest Protocol: {harvestReason}</div>
                            <div className="text-sm font-bold">{harvestMessage}</div>
                            {harvest?.decision?.percentage > 0 && (
                                <div className="mt-1 text-xs opacity-80 font-mono">
                                    建议卖出比例: {harvest.decision.percentage}%
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 1. Data Dashboard Row */}
                <div className="grid grid-cols-3 gap-2 py-2 border-b border-dashed border-slate-100">
                    <div className="flex flex-col items-center p-2 bg-slate-50/50 rounded-lg">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">今日涨跌</span>
                        <div className={cn("text-sm font-black", (stock.changePercent || 0) > 0 ? "text-red-500" : "text-green-600")}>
                            {(stock.changePercent || 0) > 0 ? '+' : ''}{stock.changePercent}%
                        </div>
                    </div>
                    <div className="flex flex-col items-center p-2 bg-slate-50/50 rounded-lg relative overflow-hidden">
                         {turnover > 15 && <div className="absolute inset-0 bg-orange-100/30 animate-pulse" />}
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            换手率 {turnover > 15 && <AlertTriangle className="w-2.5 h-2.5 text-orange-500" />}
                        </span>
                        <div className="text-sm font-black text-slate-700">{turnover}%</div>
                    </div>
                    <div className="flex flex-col items-center p-2 bg-slate-50/50 rounded-lg">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">量比</span>
                        <div className={cn("text-sm font-black", volRatio > 1.5 ? "text-red-500" : "text-slate-700")}>
                            {volRatio.toFixed(2)}
                        </div>
                    </div>
                </div>

                {/* 2. Visual Profit Guard Bar */}
                <div className="space-y-2">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
                        <span className="flex items-center gap-1">
                            <Target className="w-3 h-3" /> 
                            {stock.trailingStopMode === 'Manual' ? '手动保卫价' : 'AI 动态保卫价'}: ¥{stop > 0 ? stop.toFixed(2) : '--'}
                        </span>
                        <span className="flex items-center gap-1">现价: ¥{current.toFixed(2)} <ArrowRight className="w-3 h-3" /></span>
                    </div>
                    
                    <div className="relative h-4 bg-muted/30 rounded-full overflow-hidden border border-border/5">
                        {/* Cost Basis Marker */}
                        {cost > 0 && stop > 0 && (
                             <div 
                                className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-10"
                                style={{ left: `${Math.min(95, Math.max(5, ((cost - stop * 0.95) / (current * 1.05 - stop * 0.95)) * 100))}%` }}
                                title="Cost Basis"
                             />
                        )}
                        {/* Current Position Marker */}
                        <div 
                            className={cn("h-full transition-all duration-700", 
                                diag.level === 'Critical' ? "bg-destructive/50" : 
                                diag.level === 'Warning' ? "bg-orange-400/50" :
                                diag.level === 'Success' ? "bg-green-500/50" : "bg-primary/40")}
                            style={{ width: `${Math.max(5, 100 - diag.distToStop * 10)}%` }}
                        />
                    </div>
                    
                    <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className={cn(diag.distToStop < 2 ? "text-destructive" : "text-muted-foreground")}>
                            距离离场: {diag.distToStop.toFixed(2)}%
                        </span>
                        {diag.distToTarget !== null ? (
                            <span className={cn(diag.distToTarget < 3 ? "text-green-600 animate-pulse" : "text-primary/70")}>
                                距离止盈: {diag.distToTarget.toFixed(2)}%
                            </span>
                        ) : (
                            <span className="text-primary">
                                保卫利润: {diag.profitFromStop.toFixed(2)}%
                            </span>
                        )}
                    </div>
                </div>

                {/* 3. AI Tactics & Strategy (New v2.0) */}
                <div className={cn("p-3 rounded-2xl flex flex-col gap-2 relative overflow-hidden", 
                    diag.level === 'Critical' ? "bg-red-50 border border-red-100" : 
                    diag.level === 'Success' ? "bg-green-50 border border-green-100" : "bg-slate-50 border border-slate-100")}>
                    
                    <div className="flex items-center gap-2 mb-1">
                        <BrainCircuit className={cn("w-4 h-4", 
                            diag.level === 'Critical' ? "text-red-600" : 
                            diag.level === 'Success' ? "text-green-600" : "text-indigo-600")} />
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", 
                            diag.level === 'Success' ? "text-green-700" : "text-slate-500")}>
                             AI 战术推演 (v36.0)
                        </span>
                    </div>

                    <div className="text-xs font-bold text-slate-800 leading-tight">
                         {diag.level === 'Success' ? diag.message : prediction.summary}
                    </div>
                    <div className="text-[10px] font-medium text-slate-600 bg-white/50 p-2 rounded-lg border border-slate-100/50 whitespace-pre-line">
                        <span className={cn("font-black", diag.level === 'Success' ? "text-green-600" : "text-indigo-600")}>
                            策略:
                        </span> {mainStrategy}
                    </div>

                    {t1Strategy && (
                         <div className="text-[10px] font-medium text-slate-700 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100/50 whitespace-pre-line mt-1">
                            <div className="flex items-center gap-1 mb-1 border-b border-indigo-200/50 pb-1">
                                <TrendingUp className="w-3 h-3 text-indigo-600" />
                                <span className="font-black text-indigo-700">T+1 影线博弈推演</span>
                            </div>
                            {t1Strategy.trim()}
                        </div>
                    )}

                     {/* Key Levels */}
                    <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-[9px] h-5 bg-green-50 text-green-700 border-green-200">
                            支撑: {prediction.buyPoint}
                        </Badge>
                        <Badge variant="outline" className={cn("text-[9px] h-5 border-red-200", diag.level === 'Success' ? "bg-green-100 text-green-800 font-black animate-pulse border-green-300" : "bg-red-50 text-red-700")}>
                            {diag.level === 'Success' ? `止盈: ¥${diag.sellTarget}` : `压力: ${prediction.sellPoint}`}
                        </Badge>
                    </div>

                    {/* Chip Pressure Warning */}
                    {chipPressure > 80 && (
                        <div className="absolute top-2 right-2">
                             <Badge variant="destructive" className="text-[8px] h-4 px-1 animate-pulse">筹码高压区</Badge>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    {editingStockData[stock.id] !== undefined ? (
                        <div className="flex flex-col w-full gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400 ml-1">修改成本价</label>
                                    <Input 
                                        className="h-10 text-xs rounded-xl bg-white border-slate-200 focus:ring-primary" 
                                        placeholder="成本价" 
                                        value={editingStockData[stock.id]?.cost}
                                        onChange={e => setEditingStockData({
                                            ...editingStockData, 
                                            [stock.id]: { ...editingStockData[stock.id], cost: e.target.value }
                                        })}
                                        type="number"
                                        step="0.001"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400 ml-1">修改保卫价</label>
                                    <Input 
                                        className="h-10 text-xs rounded-xl bg-white border-slate-200 focus:ring-primary" 
                                        placeholder="保卫价" 
                                        value={editingStockData[stock.id]?.stop}
                                        onChange={e => setEditingStockData({
                                            ...editingStockData, 
                                            [stock.id]: { ...editingStockData[stock.id], stop: e.target.value }
                                        })}
                                        type="number"
                                        step="0.001"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" className="h-10 flex-1 rounded-xl font-bold" onClick={() => handleUpdateStockData(stock.id)}>
                                    <Save className="w-3.5 h-3.5 mr-2" /> 确认修改
                                </Button>
                                <Button variant="ghost" size="sm" className="h-10 px-4 rounded-xl font-bold text-xs" onClick={() => setEditingStockData(prev => {
                                    const next = { ...prev };
                                    delete next[stock.id];
                                    return next;
                                })}>
                                    取消
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex w-full gap-2">
                            <Button variant="outline" size="sm" className="h-10 flex-1 text-xs font-bold rounded-xl border-dashed border-2 hover:bg-primary/5 hover:border-primary/50 transition-all" onClick={() => setEditingStockData({...editingStockData, [stock.id]: { stop: stock.trailingStopPrice?.toString() || '', cost: stock.costPrice?.toString() || '' }})}>
                                <ShieldAlert className="w-3.5 h-3.5 mr-2" /> 
                                {stop > 0 ? '调整持仓参数' : '建立利润保卫机制'}
                            </Button>
                            {stock.trailingStopMode === 'Manual' && (
                                <Button variant="secondary" size="sm" className="h-10 px-4 rounded-xl font-bold text-xs" onClick={() => toggleMode(stock.id, 'Manual')}>
                                    恢复 AI 保卫
                                </Button>
                            )}
                        </div>
                    )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
