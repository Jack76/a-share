import React from "react";
import { TableCell, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Sparkline } from "../Sparkline";
import { cn } from "../ui/utils";
import {
  Stethoscope,
  SquarePen,
  Trash2,
  Rocket,
  Waves,
  TriangleAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Timer,
  TrendingUp,
  TrendingDown,
  Crosshair,
  Zap,
  Aperture,
  Star,
  StarOff,
  Ghost, // Import Ghost icon
  Gem, // Import Gem icon
  UserMinus, // Import UserMinus icon
  Skull, // V59.1: Zombie/Fake signal icon
  ShieldOff, // V59.1: Fake Main Wave icon
} from "lucide-react";
import { Stock, MarketPhase } from "../../types";
import { isActionableBullishPrediction } from "../../utils/predictionCalibration";

// V67.3: Board type detection for risk awareness (创业板/科创板 = 20% limit)
function getBoardType(code: string): { label: string; shortLabel: string; color: string } | null {
    if (!code) return null;
    const c = code.replace(/\D/g, '');
    if (c.startsWith('300') || c.startsWith('301')) return { label: '创业板', shortLabel: '创', color: 'bg-orange-500 text-white' };
    if (c.startsWith('688')) return { label: '科创板', shortLabel: '科', color: 'bg-blue-500 text-white' };
    return null;
}

interface StockTableRowProps {
  stock: Stock;
  phase: MarketPhase; // Added phase
  onEdit: (s: Stock) => void;
  onDiagnose: (s: Stock) => void;
  onRemove: (id: string) => void;
  onToggleWatch: (s: Stock) => void;
}

// V65.1 PERF: Stable empty array reference to avoid creating new [] on every render
const EMPTY_HISTORY: { day: string; close: number }[] = [];

