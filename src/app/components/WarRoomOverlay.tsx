import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTrading } from '../context/Store';
import { ShieldAlert, Zap, Target, Activity, Flame, Crosshair } from 'lucide-react';
import { cn } from './ui/utils';

export const WarRoomOverlay: React.FC = () => {
  const { phase, metrics } = useTrading();
  
  const isExtreme = phase === 'Climax' || phase === 'Ice' || phase === 'Ebb';
  
  if (!isExtreme) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
      >
        {/* Corner Target HUD */}
        <div className="absolute top-0 left-0 p-8">
            <div className="relative">
                <div className="absolute inset-0 border-t-2 border-l-2 border-red-600/30 w-12 h-12" />
                <div className="p-4 flex flex-col gap-1">
                    <span className="text-[10px] font-black text-red-600 uppercase tracking-[0.3em]">Sector Focus</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Tracking Active Targets...</span>
                </div>
            </div>
        </div>

        <div className="absolute top-0 right-0 p-8">
            <div className="relative">
                <div className="absolute inset-0 border-t-2 border-r-2 border-red-600/30 w-12 h-12 ml-auto" />
                <div className="p-4 text-right flex flex-col gap-1">
                    <span className="text-[10px] font-black text-red-600 uppercase tracking-[0.3em]">Quantum entropy</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase">Critical Level: {metrics.marketTemp}%</span>
                </div>
            </div>
        </div>

        {/* Ambient Pulse */}
        <div className={cn("absolute inset-0 transition-colors duration-1000", 
            phase === 'Climax' ? "bg-red-600/[0.02]" : 
            phase === 'Ice' ? "bg-blue-600/[0.02]" : "bg-orange-600/[0.02]")} 
        />

        {/* HUD Elements */}
        <div className="absolute bottom-8 left-8">
            <div className="flex items-center gap-4 bg-slate-900/90 backdrop-blur-md px-6 py-3 rounded-full border border-slate-800 shadow-2xl ring-1 ring-white/5">
                <div className="p-2 bg-red-600/20 rounded-full animate-pulse">
                    <Crosshair className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Execution mode</span>
                    <span className="text-[11px] font-black text-white uppercase italic">{phase} PROTOCOL ACTIVE</span>
                </div>
            </div>
        </div>

        <div className="absolute bottom-8 right-8">
            <div className="flex items-center gap-6 bg-slate-900/90 backdrop-blur-md px-8 py-3 rounded-2xl border border-slate-800 shadow-2xl">
                <div className="flex flex-col items-end">
                    <span className="text-[8px] font-black text-slate-500 uppercase">Limit Up/Down Ratio</span>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-red-500 font-mono text-sm font-black">{metrics.limitUpCount}</span>
                        <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden flex">
                            <div className="h-full bg-red-500" style={{ width: `${(metrics.limitUpCount / (metrics.limitUpCount + metrics.limitDownCount + 1)) * 100}%` }} />
                        </div>
                        <span className="text-blue-500 font-mono text-sm font-black">{metrics.limitDownCount}</span>
                    </div>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Alpha-1 Logic</span>
                </div>
            </div>
        </div>

        {/* Scanning Line (Cyberpunk style) */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/[0.03] to-transparent h-1 w-full animate-scan" />

        <style>{`
            @keyframes scan {
                0% { transform: translateY(-100%); }
                100% { transform: translateY(1000%); }
            }
            .animate-scan {
                animation: scan 4s linear infinite;
            }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
};