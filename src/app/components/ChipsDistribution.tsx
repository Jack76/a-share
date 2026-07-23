import React from 'react';
import { Stock } from '../types';
import { cn } from './ui/utils';

interface Props {
  stock: Stock;
}

export const ChipsDistribution: React.FC<Props> = ({ stock }) => {
  // Real Calculation based on 80-day history
  const history = stock.history || [];
  const currentPrice = stock.currentPrice || 10;
  
  const { levels, profitRatio, concentration, asr } = React.useMemo(() => {
    if (!history || history.length < 5) {
        // Fallback or empty state
        return { levels: [], profitRatio: 0, concentration: 'N/A' };
    }

    // 1. Determine Price Range (Using 120-day lookback for structure)
    const recentHistory = history.slice(-120); 
    const prices = recentHistory.map(h => h.close);
    const minP = Math.min(...prices) * 0.95;
    const maxP = Math.max(...prices) * 1.05;
    const step = (maxP - minP) / 20;

    // 2. Aggregate Volume by Price Level (Volume Profile) with Time Decay
    // Hypothesis: Recent volume is more relevant. Old chips are "washed out" by turnover.
    // We apply a Linear Decay Weight: Today = 1.0, 120 days ago = 0.1
    
    const bins = Array.from({ length: 20 }, (_, i) => ({
        price: minP + (i * step),
        volume: 0
    }));

    const totalDays = recentHistory.length;
    
    recentHistory.forEach((h, idx) => {
        // Calculate Decay Weight (Simulating Turnover Wash)
        // Recent days have weight near 1.0, older days decay
        const daysAgo = totalDays - 1 - idx;
        const decayFactor = Math.max(0.1, 1 - (daysAgo * 0.015)); // Approx 60-70 days half-life
        
        const binIdx = Math.min(19, Math.floor((h.close - minP) / step));
        if (binIdx >= 0) {
            // Apply Weight to Volume
            bins[binIdx].volume += ((h.volume || 1) * decayFactor);
        }
    });

    // 3. Calculate Profit Ratio (Percent of volume below current price)
    const totalVol = bins.reduce((acc, b) => acc + b.volume, 0);
    const profitVol = bins.filter(b => b.price <= currentPrice).reduce((acc, b) => acc + b.volume, 0);
    const pRatio = totalVol > 0 ? (profitVol / totalVol) * 100 : 0;

    // 4. Concentration (Simplistic: Top 3 bins volume / Total)
    const sortedBins = [...bins].sort((a, b) => b.volume - a.volume);
    const top3Vol = sortedBins.slice(0, 3).reduce((acc, b) => acc + b.volume, 0);
    const conc = totalVol > 0 ? (top3Vol / totalVol) * 100 : 0;
    
    // 5. ASR Calculation (Active Share Ratio)
    // Now using Decayed Volume, giving a much sharper view of CURRENT active chips
    const activeRangeLow = currentPrice * 0.925;
    const activeRangeHigh = currentPrice * 1.075;
    const activeVol = bins
        .filter(b => b.price >= activeRangeLow && b.price <= activeRangeHigh)
        .reduce((acc, b) => acc + b.volume, 0);
    const asrValue = totalVol > 0 ? (activeVol / totalVol) * 100 : 0;

    let concLabel = '分散';
    if (conc > 50) concLabel = '极高';
    else if (conc > 35) concLabel = '集中';
    else if (conc > 20) concLabel = '适中';

    // Reverse bins so HIGHER price is on TOP (idx 0)
    const reversedBins = [...bins].reverse();

    return { 
        levels: reversedBins, 
        profitRatio: pRatio.toFixed(1), 
        concentration: concLabel,
        asr: asrValue.toFixed(1)
    };
  }, [history, currentPrice]);

  if (levels.length === 0) {
      return (
          <div className="h-48 flex items-center justify-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest italic">
              等待历史行情补全以计算筹码分布...
          </div>
      );
  }

  const maxVol = Math.max(...levels.map(l => l.volume));
  
  // ASR interpretation color
  const getAsrColor = (val: number) => {
      if (val > 60) return "text-red-600";
      if (val > 40) return "text-orange-500";
      return "text-slate-500";
  };
  const asrNum = parseFloat(asr || '0');

  const ma20 = stock.technicals?.ma20 || 0;
  const ma250 = stock.technicals?.ma250 || 0;
  
  // Context Awareness: Position Analysis
  // Calculate Bias to determine if we are High or Low
  const bias250 = ma250 > 0 ? ((currentPrice - ma250) / ma250) * 100 : 0;
  const isHighPosition = bias250 > 30; // Over 30% deviation is considered High Risk
  const isBearishShort = ma20 > 0 && currentPrice < ma20; // Short term weakness

  return (
    <div className="space-y-4 p-5 bg-white/40 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl relative overflow-hidden group/chips">
      {/* Dynamic scan effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/10 to-transparent w-20 -translate-x-full group-hover/chips:translate-x-[600%] transition-transform duration-[2.5s] ease-in-out pointer-events-none" />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-0.5">Quantum Distribution v30.0 (Decay)</span>
            <span className="text-xs font-black text-slate-900 italic">时间衰减加权筹码 (T-Weighted)</span>
        </div>
        <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.3)] border border-red-400">
                <span className="text-[9px] font-black text-white uppercase italic">获利盘: {profitRatio}%</span>
            </div>
            <span className="text-[8px] font-black text-slate-400 uppercase mt-1">密集度: {concentration}</span>
        </div>
      </div>
      
      <div className="space-y-1 relative z-10">
        {levels.map((level, idx) => {
          const isCurrent = Math.abs(level.price - currentPrice) < (currentPrice * 0.02);
          const width = (level.volume / (maxVol || 1)) * 100;
          
          // Use red-ish colors for profit zone (below current) and blue/slate for trap zone (above current)
          const isProfitZone = level.price < currentPrice;

          return (
            <div key={idx} className="flex items-center gap-4 group/item h-2.5">
              <div className={cn("w-12 text-[9px] font-mono font-black tabular-nums transition-all", 
                isCurrent ? "text-red-600 scale-110" : "text-slate-400 group-hover/item:text-slate-900")}>
                {level.price.toFixed(2)}
              </div>
              <div className="flex-1 h-2 flex items-center bg-slate-200/50 rounded-full overflow-hidden border border-slate-100/50">
                <div 
                  className={cn("h-full rounded-full transition-all duration-1000", 
                    isCurrent ? "bg-gradient-to-r from-red-600 to-red-400 shadow-lg" : 
                    isProfitZone ? "bg-red-500/30" : "bg-slate-900/40")}
                  style={{ width: `${width}%` }}
                />
              </div>
              {isCurrent && (
                <div className="w-1 h-1 rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.8)] animate-ping shrink-0" />
              )}
            </div>
          );
        })}
      </div>
      
      <div className="pt-4 flex items-center justify-between border-t border-slate-200/50 mt-2 relative z-10">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-slate-900/40" />
                <span className="text-[8px] font-black text-slate-500 uppercase">套牢密集</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm bg-red-500/20" />
                <span className="text-[8px] font-black text-slate-500 uppercase">获利空间</span>
            </div>
         </div>
         <div className="flex flex-col items-end">
            <div className="text-[9px] font-black text-slate-400 uppercase">ASR 活跃筹码</div>
            <div className="flex items-center gap-1">
                <span className={cn("text-[10px] font-black font-mono italic", getAsrColor(asrNum))}>{asr}%</span>
                <span className={cn("text-[8px] font-black scale-90", getAsrColor(asrNum))}>
                    {(() => {
                        // Dynamic Interpretation based on Trend Position
                        if (asrNum > 60) {
                            if (isHighPosition) return "高位锁定"; // Danger: High lock-up
                            if (isBearishShort) return "下跌中继"; // Danger: Pause in downtrend
                            return "单峰密集"; // Neutral/Bullish: Strong control
                        }
                        if (asrNum > 40) {
                            if (isHighPosition) return "高位派发"; // Danger: Distribution
                            if (isBearishShort) return "套牢密集"; // Danger: Trapped bulls
                            return "洗盘吸筹"; // Bullish: Accumulation
                        }
                        // Low ASR
                        if (isHighPosition) return "筹码松动"; // Danger: Top is breaking
                        return "筹码发散";
                    })()}
                </span>
            </div>
         </div>
      </div>
    </div>
  );
};