import React from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import {
  TrendingUp,
  TrendingDown,
  Lock,
  TriangleAlert,
  UserMinus,
  Zap,
  Gem,
  Rocket,
  Ghost,
  ShieldOff,
  Skull,
  Crosshair,
  Aperture,
  MoreHorizontal,
  Timer,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Stock, MarketPhase } from "../../types";
import { motion } from "motion/react";

// V67.3: Board type detection for risk awareness (创业板/科创板 = 20% limit)
function getBoardType(code: string): { label: string; color: string } | null {
    if (!code) return null;
    const c = code.replace(/\D/g, '');
    if (c.startsWith('300') || c.startsWith('301')) return { label: '创', color: 'bg-orange-500 text-white' };
    if (c.startsWith('688')) return { label: '科', color: 'bg-blue-500 text-white' };
    return null;
}

interface StockMobileCardProps {
  stock: Stock;
  phase: MarketPhase;
  onEdit: (s: Stock) => void;
  onDiagnose: (s: Stock) => void;
  onRemove: (id: string) => void;
  onToggleWatch: (s: Stock) => void;
}

export const StockMobileCard: React.FC<StockMobileCardProps> = ({
  stock,
  phase,
  onEdit,
  onDiagnose,
  onRemove,
  onToggleWatch,
}) => {
  const isRed = (stock.changePercent || 0) > 0;
  const isGreen = (stock.changePercent || 0) < 0;

  // --- Quality Score Logic (Simplified for Mobile) ---
  const alphaScore = stock.independenceScore || 50;
  const isDragonPass = (stock.technicals?.rsi || 0) > 85 && alphaScore > 65;
  
  let score = 50;
  // ... (Reusing simplified score logic or passing it in would be better, but for now recalculate or use simplified)
  // We can just use the provided score props if available, but they are calculated in parent or row.
  // Ideally, the parent should pass the score, but here we can just recalculate the visual score quickly
  // or just use the visual indicators available on the stock object if we had them.
  // Re-implementing the visual score calculation to match TableRow:
  
  if (stock.isLimitUp) score += 25;
  else if ((stock.changePercent || 0) > 5) score += 15;
  else if ((stock.changePercent || 0) < -5) score -= 15;
  if (stock.mainForceInflow !== undefined) {
      if (stock.mainForceInflow > 10) score += 15;
      else if (stock.mainForceInflow < -10) score -= 20;
  }
  if ((stock.trapRiskScore || 0) > 60) score -= 30;
  score = Math.min(100, Math.max(0, score));


  // --- Prediction Badge Logic ---
  const renderPredictionBadge = () => {
      // Reuse logic from StockTableRow but simplified for mobile
      let badgeText = stock.aiPrediction?.summary || "分析中";
      let badgeClass = "bg-slate-100 text-slate-700";
      let icon = null;

      const tech = stock.technicals || {};
      const isDragonPass = (tech.rsi || 0) > 85 && (stock.independenceScore || 50) > 65;
      const isGoldenPit = ['Leader', 'Vice', 'Main'].includes(stock.role) && (stock.changePercent || 0) < -3 && !stock.isLimitDown && (stock.mainForceInflow || 0) > 0 && (stock.turnoverRate || 0) < 15;

      if (stock.isLimitUp) {
          const sealQuality = stock.sealQualityScore || 100;
          if (sealQuality < 50 || (stock.turnoverRate || 0) > 50) {
              badgeText = "烂板";
              badgeClass = "bg-orange-100 text-orange-700 border border-orange-200";
              icon = <TriangleAlert className="w-3 h-3 mr-1" />;
          } else {
              badgeText = "锁仓";
              badgeClass = "bg-red-100 text-red-700 border border-red-200";
              icon = <Lock className="w-3 h-3 mr-1" />;
          }
      } else if (isGoldenPit) {
          badgeText = "龙回头";
          badgeClass = "bg-amber-100 text-amber-700 border border-amber-200";
          icon = <Gem className="w-3 h-3 mr-1" />;
      } else if (stock.aiPrediction) {
           const { trend, summary } = stock.aiPrediction;
           if (summary?.includes('弱转强')) {
               badgeText = "弱转强";
               badgeClass = "bg-orange-100 text-orange-700 border border-orange-200";
               icon = <Zap className="w-3 h-3 mr-1" />;
           } else if (trend === 'Accelerate') {
               badgeText = "加速";
               badgeClass = "bg-red-100 text-red-700 border border-red-200";
               icon = <Rocket className="w-3 h-3 mr-1" />;
           } else if (trend === 'Divergence') {
               badgeText = "背离";
               badgeClass = "bg-slate-100 text-slate-700 border border-slate-200";
               icon = <TrendingDown className="w-3 h-3 mr-1" />;
           }
      }

      return (
          <Badge className={cn("text-[10px] font-black px-1.5 h-5 w-fit uppercase tracking-wider flex items-center shadow-none", badgeClass)}>
              {icon}
              {badgeText}
          </Badge>
      );
  };

  return (
    <motion.div 
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative overflow-hidden"
    >
      {/* Background Decor */}
      <div className={cn("absolute top-0 right-0 w-16 h-16 opacity-5 -mr-4 -mt-4 rounded-full", isRed ? "bg-red-600" : isGreen ? "bg-green-600" : "bg-slate-400")} />

      <div className="flex justify-between items-start mb-3">
        {/* Left: Name & Code */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-slate-900">{stock.name}</span>
            {stock.stargate?.gateLevel && stock.stargate.gateLevel > 0 && (
                <Badge className="bg-indigo-50 text-indigo-600 border-indigo-100 text-[8px] h-4 px-1 font-black flex items-center gap-0.5">
                    G{stock.stargate.gateLevel}
                </Badge>
            )}
            {stock.tags?.includes('SelfSelect') && (
                <Badge className="bg-yellow-500 text-white border-yellow-400 text-[8px] h-4 px-1 font-black">自选</Badge>
            )}
            {/* V67.3: Board type badge */}
            {getBoardType(stock.code) && (
                <Badge className={cn("text-[8px] h-4 px-1 border-none font-bold", getBoardType(stock.code)!.color)}>
                    {getBoardType(stock.code)!.label}
                </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-mono font-bold text-slate-400">{stock.code}</span>
            <Badge
                variant="outline"
                className={cn(
                  "text-[8px] h-4 px-1 font-bold uppercase border-none",
                  stock.role === "Leader" ? "bg-red-600 text-white" : 
                  stock.role === "Vice" ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500"
                )}
              >
                {stock.role === 'Leader' ? '龙头' : stock.role === 'Vice' ? '副龙' : stock.role}
            </Badge>
          </div>
        </div>

        {/* Right: Price & Change */}
        <div className="flex flex-col items-end">
             <div className={cn("text-lg font-black tracking-tight flex items-center", isRed ? "text-red-600" : isGreen ? "text-green-600" : "text-slate-500")}>
                {isRed ? "+" : ""}{stock.changePercent}%
             </div>
             <div className="text-[10px] font-mono font-bold text-slate-400">
                ¥{stock.currentPrice?.toFixed(2) || "--"}
             </div>
        </div>
      </div>

      {/* Middle: Stats Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3 bg-slate-50/50 rounded-xl p-2 border border-slate-100">
          <div className="flex flex-col items-center justify-center border-r border-slate-200/50">
             <span className="text-[9px] font-bold text-slate-400 uppercase">主力</span>
             <div className={cn("text-[11px] font-black font-mono mt-0.5", (stock.mainForceInflow || 0) > 0 ? "text-red-500" : "text-green-500")}>
                {(stock.mainForceInflow || 0) > 0 ? "+" : ""}{stock.mainForceInflow?.toFixed(1) || "0.0"}M
             </div>
          </div>
          <div className="flex flex-col items-center justify-center border-r border-slate-200/50">
             <span className="text-[9px] font-bold text-slate-400 uppercase">换手</span>
             <div className="text-[11px] font-black font-mono mt-0.5 text-slate-700">
                {stock.turnoverRate?.toFixed(1) || "--"}%
             </div>
          </div>
          <div className="flex flex-col items-center justify-center">
             <span className="text-[9px] font-bold text-slate-400 uppercase">风险</span>
             <div className={cn("text-[11px] font-black font-mono mt-0.5", (stock.trapRiskScore || 0) > 50 ? "text-red-500" : "text-green-500")}>
                {stock.trapRiskScore || 0}%
             </div>
          </div>
      </div>

      {/* Footer: AI & Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
         <div className="flex flex-col gap-1">
             {renderPredictionBadge()}
             {stock.aiPrediction?.prediction && (
                 <div className="flex items-center gap-1">
                    <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                            className={cn("h-full", stock.aiPrediction.prediction.direction === 'UP' ? "bg-red-500" : "bg-green-500")}
                            style={{ width: `${stock.aiPrediction.prediction.probability}%` }}
                        />
                    </div>
                    <span
                      className="text-[8px] font-mono text-slate-400"
                      title={stock.aiPrediction.prediction.warnings?.join('\n')}
                    >
                      {stock.aiPrediction.prediction.probability}% · {stock.aiPrediction.prediction.reliability === 'HIGH' ? '高' : stock.aiPrediction.prediction.reliability === 'MEDIUM' ? '中' : '低'}
                    </span>
                 </div>
             )}
         </div>

         <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" onClick={() => onDiagnose(stock)}>
                <Aperture className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0 text-slate-400 hover:text-slate-900 hover:bg-slate-100" onClick={() => onEdit(stock)}>
                <MoreHorizontal className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 rounded-full p-0 text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => onRemove(stock.id)}>
                <Trash2 className="w-4 h-4" />
            </Button>
         </div>
      </div>
    </motion.div>
  );
};
