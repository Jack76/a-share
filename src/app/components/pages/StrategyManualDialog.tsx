import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { MarketPhase } from '../../types';
import { ShieldAlert, Zap, ThermometerSnowflake, Activity, TriangleAlert, BookOpen } from 'lucide-react';
import { cn } from '../ui/utils';

interface StrategyManualDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhase: MarketPhase;
}

export const StrategyManualDialog: React.FC<StrategyManualDialogProps> = ({ isOpen, onOpenChange, currentPhase }) => {
  
  const strategies = [
    {
      id: 'SystemRisk',
      title: '系统性风险 (System Risk)',
      icon: <TriangleAlert className="w-5 h-5" />,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20',
      condition: '指数与情绪严重背离，风险因子 > 30',
      action: '强制空仓 / 降维防御',
      tactics: [
        '禁止接力任何高位连板股，防止补跌',
        '清仓所有非核心趋势股',
        '唯一可做的是：1板起步的低位试错（仓位 < 10%）',
        '等待指数出现明确的长下影线探底信号'
      ],
      taboo: '严禁半路追涨，严禁抄底老龙头'
    },
    {
      id: 'Climax',
      title: '情绪高潮 (Euphoria)',
      icon: <Zap className="w-5 h-5" />,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      condition: '龙头连续加速，板块批量涨停',
      action: '持筹盛宴 / 谨慎接力',
      tactics: [
        '持筹者：缩量加速不卖，放量分歧减半',
        '空仓者：只做龙头的分歧回封，不做跟风',
        '关注低位补涨龙的首板机会'
      ],
      taboo: '严禁排撤单，严禁去弱留强'
    },
    {
      id: 'Ebb',
      title: '退潮期 (Ebb Tide)',
      icon: <ShieldAlert className="w-5 h-5" />,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      condition: '炸板率飙升，高位股出现核按钮',
      action: '防守反击 / 只看不做',
      tactics: [
        '空仓是最高级的战术',
        '观察跌停板家数是否减少',
        '等待高标股止跌企稳',
        '只做低位首板的试错，不做中位股接力'
      ],
      taboo: '严禁抄底“昨日最强”，严禁接力缩量板'
    },
    {
      id: 'Ice',
      title: '冰点期 (Deep Freeze)',
      icon: <ThermometerSnowflake className="w-5 h-5" />,
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      condition: '全场普跌，连板高度压制在 2-3 板',
      action: '试错穿越 / 寻找火种',
      tactics: [
        '关注逆势抗跌的标的',
        '寻找打破空间压制的破局龙',
        '试错仓位控制在 20% 以内',
        '重点关注新题材的首板启动'
      ],
      taboo: '严禁做老周期的反抽'
    },
    {
      id: 'Repair',
      title: '修复期 (Repair)',
      icon: <Activity className="w-5 h-5" />,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      condition: '核按钮被撬开，跌停家数大幅减少',
      action: '积极做多 / 猛干龙头',
      tactics: [
        '围绕核心辨识度标的做反包',
        '积极参与主流板块的低吸',
        '仓位可以提升至 50%-80%',
        '关注弱转强的机会'
      ],
      taboo: '犹豫不决，踏空行情'
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden bg-[#0A0A0A] border-white/10 text-white">
        <DialogHeader className="p-6 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
                <BookOpen className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
                <DialogTitle className="text-xl font-bold tracking-tight">Predator-X 战术应变手册</DialogTitle>
                <DialogDescription className="text-white/60 text-xs mt-1">
                    基于量化情绪周期的标准操作SOP
                </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-full max-h-[calc(85vh-100px)] p-6">
          <div className="space-y-6">
            {strategies.map((strategy) => {
              const isActive = strategy.id === currentPhase || (strategy.id === 'SystemRisk' && !['Climax', 'Ebb', 'Ice', 'Repair'].includes(currentPhase));
              
              return (
                <div 
                  key={strategy.id} 
                  className={cn(
                    "relative rounded-xl border p-5 transition-all duration-300",
                    isActive ? `border-l-4 ${strategy.bg} border-white/20` : "border-white/5 bg-white/[0.02] opacity-60 hover:opacity-100"
                  )}
                  style={{ borderLeftColor: isActive ? undefined : 'transparent' }}
                >
                  {isActive && (
                    <div className="absolute top-4 right-4 px-2 py-1 bg-white/10 rounded text-[10px] font-bold text-white animate-pulse">
                      当前阶段 (Current)
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    <div className={cn("p-2 rounded-lg mt-1", strategy.bg)}>
                        {React.cloneElement(strategy.icon as React.ReactElement, { className: cn("w-5 h-5", strategy.color) })}
                    </div>
                    <div className="flex-1 space-y-3">
                        <div>
                            <h3 className={cn("font-bold text-base flex items-center gap-2", strategy.color)}>
                                {strategy.title}
                            </h3>
                            <p className="text-sm text-white/60 mt-1 font-medium">
                                触发条件: {strategy.condition}
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 rounded-lg p-3 border border-white/5">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-white/40 mb-2">Action (核心动作)</div>
                                <div className="text-sm font-bold text-white">{strategy.action}</div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-white/40 mb-2">Taboo (交易禁忌)</div>
                                <div className="text-sm font-bold text-red-400">{strategy.taboo}</div>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="text-[10px] uppercase font-bold text-white/40">Tactical Execution (战术执行)</div>
                            <ul className="space-y-1">
                                {strategy.tactics.map((tactic, i) => (
                                    <li key={i} className="text-xs text-white/80 flex items-start gap-2">
                                        <span className={cn("w-1 h-1 rounded-full mt-1.5 flex-shrink-0", strategy.color.replace('text-', 'bg-'))} />
                                        {tactic}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
