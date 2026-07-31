import React, { useState } from 'react';
import { MarketPhase } from '../types';
import { TriangleAlert, ShieldAlert, Zap, ArrowRight, ShieldCheck } from 'lucide-react';
import { cn } from './ui/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { StrategyManualDialog } from './pages/StrategyManualDialog';

interface Props {
  phase: MarketPhase;
  temp: number;
  hedgeFactor?: number;
}

export const ExtremeAlert: React.FC<Props> = ({ phase, temp, hedgeFactor = 0 }) => {
  const [isManualOpen, setIsManualOpen] = useState(false);
  const isExtreme = phase === 'Climax' || phase === 'Ebb' || phase === 'Ice' || phase === 'Repair' || temp > 85 || temp < 15 || hedgeFactor > 30;

  // IMPORTANT: Move the conditional return inside the render to allow hooks to run
  // but we still need the 'config' object to be defined.
  // Instead of early return, we wrap the content in a condition.
  
  const config = {
      Climax: {
          icon: <Zap className="w-5 h-5" />,
          title: "情绪进入过热高潮区 (Extreme Euphoria)",
          desc: "市场辨识度龙头开始加速。注意：加速即是风险的开始，禁止新开非核心仓位。",
          bg: "bg-red-600",
          text: "text-white",
          border: "border-red-700"
      },
      Ebb: {
          icon: <ShieldAlert className="w-5 h-5" />,
          title: "情绪进入严重退潮区 (Risk: Ebb Tide)",
          desc: "高位股出现大规模负反馈。第一原则：空仓或控制在 10% 以下。保护利润！",
          bg: "bg-blue-600",
          text: "text-white",
          border: "border-blue-700"
      },
      Ice: {
          icon: <ShieldAlert className="w-5 h-5" />,
          title: "市场进入极端冰点 (Deep Freeze)",
          desc: "全场跌停家数剧增，赚钱效应消失。空仓等待，寻找穿越混沌的第一个火种。",
          bg: "bg-slate-900",
          text: "text-white",
          border: "border-slate-800"
      },
      Repair: {
          icon: <Zap className="w-5 h-5" />,
          title: "冰点修复开启 (Bottom Rebound)",
          desc: "恐慌杀跌动能枯竭。核心动作：分时低吸辨识度最高的先手标的，试探做多。",
          bg: "bg-teal-600",
          text: "text-white",
          border: "border-teal-700"
      }
  }[phase as 'Climax' | 'Ebb' | 'Ice' | 'Repair'] || {
      icon: <TriangleAlert className="w-5 h-5" />,
      title: "系统性风险预警 (System Risk)",
      desc: "背离指数异常，风险对冲因子高。资金方向证据不足，建议轻仓或观望。",
      bg: "bg-orange-600",
      text: "text-white",
      border: "border-orange-700"
  };

  return (
    <AnimatePresence>
        {isExtreme && (
            <motion.div 
                key="extreme-alert"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className={cn("w-full overflow-hidden shadow-2xl", config.bg, config.text)}
            >
                <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md animate-pulse">
                            {config.icon}
                        </div>
                        <div>
                            <h4 className="font-bold text-base tracking-tight flex items-center gap-2">
                                {config.title}
                                <Badge className="bg-white/20 text-white border-none text-[10px]">Critical Alert</Badge>
                            </h4>
                            <p className="text-xs text-white/80 font-medium mt-0.5 leading-tight max-w-2xl">
                                {config.desc}
                            </p>
                        </div>
                    </div>
                    <div className="hidden md:flex items-center gap-3">
                         <div className="text-right">
                             <div className="text-[10px] uppercase font-bold tracking-widest opacity-60">Current Temp</div>
                             <div className="text-2xl font-black tracking-tighter">{temp}</div>
                         </div>
                         <div className="w-px h-10 bg-white/20" />
                         <div className="text-right">
                             <div className="text-[10px] uppercase font-bold tracking-widest opacity-60">Risk Hedge</div>
                             <div className="text-2xl font-black tracking-tighter">{hedgeFactor?.toFixed(2)}%</div>
                         </div>
                         <div className="w-px h-10 bg-white/20" />
                         <button 
                            onClick={() => setIsManualOpen(true)}
                            className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/90 transition-all shadow-lg cursor-pointer active:scale-95"
                         >
                            查看应变手册 <ArrowRight className="w-4 h-4" />
                         </button>
                    </div>
                </div>
            </motion.div>
        )}
        
        <StrategyManualDialog 
            key="strategy-manual"
            isOpen={isManualOpen} 
            onOpenChange={setIsManualOpen} 
            currentPhase={phase} 
        />
    </AnimatePresence>
  );
};

const Badge = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", className)}>
        {children}
    </span>
);
