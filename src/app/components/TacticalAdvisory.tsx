import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { ShieldAlert, Zap, Target, Lock, Waves, Flame } from 'lucide-react';
import { cn } from './ui/utils';

interface Props {
  phase: string;
  temp: number;
}

export const TacticalAdvisory: React.FC<Props> = ({ phase, temp }) => {
  const getAdvisory = () => {
    switch (phase) {
      case 'Climax':
        return {
          title: '情绪高潮：去弱留强 (Euphoria)',
          instructions: [
            '核心龙头：锁死仓位，不炸不卖。',
            '跟风杂毛：冲高即卖，防止高位分歧杀跌。',
            '新开仓：极度审慎，仅限最强核心板换手。'
          ],
          position: '80% - 100%',
          color: 'text-red-600',
          bg: 'bg-red-50/50',
          icon: <Flame className="w-5 h-5" />,
          status: 'AGGRESSIVE',
          border: 'border-red-200'
        };
      case 'Startup':
        return {
          title: '启动阶段：试错抢筹 (Startup)',
          instructions: [
            '题材博弈：关注板块共振首个连板。',
            '进攻方向：新题材穿越混沌的第一时间。',
            '汰弱留强：次日不封即走。'
          ],
          position: '30% - 50%',
          color: 'text-orange-600',
          bg: 'bg-orange-50/50',
          icon: <Zap className="w-5 h-5" />,
          status: 'STRATEGIC',
          border: 'border-orange-200'
        };
      case 'Repair':
        return {
          title: '冰点修复：反抽博弈 (Repair)',
          instructions: [
            '核心回归：寻找冰点期抗跌的穿越龙。',
            '博弈点：前期妖股超跌反抽机会。',
            '纪律：快进快出，不恋战。'
          ],
          position: '20% - 40%',
          color: 'text-teal-600',
          bg: 'bg-teal-50/50',
          icon: <ShieldAlert className="w-5 h-5" />,
          status: 'RECOVERY',
          border: 'border-teal-200'
        };
      case 'Ice':
        return {
          title: '极端冰点：空仓观察 (Deep Ice)',
          instructions: [
            '第一准则：保住本金，拒绝任何形式抄底。',
            '观察点：寻找在市场大跌中逆势放量的异动。',
            '准备：整理自选，等待市场转折信号。'
          ],
          position: '0% - 10%',
          color: 'text-slate-900',
          bg: 'bg-slate-100/50',
          icon: <Lock className="w-5 h-5" />,
          status: 'FREEZE',
          border: 'border-slate-300'
        };
      case 'Ebb':
        return {
          title: '退潮阶段：避险撤退 (Ebb Tide)',
          instructions: [
            '核心动作：无条件撤离高位断板个股。',
            '禁忌：严禁补仓，严禁博弈所谓的回头波。',
            '状态：现金为王，等待风险释放。'
          ],
          position: '0% - 20%',
          color: 'text-blue-600',
          bg: 'bg-blue-50/50',
          icon: <Waves className="w-5 h-5" />,
          status: 'DEFENSIVE',
          border: 'border-blue-200'
        };
      default:
        return {
          title: '混沌博弈：轻仓试探 (Chaos)',
          instructions: [
            '市场无主线，多看少动。',
            '控制账户总仓位。',
            '寻找穿越混沌的新异动。'
          ],
          position: '10% - 30%',
          color: 'text-slate-600',
          bg: 'bg-slate-50/50',
          icon: <Target className="w-5 h-5" />,
          status: 'NEUTRAL',
          border: 'border-slate-200'
        };
    }
  };

  const advice = getAdvisory();

  return (
    <Card className={cn("glass border shadow-xl overflow-hidden rounded-2xl", advice.bg, advice.border)}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center mb-1">
            <div className={cn("text-[10px] font-black uppercase tracking-[0.2em]", advice.color)}>
                Tactical Command Unit
            </div>
            <div className={cn("px-2 py-0.5 rounded-full text-[9px] font-black text-white shadow-sm", 
                phase === 'Climax' ? 'bg-red-600' : 
                phase === 'Ebb' ? 'bg-blue-600' : 
                phase === 'Ice' ? 'bg-slate-900' :
                phase === 'Repair' ? 'bg-teal-600' :
                'bg-slate-500'
            )}>
                {advice.status}
            </div>
        </div>
        <CardTitle className={cn("text-lg font-black tracking-tight flex items-center gap-3 italic uppercase", advice.color)}>
            {advice.icon}
            {advice.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 rounded-xl bg-white/40 border border-white/60 shadow-inner">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">动态建议仓位</span>
                <span className={cn("text-lg font-black italic", advice.color)}>{advice.position}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200/50 rounded-full overflow-hidden">
                <div 
                    className={cn("h-full transition-all duration-1000", 
                        phase === 'Climax' ? 'bg-red-500' : 
                        phase === 'Ebb' ? 'bg-blue-500' : 
                        'bg-slate-500'
                    )} 
                    style={{ width: advice.position.includes('100') ? '100%' : advice.position.split('-')[1].trim() }} 
                />
            </div>
        </div>

        <div className="space-y-3">
            {advice.instructions.map((line, idx) => (
                <div key={idx} className="flex items-start gap-3 group">
                    <div className={cn("mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 transition-all group-hover:scale-150", 
                        phase === 'Climax' ? 'bg-red-400' : 'bg-slate-400')} 
                    />
                    <p className="text-[11px] font-bold text-slate-700 leading-relaxed italic">{line}</p>
                </div>
            ))}
        </div>
        
        <div className="pt-4 border-t border-slate-200/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">AI Engine: Synced</span>
            </div>
            <div className="text-[10px] font-black italic text-slate-500 flex items-center gap-1">
                ENTROPY: <span className={cn(temp > 70 ? 'text-red-600' : 'text-slate-600')}>{temp}%</span>
            </div>
        </div>
      </CardContent>
    </Card>
  );
};