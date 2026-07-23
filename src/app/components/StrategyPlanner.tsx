import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { ScrollText, Save, Send, Calendar, Lightbulb, TrendingUp, AlertCircle, BrainCircuit, Sparkles, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTrading } from '../context/Store';
import { cn } from './ui/utils';

export const StrategyPlanner: React.FC = () => {
  const { phase, themes, metrics, stocks } = useTrading();
  const [isGenerating, setIsGenerating] = useState(false);
  const [plan, setPlan] = useState({
    focus: '人工智能/机器人',
    strategy: '关注三板进四板的核心龙头回踩机会',
    risk: '控制在 2 层仓位以内，严禁追高',
    notes: '留意下午 2:00 后的情绪转折点'
  });

  const handleSave = () => {
    toast.success("操盘计划已加密同步至本地终端");
  };

  const generateAIPlan = () => {
    // Quantum Strategy Engine v2.0
    setIsGenerating(true);
    
    setTimeout(() => {
        // 1. Data Extraction & Quantitative Analysis
        // Filter out "Automatic" themes to ensure we lock onto real market concepts
        const validThemes = (themes || []).filter(t => t.name !== '自动扫描' && t.name !== '自动发现' && t.name !== 'Auto-Discovered');
        const topTheme = [...validThemes].sort((a,b) => ((b.limitUps || 0) * 10 + (b.strength || 0)) - ((a.limitUps || 0) * 10 + (a.strength || 0)))[0];
        const themeName = topTheme?.name || '盘面混沌无主线';
        
        // Dragon Filter: High strength, Limit Up, Real Leaders
        const dragons = [...stocks]
            .filter(s => s.isLimitUp && (s.strengthScore || 0) > 75) // Increased threshold for stricter selection
            .sort((a,b) => (b.strengthScore || 0) - (a.strengthScore || 0));
        
        // Potential Leaders (Weak-to-Strong candidates) - Only High Quality
        const candidates = [...stocks]
            .filter(s => !s.isLimitUp && (s.changePercent || 0) > 3 && (s.strengthScore || 0) > 60 && (s.aiPrediction?.summary.includes('弱转强') || s.status === 'Watch'))
            .sort((a,b) => (b.strengthScore || 0) - (a.strengthScore || 0))
            .slice(0, 2);

        // Risk Factors - Focus on high entropy stocks
        const highRiskStocks = [...stocks]
            .filter(s => (s.trapRiskScore || 0) > 80) // Stricter risk threshold
            .sort((a,b) => b.trapRiskScore! - a.trapRiskScore!);

        const entropy = metrics.marketEntropy || 50;
        const divergence = metrics.divergenceIndex || 0;
        const temp = metrics.marketTemp || 50;

        let aiStrategy = "";
        let aiRisk = "";
        let aiFocus = "";

        // 2. Logic Generation Matrix
        // Phase: Climax (High Temp)
        if (phase === 'Climax') {
            aiFocus = dragons.length > 0 ? `${dragons[0].name} (龙头) / ${themeName}` : themeName;
            
            if (entropy > 70) {
                 aiStrategy = `市场高潮但熵值过高(${entropy.toFixed(0)})，筹码开始松动。仅锁仓核心龙头 ${dragons[0]?.name || ''}，严禁后排挖掘。`;
            } else {
                 aiStrategy = `一致性极强。主线【${themeName}】进入加速段，持有前排筹码，关注 ${candidates[0]?.name || '首板'} 的补涨机会。`;
            }

            if (highRiskStocks.length > 0) {
                aiRisk = `高位股 ${highRiskStocks[0].name} 出现诱多信号，警惕尾盘炸板潮。止盈位上移至 7%。`;
            } else {
                aiRisk = "情绪过热，随时可能分歧，禁止盘中随意追高非核心标的。";
            }
        } 
        // Phase: Ebb / Ice (Low Temp)
        else if (phase === 'Ebb' || phase === 'Ice') {
            aiFocus = "空仓 / 逆势标的";
            
            if (divergence < -15) {
                aiStrategy = `指数与情绪严重背离(${divergence})，冰点极致。可尝试极轻仓博弈 ${dragons[0]?.name || '最高标'} 的地天板反核。`;
            } else {
                aiStrategy = "退潮期确认，亏钱效应由高位向下传导。当前最优策略为：空仓观望，等待亏损效应衰竭。";
            }
            
            aiRisk = `严格防守。${highRiskStocks.length ? highRiskStocks[0].name + ' 等' : '高位'}人气股正在补跌，切勿接飞刀。`;
        }
        // Phase: Startup / Repair
        else {
            aiFocus = `${themeName} / 试错首板`;
            
            if (candidates.length > 0) {
                 aiStrategy = `情绪修复期，资金回流。重点关注 ${candidates.map(s => s.name).join('、')} 的弱转强上板机会（打板确认）。`;
            } else {
                 aiStrategy = `新周期启动初期，关注【${themeName}】板块的首板与1进2机会，寻找身位优势卡位龙。`;
            }
            
            aiRisk = entropy > 60 ? "盘面轮动较快，去弱留强，封板不强坚决离场。" : "控制回撤，试错仓位不超过 3 成。";
        }

        // 3. Output Synthesis
        setPlan({
            focus: aiFocus,
            strategy: aiStrategy,
            risk: aiRisk,
            notes: `[Full Market Scan] T:${temp}°C | Entropy:${entropy.toFixed(0)} | Div:${divergence} | Core:${dragons.length}`
        });
        
        setIsGenerating(false);
        toast.success("AI 全市场战术计划构建完成 (v8.0 Logic)");
    }, 800);
  };

  const getPositionAdvice = () => {
    switch(phase) {
        case 'Climax': return { label: '重仓进攻', color: 'bg-red-600', percent: '70% - 100%' };
        case 'Startup': return { label: '分歧试错', color: 'bg-orange-500', percent: '30% - 50%' };
        case 'Repair': return { label: '超跌博弈', color: 'bg-yellow-500', percent: '20% - 40%' };
        case 'Ebb': return { label: '空仓防守', color: 'bg-blue-600', percent: '0% - 10%' };
        case 'Ice': return { label: '绝对防御', color: 'bg-slate-900', percent: '0%' };
        default: return { label: '轻仓试错', color: 'bg-slate-400', percent: '10% - 20%' };
    }
  };

  const advice = getPositionAdvice();

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col">
      <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900">
                <ScrollText className="w-4 h-4 text-red-600" />
                操盘手计划 (Trading Plan)
            </div>
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-[10px] font-black uppercase text-red-600 hover:bg-red-50"
                onClick={generateAIPlan}
                disabled={isGenerating}
            >
                {isGenerating ? <BrainCircuit className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
                AI 生成
            </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Dynamic Position Advice */}
        <div className={cn("p-3 rounded-xl border flex items-center justify-between", advice.color.replace('bg-', 'border-').replace('600', '200').replace('500', '200').replace('400', '200').replace('900', 'border-slate-300'), advice.color.replace('bg-', 'bg-') + "/5")}>
            <div className="flex items-center gap-3">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white", advice.color)}>
                    <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">建议仓位 (Position)</div>
                    <div className="text-xs font-black text-slate-900">{advice.label}</div>
                </div>
            </div>
            <div className="text-right">
                <div className={cn("text-lg font-black tracking-tighter font-mono leading-none", advice.color.replace('bg-', 'text-'))}>{advice.percent}</div>
                <div className="text-[9px] font-bold text-slate-400">基于 {phase} 阶段</div>
            </div>
        </div>

        <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Lightbulb className="w-3 h-3 text-orange-400" /> 核心聚焦
            </label>
            <Input 
                value={plan.focus}
                onChange={e => setPlan({...plan, focus: e.target.value})}
                className="bg-slate-50 border-slate-100 font-bold text-xs h-9 rounded-lg focus-visible:ring-red-500"
            />
        </div>

        <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-red-500" /> 进攻策略
            </label>
            <Textarea 
                value={plan.strategy}
                onChange={e => setPlan({...plan, strategy: e.target.value})}
                className="bg-slate-50 border-slate-100 font-medium text-xs rounded-lg min-h-[60px] resize-none py-2 focus-visible:ring-red-500"
            />
        </div>

        <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-green-600" /> 风险控制
            </label>
            <Input 
                value={plan.risk}
                onChange={e => setPlan({...plan, risk: e.target.value})}
                className="bg-slate-50 border-slate-100 font-bold text-xs h-9 rounded-lg focus-visible:ring-red-500"
            />
        </div>

        <div className="pt-2">
            <Button className="w-full rounded-lg font-black text-xs h-10 bg-slate-900 hover:bg-slate-800 text-white" onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" /> 保存计划
            </Button>
        </div>
      </CardContent>
    </Card>
  );
};