export const StockTableRow = React.memo(
  ({
    stock,
    phase,
    onEdit,
    onDiagnose,
    onRemove,
    onToggleWatch,
  }: StockTableRowProps) => {
    const isRed = (stock.changePercent || 0) > 0;
    const isGreen = (stock.changePercent || 0) < 0;

    // Derived: Relative Sector Alpha
    const alphaScore = stock.independenceScore || 50;
    
    // V17.5: RSI Passivation Logic (The "Dragon Pass")
    // High RSI (>85) + High Alpha (>15) = Ignore Overbought, Signal Strong Momentum
    const rsi = stock.technicals?.rsi || 0;
    const isDragonPass = rsi > 85 && alphaScore > 65; // independenceScore is 0-100, assuming >65 is High Alpha equivalent to user's "19.3" (context dependent, but 65 is high relative) 
    // Wait, user said "Alpha 19.3". Usually Alpha is a specific value. 
    // In this app's "independenceScore", usually 0-100. 
    // Let's assume stock.independenceScore IS the Alpha value if it's not normalized. 
    // However, looking at line 52: `const alphaScore = stock.independenceScore || 50;` implies it's a score.
    // Let's stick to the score logic: High Score (>65) + High RSI (>85).
    
    // Dragon Quality Score V5.0 (Hunter Algorithm)
    const tech = stock.technicals || {};
    // MA250 Trend Check
    const ma250 = tech.ma250 || 0;
    const isBullTrend =
      ma250 > 0 && (stock.currentPrice || 0) > ma250;

    let score = 50;

    // 1. Price Momentum (Fact)
    if (stock.isLimitUp) score += 25;
    else if ((stock.changePercent || 0) > 5) score += 15;
    else if ((stock.changePercent || 0) < -5) score -= 15;

    // 2. Market Phase Alignment (Context)
    if (phase === "Climax") {
      if (stock.role === "Leader") score += 15;
      else score -= 5;
    }
    if (phase === "Ebb") {
      score -= 20;
      if (stock.aiPrediction?.trend === "Rebound") score += 20;
    }
    if (phase === "Startup") {
      if (
        stock.role === "Potential" &&
        (stock.changePercent || 0) > 3
      )
        score += 10;
    }

    // --- V11.0 Ghost Protocol: Score Correction ---
    // If Stealth Score (Ghost) is detected, override Risk Penalties
    if (stock.aiPrediction?.strategy?.includes("幽灵协议")) {
        score += 25; // Bonus for hidden accumulation
    }

    // 3. Main Force & Flow (Truth)
    if (stock.mainForceInflow !== undefined) {
      if (stock.mainForceInflow > 10) score += 15;
      else if (stock.mainForceInflow < -10) score -= 20;
    } else {
      const flowQuality = stock.moneyQualityScore || 50;
      if (flowQuality > 75) score += 15;
      if (flowQuality < 30) score -= 20;
    }

    // 4. Risk Control
    if ((stock.trapRiskScore || 0) > 60) score -= 30;

    // 5. Technicals
    if (tech.mfi !== undefined) {
      if (tech.mfi > 85) {
         // V17.5: If Dragon Pass, ignore Overbought penalty
         if (!isDragonPass) score -= 10;
      }
      else if (tech.mfi < 20) score += 10;
    }

    // 6. Turnover Constraint
    if ((stock.turnoverRate || 0) > 25 && !stock.isLimitUp && !isDragonPass)
      score -= 10;

    // --- V17.0 Golden Pit Bonus ---
    // Identify Core Assets in Shrinking Pullback
    const isCore = ['Leader', 'Vice', 'Main'].includes(stock.role);
    const isDrop = (stock.changePercent || 0) < -3 && !stock.isLimitDown;
    const isMoneyIn = (stock.mainForceInflow || 0) > 0;
    const isShrinking = (stock.turnoverRate || 0) < 15;
    
    // V17.2: Enhanced Sector & Confidence Check
    // 1. Sector Safety: !isThemeDropout AND Resonance > 50 (Sector still active)
    const isSectorSafe = !stock.isThemeDropout && (stock.resonanceScore || 0) > 50;
    
    // 2. Probability Gate: If AI provides a probability, it must be > 70% to be "Golden"
    // 60% is a gamble, not a pattern lock.
    const isHighConfidence = isActionableBullishPrediction(stock.aiPrediction?.prediction);

    const isGoldenPit = isCore && isDrop && isMoneyIn && isShrinking && isSectorSafe && isHighConfidence;
    
    if (isGoldenPit) {
        score += 20; // Rebound potential
    }

    // Normalize
    score = Math.min(100, Math.max(0, score));

    const renderPredictionBadge = () => {
      // --- PREDATOR V6.0 ORACLE LOGIC ---
      const current = stock.currentPrice || 0;
      const high = stock.high || current;
      const low = stock.low || current;
      const prevClose = stock.prevClose || current;
      const pivot = (high + low + current) / 3;

      // 1. Technical Signals
      const upperShadowRatio =
        prevClose > 0 ? (high - current) / prevClose : 0;
      const isSickleStructure = upperShadowRatio > 0.025;
      const isSickle = isSickleStructure && current < pivot; 

      const isDeepDrop = (stock.changePercent || 0) < -3;
      const isBleed = (stock.changePercent || 0) < 0 && !isDeepDrop;

      const tech = stock.technicals || {};
      const ma5 = tech.ma5 || 0;
      const ma20 = tech.ma20 || 0;
      const ma60 = tech.ma60 || 0;
      const isAccelerating = ma5 > ma20 && ma20 > ma60;
      const isSuperBull = isAccelerating && current > ma5 && current > pivot; 

      const isTrapHigh = (stock.trapRiskScore || 0) > 60;

      // 2. Decision Matrix
      let badgeText = stock.aiPrediction?.summary || "分析中";
      let badgeClass = "bg-slate-100 text-slate-700";
      let icon = null;

      // Priority 1: Limit Up (Lock) - Hard State
      if (stock.isLimitUp) {
        // Limit Up Risk Check (Weak Seal)
        const sealQuality = stock.sealQualityScore || 100;
        const isWeakSeal = sealQuality < 50;
        const isDeathTurnover = (stock.turnoverRate || 0) > 50;

        if (isWeakSeal || isDeathTurnover) {
            badgeText = "烂板 WEAK";
            badgeClass = "bg-orange-600 text-white shadow-sm shadow-orange-200 animate-pulse font-black";
            icon = <TriangleAlert className="w-3 h-3 mr-1" />;
        } else {
            badgeText = "锁仓 LOCK";
            badgeClass = "bg-red-600 text-white shadow-sm shadow-red-200";
            icon = <Lock className="w-3 h-3 mr-1" />;
        }
      }
      // Priority 1.1: Pump & Dump (Trap)
      else if ((stock.changePercent || 0) > 5 && (stock.mainForceInflow || 0) < -10) {
           badgeText = "诱多 TRAP";
           badgeClass = "bg-purple-900 text-purple-100 border border-purple-500 animate-pulse font-black shadow-[0_0_10px_rgba(168,85,247,0.5)]";
           icon = <UserMinus className="w-3 h-3 mr-1" />;
      }
      // Priority 1.2: Technical Divergence (Bear)
      else if (tech.rsiDivergence === 'bear' || tech.macdDivergence === 'bear') {
           badgeText = "背离 DIV";
           badgeClass = "bg-slate-950 text-slate-300 border border-slate-600 animate-pulse font-black";
           icon = <TrendingDown className="w-3 h-3 mr-1" />;
      }
      // Priority 1.3: Dragon Pass (RSI Passivation) - V17.5
      else if (isDragonPass) {
        badgeText = "钝化 PASSIV";
        badgeClass = "bg-pink-600 text-white shadow-sm shadow-pink-200 animate-pulse font-black";
        icon = <Zap className="w-3 h-3 mr-1" />;
      }
      // Priority 1.5: Golden Pit (Front-end Override)
      else if (isGoldenPit) {
        badgeText = "龙回头 BACK";
        badgeClass = "bg-amber-500 text-white shadow-sm shadow-amber-200 animate-pulse font-black";
        icon = <Gem className="w-3 h-3 mr-1" />;
      }
      // Priority 2: AI Engine Decision (Single Source of Truth)
      else if (stock.aiPrediction) {
        const { summary, trend } = stock.aiPrediction;
        const probVal = Number(stock.aiPrediction.winRate || stock.aiPrediction.prediction?.probability || 0);
        
        // Define Risk Signals (Do NOT degrade these)
        const riskSignals = ['出逃', 'EVAC', '止损', 'CUT', '诱多', 'TRAP', '埋人', 'BURY', '核按钮', 'NUCLEAR', '退潮', '滞涨', 'STALL', '假主升', 'FAKE', '僵尸', 'ZOMBIE'];
        const isRiskSignal = stock.aiPrediction?.prediction?.direction === 'DOWN' || riskSignals.some(k => summary?.includes(k));
        const isWaitSignal = summary === '观望' || summary === 'WAIT';

        // V17.6: "Fake Strength" Detection (High Alpha + Stagnation)
        // If system says "STALL" but Alpha is huge (>40), it's a Trap/Mask, not just weak.
        const isFakeStrength = (summary?.includes('滞涨') || summary?.includes('STALL')) && alphaScore > 40;

        // Check for Low Confidence Positive Signal -> Force GAMBLE or WEAK
        if (!isRiskSignal && !isWaitSignal && probVal > 0 && probVal < 70) {
            if (probVal >= 50) {
                badgeText = "博弈 GAMBLE";
                badgeClass = "bg-purple-600 text-white shadow-sm shadow-purple-200 animate-pulse";
                icon = <Rocket className="w-3 h-3 mr-1" />;
            } else {
                badgeText = "弱势 WEAK";
                badgeClass = "bg-slate-200 text-slate-500 border border-slate-300"; // Neutral/Gray
                icon = <Ghost className="w-3 h-3 mr-1" />;
            }
        }
        // Map Engine Summary to Visuals
        else if (isFakeStrength) {
            badgeText = "掩护 MASK";
            badgeClass = "bg-indigo-900 text-indigo-100 border border-indigo-500 animate-pulse font-black shadow-[0_0_10px_rgba(79,70,229,0.5)]";
            icon = <Ghost className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('博弈') || summary?.includes('GAMBLE')) {
            badgeText = "博弈 GAMBLE";
            badgeClass = "bg-purple-600 text-white shadow-sm shadow-purple-200 animate-pulse";
            icon = <Rocket className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('护盘') || summary?.includes('GUARD')) { // V11.0 Ghost Protocol
            badgeText = "护盘 GUARD";
            badgeClass = "bg-indigo-600 text-white shadow-sm shadow-indigo-200 animate-pulse font-black";
            icon = <Ghost className="w-3 h-3 mr-1" />; // Use Ghost Icon
        }
        // V59.1: Fake Main Wave (假主升) - Alpha Divergence on Bullish HOLD
        else if (summary?.includes('假主升') || summary?.includes('FAKE')) {
            badgeText = "假主升 FAKE";
            badgeClass = "bg-red-950 text-red-100 border border-red-500 animate-pulse font-black shadow-[0_0_12px_rgba(239,68,68,0.6)]";
            icon = <ShieldOff className="w-3 h-3 mr-1" />;
        }
        // V59.1: Zombie Boomerang (僵尸) - Dead Alpha on Reversal Pattern
        else if (summary?.includes('僵尸') || summary?.includes('ZOMBIE')) {
            badgeText = "僵尸 ZOMBIE";
            badgeClass = "bg-emerald-950 text-emerald-100 border border-emerald-500 animate-pulse font-black shadow-[0_0_12px_rgba(16,185,129,0.5)]";
            icon = <Skull className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('出逃') || summary?.includes('EVAC')) {
            badgeText = "出逃 EVAC";
            badgeClass = "bg-red-950 text-red-100 border border-red-600 animate-pulse font-black shadow-[0_0_10px_rgba(220,38,38,0.5)]";
            icon = <TrendingDown className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('突击') || summary?.includes('ASSAULT')) {
            badgeText = "突击 ASSAULT";
            badgeClass = "bg-red-500 text-white shadow-sm shadow-red-200";
            icon = <TrendingUp className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('伏击') || summary?.includes('AMBUSH')) {
            badgeText = "伏击 AMBUSH";
            badgeClass = "bg-blue-500 text-white shadow-sm shadow-blue-200";
            icon = <Crosshair className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('弱转强') || summary?.includes('WTS')) {
            badgeText = "弱转强 WTS";
            badgeClass = "bg-orange-500 text-white shadow-sm shadow-orange-200";
            icon = <Zap className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('锁仓') || summary?.includes('LOCK')) {
            badgeText = "锁仓 LOCK";
            badgeClass = "bg-red-600 text-white shadow-sm shadow-red-200";
            icon = <Lock className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('无限') || summary?.includes('INF')) {
            badgeText = "无限 INF";
            badgeClass = "bg-fuchsia-600 text-white shadow-sm shadow-fuchsia-200 animate-pulse font-black";
            icon = <Rocket className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('趋势') || summary?.includes('TREND')) {
            badgeText = "趋势 TREND";
            badgeClass = "bg-blue-600 text-white shadow-sm shadow-blue-200";
            icon = <TrendingUp className="w-3 h-3 mr-1" />;
        }
        else if (summary?.includes('止损') || summary?.includes('CUT')) {
             badgeText = "止损 CUT";
             badgeClass = "bg-slate-900 text-emerald-500 border border-slate-700";
             icon = <TrendingDown className="w-3 h-3 mr-1" />;
        }
        else {
            // Fallback to Trend
            if (trend === 'Accelerate') {
                badgeText = "持仓 HOLD";
                badgeClass = "bg-red-500 text-white";
            } else if (trend === 'Divergence') {
                badgeText = "背离 DIV";
                badgeClass = "bg-orange-400 text-white";
            } else if (trend === 'Rebound') {
                badgeText = "反弹 REB";
                badgeClass = "bg-blue-500 text-white";
            } else if (trend === 'Top') {
                // V59.2: 见顶信号兜底 — 防止未映射的 Top 信号显示为灰色
                badgeText = "见顶 TOP";
                badgeClass = "bg-red-900 text-red-100 border border-red-600 animate-pulse font-black";
                icon = <TrendingDown className="w-3 h-3 mr-1" />;
            }
        }
      }
      // Priority 3: Local Fallback (If AI missing)
      else if (isTrapHigh) {
          // ... legacy local checks ...
          if (isDeepDrop) {
             badgeText = "埋人 BURY";
             badgeClass = "bg-slate-950 text-emerald-500 border border-emerald-900";
          } else {
             badgeText = "诱多 TRAP";
             badgeClass = "bg-orange-600 text-white shadow-sm shadow-orange-200 animate-pulse";
          }
      }

      const prediction = stock.aiPrediction?.prediction;

      return (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <Badge
            className={cn(
              "text-[10px] font-black border-0 px-2 h-5 w-fit uppercase tracking-wider",
              badgeClass,
            )}
          >
            {icon}
            {badgeText}
          </Badge>
          
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[9px] font-bold text-slate-600 truncate max-w-[100px]"
              title={stock.aiPrediction?.strategy}
            >
              {stock.aiPrediction?.positionAdvice || stock.aiPrediction?.strategy || "等待信号..."}
            </span>
          </div>

          {/* V6.0 Oracle Prediction Display */}
          {prediction ? (
            <div className="flex flex-col gap-1 mt-1 pt-1 border-t border-slate-100/50">
                <div className="flex items-center justify-between">
                     <div
                       className="flex items-center gap-1"
                       title={`${prediction.description}${prediction.warnings?.length ? `\n${prediction.warnings.join('\n')}` : ''}`}
                     >
                         {prediction.direction === 'UP' && <TrendingUp className="w-2.5 h-2.5 text-red-500" />}
                         {prediction.direction === 'DOWN' && <TrendingDown className="w-2.5 h-2.5 text-green-500" />}
                         {prediction.direction === 'SIDEWAYS' && <TrendingUp className="w-2.5 h-2.5 text-slate-400 rotate-45" />}
                         <span className="text-[9px] font-black text-slate-700">
                            {prediction.probability}% · 数据{prediction.dataReliability === 'HIGH' ? '高' : prediction.dataReliability === 'MEDIUM' ? '中' : '低'}/证据{prediction.evidenceReliability === 'HIGH' ? '高' : prediction.evidenceReliability === 'MEDIUM' ? '中' : '低'}
                         </span>
                     </div>
                     <div className="text-[8px] font-mono text-slate-400" title="Predicted Target">
                         T: {prediction.targetHigh.toFixed(2)}
                     </div>
                </div>
                {/* Probability Bar */}
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                     <div 
                        className={cn("h-full transition-all duration-500", 
                            prediction.direction === 'UP' ? "bg-red-500" : 
                            prediction.direction === 'DOWN' ? "bg-green-500" : "bg-slate-400"
                        )}
                        style={{ width: `${prediction.probability}%` }}
                     />
                </div>
            </div>
          ) : (
            // Fallback for stocks without V6 data
            stock.aiPrediction && (
                <div className="flex items-center gap-3 mt-1 pt-1 border-t border-slate-100/50">
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-black text-red-400/70 uppercase">B</span>
                    <span className="text-[9px] font-mono font-bold text-red-600/90">
                      {stock.aiPrediction.buyPoint || "--"}
                    </span>
                  </div>
                  <div className="w-px h-2 bg-slate-200" />
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-black text-green-400/70 uppercase">S</span>
                    <span className="text-[9px] font-mono font-bold text-green-600/90">
                      {stock.aiPrediction.sellPoint || "--"}
                    </span>
                  </div>
                </div>
            )
          )}
        </div>
      );
    };

    const renderTrapRisk = () => {
      const score = stock.trapRiskScore || 0;
      const sealQuality = stock.sealQualityScore || 100;
      const moneyQuality = stock.moneyQualityScore || 50;

      return (
        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Trap Guard
            </span>
            <span
              className={cn(
                "font-mono text-[10px] font-bold",
                score > 70
                  ? "text-red-600"
                  : score > 40
                    ? "text-orange-600"
                    : "text-green-600",
              )}
            >
              {score}%
            </span>
          </div>
          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-1000",
                score > 70
                  ? "bg-red-500"
                  : score > 40
                    ? "bg-orange-500"
                    : "bg-green-500",
              )}
              style={{ width: `${score}%` }}
            />
          </div>

          {/* v28.0 New: Quality Matrix */}
          {stock.isLimitUp && (
            <div className="flex items-center gap-2 mt-1">
              <div
                className="flex items-center gap-0.5"
                title={`封板质量: ${sealQuality.toFixed(0)}%`}
              >
                <Timer className="w-2.5 h-2.5 text-slate-400" />
                <span
                  className={cn(
                    "text-[8px] font-black",
                    sealQuality > 70
                      ? "text-green-600"
                      : "text-orange-500",
                  )}
                >
                  {sealQuality.toFixed(0)}
                </span>
              </div>
              <div className="w-px h-2 bg-slate-200" />
              <div
                className="flex items-center gap-0.5"
                title={`资金诚意: ${moneyQuality.toFixed(0)}%`}
              >
                <ShieldCheck className="w-2.5 h-2.5 text-slate-400" />
                <span
                  className={cn(
                    "text-[8px] font-black",
                    moneyQuality > 70
                      ? "text-red-600"
                      : "text-slate-500",
                  )}
                >
                  {moneyQuality.toFixed(0)}
                </span>
              </div>
            </div>
          )}

          {stock.trapSignals &&
            stock.trapSignals.length > 0 && (
              <div className="flex gap-0.5">
                {stock.trapSignals.slice(0, 2).map((sig, i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"
                    title={sig.description}
                  />
                ))}
              </div>
            )}
        </div>
      );
    };

    const isSelfSelect = stock.tags?.includes('SelfSelect');

    return (
      <TableRow className="group transition-none border-border/30 hover:bg-slate-50/50 h-[80px] md:h-[80px] overflow-hidden transform-gpu relative">
        <TableCell className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors pl-2 md:pl-8 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] w-[90px] md:w-auto">
          <div className="flex flex-col justify-center h-full py-1">
            <div className="font-black text-sm tracking-tight text-slate-900 group-hover:text-red-600 transition-colors truncate max-w-[80px] md:max-w-none">
              {stock.name}
            </div>
            {/* Mobile: Code on separate line */}
            <div className="text-[10px] font-mono font-bold text-slate-400 mt-0.5 md:hidden">
                {stock.code}
            </div>
            {/* Badges: Wrapped on Mobile, No Wrap on Desktop */}
            <div className="flex flex-wrap md:flex-nowrap items-center gap-1 mt-0.5 md:mt-1">
              <span className="hidden md:inline text-[10px] font-mono font-bold text-slate-400">
                {stock.code}
              </span>
              {isSelfSelect && (
                 <Badge className="bg-yellow-500 text-white border-yellow-400 text-[8px] h-3.5 px-1 font-black shadow-sm shadow-yellow-200 shrink-0">
                   {/* Simplify for Mobile */}
                   <span className="md:hidden">选</span>
                   <span className="hidden md:inline">自选</span>
                 </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  "text-[8px] h-3.5 px-1 font-bold uppercase border-none shrink-0",
                  stock.role === "Leader"
                    ? "bg-red-600 text-white shadow-sm shadow-red-200"
                    : stock.role === "Independent"
                      ? "bg-purple-600 text-white shadow-sm shadow-purple-200"
                      : stock.role === "Substitute"
                        ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                        : stock.role === "Vice"
                          ? "bg-orange-500 text-white shadow-sm shadow-orange-200"
                          : stock.role === "Main"
                            ? "bg-emerald-600 text-white shadow-sm shadow-emerald-200"
                            : stock.role === "Follower"
                              ? "bg-slate-500 text-white"
                              : "bg-slate-100 text-slate-500",
                )}
              >
                {/* Simplified Mobile Labels */}
                <span className="md:hidden">
                    {stock.role === "Leader" ? "龙头" : 
                     stock.role === "Vice" ? "副龙" :
                     stock.role === "Independent" ? "妖股" :
                     stock.role === "Substitute" ? "补涨" :
                     stock.role === "Main" ? "中军" :
                     stock.role === "Follower" ? "跟风" :
                     stock.role === "Potential" ? "潜力" : "观察"}
                </span>
                <span className="hidden md:inline whitespace-nowrap">
                    {stock.role === "Leader"
                      ? "核心龙头"
                      : stock.role === "Independent"
                        ? "独立妖"
                        : stock.role === "Substitute"
                          ? "中位补涨"
                          : stock.role === "Vice"
                            ? "强力副龙"
                            : stock.role === "Main"
                              ? "中军容量"
                              : stock.role === "Follower"
                                ? "跟风杂毛"
                                : stock.role === "Potential"
                                  ? "潜力潜伏"
                                  : stock.role === "Normal"
                                    ? "普通观察"
                                    : stock.role}
                </span>
              </Badge>
              {stock.isLimitUp && (
                <Badge className="bg-red-50 text-red-600 border-red-100 text-[8px] h-3.5 px-1 font-black shrink-0">
                  <span className="md:hidden">封</span>
                  <span className="hidden md:inline">封板</span>
                </Badge>
              )}
              {/* V8.6 Stargate Badge */}
              {stock.stargate?.gateLevel !== undefined && stock.stargate.gateLevel > 0 && (
                <Badge className="bg-indigo-50 text-indigo-600 border-indigo-100 text-[8px] h-3.5 px-1 font-black flex items-center gap-0.5 shrink-0">
                  <span className="md:hidden">G{stock.stargate.gateLevel}</span>
                  <span className="hidden md:flex items-center gap-0.5 whitespace-nowrap">
                      <Aperture className="w-2 h-2" />
                      GATE {stock.stargate.gateLevel}
                  </span>
                </Badge>
              )}
              {/* V67.3: Board type badge (创业板/科创板 = 20% limit) */}
              {getBoardType(stock.code) && (
                <Badge className={cn("text-[8px] h-3.5 px-1 border-none font-bold shrink-0", getBoardType(stock.code)!.color)}>
                  <span className="md:hidden">{getBoardType(stock.code)!.shortLabel}</span>
                  <span className="hidden md:inline">{getBoardType(stock.code)!.label}</span>
                </Badge>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="px-1 md:px-4 w-[90px] md:w-auto">
          <div className="flex flex-col">
            <div
              className={cn(
                "font-black text-sm",
                isRed
                  ? "text-red-600"
                  : isGreen
                    ? "text-green-600"
                    : "text-slate-500",
              )}
            >
              {isRed ? "+" : ""}
              {stock.changePercent}%
            </div>
            <div className="text-[10px] font-mono font-bold text-slate-400">
              ¥{stock.currentPrice?.toFixed(2) || "--"}
            </div>
          </div>
        </TableCell>
        <TableCell className="px-1 md:px-4 w-[110px] md:w-auto">{renderPredictionBadge()}</TableCell>
        <TableCell className="px-1 md:px-4 w-[100px] md:w-auto">
          <div className="flex flex-col gap-1.5 min-w-[70px] md:min-w-[80px]">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-lg font-black italic",
                  score >= 80
                    ? "text-red-600"
                    : score >= 60
                      ? "text-orange-500"
                      : "text-slate-400",
                )}
              >
                {score}
              </span>
              <span className="text-[9px] font-black uppercase text-slate-300">
                Score
              </span>
            </div>
            <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-1000",
                  score >= 80
                    ? "bg-red-500"
                    : score >= 60
                      ? "bg-orange-500"
                      : "bg-slate-300",
                )}
                style={{ width: `${score}%` }}
              />
            </div>
            {/* Hunter V5.0 Flow Indicator */}
            {stock.mainForceInflow !== undefined && (
              <div className="flex items-center gap-1 mt-0.5">
                {stock.mainForceInflow > 0 ? (
                  <TrendingUp className="w-2.5 h-2.5 text-red-500" />
                ) : (
                  <TrendingDown className="w-2.5 h-2.5 text-green-500" />
                )}
                <span
                  className={cn(
                    "text-[9px] font-mono font-black",
                    stock.mainForceInflow > 0
                      ? "text-red-500"
                      : "text-green-500",
                  )}
                >
                  {Math.abs(stock.mainForceInflow).toFixed(1)}M
                </span>
              </div>
            )}
          </div>
        </TableCell>
        <TableCell className="px-1 md:px-4 w-[110px] md:w-auto">{renderTrapRisk()}</TableCell>
        <TableCell className="hidden md:table-cell">
          <div className="flex flex-col gap-1 max-w-[120px]">
            <Badge
              variant="outline"
              className="bg-primary/5 border-primary/10 text-primary font-bold uppercase tracking-tighter text-[10px] w-fit"
            >
              {stock.concept || "-"}
            </Badge>
            <div className="flex items-center gap-1.5">
              {ma250 > 0 && (
                <div
                  className={cn(
                    "flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[8px] font-black uppercase",
                    isBullTrend
                      ? "bg-red-50 text-red-600 border-red-100"
                      : "bg-slate-50 text-slate-400 border-slate-100",
                  )}
                >
                  {isBullTrend ? (
                    <TrendingUp className="w-2.5 h-2.5" />
                  ) : (
                    <TrendingDown className="w-2.5 h-2.5" />
                  )}
                  {isBullTrend ? "多头" : "空头"}
                </div>
              )}
              {stock.status === "Hold" && (
                <Badge className="bg-green-600 text-white border-green-200 text-[8px] h-3.5 px-1 font-black shadow-sm shadow-green-200 w-fit">
                  持仓
                </Badge>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <div className="opacity-70 group-hover:opacity-100 transition-opacity">
            <Sparkline
              data={stock.history || EMPTY_HISTORY}
              width={80}
              height={24}
            />
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <div className="flex flex-col gap-1">
            {/* T+1 Optimized Turnover Display */}
            <div className="flex items-center gap-1.5">
              {(() => {
                  const turnover = stock.turnoverRate || 0;
                  // Logic V9.0: T+1 Safety Check
                  if (turnover > 50) {
                      return (
                          <span className="flex items-center text-[10px] font-black text-red-600 animate-pulse bg-red-50 px-1 rounded">
                             <TriangleAlert className="w-3 h-3 mr-0.5" /> 死亡换手 {turnover}%
                          </span>
                      );
                  }
                  if (turnover > 20) {
                      return (
                          <span className="text-[10px] font-bold text-orange-500">
                             高换手 {turnover}%
                          </span>
                      );
                  }
                  if (turnover > 0 && turnover < 5) {
                       return (
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                             <Lock className="w-2.5 h-2.5 mr-0.5" /> 缩量 {turnover}%
                          </span>
                       );
                  }
                  return (
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                        换手 {turnover || "--"}%
                      </span>
                  );
              })()}
            </div>
            
            {/* T+1 Optimized Time/Ladder Display */}
            <div className="flex items-center gap-1">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                  {stock.notes?.match(/(\d+)连板/)?.[0] || "首板/趋势"}
                </div>
                {/* Time Decay Badge */}
                {(() => {
                    const notes = stock.notes || "";
                    if (notes.includes('早盘') || notes.includes('09:') || notes.includes('10:')) {
                        return <Badge className="h-3.5 px-0.5 text-[8px] bg-red-100 text-red-700 border-none font-black shadow-none rounded-sm">早盘硬板</Badge>
                    }
                    if (notes.includes('尾盘') || notes.includes('14:4') || notes.includes('14:5')) {
                        return <Badge className="h-3.5 px-0.5 text-[8px] bg-slate-100 text-slate-500 border-none font-bold shadow-none rounded-sm">尾盘弱板</Badge>
                    }
                    return null;
                })()}
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right pr-2 md:pr-8 w-[90px] md:w-auto">
          <div className="flex justify-end gap-1 opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                  "h-7 w-7 rounded-lg hover:bg-red-50 hover:text-red-600 hidden md:inline-flex",
                  stock.tags?.includes('SelfSelect') ? "text-yellow-500 hover:text-yellow-600" : "text-slate-300" 
              )}
              onClick={() => onToggleWatch(stock)}
              title={stock.tags?.includes('SelfSelect') ? "取消自选" : "加入自选"}
              aria-label={`${stock.tags?.includes('SelfSelect') ? "取消自选" : "加入自选"} ${stock.name}`}
            >
              {stock.tags?.includes('SelfSelect') ? <Star className="h-3.5 w-3.5 fill-current" /> : <Star className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg hover:bg-red-50 hover:text-red-600"
              onClick={() => onDiagnose(stock)}
              aria-label={`诊断 ${stock.name}`}
            >
              <Stethoscope className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg hover:bg-red-50 hover:text-red-600 md:hidden"
              onClick={() => onEdit(stock)}
              aria-label={`编辑 ${stock.name}`}
            >
              <SquarePen className="h-3.5 w-3.5" />
            </Button>
             <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg hover:bg-red-50 hover:text-red-600 hidden md:inline-flex"
              onClick={() => onEdit(stock)}
              aria-label={`编辑 ${stock.name}`}
            >
              <SquarePen className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg hover:bg-red-50 hover:text-red-600 hidden md:inline-flex"
              onClick={() => onRemove(stock.id)}
              aria-label={`删除 ${stock.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  },
  // V65.1 PERF: Custom comparator — stock objects are recreated every recalc cycle.
  // Only re-render when visually meaningful fields change.
  (prev, next) => {
    const ps = prev.stock;
    const ns = next.stock;
    if (prev.phase !== next.phase) return false;
    // Key display fields
    if (ps.currentPrice !== ns.currentPrice) return false;
    if (ps.changePercent !== ns.changePercent) return false;
    if (ps.isLimitUp !== ns.isLimitUp) return false;
    if (ps.isLimitDown !== ns.isLimitDown) return false;
    if (ps.role !== ns.role) return false;
    if (ps.status !== ns.status) return false;
    if (ps.trapRiskScore !== ns.trapRiskScore) return false;
    if (ps.turnoverRate !== ns.turnoverRate) return false;
    if (ps.mainForceInflow !== ns.mainForceInflow) return false;
    if (ps.stargate?.gateLevel !== ns.stargate?.gateLevel) return false;
    if (ps.aiPrediction?.summary !== ns.aiPrediction?.summary) return false;
    if (ps.aiPrediction?.winRate !== ns.aiPrediction?.winRate) return false;
    if (ps.tags?.length !== ns.tags?.length) return false;
    // History length change (new data loaded)
    if ((ps.history?.length || 0) !== (ns.history?.length || 0)) return false;
    return true;
  }
);
