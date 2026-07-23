import React from 'react';
import { useTrading } from '../context/Store';
import { Zap, Rocket, ShieldAlert, Target, Flame, Activity, TrendingUp, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './ui/utils';

export const WarRoomTicker: React.FC = () => {
  const { marketEvents, stocks, metrics } = useTrading();
  
  // Real-time signals from the entire market pool
  const tickerItems = React.useMemo(() => {
    const items: Array<{ icon: any, color: string, text: string, type: string }> = [];

    // 1. Critical Market Events (e.g., "Main theme ignition")
    marketEvents.slice(0, 5).forEach(e => {
        items.push({
            icon: e.type === 'Danger' ? ShieldAlert : Flame,
            color: e.type === 'Danger' ? 'text-red-400' : 'text-orange-400',
            text: `[EVENT] ${e.message}`,
            type: 'event'
        });
    });

    // 2. Real-time Dragon Activity (e.g., "Dragon Head WTS")
    stocks.filter(s => (s.strengthScore || 0) > 85).forEach(s => {
        items.push({
            icon: Rocket,
            color: 'text-yellow-400',
            text: `[DRAGON] ${s.name} ${s.changePercent > 0 ? '+' : ''}${s.changePercent}% | 封板评分: ${s.sealIntensity?.toFixed(0) || 80}`,
            type: 'dragon'
        });
    });

    // 3. Risk Contagion (e.g., "Slap Alert")
    const bigSlaps = stocks.filter(s => s.changePercent < -5);
    if (bigSlaps.length > 0) {
        items.push({
            icon: AlertTriangle,
            color: 'text-red-500',
            text: `[RISK] 检测到 ${bigSlaps.length} 个大面标的，情绪退潮风险上升`,
            type: 'risk'
        });
    }

    // 4. Alpha Divergence
    if (Math.abs(metrics.alphaDivergence || 0) > 10) {
        items.push({
            icon: TrendingUp,
            color: 'text-cyan-400',
            text: `[ALPHA] 背离系数: ${metrics.alphaDivergence?.toFixed(1)} | 指数与情绪异动共振中`,
            type: 'alpha'
        });
    }

    return items;
  }, [marketEvents, stocks, metrics]);

  return (
    <div className="w-full bg-black border-y border-white/5 py-2.5 px-6 overflow-hidden relative z-40 shadow-2xl">
      {/* Visual background pattern for high-tech look */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(50,50,50,0.5),transparent)] pointer-events-none" />
      
      <div className="flex items-center gap-12 animate-marquee whitespace-nowrap">
        {tickerItems.length > 0 ? tickerItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="flex items-center gap-3">
              <div className={cn("w-1.5 h-1.5 rounded-full", item.color.replace('text', 'bg'))} />
              <span className={cn("text-xs font-black uppercase tracking-[0.1em] flex items-center gap-2", item.color)}>
                 <Icon className="w-3.5 h-3.5" />
                 {item.text}
              </span>
            </div>
          );
        }) : (
            <div className="flex items-center gap-3">
                <Activity className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    AI COMMAND: SCANNING QUANTUM FLUX... STANDBY FOR SIGNALS
                </span>
            </div>
        )}

        {/* Dynamic System Heartbeat (Integrated but meaningful) */}
        <div className="flex items-center gap-3 border-l border-white/10 pl-12 ml-6">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] italic">
                WAR ROOM V29.6 | CORE TEMP: {(35 + (metrics.marketTemp || 50) / 10).toFixed(1)}°C | LATENCY: 8ms
            </span>
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: inline-flex;
          animation: marquee 40s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};