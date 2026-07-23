import React from 'react';
import { MarketPhase } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Progress } from './ui/progress';
import { ShieldCheck, Target, TriangleAlert, Calculator, Percent, TrendingUp } from 'lucide-react';
import { cn } from './ui/utils';

interface Props {
  phase: MarketPhase;
  marketTemp: number; // 0-100
}

export const PositionAdvisor: React.FC<Props> = ({ phase, marketTemp }) => {
  const getAdvice = () => {
    switch (phase) {
      case 'Ice':
        return { percent: 10, label: '试探性/轻仓', style: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', text: '处于极端冰点期，仅建议对极具辨识度的强势股进行 0.5-1 成仓位试错，防止回撤。' };
      case 'Repair':
        return { percent: 30, label: '左侧/轻仓试错', style: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100', text: '情绪修复期，赚钱效应初现。建议总仓位控制在 3 成左右，重点关注先手卡位龙。' };
      case 'Startup':
        return { percent: 80, label: '积极/重仓出击', style: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', text: '主线启动期，容错率高。建议仓位 7-9 成，猛干核心主轴题材的龙头及其补涨。' };
      case 'Climax':
        return { percent: 100, label: '持仓/满仓博弈', style: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', text: '情绪高潮期，切忌新开仓。建议持有核心标的至断板，总仓位可维持高位，但需警惕分歧。' };
      case 'Ebb':
        return { percent: 20, label: '防守/空仓观望', style: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', text: '退潮期风险极大，赚钱效应向亏钱效应切换。建议空仓或仅留 1-2 成底仓博弈穿越标的。' };
      default:
        return { percent: 40, label: '中性/平衡', style: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100', text: '混沌震荡期，主线不清晰。建议控制在 4 成仓位，等待市场方向选择。' };
    }
  };

  const advice = getAdvice();

  // Adjust percent slightly based on temp
  const finalPercent = Math.min(100, Math.max(0, advice.percent + (marketTemp - 50) / 2));

  return (
    <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden rounded-2xl">
      <CardHeader className="pb-2 border-b border-slate-50 bg-slate-50/30">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Calculator className="w-3.5 h-3.5 text-slate-900" />
                动态仓位建议 (Position Sizing)
            </div>
            <div className="flex items-center gap-1.5">
                <Percent className="w-3 h-3" />
                <span className="font-mono text-slate-900">{finalPercent.toFixed(0)}%</span>
            </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-5">
        <div className="flex items-end justify-between gap-4">
            <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase">当前建议上限</span>
                    <span className={cn("text-xs font-black uppercase", advice.style)}>{advice.label}</span>
                </div>
                <div className="h-4 w-full bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-inner p-0.5">
                    <div 
                        className={cn("h-full rounded-md transition-all duration-1000 flex items-center justify-end px-2", 
                            finalPercent < 30 ? "bg-blue-500" : (finalPercent < 70 ? "bg-emerald-500" : "bg-red-500"))}
                        style={{ width: `${finalPercent}%` }}
                    >
                        <TrendingUp className="w-2 h-2 text-white/50" />
                    </div>
                </div>
            </div>
        </div>

        <div className={cn("p-4 rounded-xl border flex items-start gap-4", advice.bg, advice.border)}>
            <div className={cn("p-2 rounded-lg shrink-0 bg-white shadow-sm", advice.style)}>
                {finalPercent > 50 ? <Target className="w-5 h-5" /> : (finalPercent > 20 ? <ShieldCheck className="w-5 h-5" /> : <TriangleAlert className="w-5 h-5" />)}
            </div>
            <div className="space-y-1">
                <div className={cn("text-[11px] font-black uppercase tracking-widest", advice.style)}>
                    执行策略: {advice.label}
                </div>
                <p className="text-[10px] font-semibold leading-relaxed text-slate-600 italic">
                    {advice.text}
                </p>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">风险系数</div>
                <div className="text-xs font-black text-slate-900">
                    {marketTemp > 70 ? '极高 - 注意炸板' : (marketTemp < 30 ? '极低 - 动力不足' : '中性 - 核心博弈')}
                </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">容错评估</div>
                <div className="text-xs font-black text-slate-900">
                    {phase === 'Startup' ? '高 - 敢于试错' : (phase === 'Ebb' ? '极低 - 严禁新仓' : '中等')}
                </div>
            </div>
        </div>
      </CardContent>
    </Card>
  );
};