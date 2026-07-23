import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Calculator, ShieldCheck, Zap, TrendingUp, TrendingDown, Clock, DollarSign, Lock, ShieldAlert, BrainCircuit, Activity, Target, TriangleAlert, Rocket, ShieldPlus } from 'lucide-react';
import { useTrading } from '../../context/Store';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { HoldingsDiagnosis } from '../HoldingsDiagnosis';
import { SentimentHeatmap } from '../SentimentHeatmap';
import { OrderFlowMonitor } from '../OrderFlowMonitor';
import { VolumeProfileChart } from '../VolumeProfileChart';
import { DivergenceMonitor } from '../DivergenceMonitor';
import { AuctionInsight } from '../AuctionInsight';
import { L2OrderFlow } from '../L2OrderFlow'; // Updated import
import { LimitLadder } from '../LimitLadder';
import { DragonLineage } from '../DragonLineage';
import { toast } from 'sonner';
import { buildTradeRiskPlan } from '../../utils/riskControl';

export const Trading: React.FC = () => {
  const { phase, stocks, updateStock, marketIndices, marketTemp } = useTrading();
  
  // Calculator State
  const [capital, setCapital] = useState<number>(100000);
  const [riskPercent, setRiskPercent] = useState<number>(2); // 2% risk of total capital
  const [stopLossPercent, setStopLossPercent] = useState<number>(8); // 8% stop loss on stock
  const [hedgeFactor, setHedgeFactor] = useState<number>(0); // 0-100% hedging
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  
  const selectedStock = stocks.find(s => s.id === selectedStockId);
  const sharePrice = selectedStock?.currentPrice || 0;

  const mainIndex = marketIndices.find(i => i.code.includes('sh000001')) || marketIndices[0];

  // Recommendations based on Phase
  const getPhaseAdvice = () => {
    switch(phase) {
      case 'Climax': return {
        text: '情绪高潮期：只做最强主线，最高总仓位 50%',
        color: 'text-red-600',
        maxPos: 50
      };
      case 'Startup': return {
        text: '情绪启动期：试仓 10%-20%，确认后加仓',
        color: 'text-orange-500',
        maxPos: 20
      };
      case 'Ebb': return {
        text: '情绪退潮期：逐步撤退，甚至空仓。严控回撤。',
        color: 'text-green-600',
        maxPos: 0
      };
      case 'Ice': return {
        text: '情绪冰点期：停止开新仓，等待市场修复确认。',
        color: 'text-blue-600',
        maxPos: 0
      };
      case 'Repair': return {
        text: '情绪修复期：仅小仓验证，不追逐一致性加速。',
        color: 'text-amber-600',
        maxPos: 15
      };
      default: return {
        text: '混沌期：多看少动，轻仓试错。',
        color: 'text-gray-500',
        maxPos: 10
      };
    }
  };

  const advice = getPhaseAdvice();
  const tradePlan = useMemo(() => buildTradeRiskPlan({
    capital,
    riskPercent,
    maxStopLossPercent: stopLossPercent,
    hedgePercent: hedgeFactor,
    phase,
    stock: selectedStock,
  }), [capital, hedgeFactor, phase, riskPercent, selectedStock, stopLossPercent]);
  
  // Advanced Algo: Dynamic Stop Loss Calculation (ATR-like simulation)
  const calculateStopLosses = (price: number) => {
      if (!price) return null;
      return {
          conservative: (price * 0.96).toFixed(2), // -4%
          standard: (price * 0.93).toFixed(2),     // -7%
          technical: (price * 0.90).toFixed(2)     // -10%
      };
  };
  
  const stopLossLevels = calculateStopLosses(sharePrice);

  const heldStocks = stocks.filter(s => s.status === 'Hold');

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-10 md:px-10 md:py-16 space-y-16">
      {/* 1. Market Context Advisory & Heatmap */}
      <div className="w-full space-y-6">
          <Card className="relative overflow-hidden border-none shadow-sm bg-primary text-primary-foreground group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                  <BrainCircuit className="w-32 h-32" />
              </div>
              <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="bg-white/20 text-white border-none font-bold text-[10px] uppercase tracking-widest">
                          AI Operational Insight
                      </Badge>
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight">
                      当前实战方略：{advice.text.split('：')[0]}
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <p className="text-primary-foreground/80 font-medium leading-relaxed max-w-2xl">
                      {advice.text.split('：')[1]}。
                      请严格遵守仓位限制，当前阶段建议最高总仓位不超过 <span className="text-white font-bold">{advice.maxPos}%</span>。
                  </p>
              </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Card className="border-none shadow-sm bg-card flex flex-col justify-center p-6 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4">Account Risk Limit</div>
                  <div className="flex justify-center gap-4 mb-4">
                      <div className="flex flex-col">
                          <span className="text-3xl font-bold tracking-tighter text-red-500">{riskPercent}%</span>
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">Max Loss</span>
                      </div>
                      <div className="w-px h-10 bg-border mx-2 self-center" />
                      <div className="flex flex-col">
                          <span className="text-3xl font-bold tracking-tighter text-primary">{advice.maxPos}%</span>
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">Max Pos</span>
                      </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic font-medium leading-tight">
                      “活着比什么都重要” — 龙头战法第一法则
                  </p>
              </Card>
              <Card className="border-none shadow-sm bg-card p-6 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-primary/10 rounded-xl">
                          <Activity className="w-5 h-5 text-primary" />
                      </div>
                      <span className="text-sm font-bold uppercase tracking-tight">执行纪律检查</span>
                  </div>
                  <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">止损执行率</span>
                          <span className="font-bold">100%</span>
                      </div>
                      <Progress value={100} className="h-1 bg-muted" />
                      <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">空仓等待耐心</span>
                          <span className="font-bold text-orange-500">85%</span>
                      </div>
                      <Progress value={85} className="h-1 bg-muted" />
                  </div>
              </Card>
          </div>
      </div>

      <Tabs defaultValue="holdings" className="w-full">
        <TabsList className="bg-muted/50 p-1 mb-6 rounded-2xl h-12">
          <TabsTrigger value="holdings" className="rounded-xl px-6 font-bold text-xs uppercase tracking-widest">持仓诊断 (Portfolio)</TabsTrigger>
          <TabsTrigger value="intelligence" className="rounded-xl px-6 font-bold text-xs uppercase tracking-widest">战术情报 (Intelligence)</TabsTrigger>
          <TabsTrigger value="calculator" className="rounded-xl px-6 font-bold text-xs uppercase tracking-widest">仓位计算 (Calculator)</TabsTrigger>
          <TabsTrigger value="checklist" className="rounded-xl px-6 font-bold text-xs uppercase tracking-widest">买入纪律 (Entry)</TabsTrigger>
          <TabsTrigger value="sell" className="rounded-xl px-6 font-bold text-xs uppercase tracking-widest">止损标准 (Exit)</TabsTrigger>
        </TabsList>
        
        <TabsContent value="holdings">
          <div className="space-y-6">
            <HoldingsDiagnosis />
            
            {/* Detailed Stats if needed */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4 text-primary" />
                   实战纪律执行 (Execution)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg border bg-accent/5">
                        <div className="text-xs font-bold mb-2 flex items-center gap-1 uppercase">
                           <Zap className="w-3 h-3 text-yellow-500" /> 
                           利润保卫逻辑 (Profit Guard Logic)
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed italic">
                           “龙头断板不回撤”。随着股价上涨，手动上调保卫价（通常设在 5日线 或 分时关键支撑位）。一旦击穿，说明分歧过大，必须果断撤出。
                        </p>
                    </div>
                    <div className="p-3 rounded-lg border bg-accent/5">
                        <div className="text-xs font-bold mb-2 flex items-center gap-1 uppercase">
                           <ShieldAlert className="w-3 h-3 text-red-500" />
                           退潮避险原则 (Safe Exit)
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed italic">
                           当市场阶段进入 Ebb（退潮）时，手中持仓即使未触及止损，也应减仓 50% 锁定利润。防守是短线交易的第一要素。
                        </p>
                    </div>
                 </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="intelligence">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2">
                    <LimitLadder stocks={stocks} marketTemp={marketTemp} />
                </div>
                <div className="xl:col-span-1">
                    <DragonLineage stocks={stocks} />
                </div>
            </div>
        </TabsContent>

        <TabsContent value="calculator">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  仓位与风控计算 (Position Control)
                </CardTitle>
                <CardDescription>
                  单笔亏损 ≤ 5%-8%，账户总亏损控制在安全线内
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">总资金 (Total Capital)</Label>
                    <Input type="number" className="font-mono font-bold" value={capital} onChange={e => setCapital(Number(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">关联标的 (Select Stock)</Label>
                    <Select value={selectedStockId} onValueChange={setSelectedStockId}>
                      <SelectTrigger className="font-bold italic">
                        <SelectValue placeholder="选择候选池标的..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stocks.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.code}) {s.currentPrice ? `¥${s.currentPrice}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">可接受总亏损 % (Risk/Trade)</Label>
                    <Input type="number" className="font-mono font-bold" value={riskPercent} onChange={e => setRiskPercent(Number(e.target.value))} />
                    <p className="text-xs text-muted-foreground">建议 1% - 2%</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">个股止损幅度 % (Stop Loss)</Label>
                    <Input type="number" className="font-mono font-bold" value={stopLossPercent} onChange={e => setStopLossPercent(Number(e.target.value))} />
                    {stopLossLevels && (
                      <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="cursor-pointer hover:bg-slate-100" onClick={() => setStopLossPercent(5)}>保守 5%</Badge>
                          <Badge variant="outline" className="cursor-pointer hover:bg-slate-100" onClick={() => setStopLossPercent(8)}>标准 8%</Badge>
                          <Badge variant="outline" className="cursor-pointer hover:bg-slate-100" onClick={() => setStopLossPercent(10)}>宽幅 10%</Badge>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <ShieldPlus className="w-3 h-3 text-blue-500" />
                        风险对冲因子 % (Hedge)
                    </Label>
                    <Input type="number" className="font-mono font-bold text-blue-600" value={hedgeFactor} onChange={e => setHedgeFactor(Number(e.target.value))} />
                    <p className="text-[9px] text-muted-foreground">减少建议仓位的比例以应对极端行情</p>
                  </div>
                </div>
                
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">建议买入金额 (Max Value):</span>
                    <span className="text-xl font-bold font-mono">
                        ¥ {Math.round(tradePlan?.positionValue || 0).toLocaleString()}
                    </span>
                  </div>
                  
                  {selectedStock && sharePrice > 0 && tradePlan && (
                    <>
                    <div className="flex justify-between items-center border-t pt-2 border-dashed border-slate-300 dark:border-slate-700">
                      <span className="text-sm font-medium">建议手数 (Shares):</span>
                      <div className="text-right">
                        <span className="text-xl font-bold font-mono text-blue-600">{tradePlan.shares} 股</span>
                        <div className="text-xs text-muted-foreground">
                          (¥{tradePlan.positionValue.toLocaleString()})
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                       <span className="text-sm font-medium text-muted-foreground">ATR/结构止损位:</span>
                       <div className="flex gap-2 text-xs font-mono">
                          <span className="text-red-500">¥{tradePlan.stopPrice}</span>
                          <span className="text-emerald-600">目标 ¥{tradePlan.targetPrice}</span>
                       </div>
                    </div>
                    <div className="flex justify-between items-center pt-1 text-xs">
                      <span className="text-muted-foreground">最大估算亏损 / 风险回报比:</span>
                      <span className="font-mono font-bold">¥{tradePlan.maxLoss.toLocaleString()} / {tradePlan.riskRewardRatio}:1</span>
                    </div>
                    </>
                  )}

                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-medium">占总仓位 (Position %):</span>
                    <span className={`text-xl font-bold font-mono ${(tradePlan?.positionPercent || 0) > advice.maxPos ? 'text-red-500' : 'text-green-600'}`}>
                      {(tradePlan?.positionPercent || 0).toFixed(1)}%
                    </span>
                  </div>
                  {tradePlan && !tradePlan.canOpen && (
                    <p className="flex items-center justify-end gap-1 text-xs text-red-500 mt-1 font-black uppercase tracking-tighter italic">
                      <TriangleAlert className="w-3 h-3" /> {tradePlan.reasons[0]}
                    </p>
                  )}

                  <div className="pt-4">
                      <Button 
                          className="w-full bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest h-12 rounded-xl shadow-lg shadow-red-600/20"
                          disabled={!selectedStock || !tradePlan?.canOpen}
                          onClick={() => {
                              if (selectedStock) {
                                  updateStock(selectedStock.id, { 
                                      status: 'Hold', 
                                      costPrice: tradePlan.entryPrice,
                                      trailingStopPrice: tradePlan.stopPrice,
                                      profitTarget: tradePlan.targetPrice,
                                      buyDate: new Date().toISOString() 
                                  });
                                  toast.success(`已建立虚拟头寸: ${selectedStock.name} @ ¥${sharePrice}`);
                              }
                          }}
                      >
                          <Rocket className="w-4 h-4 mr-2" />
                          建立实战头寸 (Execute Position)
                      </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="xl:col-span-1 space-y-6">
                {selectedStock ? (
                    <div className="space-y-6" key={selectedStock.id}> {/* Key added to prevent logic overlap between stocks */}
                        <AuctionInsight stocks={[selectedStock]} />
                        <DivergenceMonitor stock={selectedStock} index={mainIndex} />
                        <L2OrderFlow stock={selectedStock} /> {/* Using the fixed L2OrderFlow */}
                        <OrderFlowMonitor stock={selectedStock} />
                        <VolumeProfileChart stock={selectedStock} />
                    </div>
                ) : (
                    <div className="h-full border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-12 text-center bg-slate-50/50">
                        <Target className="w-12 h-12 text-slate-200 mb-4" />
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            Select a stock to analyze<br/>Tactical Sentinel & L2 Flow
                        </p>
                    </div>
                )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="checklist">
          <Card>
            <CardHeader>
              <CardTitle>买入前核对 (Pre-Trade Checklist)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <input type="checkbox" className="mt-1" />
                  <div>
                    <h4 className="font-semibold">是否主线题材？</h4>
                    <p className="text-sm text-muted-foreground">只做主线，不做毛。</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <input type="checkbox" className="mt-1" />
                  <div>
                    <h4 className="font-semibold">是否核心龙头？</h4>
                    <p className="text-sm text-muted-foreground">市场辨识度最高，换手充分。</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <input type="checkbox" className="mt-1" />
                  <div>
                    <h4 className="font-semibold">买点是否确认？</h4>
                    <p className="text-sm text-muted-foreground">二板确认/三板强化/分歧转一致/突破放量。</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-md">
                  <input type="checkbox" className="mt-1" />
                  <div>
                    <h4 className="font-semibold">情绪周期是否配合？</h4>
                    <p className="text-sm text-muted-foreground">避免在退潮期接力。</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sell">
          <Card>
            <CardHeader>
              <CardTitle>卖出与风控 (Selling Rules)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-900/10 rounded-lg">
                  <h4 className="font-bold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> 强制止损纪律
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>个股最大回撤不超过 8%。</li>
                    <li>跌破关键均线 (5日/10日) 无条件离场。</li>
                    <li>板块逻辑证伪或龙头大幅走坏。</li>
                    <li><span className="font-bold">一旦触发，立即执行，不讲故事，不幻想。</span></li>
                  </ul>
                </div>

                <div className="p-4 border border-green-200 bg-green-50 dark:bg-green-900/10 rounded-lg">
                  <h4 className="font-bold text-green-700 dark:text-green-400 mb-2">止盈卖出逻辑</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>盈利 ≥ 20% 分批止盈。</li>
                    <li>龙头断板 → 减仓。</li>
                    <li>开盘弱 + 板块走坏 → 清仓。</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
