import React, { useMemo } from 'react';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Stock, MarketPhase } from '../../types';
import { TechnicalIndicators } from '../../utils/indicators';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Activity, Target, Shield, TriangleAlert, Fingerprint, Zap, TrendingDown, TrendingUp, Crosshair, Lock, Rocket, Layers, BarChart3, DollarSign, Eye, Anchor, Calculator, Aperture, UserMinus, Users, Gem, Ghost, Siren, HelpCircle, Skull, Handshake, Swords, ShieldCheck, Waves, Diamond, Flame, ArrowDownToLine, Copy, CircleDot, Ban, X } from 'lucide-react';
import { TimeSharingDivergence } from '../TimeSharingDivergence';
import { ChipsDistribution } from '../ChipsDistribution';
import { cn } from '../ui/utils';
import { calculateRealtimeMetrics, RealtimeMetrics } from '../../utils/realtimeAnalysis';
import { fetchStockTicks, fetchStockData } from '../../services/marketData';
import { detectFundIdentity, predictSmashRisk } from '../../utils/fundIntelligence';
import { calculateOvernightPotential, calculateLimitUpStrength } from '../../utils/scoring';
import {
  getPredictionWaitReason,
  isActionableBullishPrediction,
  shouldApplyEntryWaitGate,
} from '../../utils/predictionCalibration';
import { calculateLimitState } from '../../../shared/marketRules';
import { useTrading } from '../../context/Store';
import {
  assessCapitalFlow,
  formatCapitalFlowYuan,
  getDirectLargeOrderNetYuan,
} from '../../utils/capitalFlow';
import { assessMarginTradingRisk } from '../../utils/marginRisk';
import { sanitizeAdvisoryLanguage } from '../../utils/advisoryLanguage';
import { ASHARE_FACTOR_LABELS, type AShareFactorName } from '../../utils/aShareFactors';

interface StockDiagnosisDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  stock: Stock | null;
  phase: MarketPhase;
}

export const StockDiagnosisDialog: React.FC<StockDiagnosisDialogProps> = ({ isOpen, onOpenChange, stock: initialStock, phase }) => {
  const { analyzeLiveStockSignal, isMarketOpen } = useTrading();
  // V49.7 FIX: INITIALIZE WITH SNAPSHOT METRICS (防止闪烁)
  // Instead of starting with null (which forces Decoy=0), calculate metrics immediately from initialStock.
  // This ensures "Main Force Profit" is stable even before Ticks arrive.
  const [localMetrics, setLocalMetrics] = React.useState<RealtimeMetrics | null>(() => 
      initialStock ? calculateRealtimeMetrics(initialStock, []) : null
  );
  
  const [stock, setStock] = React.useState<Stock | null>(initialStock);

  React.useEffect(() => {
      if (initialStock) {
          setStock(prev => initialStock);
          // V49.7: Reset to Snapshot, not null
          setLocalMetrics(calculateRealtimeMetrics(initialStock, []));
      }
  }, [initialStock]);

  // Single-flight polling: a slow request must finish before the next one starts.
  React.useEffect(() => {
    if (isOpen && initialStock?.code) {
        let isMounted = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        
        const loadRealtimeData = async () => {
             if (document.hidden) {
               if (isMarketOpen) timer = setTimeout(loadRealtimeData, 15000);
               return;
             }
             try {
               const ticks = await fetchStockTicks(initialStock.code);
               if (!isMounted) return;
             
             // Fix: Pass initialStock as first argument, ticks as second
             const computed = calculateRealtimeMetrics(initialStock, ticks || []);
             setLocalMetrics(computed);

             // V47.3 FIX: Real-time Price Sync
             // Extract latest price from ticks to ensure the UI feels "alive"
             let latestCurrent = initialStock.currentPrice || 0;
             let latestChange = initialStock.changePercent || 0;
             if (ticks && ticks.length > 0) {
                 const lastTick = ticks[ticks.length - 1];
                 const currentPrice = parseFloat(lastTick.price);
                 if (!isNaN(currentPrice) && currentPrice > 0) {
                     latestCurrent = currentPrice;
                     if (initialStock.prevClose && initialStock.prevClose > 0) {
                        latestChange = Number(((currentPrice - initialStock.prevClose) / initialStock.prevClose * 100).toFixed(2));
                     }
                 }
                 // Accumulate volume (rough estimate if not provided directly)
                 // Ideally fetchStockTicks should provide total volume, but here we assume we might need to rely on what we have.
                 // For now, let's trust the tick stream implies latest state.
             }

             // V46.0: PRECOGNITION ENGINE (Momentum Extrapolation)
             // Calculate 1st Derivative (Velocity) to anticipate moves
             let instantVelocity = 0;
             if (ticks && ticks.length >= 5) {
                 const recent = ticks.slice(-5);
                 const last = parseFloat(recent[recent.length - 1].price);
                 const start = parseFloat(recent[0].price);
                 if (start > 0) {
                     // 5-tick velocity (approx 15s window)
                     instantVelocity = ((last - start) / start) * 100;
                 }
             }
             
             // Update the stock object with the latest real-time signal AND Price
             // We must merge initialStock (base info) with latest updates
             const mergedStock = { 
                 ...initialStock, 
                 ...stock,
                 currentPrice: latestCurrent,
                 changePercent: latestChange
                 // Note: volume is harder to update purely from ticks without total vol field
             }; 

             // V65.0: Build micro-context from intraday indicators if available
             const _diagIntraday = mergedStock.intradayIndicators;
             const _diagMicro = _diagIntraday?.macdfs ? {
               macdfs: _diagIntraday.macdfs.signal as 'GoldenCross' | 'DeadCross' | 'None',
               volumeRatio: _diagIntraday.volumeStructure?.avgVol5 ? _diagIntraday.volumeStructure.lastVol / _diagIntraday.volumeStructure.avgVol5 : undefined,
               largeOrderNetYuan: getDirectLargeOrderNetYuan(mergedStock),
               isHeavyVolume: _diagIntraday.volumeStructure?.isHeavy || false,
             } : undefined;

             const liveSignal = analyzeLiveStockSignal(
                 mergedStock,
                 instantVelocity, // V46.0: Inject Velocity for predictive signaling
                 _diagMicro, // V65.0: microContext (was undefined)
                 {          // intentContext
                     intent: computed.mainForceIntent,
                     decoyScore: computed.decoyScore,
                     algoReason: computed.algoReason
                 }
             );
             
             // Override the stale prediction with the live one
             const finalStock = {
                 ...mergedStock,
                 aiPrediction: liveSignal
             };
             
               setStock(finalStock as Stock);
             } finally {
               if (isMounted && isMarketOpen) {
                 timer = setTimeout(loadRealtimeData, 10000);
               }
             }
        };
        
        void loadRealtimeData();
        return () => {
          isMounted = false;
          if (timer) clearTimeout(timer);
        };
    } else {
        setLocalMetrics(null);
    }
  }, [analyzeLiveStockSignal, isMarketOpen, isOpen, initialStock?.code]);

  if (!stock) return null;

  const { profile: fundProfile, detectedName: fundName, evidence: fundEvidence } = detectFundIdentity(stock);
  const capitalFlow = assessCapitalFlow(stock);
  const largeOrderNetYuan = capitalFlow.directNetYuan;
  const isVerifiedLargeOrderInflow =
      capitalFlow.signal === 'DIRECT_INFLOW' ||
      capitalFlow.signal === 'CONFIRMED_INFLOW';

  const current = stock.currentPrice || 0;
  const high = stock.high || current;
  const low = stock.low || current;
  const prevClose = stock.prevClose || current;
  const limitState = calculateLimitState({
      code: stock.code,
      name: stock.name,
      currentPrice: current,
      previousClose: prevClose,
      changePercent: stock.changePercent || 0,
      sourceLimitUpPrice: stock.limitUpPrice,
      sourceLimitDownPrice: stock.limitDownPrice,
  });
  const limitUpPrice = limitState.limitUpPrice;

  // --- V15.1 GUILLOTINE DETECTION ---
  const openGap = stock.auctionData?.openGap !== undefined 
      ? stock.auctionData.openGap 
      : (stock.open && prevClose) ? ((stock.open - prevClose) / prevClose) * 100 : 0;
      
  const isSkyFloor = ((high - prevClose) / prevClose > 0.08) && ((current - prevClose) / prevClose < -0.06);
  const isGuillotine = (
      ((stock.role === 'Leader' || stock.role === 'Vice' || (stock.consecutiveLimitUps || 0) >= 1) && openGap < -4 && (stock.changePercent || 0) < -6) ||
      (openGap < -8.5)
  );
  const isNuclear = isSkyFloor || isGuillotine;

  const range = high - low;
  const distToLimitUp = ((limitUpPrice - current) / current) * 100;
  const isLimitUp = stock.isLimitUp || limitState.isLimitUp;

  const tech = (stock.technicals || {}) as TechnicalIndicators;
  const ma5 = tech.ma5 || 0;
  const ma20 = tech.ma20 || 0;
  
  const alphaScore = stock.independenceScore || 50;
  const isDragonPass = (tech.rsi?.rsi6 || 0) > 85 && alphaScore > 65;
  
  const staticRisk = stock.trapRiskScore || 0;
  let refinedRisk = staticRisk;
  
  // V18.0: MAIN FORCE INTENT
  const intent = localMetrics?.mainForceIntent || 'Neutral';
  const decoyScore = localMetrics?.decoyScore || 0;
  
  if (intent === 'Distribute' && decoyScore > 60) {
      refinedRisk = 100;
  }
  else if (intent === 'Accumulate' && decoyScore > 60) {
      refinedRisk = 10;
  }

  // T-1 融资融券只作为已归一化的杠杆风险覆盖层。
  // trapRiskScore 已通过 TrapGuard 纳入该因子，详情页不再重复加分。
  const marginRisk = assessMarginTradingRisk(stock);

  // --- V17.0: GOLDEN PIT DETECTION ---
  const isCoreAsset = ['Leader', 'Vice', 'Main'].includes(stock.role);
  const isDrop = (stock.changePercent || 0) < -3 && !stock.isLimitDown;
  const turnoverAmt = capitalFlow.turnoverYuan || 0;
  const flowRatio = capitalFlow.directRatio;
  const isShrinking = (stock.turnoverRate || 0) < 15; 
  const isLeverageWash = marginRisk.status === 'AVAILABLE' &&
    (marginRisk.financingNetBuyRatio || 0) < 0 &&
    marginRisk.riskScore === 0;
  const isSectorSafe = !stock.isThemeDropout && (stock.resonanceScore || 0) > 50;
  const isHighConfidence = isActionableBullishPrediction(stock.aiPrediction?.prediction);
  const isGoldenPit = isCoreAsset && isDrop && isVerifiedLargeOrderInflow && isShrinking && !isNuclear && isSectorSafe && isHighConfidence && isLeverageWash;

  if (localMetrics) {
      if ((stock.changePercent || 0) > 5 && localMetrics.mainForceChips < 40) refinedRisk += 20;
      if (localMetrics.priceStability > 60 && localMetrics.darkPoolMoney > 60) refinedRisk -= 20;
      if (localMetrics.buyPressure > 70) refinedRisk -= 15;
  }
  
  if (isNuclear) refinedRisk = 100;

  if (isLimitUp && localMetrics) {
      const isWeakSeal = localMetrics.sealStrength < 35 || (stock.breakCount || 0) >= 3;
      if (isWeakSeal) refinedRisk = Math.max(refinedRisk, 85);
  }
  
  if ((stock.changePercent || 0) > 5) {
      if (flowRatio !== undefined && flowRatio < -0.05) refinedRisk = Math.max(refinedRisk, 90);
  }

  refinedRisk = Math.max(0, Math.min(100, refinedRisk));

  // 6. Score Visuals
  let score = 50; 
  if (isLimitUp) score += 25;
  else if ((stock.changePercent || 0) > 5) score += 15;
  else if ((stock.changePercent || 0) < -5) {
      if (isGoldenPit) score += 20;
      else score -= 15; 
  }
  
  if (phase === 'Climax') {
      if (stock.role === 'Leader') score += 15;
      else score -= 5; 
  }
  if (phase === 'Ebb') {
      score -= 20; 
      if (stock.aiPrediction?.trend === 'Rebound') score += 20; 
  }
  if (phase === 'Startup') {
      if (stock.role === 'Potential' && (stock.changePercent || 0) > 3) score += 10;
  }

  if (flowRatio !== undefined) {
       if (flowRatio > 0.1 && capitalFlow.signal !== 'CONFLICT') score += 15;
       else if (flowRatio < -0.05) score -= 20;
       if (capitalFlow.signal === 'CONFLICT') score -= 10;
  }

  if (tech.chipPressure && tech.chipPressure > 80) score -= 15;
  if (tech.profitRatio && tech.profitRatio > 95) score += 10;
  
  // V52.0 FIX: Dragon Divergence Immunity (龙头背离豁免)
  // 龙头股在高位钝化是常态。如果 role 是 Leader/Dragon，且趋势向上(MA5>MA20)，
  // 忽略背离扣分，甚至给予“空中加油”加分。
  const isDragonTrend = (stock.role === 'Leader' || stock.role === 'Dragon') && (ma5 > ma20);
  
  if (tech.macdDivergence === 'bear' || tech.rsiDivergence === 'bear') {
      if (isDragonTrend) {
          score += 10; // 空中加油，强势钝化
      } else {
          score -= 30; // 普通股顶背离，重罚
      }
  }
  
  if (tech.macdDivergence === 'bull' && (stock.changePercent || 0) > 0) score += 20;
  
  if (tech.atrBands && stock.currentPrice) {
      if (stock.currentPrice > tech.atrBands.upperResistance && !isLimitUp) score -= 10;
      if (stock.currentPrice < tech.atrBands.lowerSupport) score -= 20;
  }
  
  if (tech.mfi !== undefined) {
      if (tech.mfi > 90) score -= 5;
      else if (tech.mfi < 15) score += 10;
  }

  // v44.0 DMI 趋势强度修正
  if (tech.dmi) {
      const { adx, pdi, mdi } = tech.dmi;
      
      // 趋势有效性判定 (ADX > 25)
      if (adx > 25) {
          if (pdi > mdi) score += 10; // 多头趋势确立
          else score -= 15;           // 空头趋势确立 (扣分更重，因为要规避下跌)
      }
      
      // 龙头确认 (Dragon Signal: ADX > 50)
      if (adx > 50 && pdi > mdi) {
          score += 15; // 极强主升浪
      }
      
      // 假突破预警 (Fake Breakout: 涨幅大但ADX低)
      if ((stock.changePercent || 0) > 5 && adx < 20) {
          score -= 15; // 有价无市，可能是诱多
      }
  }

  // v44.0 KDJ 动能共振修正
  if (tech.kdj) {
      const { k, d, j } = tech.kdj;
      const isDragon = tech.dmi && tech.dmi.adx > 50 && tech.dmi.pdi > tech.dmi.mdi;
      
      if (j < 0) score += 10; // 超卖钝化 (黄金坑)
      else if (j < 20 && k > d) score += 5; // 低位金叉
      else if (j > 100) {
          if (isDragon) score += 10; // 妖股不看指标 (钝化通行)
          else score -= 15; // 普通股超买预警
      } else if (k < d && j > 80) {
          score -= 10; // 高位死叉
      }
  }

  // v44.0 综合信号研判 (Signal Synthesis)
  // MOVED DOWN AFTER gameState INITIALIZATION


  if ((stock.trapRiskScore || 0) > 60) score -= 30;
  
  const volRatio = stock.auctionData?.volumeRatio || stock.volRatio || 1.0;
  if ((stock.turnoverRate || 0) > 15 && volRatio > 2.5 && !isLimitUp) score -= 10;
  if ((stock.turnoverRate || 0) > 50) score -= 30;

  // 单项影响封顶：温和共振最多 +2，杠杆风险最多 -15。
  score += marginRisk.buyScoreAdjustment;

  if (localMetrics) {
      const staticMoneyScore = largeOrderNetYuan === undefined
          ? 50
          : 50 + (largeOrderNetYuan > 0 ? 15 : -15);
      const realMoneyScore = localMetrics.mainForceChips; 
      const blendedMoney = staticMoneyScore * 0.4 + realMoneyScore * 0.6;
      score += (blendedMoney - staticMoneyScore) * 0.5;

      if (localMetrics.darkPoolMoney > 70 && (stock.changePercent || 0) < 3) score += 10;
      if (localMetrics.limitUpProbability > 80 && !isLimitUp) score += 10;
  }

  if (isNuclear) score = 0; 
  else if (refinedRisk > 80 && (stock.changePercent || 0) > 0) score = Math.min(score, 40);
  else score = Math.max(0, Math.min(100, score));

  const staticPosition = range > 0 ? ((current - low) / range) * 100 : 50;
  const refinedStrength = localMetrics 
      ? (staticPosition * 0.3 + localMetrics.buyPressure * 0.7)
      : staticPosition;

  const getScoreColor = (s: number) => {
      if (s >= 80) return "text-red-500";
      if (s >= 60) return "text-orange-500";
      if (s < 40) return "text-green-600";
      return "text-blue-500";
  };

  // --- V49.0: DYNAMIC CHARACTER ADAPTATION (股性自适应) ---
  // MOVED UP to fix ReferenceError
  // 根据 Alpha 值和换手率定义“股性”
  const volatilityScore = alphaScore + (stock.turnoverRate || 0) * 2;
  const isAgile = volatilityScore > 80; // 妖股/活跃股
  
  // 1. 动态 RSI 阈值
  const rsiHigh = isAgile ? 82 : 72;
  const rsiSupport = isAgile ? 55 : 45;
  const rsiDragonFloor = isAgile ? 75 : 65; 

  // 2. 动态趋势线 (Dynamic MA)
  const trendLine = isAgile ? (tech.ma5 || tech.ma20 || 0) : (tech.ma20 || 0);
  const lifeLine = isAgile ? (tech.ma20 || 0) : (tech.ma60 || 0);

  // 3. 动态低位/缩量标准 (Dynamic Low/Shrink for V49.2)
  // 妖股拒绝深跌(J<25即超卖)，换手率<7%即视为缩量极致
  // 慢牛需深度清洗(J<10)，换手率<2%才算没人玩
  const oversoldLimit = isAgile ? 25 : 10;
  const shrinkLimit = isAgile ? 7.0 : 2.5;

  // --- V21.3: PREDATOR GAME THEORY (Adaptive Chip Memory) ---
  // 1. DNA Profiling (Stock Personality)
  const volatility = (high - low) / prevClose * 100;
  let dnaScale = 1.0;
  if (stock.role === 'Leader' || stock.role === 'Dragon') dnaScale = 1.5; // Dragon tolerates deep wash
  else if (stock.role === 'Substitute' || volatility < 2.0) dnaScale = 0.8; // Weak hands panic easily

  // 2. Chip Memory (Volume Weighting)
  const currentVolRatio = stock.volRatio || (tech.avgVol5 ? (stock.volume || 0) / tech.avgVol5 : 1.0);
  const isHeavyVolume = currentVolRatio > 1.8; // New money entering
  const isShrinkingVol = currentVolRatio < 0.6;   // Old money locking

  // 3. Adaptive Cost Calculation & Trend Analysis
  const vwap = stock.avgPrice || (current * 0.98);
  
  // V22.0: Deep Trend Cost Analysis (20/60 Day)
  // Determine cost basis based on fund type and holding period
  // V50.4 FIX: 对于连板妖股，MA5 严重滞后，导致计算出的主力成本过低，浮盈虚高（如+40%）。
  // 必须引入“乖离率修正”：如果股价远超 MA5，说明是加速期，基准成本应上移至 (Current + MA5)/2 或 MA3。
  
  let baseline = ma5 > 0 ? ma5 : current * 0.95; // Default short-term
  const bias5 = ma5 > 0 ? (current - ma5) / ma5 : 0;

  if (isAgile && bias5 > 0.1 && (stock.turnoverRate || 0) > 8) {
      // V50.5 FIX: 只有在"高换手"前提下，才进行乖离率成本修正。
      // 乖离率 > 10% (加速暴涨中)
      // 此时主力成本不可能还在 MA5，至少是在昨天的涨停板附近
      // 我们用 (Current + MA5) * 0.55 近似 MA3 或更激进的成本
      baseline = current * 0.92; // 假设成本在现价-8%左右（一个板的距离）
  }

  // Apply specific fund logic
  if (fundProfile?.holdingPeriod === 'Long') {
      // National Team / Old Syndicate: Look at 60 day avg
      baseline = tech.ma60 > 0 ? tech.ma60 : (ma20 > 0 ? ma20 : baseline);
  } else if (fundProfile?.holdingPeriod === 'Medium') {
      // Institution / Trend Rider: Look at 20 day avg
      baseline = ma20 > 0 ? ma20 : baseline;
  }
  // Short/Day funds stick to MA5/VWAP (baseline)

  const activeLine = baseline;
  
  // V47.2 FIX: Standardized Trend Detection (Independent of Cost Basis)
  // Trend should be judged by Standard Moving Average Alignment, not the variable Cost Line.
  // This ensures "Medium/Long Term Funds" don't break the trend logic.
  const isMaBullish = (ma5 > ma20) || (ma20 > (tech.ma60 || 0)); 
  const isTrendUp = isMaBullish && current > ma20; // Standing on trend line
  const isTrendBroken = current < ma20 && ma5 < ma20; // Falling and MA dead cross
  
  let estimatedMFCost = 0;
  
  // V45.1: ASYMMETRIC COST CALCULATION (Real-time Correction)
  // Fix: Only count today's volume if Main Force is BUYING.
  // If Main Force is SELLING, they are not adding cost, they are cashing out.
  // We must NOT let today's high price dilute their low historical cost.
  
  // 1. Determine Main Force Flow Direction
  const isNetBuy = (largeOrderNetYuan || 0) > 0;
  const turnover = stock.turnoverRate || 0;
  
  // 2. Determine Cost Weights based on Direction
  let todayWeight = 0;
  const isLimitUpStrong = isLimitUp && currentVolRatio < 0.6; // 缩量板

  if (isLimitUpStrong) {
      // V47.0 FIX: 缩量一字板/加速板
      // 逻辑：主力锁仓不动，不需要提高成本。保留历史成本。
      // 但对于新进场的散户，成本很高。对于主力（庄），成本依然极低。
      // 我们计算的是“主力浮盈”。如果用低成本，浮盈会巨大 -> 触发高危。
      // 修正：对于缩量板，虽然主力成本低，但这是"强控盘"特征，而非"出货风险"。
      // 因此，我们强制拉高一点点估算成本（模拟市场平均成本），或者在后续逻辑豁免高危判定。
      // 方案：稍微提高权重，防止浮盈数据过于夸张（>30%）导致被误判为"拉高派发"。
      todayWeight = 0.5; 
  } else if (isHeavyVolume) {
      if (isNetBuy || (stock.changePercent || 0) > 8) {
          // Case A: High Volume + Net Buy = Aggressive Entry
          // V47.0 FIX: 爆量换手板 (即使是 Net Sell，如果是涨停/大阳线，也视为良性换手)
          // 之前的 Net Buy 判断可能因为主力对倒数据失真而误判。
          // 只要股价大涨且放量，大概率是新主力接力。必须大幅拉高成本，降低浮盈率。
          todayWeight = 0.9; // 几乎重置为今日均价
      } else {
          // Case B: High Volume + Net Sell = Aggressive Exit (Pump & Dump)
          // Main force is selling to retail. Do NOT raise their cost.
          todayWeight = 0.05; // Small epsilon
      }
  } else {
      // Normal Volume
      if (isNetBuy) {
           todayWeight = 0.3; // Accumulating slowly
      } else {
           todayWeight = 0.0; // Locked positions
      }
  }

  // 3. Calculate Final Cost (V49.4: PRECISION ENHANCEMENT)
  // activeLine is the Historical Trend Cost (MA5/MA20/MA60)

  // A. Decoy Filtering (欺诈清洗)
  // If Decoy Score is high, the "Volume" is fake (self-churning). We must reduce its weight.
  // Decoy=60 reduces today's weight impact by ~40%.
  const reliability = Math.max(0.2, 1.0 - (decoyScore / 150)); 
  const effectiveWeight = todayWeight * reliability;

  // B. Smart Money Discount (主力低吸修正)
  // Real main force rarely buys at VWAP (Average). They buy on dips or before pullups.
  // If Net Buy + Red Candle, assume they bought 0.5% cheaper than retail VWAP.
  let effectiveVwap = vwap;
  if (isNetBuy && (stock.changePercent || 0) > 0 && !isLimitUp) {
      effectiveVwap = vwap * 0.995; 
  }

  estimatedMFCost = effectiveVwap * effectiveWeight + activeLine * (1 - effectiveWeight);

  // Correction: If calculated cost > current price but it's a Net Sell day, 
  // force cost down to history. Don't let a falling price fool us into thinking cost is high.
  // V47.0 FIX: 排除涨停板/大阳线。涨停板即使显示净流出（可能是假数据），也不要强行压低成本。
  if (!isNetBuy && estimatedMFCost > activeLine && (stock.changePercent || 0) < 5) {
      estimatedMFCost = activeLine;
  }

  let mfProfitRatio = ((current - estimatedMFCost) / estimatedMFCost) * 100;

  // V50.4 SANITY CHECK: Cap Extreme Profit for Short-Term Hot Stocks
  // 短线游资票不可能有 +40% 的全仓浮盈而不砸盘。如果数据显示 >25%，通常是算法没算准（低估了中间的换手成本）。
  // V50.5 FIX: 同样，只有在高换手前提下，才认为成本被换手抬高了。如果缩量，说明主力真有这么高浮盈。
  if (isAgile && stock.role !== 'Independent' && mfProfitRatio > 25 && (stock.turnoverRate || 0) > 10) {
      // 检查是否是一字连板（锁仓导致的真实高浮盈）
      const isOneWordBoard = stock.limitUpCount && stock.limitUpCount >= 3 && (stock.turnoverRate || 0) < 2;
      
      if (!isOneWordBoard) {
          // 非一字板，却显示巨额浮盈 -> 数据失真，强制压缩
          // 假设主力通过高位对倒，实际成本已经抬高
          mfProfitRatio = 15 + (mfProfitRatio - 15) * 0.2; // 压缩超过15%的部分
      }
  }

  // 4. Dynamic Thresholds based on DNA
  const TH_HIGH_RISK = 12 * dnaScale; // Normal: 12%, Dragon: 18%, Weak: 9.6%
  const TH_PROFIT = 4 * dnaScale;     // Normal: 4%, Dragon: 6%, Weak: 3.2%
  const TH_SAFE = -4 * dnaScale;      // Normal: -4%, Dragon: -6%, Weak: -3.2%

  // V51.0: STRONG CONTROL EXEMPTION (强庄控盘豁免)
  // 针对"历史换手率一直很低"的强庄股。
  // 针对“历史换手率一直很低”的强庄股。
  // 特征：换手极低(<3%) + 趋势向上。
  // 逻辑：此类股票主力筹码极度锁定，浮盈虽高(可能>30%)，但只要不爆量，就没有兑现风险。
  // 修正：大幅提高高危阈值，避免将“锁仓拉升”误判为“即将出货”。
  
  const isLowTurnoverControl = (stock.turnoverRate || 0) < 3.0 && isTrendUp && !isNuclear && (stock.changePercent || 0) > -3;
  
  let effectiveRiskThreshold = TH_HIGH_RISK;
  if (isLowTurnoverControl) {
      effectiveRiskThreshold = Math.max(25, TH_HIGH_RISK * 2.0); // 至少容忍 25% 浮盈，最高可达 36%
  }

  // --- V21.3 SCORE CORRECTION: Main Force Impact ---
  // Apply Game Theory penalties/bonuses to the Global Score
  // Difference Explanation: 
  // THS/Software calculates "Average Market Cost" (Retail + Main Force).
  // Predator-X calculates "Main Force Specific Cost" (Lower Cost = Higher Profit).
  // If our profit is much higher than standard (e.g. >15%), it means Main Force is hiding in the bottom.
  const isProfitHidden = mfProfitRatio > 15; 

  if (mfProfitRatio > TH_HIGH_RISK) score -= 25; // High Risk: Huge penalty
  else if (mfProfitRatio < TH_SAFE) score += 15; // Golden Pit: Bonus
  else if (mfProfitRatio >= TH_SAFE && mfProfitRatio <= TH_PROFIT) {
      if (isTrendBroken) score -= 10; // Penalize broken trend even if cost is safe
      else score += 10; // Co-Resonance: Bonus
  }

  // Re-clamp score after adjustments
  score = Math.max(0, Math.min(100, score));

  let safetyScore = 100 - (mfProfitRatio * 5); 
  if (mfProfitRatio < 0) safetyScore = 100; 
  if (safetyScore < 0) safetyScore = 0;
  if (isLimitUp) safetyScore -= 20; 

  let gameState = {
      status: "未知",
      desc: "数据不足，无法计算博弈状态",
      color: "text-slate-400",
      bg: "bg-slate-100",
      icon: HelpCircle
  };

  // V21.6 FIX: Prioritize AI/Intent Signal over Chip Ratio for "Trap" detection
  // If AI clearly says "Get Out", don't say "Dancing with Dealer" even if cost looks safe.
  const pred = stock.aiPrediction;
  const summary = pred?.summary || "观望";
  // V67.2: Added '撤退','天量','避险','空涨' — these SELL signals should also trigger "主力出货" gameState
  const isTrapSignal = ['出货', '出逃', '离场', 'EVAC', '诱多', 'TRAP', '埋人', 'BURY', '核按钮', 'NUCLEAR', '拉高出货', 'PUMP & DUMP', '伪弱转强', '假主升', 'FAKE', '僵尸', 'ZOMBIE', '撤退', 'FLEE', '天量', 'VOL_TOP', '避险', 'AVOID', '空涨', 'HOLLOW', 'ESCAPE', 'EXIT'].some(k => summary.includes(k));
  const isDecoy = (intent === 'Distribute' && decoyScore > 60);

  // V59.2: 假主升/僵尸专属博弈状态
  const _isFakeMainSignal = summary.includes('假主升');
  const _isZombieSignal = summary.includes('僵尸');

  if (isTrapSignal || isDecoy) {
       // V59.2: 为假主升/僵尸提供专属描述
       const _trapDesc = _isFakeMainSignal
           ? `致命矛盾：形态呈天空之城主升浪，但Alpha严重背离(${(tech.alpha || 0).toFixed(1)})。趋势只剩空壳，随时崩塌。`
           : _isZombieSignal
           ? `致命陷阱：回马枪形态看似反转确认，但Alpha值(${(tech.alpha || 0).toFixed(1)})表明趋势早已死亡。`
           : '';
       gameState = {
          status: _isFakeMainSignal ? "假主升 (空壳趋势)" : _isZombieSignal ? "僵尸复活 (虚假反转)" : "派发风险 (陷阱)",
          desc: `检测到明确的出货/诱多结构。量价估算成本不能证明机构真实持仓，应以风险信号为先。`,
          color: "text-red-500",
          bg: (_isFakeMainSignal || _isZombieSignal) ? "bg-red-100" : "bg-red-50",
          icon: (_isFakeMainSignal || _isZombieSignal) ? Skull : Siren 
      };
      // V59.2: Override desc if fake/zombie
      if (_trapDesc) gameState.desc = _trapDesc;
  } else if (mfProfitRatio > effectiveRiskThreshold) {
      // V51.0: Differentiate between High Risk Dump and Strong Lock-up
      if (isLowTurnoverControl && mfProfitRatio < 40) {
          // 浮盈虽高 (25%~40%)，但换手极低 -> 强庄锁仓
          gameState = {
              status: "低换手锁仓特征",
              desc: `现价较量价估算成本高 ${mfProfitRatio.toFixed(1)}%，同时换手率极低(<3%)。这是锁仓特征，不等于已识别真实机构持仓。`,
              color: "text-purple-500",
              bg: "bg-purple-50",
              icon: Lock
          };
      } else {
          // 真正的出货风险
          gameState = {
              status: "高浮盈结构 (高危)",
              desc: `现价较量价估算成本高 ${mfProfitRatio.toFixed(1)}% (>${effectiveRiskThreshold.toFixed(1)}%)。${stock.role === 'Leader' ? '虽是龙头，但' : '股性疲软且'}潜在兑现压力较高。`,
              color: "text-red-500",
              bg: "bg-red-50",
              icon: Skull
          };
          gameState.desc += ` 建议采取"越涨越卖"策略，将仓位严格控制在 3成以下，谨防利润回撤。`;
      }
  } else if (mfProfitRatio > TH_PROFIT) {
      if (current < ma5) {
          gameState = {
              status: "高位整固 (分歧)",
              desc: `现价较量价估算成本高 ${mfProfitRatio.toFixed(1)}%，但股价失守5日线，进攻转入防守，需警惕连续回调。`,
              color: "text-amber-600",
              bg: "bg-amber-50",
              icon: Activity
          };
      } else {
          const trendDesc = isTrendUp ? "依托5日线强势逼空，" : "虽然浮盈较高，但趋势暂未走坏，";
          const isGreen = (stock.changePercent || 0) < 0;
          gameState = {
              status: isGreen ? "拉升中继 (分歧)" : "趋势拉升期",
              desc: `现价较量价估算成本高 ${mfProfitRatio.toFixed(1)}%。${trendDesc}${isHeavyVolume ? '今日爆量换手，筹码交换充分。' : '缩量拉升，潜在兑现压力需持续观察。'}`,
              color: isGreen ? "text-blue-500" : "text-orange-500",
              bg: isGreen ? "bg-blue-50" : "bg-orange-50",
              icon: isGreen ? Activity : TrendingUp
          };
      }
  } else if (mfProfitRatio >= TH_SAFE && mfProfitRatio <= TH_PROFIT) {
      if (isTrendBroken) {
          gameState = {
            status: "成本支撑 (险)",
            desc: `股价虽回踩量价估算成本(¥${estimatedMFCost.toFixed(2)})，但已跌破趋势线(MA20)。若不能快速收回，弱势风险上升。`,
            color: "text-amber-600",
            bg: "bg-amber-50",
            icon: Shield
          };
      } else {
          gameState = {
              status: "成本支撑 (观察)",
              desc: `量价估算成本约 ¥${estimatedMFCost.toFixed(2)}，现价偏离 ${mfProfitRatio.toFixed(1)}%。趋势仍在，但该估算不代表机构真实成本。`,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
              icon: Handshake
          };
      }
  } else {
      gameState = {
          status: "低于估算成本",
          desc: `现价低于量价估算成本 ${Math.abs(mfProfitRatio).toFixed(1)}%。这只说明价格位置偏低，不能推导机构被套或必然自救。`,
          color: "text-blue-600",
          bg: "bg-blue-50",
          icon: Anchor
      };
  }
  
  // v44.0 DMI 辅助研判
  if (tech.dmi) {
      const { adx, pdi, mdi } = tech.dmi;
      if (adx > 40 && pdi > mdi && (gameState.status.includes('拉升') || gameState.status.includes('共舞'))) {
         // 强化多头逻辑
         // gameState.desc += ` [DMI确认: 主升浪ADX=${adx.toFixed(0)}]`;
      } else if (adx < 20 && (stock.changePercent || 0) > 3) {
         // 弱势上涨警告
         if (!gameState.desc.includes('诱多')) {
             gameState.desc += ` [DMI警告: 动能衰竭，谨防冲高回落]`;
         }
      }
  }



  // v44.0 综合信号研判 (Signal Synthesis)
  // 如果 资金面(博弈) + 趋势面(DMI) + 动能面(KDJ) 三者共振，则给出确信度极高的预判
  let synthesisDesc = "";
  let isDragonSignal = false;
  let isTopSignal = false;
  let isBottomSignal = false;

  if (gameState.status.includes('共舞') || gameState.status.includes('拉升')) {
      // 多头象限
      // V46.4 FIX: 只有当日收红才判定为"主升浪共振"，避免下跌时误报
      // V47.5: RSI Enhancement (Bull + RSI)
      const isRsiStrong = (tech.rsi?.rsi6 || 0) > rsiDragonFloor || (tech.kdj?.j || 0) > 80;
      
      if (tech.dmi?.adx > 40 && isRsiStrong && (stock.changePercent || 0) > 0) {
         synthesisDesc = `【全维共振】${isAgile ? '妖股' : '趋势'}形态确认，均线多头与RSI动能(>${rsiDragonFloor})完美共振。`;
         isDragonSignal = true;
         score += 5;
      } else if (tech.kdj?.k < tech.kdj?.d) {
         // V49.0: 妖股顶背离容忍度更高
         if (!isAgile || (tech.rsi?.rsi6 || 0) < rsiHigh) {
             synthesisDesc = "【顶背离警告】主力虽在拉升，但短线动能(KDJ)已衰竭，需警惕主力利用惯性诱多出货。";
             isTopSignal = true;
             score -= 10;
         }
      }
  } else if (gameState.status.includes('被套') || gameState.status.includes('黄金坑')) {
      // 空头/反转象限
      // V49.2: Dynamic Oversold Threshold
      if (tech.kdj?.j < oversoldLimit && tech.kdj?.k > tech.kdj?.d) {
          synthesisDesc = `【完美抄底】主力被套+KD低位(J<${oversoldLimit})金叉，${isAgile ? '妖股急跌反抽' : '技术面与资金面'}确立买点。`;
          isBottomSignal = true;
          score += 10;
      }
  }

  // V47.5: Bull Refueling (空中加油) Logic
  // Bull Trend + RSI Healthy Pullback + Price Stability
  // V49.0: Dynamic Trend Support
  const isBullTrend = (trendLine > lifeLine) && ((stock.currentPrice || 0) > trendLine);
  
  // V49.0: Dynamic RSI Range (Refueling Zone)
  const refuelFloor = rsiSupport;
  const refuelCeiling = rsiHigh - 5;
  const isRsiRefueling = (tech.rsi?.rsi6 || 0) > refuelFloor && (tech.rsi?.rsi6 || 0) < refuelCeiling && ((tech.rsi?.rsi6 || 0) > (tech.rsi?.rsi12 || 0));
  
  // V49.4 FIX: STRICTER REFUELING CONDITIONS
  const isPriceStable = (stock.changePercent || 0) > -2.5 && (stock.changePercent || 0) < 3.0;
  
  // V48.0: Low-level Ambush (潜伏) Logic
  // Conditions: Low relative position + Volume Contraction + Smart Money + RSI Base
  // V49.0: Ambush uses LifeLine (MA60/MA20) as baseline
  const isAmbushLowPos = (stock.currentPrice || 0) < lifeLine || (stock.changePercent || 0) < 0;
  // V49.2: Dynamic Shrinking Limit
  const isAmbushShrinking = (stock.turnoverRate || 0) < shrinkLimit;
  const isAmbushMoneyIn = isVerifiedLargeOrderInflow;
  const isAmbushRsiBuilding = (tech.rsi?.rsi6 || 0) > (tech.rsi?.rsi12 || 0) && (tech.rsi?.rsi6 || 0) > (isAgile ? 50 : 35);
  
  let isAmbush = false;
  if (isAmbushLowPos && isAmbushShrinking && isAmbushMoneyIn && isAmbushRsiBuilding && !isBottomSignal) {
      isAmbush = true;
      synthesisDesc = `【隐形伏击】股价低位缩量(换手<${shrinkLimit}%)横盘，同时供应商大单净额为正。`;
      score += 5;
  }

  // Only trigger if not already a Dragon Signal (which is stronger)
  let isRefueling = false;
  // V49.4 FIX: Added alphaScore > 0 check to prevent flickering with Risk signals
  if (isBullTrend && isRsiRefueling && isPriceStable && !isDragonSignal && !isTopSignal && !isAmbush && alphaScore > 0) {
      isRefueling = true;
      synthesisDesc = `【空中加油】${isAgile ? '强势' : '稳健'}回调确认，RSI在支撑位(${refuelFloor})获支撑。`;
      score += 5;
  }

  // 将综合研判注入到 gameState 描述中
  if (synthesisDesc) {
      gameState.desc += `\n${synthesisDesc}`;
  }

  // --- SIGNAL VISUAL MAPPER (V21.1 Strategic Unification) ---
  const getSignalVisuals = () => {
      // 0. PRE-CALCULATE AI STRATEGY (The Anchor)
      // Note: pred/summary extracted above for gameState calculation
      const probVal = Number(pred?.prediction?.probability || 0);
      const predictionDirection = pred?.prediction?.direction;
      const predictionReliability = pred?.prediction?.reliability;
      
      // v44.0: SIGNAL ENHANCEMENT (Trajectory + KDJ)
      // Refactored V46.7: Use explicit boolean flags instead of fragile string parsing
      const isTrajectoryGolden = isBottomSignal;
      const isTrajectoryDanger = isTopSignal;
      const isDragonRun = isDragonSignal;
      
      // --- V21.4: ALPHA MOMENTUM FUSION ---
      const buyPressure = localMetrics?.buyPressure || 50;
      // Alpha Momentum = 60% Independent DNA + 40% Real-time Buy Pressure
      const alphaMomentum = alphaScore * 0.6 + buyPressure * 0.4;
      
      // Rule 1: Alpha Override (The "Dragon" Exception)
      // High Alpha (>75) means the stock is acting independently of the market.
      // It can ignore "Trend Falsification" and turn it into "Deep Wash".
      const isHighAlpha = alphaMomentum > 75;

      // Rule 2: Alpha Veto (The "Zombie" Trap)
      // Low Alpha (<35) means the stock has no driver. 
      // Even if it's at the cost line ("Dancing with Dealer"), it's likely a trap.
      const isLowAlpha = alphaMomentum < 35;
      
      // V67.2: Added missing SELL keywords — '离场','撤退','天量','分歧','避险' were falling through to neutral/opportunity
      const isRiskSignal = ['出逃', 'EVAC', '止损', 'CUT', '诱多', 'TRAP', '埋人', 'BURY', '核按钮', 'NUCLEAR', '烂板', 'WEAK SEAL', '炸板', 'SMASH', 'BROKEN', '拉高出货', 'PUMP & DUMP', '空涨', 'HOLLOW', '止盈', 'PROFIT', '减仓', 'REDUCE', '伪弱转强', '诈尸', '护', 'MASK', '假主升', 'FAKE', '僵尸', 'ZOMBIE', '离场', 'ESCAPE', 'EXIT', '撤退', 'FLEE', '天量', 'VOL_TOP', '分歧', 'SPLIT', '避险', 'AVOID'].some(k => summary.includes(k));
      const isOpportunitySignal = !isRiskSignal && (summary !== '观望' && summary !== 'WAIT');
      const isHighConfidence = probVal >= 75 && predictionReliability !== 'LOW';

      // --- TIER 0: REALITY CHECK & GAME THEORY UNIFICATION ---
      // V59.2: "假主升" 必须排除在看多判定之外，否则 includes('主升') 会把它当成多头信号
      const isFakeMainWave = summary.includes('假主升') || summary.includes('FAKE') || summary.includes('僵尸') || summary.includes('ZOMBIE');
      const isBullishAI = predictionDirection === 'UP' && !isFakeMainWave && ['主升', '锁仓', '博弈', '突击', '弱转强', 'MAIN', 'LOCK', 'GAMBLE', 'ASSAULT', 'WTS'].some(k => summary.includes(k));
      const isDeepDrop = (stock.changePercent || 0) < -3;
      const isDipBuying = summary.includes('龙回头') || summary.includes('Golden Pit') || summary.includes('回马枪') || summary.includes('RETURN') || summary.includes('伏击') || summary.includes('AMBUSH');

      // --- V59.2: FAKE MAIN WAVE / ZOMBIE INTERCEPTOR (Highest Priority) ---
      // 引擎已完成仲裁并产出"假主升"或"僵尸"信号时，详情页必须无条件尊重，
      // 不得被后续的 isBullishAI / isHighConfidence 逻辑覆盖。
      if (isFakeMainWave) {
           const rawAlpha = tech.alpha || 0;
           if (summary.includes('僵尸') || summary.includes('ZOMBIE')) {
               return {
                   title: "僵尸复活 (致命陷阱)",
                   color: "bg-emerald-950 from-emerald-900 to-black border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]",
                   textColor: "text-emerald-300 font-black animate-pulse",
                   icon: <Skull className="w-8 h-8 text-emerald-400 animate-bounce" />,
                   advice: `【态势】股价呈现"回马枪"反包形态，K线看似反转确立。\n【内幕】但 Alpha 值严重背离(${rawAlpha.toFixed(1)})，上涨完全缺乏内生动能。这是一具"已死的趋势"被主力短暂拉起，用技术图形骗散户上车的最后诱多。\n【指令】这是最致命的陷阱之一！形态越漂亮越危险。严禁参与，持有者立即止损。`
               };
           }
           // 假主升 (FAKE) — 天空之城形态 + Alpha 枯竭
           return {
               title: "假主升 (灵魂离体)",
               color: "bg-red-950 from-red-900 to-black border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]",
               textColor: "text-red-300 font-black animate-pulse",
               icon: <Activity className="w-8 h-8 text-red-400 animate-pulse" />,
               advice: `【态势】形态呈现"天空之城"主升浪特征(获利盘主导、均线多头排列)。\n【内幕】致命矛盾！Alpha 严重背离(${rawAlpha.toFixed(1)})，股价上涨完全脱离真实资金驱动。这是一个没有灵魂的空壳主升浪——形态在"画"，资金在"跑"。\n【指令】立即止盈撤退！不要被漂亮的K线迷惑。一旦多头惯性耗尽，这种"假主升"坠落的速度和幅度远超想象。`
           };
      }

      // v45.0: ALPHA DIVERGENCE INTERCEPTOR (High Priority)
      // Fix for user case: "Signal Main Wave, Alpha -30.7"
      // Scenario: Signal says "Main Wave" (Up), but Alpha is Negative.
      // If Alpha Score is low (<20) OR Alpha Momentum is low (<25), trigger trap warning.
      // Even if Buy Pressure is high (manipulated), a negative Alpha Score reveals the lack of real independent trend.
      if ((isDragonRun || isBullishAI) && (alphaMomentum < 25 || alphaScore < 20) && !isDipBuying) {
           return {
              title: "无量空涨 (诱多)",
              color: "bg-purple-950 from-purple-900 to-black border-purple-600 shadow-purple-900/50",
              textColor: "text-purple-400 font-black animate-pulse",
              icon: <Activity className="w-8 h-8 text-purple-500 animate-pulse" />, 
              advice: `【态势】虽然形态看似主升，但 Alpha 动能出现严重背离(Score: ${alphaScore.toFixed(1)}, Momentum: ${alphaMomentum.toFixed(1)})。\n【内幕】典型的"空涨"格局——价格上涨缺乏核心资金支持，大概率是主力利用少量资金对倒拉高，掩护出货。\n【指令】极度危险！这是最隐蔽的诱多陷阱，千万别追，持有者建议利用假突破逢高离场。`
           };
      }

      // 1. Reality Check: AI says UP, Price says DOWN
      
      // v46.5: Main Wave Reality Check (High Priority)
      // If AI says "Main Wave" but stock is down, it's a contradiction, unless it's a very small fluctuation.
      // V47.0 FIX: 引入瞬时动能 (Instant Velocity) 豁免
      // 如果当前是弱转强节点（AI判定WTS），且瞬时动能极强（>0.1% per 15s -> ~2.5% per min），允许深水区启动。
      const isWTS = summary.includes('弱转强');
      const isStrongVelocity = (localMetrics?.instantVelocity || 0) > 0.1;
      
      if ((summary.includes('主升') || isWTS) && (stock.changePercent || 0) < -0.5) {
           // 如果是弱转强且有强劲点火动作，豁免拦截
           if (isWTS && isStrongVelocity && (stock.changePercent || 0) > -5) {
               // Pass through (Allow Signal)
           } else {
               return {
                   title: isWTS ? "弱转强 (失败)" : "主升分歧 (洗盘)",
                   color: isWTS ? "bg-slate-800 border-slate-600" : "bg-blue-950 from-blue-900 to-black border-blue-600 shadow-blue-900/50",
                   textColor: isWTS ? "text-slate-400" : "text-blue-400 font-bold",
                   icon: isWTS ? <TrendingDown className="w-8 h-8 text-slate-500" /> : <Waves className="w-8 h-8 text-blue-500 animate-pulse" />, 
                   advice: `【态势】AI模型判定为"${isWTS ? '弱转强' : '主升浪'}"，但今日股价收绿(跌${Math.abs(stock.changePercent||0).toFixed(2)}%)。\n【内幕】${isWTS ? '竞价或盘中承接不及预期，由弱转强演变为"弱更弱"。' : '这属于上涨途中的"良性分歧"，只要不破5日线，主力大概率是在清洗获利盘。'}\n【指令】${isWTS ? '放弃博弈，立即止损。' : '暂时持有，关注尾盘能否回升。若跌破5日线则减仓。'}`
               };
           }
      }

      if (isBullishAI && !isDipBuying && isDeepDrop) {
          // V21.3 UPDATE: Handle "Drop to Cost Line" (False Breakdown)
          // If price drops deep BUT hits the "Dancing with Dealer" zone, it's a Defense Test.
          if (mfProfitRatio >= TH_SAFE && mfProfitRatio <= TH_PROFIT) {
               // V45.5 UPDATE: Real-time Fleeing Veto
               // If main force is dumping (Distribute) or net outflow is huge, NO Protection.
               if (intent === 'Distribute' || (largeOrderNetYuan || 0) < -30_000_000) {
                    return {
                        title: "主力出逃 (破位)",
                        color: "bg-red-950 from-red-900 to-black border-red-800 shadow-red-900/50",
                        textColor: "text-red-400 animate-pulse",
                        icon: <TrendingDown className="w-8 h-8 text-red-500 animate-bounce" />,
                        advice: `【态势】股价跌至成本线，但资金面严重恶化。\n【证据】供应商大单净额为 ${formatCapitalFlowYuan(largeOrderNetYuan)}，盘口意图(${intent})为派发。\n【指令】支撑的有效性已下降，优先执行止损纪律。`
                    };
               }

               // V21.4 UPDATE: Alpha Veto Check
               if (isLowAlpha) {
                   return {
                      title: "弱势震荡 (织布机)",
                      color: "bg-slate-800 border-slate-600 shadow-slate-900/50",
                      textColor: "text-slate-400",
                      icon: <Ghost className="w-8 h-8 text-slate-500" />,
                      advice: `【态势】股价虽然回踩至主力成本线，但 Alpha 动能极弱(${alphaMomentum.toFixed(0)})。\n【内幕】盘面毫无生气，主力无意拉升，大概率将维持阴跌震荡。\n【指令】不要浪费时间，放弃博弈，寻找更有活力的标的。`
                  };
               }

               return {
                  title: "主力护盘 (关键位)",
                  color: "bg-indigo-950 from-indigo-900 to-black border-indigo-500 shadow-indigo-900/50",
                  textColor: "text-indigo-400 animate-pulse",
                  icon: <ShieldCheck className="w-8 h-8 text-indigo-500 animate-pulse" />,
                  advice: `【态势】股价大跌(${(stock.changePercent || 0)}%)，趋势形态受损。\n【内幕】但价格精准回踩至主力成本线(偏差${mfProfitRatio.toFixed(1)}%)。主力并未出逃，而是在构筑防线。\n【指令】密切关注缩量止跌信号。若撑住，这是胜率极高的"回马枪"买点；若放量跌穿，则立即止损。`
              };
          }
          
          // V21.4 UPDATE: Alpha Override Check
          if (isHighAlpha && (stock.changePercent || 0) > -7) { 
               return {
                  title: "妖股深水洗盘",
                  color: "bg-purple-950 from-purple-900 to-black border-purple-500 shadow-purple-900/50",
                  textColor: "text-purple-400 animate-pulse",
                  icon: <Waves className="w-8 h-8 text-purple-500 animate-pulse" />,
                  advice: `【态势】股价剧烈波动，看似破位。\n【内幕】但检测到极强的 Alpha 动能(${alphaMomentum.toFixed(0)})，这通常是妖股的"深水炸弹"洗盘手法。\n【指令】不要被恐慌盘吓跑。只要不跌停，大概率会有"地天板"或暴力反包。建议锁仓观察。`
              };
          }

          return {
              title: "趋势证伪",
              color: "bg-slate-900 from-slate-900 to-black border-orange-900 shadow-orange-900/20",
              textColor: "text-orange-500 animate-pulse",
              icon: <TrendingDown className="w-8 h-8 text-orange-500" />,
              advice: `【态势】股价大跌(${(stock.changePercent || 0)}%)，完全背离模型预期的"${summary}"形态。\n【内幕】盘面走势已证伪看多逻辑，成本线防守失败，多头主力或已反水。\n【指令】预测已失效，立即终止多头策略，执行防御性风控。`
          };
      }

      // 2. Game Theory Conflict: AI says UP, Cost says HIGH RISK
      if (isBullishAI && mfProfitRatio > TH_HIGH_RISK) {
           return {
              title: "鱼尾博弈 (高危)",
              color: "bg-red-950 from-red-900 to-black border-red-600 shadow-red-900/50",
              textColor: "text-white animate-pulse",
              icon: <Swords className="w-8 h-8 text-white animate-pulse" />,
              advice: `【态势】虽然趋势向上，但主力浮盈已达${mfProfitRatio.toFixed(1)}% (阈值${TH_HIGH_RISK.toFixed(1)}%)。\n【内幕】${stock.role === 'Leader' ? '龙头' : ''}股性已无法支撑如此高的获利盘，主力随时砸盘。\n【指令】建议"分仓止盈"：先锁定 70% 利润，仅留 3成底仓博弈最后的冲刺。一旦股价跌破 5日线，剩余仓位必须无条件清仓。`
          };
      }

      // 3. Game Theory Opportunity: AI says WAIT, Cost says TRAPPED
      if ((summary === '观望' || summary === 'WAIT') && mfProfitRatio < TH_SAFE) {
           // V45.3 FIX: Alpha Trap Filter
           // If Alpha is too low, Main Force is dead/zombie, not saving.
           if (alphaMomentum < 25) {
                return {
                   title: "阴跌不止 (主力躺平)",
                   color: "bg-slate-800 border-slate-600 shadow-slate-900/50",
                   textColor: "text-slate-400",
                   icon: <Ghost className="w-8 h-8 text-slate-500" />,
                   advice: `【态势】虽然主力被套${Math.abs(mfProfitRatio).toFixed(1)}%，但 Alpha 动能(${alphaMomentum.toFixed(1)})极度疲弱。\n【内幕】盘面缺乏承接资金，主力似乎已放弃抵抗或正在通过阴跌缓慢出局。\n【指令】不要试图去接飞刀，"主力被套"不等于"主力会救"，远离此类僵尸股。`
               };
           }

           return {
              title: "左侧伏击 (主力自救)",
              color: "bg-emerald-950 from-emerald-900 to-black border-emerald-600 shadow-emerald-900/50",
              textColor: "text-emerald-400 animate-pulse",
              icon: <Anchor className="w-8 h-8 text-emerald-500 animate-pulse" />,
              advice: `【态势】AI模型暂无明确信号，但主力被套${Math.abs(mfProfitRatio).toFixed(1)}% (深于${Math.abs(TH_SAFE).toFixed(1)}%)。\n【内幕】主力自救欲望极强，当前价格具有极高的安全边际。\n【指令】建议左侧分批埋伏，等待主力自救拉升。`
          };
      }

      // 4. Strategic Arbitration: AI says CUT, Cost says SAFE (The "Wash" Trap)
      // V21.5 Fix: Resolve conflict where AI sees technical breakdown but Chips show main force protection
      // V49.5 FIX: Priority Check - Do not show "Wash" if it's clearly "Refueling" (Bullish) to avoid flickering
      // V67.2 FIX: Do NOT override genuine trap/distribution signals — the "safe cost line" can be faked by decoy orders
      if (isRiskSignal && mfProfitRatio >= TH_SAFE && mfProfitRatio <= TH_PROFIT && !isRefueling && !isTrapSignal && !isDecoy && intent !== 'Distribute') {
           return {
              title: "极限洗盘 (错杀)",
              color: "bg-indigo-950 from-indigo-900 to-black border-indigo-500 shadow-indigo-900/50",
              textColor: "text-indigo-400 animate-pulse",
              icon: <ShieldCheck className="w-8 h-8 text-indigo-500 animate-pulse" />,
              advice: `【矛盾仲裁】AI模型因形态破位发出"${summary}"警报，但底层筹码显示股价精准回踩主力成本线(偏差${mfProfitRatio.toFixed(1)}%)。\n【内幕】这是典型的"假摔"洗盘！主力并未出逃，而是在利用技术破位清洗恐慌盘。\n【指令】否决AI止损建议！只要不有效跌穿成本线，坚决锁仓，博弈随后的"弱转强"反包。`
          };
      }

      // v44.0: NEW ARBITRATION - Strong Trend vs Weak Momentum (Aerial Refueling)
      // Logic: ADX > 40 (Strong Trend) BUT KDJ Death Cross (Short-term Correction)
      // V46.6 FIX: Must ensure PDI > MDI (Bullish Trend), otherwise ADX>40 + KDJ Dead Cross = Crash
      // V49.3 FIX: Strict Trend Check (Price > MA20/MA5) & Alpha > 0 to avoid catching falling knives
      const isTrendIntact = (stock.currentPrice || 0) > trendLine;
      if (tech.dmi?.adx > 40 && tech.dmi?.pdi > tech.dmi?.mdi && tech.kdj?.k < tech.kdj?.d && mfProfitRatio < TH_HIGH_RISK && isTrendIntact && alphaScore > 0) {
           return {
              title: "空中加油 (良性分歧)",
              color: "bg-blue-950 from-blue-900 to-black border-blue-500 shadow-blue-900/50",
              textColor: "text-blue-400 font-bold",
              icon: <Zap className="w-8 h-8 text-blue-500 animate-pulse" />,
              advice: `【矛盾仲裁】KDJ发出死叉卖讯，但DMI显示趋势依然极强(ADX=${tech.dmi.adx.toFixed(0)})。\n【内幕】这属于上涨途中的良性换手(空中加油)，而非见顶。\n【指令】忽略KDJ短线噪音，利用急跌机会做T或加仓，趋势未改。`
          };
      }

      // v44.0: NEW ARBITRATION - Good Tech vs Bad Chips (The "Receiver" Trap)
      // Logic: Technical Breakout BUT Main Force Profit is Huge (Selling into strength)
      if ((stock.changePercent || 0) > 3 && mfProfitRatio > TH_HIGH_RISK && !isLimitUp) {
           return {
              title: "拉高派发 (假突破)",
              color: "bg-purple-950 from-purple-900 to-black border-purple-500 shadow-purple-900/50",
              textColor: "text-purple-400 font-bold",
              icon: <UserMinus className="w-8 h-8 text-purple-500" />,
              advice: `【矛盾仲裁】技术面看似突破，但筹码面显示主力浮盈过大(${mfProfitRatio.toFixed(1)}%)。\n【内幕】这种"突破"往往是主力为了吸引跟风盘接货而画的图形。\n【指令】不要相信眼睛看到的K线，风险收益比极差，建议趁拉升离场。`
          };
      }

      // --- TIER 1: EXTREME RISK INTERCEPTORS (Override ALL else) ---
      
      // v44.0: Synthesized Trajectory Override (Highest Priority)
      if (isTrajectoryDanger) {
          return {
              title: "高位背离 (危险)",
              color: "bg-orange-950 from-orange-900 to-black border-orange-600 shadow-orange-900/50",
              textColor: "text-orange-400 animate-pulse",
              icon: <Activity className="w-8 h-8 text-orange-500 animate-pulse" />,
              advice: "【态势】股价惯性冲高，但KDJ动能指标已死叉向下。\n【内幕】DMI显示趋势衰竭，主力正在借势出货。这往往是阶段性顶部的特征。\n【指令】不要被盘中拉升迷惑，建议果断止盈或减仓。"
          };
      }
      
      // V47.5: Refueling Override (Opportunity)
      if (isRefueling) {
           return {
              title: "空中加油 (蓄势)",
              color: "bg-blue-950 from-blue-900 to-black border-blue-600 shadow-blue-900/50",
              textColor: "text-blue-400 font-black animate-pulse",
              icon: <Layers className="w-8 h-8 text-blue-500 animate-pulse" />,
              advice: `【态势】多头趋势(Bull)完好，RSI回踩中位后再次拐头向上。\n【内幕】主力清洗获利盘，筹码交换充分，属于典型的"空中加油"形态。\n【指令】这是趋势中继的最佳买点，建议果断介入或加仓。`
           };
      }
      
      // V48.0: Ambush Override (Opportunity)
      if (isAmbush) {
           return {
              title: "隐形伏击 (潜伏)",
              color: "bg-emerald-950 from-emerald-900 to-black border-emerald-600 shadow-emerald-900/50",
              textColor: "text-emerald-400 font-black animate-pulse",
              icon: <Ghost className="w-8 h-8 text-emerald-500 animate-pulse" />,
              advice: `【态势】股价处于相对低位，缩量横盘(Turnover<3%)。\n【内幕】监测到主力资金持续暗中吸筹(Money Flow +)，且RSI底部逐渐抬高。\n【指令】这是风险最小的左侧潜伏点，建议分批建仓，等待拉升。`
           };
      }

      // v44.0: Synthesized Dragon Override (Opportunity)
      if (isDragonRun) {
           return {
              title: "主升浪共振 (极强)",
              color: "bg-red-950 from-red-900 to-black border-red-600 shadow-red-900/50",
              textColor: "text-red-400 font-black animate-pulse",
              icon: <Flame className="w-8 h-8 text-red-500 animate-pulse" />,
              advice: `【态势】资金、趋势(DMI)、动能(KDJ)三维共振，进入最确定的主升阶段。\n【内幕】ADX=${tech.dmi?.adx.toFixed(0)}，主力完全控盘，且处于盈利加速期。\n【指令】只要均线不破，无视所有超买指标，死死拿住！`
           };
      }
      
      // v44.0: Golden Pit Override (Opportunity)
      if (isTrajectoryGolden) {
           return {
              title: "完美抄底 (共)",
              color: "bg-emerald-950 from-black to-emerald-900 border-emerald-600 shadow-emerald-900/50",
              textColor: "text-emerald-400 font-black animate-bounce",
              icon: <Anchor className="w-8 h-8 text-emerald-500 animate-bounce" />,
              advice: "【态势】主力资金深度被套，同时KDJ在低位形成金叉。\n【内幕】技术面与资金面形成'双重底'共振，主力自救欲望极强。\n【指令】这是千载难逢的确定性买点，重仓出击！"
           };
      }

      // --- TIER 1: EXTINCTION LEVEL EVENTS (Override Everything) ---
      if (isNuclear) {
          return {
              title: isSkyFloor ? "天地板" : "核按钮",
              color: "bg-black from-black to-slate-900 border-red-900 shadow-red-900/50",
              textColor: "text-red-600 animate-pulse",
              icon: <UserMinus className="w-8 h-8 text-red-600 animate-ping" />, 
              advice: "【态势】检测到极端核按钮/天地板走势，空头动能完全失控。\n【内幕】主力资金暴力出逃，买盘瞬间枯竭，技术指标彻底失效。\n【指令】立即无条件市价止损，保命第一！"
          };
      }

      // Limit Up Risks (V46.6: Promoted to Tier 1)
      let riskTolerance = 1.0;
      if (phase === 'Climax') riskTolerance = 1.2; 
      else if (phase === 'Ebb') riskTolerance = 0.8; 
      
      if (stock.role === 'Leader') riskTolerance += 0.2; 
      
      const isLateSeal = stock.notes?.includes('13:') || stock.notes?.includes('14:') || stock.notes?.includes('尾盘');
      const baseStrength = isLateSeal ? 45 : 35;

      if (isLimitUp && localMetrics) {
          const strengthThreshold = baseStrength / riskTolerance;
          const isWeakSeal = localMetrics.sealStrength < strengthThreshold || (stock.breakCount || 0) >= (riskTolerance > 1 ? 4 : 2);
          const turnoverLimit = 50 * riskTolerance; 
          const isDeathTurnover = (stock.turnoverRate || 0) > turnoverLimit;
          
          if (isWeakSeal || isDeathTurnover) {
             return {
                  title: "烂板风险",
                  color: "bg-orange-900 from-orange-900 to-black border-orange-700 shadow-orange-900/50",
                  textColor: "text-orange-400 animate-pulse",
                  icon: <TriangleAlert className="w-8 h-8 text-orange-500" />,
                  advice: `【态势】虽然封住涨停，但盘口极度不稳。\n【内幕】封板质量极差 (强度${localMetrics.sealStrength.toFixed(0)} < 阈值${strengthThreshold.toFixed(0)}) 或出现死亡换手(>${turnoverLimit.toFixed(0)}%)。\n【指令】随时可能炸板或遭遇"一日游"闷杀，AI已强制否决多头建议，建议排板出局。`
              }; 
          }
      }

      // Pump & Dump (V46.6: Promoted to Tier 1)
      if ((stock.changePercent || 0) > 5 && localMetrics) {
          const fRatio = flowRatio || 0;
          const isDiverging = fRatio < (-0.05 * riskTolerance); 
          if (isDiverging) {
               return {
                  title: "拉高出货",
                  color: "bg-purple-900 from-purple-900 to-black border-purple-700 shadow-purple-900/50",
                  textColor: "text-purple-400 animate-pulse",
                  icon: <UserMinus className="w-8 h-8 text-purple-500" />,
                  advice: `【态势】股价大幅拉升，但供应商大单净额为负。\n【证据】大单净流出占成交额 ${(Math.abs(fRatio)*100).toFixed(1)}%，与价格上涨方向背离。\n【指令】冲高回落风险较高，优先分批止盈。`
              };
          }
      }

      // Technical Divergence (V47.4: RSI/MACD Bearish Divergence)
      if (tech.rsiDivergence === 'bear' || tech.macdDivergence === 'bear') {
           return {
              title: "顶背离预警",
              color: "bg-slate-950 from-slate-900 to-black border-slate-700 shadow-slate-900/50",
              textColor: "text-slate-400 animate-pulse",
              icon: <TrendingDown className="w-8 h-8 text-slate-500" />,
              advice: `【态势】股价虽在尝试新高，但RSI/MACD动能指标出现明显顶背离。\n【内幕】上涨动能正在快速衰竭，这是典型的"诱多赶顶"形态，后续往往伴随剧烈杀跌。\n【指令】趋势即将反转，切勿追涨，建议逢高减仓锁定利润。`
          };
      }

      // T-1 Margin Risk: leverage overlay, never described as insider/main-force evidence.
      if (marginRisk.status === 'AVAILABLE' && marginRisk.riskScore >= 12) {
           return {
              title: marginRisk.signal === 'DELEVERAGING_PRESSURE' ? "去杠杆压力" : "融资拥挤风险",
              color: "bg-red-950 from-red-900 to-black border-red-800 shadow-red-900/50",
              textColor: "text-red-400 animate-pulse",
              icon: <Users className="w-8 h-8 text-red-500" />,
              advice: `【态势】${marginRisk.evidence.join('；')}。\n【证据】该数据截至${marginRisk.dataAsOf || '前一交易日'}，为T-1融资融券汇总，已按成交额归一化，风险覆盖分${marginRisk.riskScore}/20。\n【指令】降低买入权重，持仓优先检查止损与分批减仓条件；不依据单一融资因子作出决策。`
          };
      }

      // High Confidence Fraud (Decoy > 65 to avoid flickering)
      if (decoyScore > 65) {
          if (intent === 'Distribute') {
              const reason = localMetrics?.algoReason ? ` (${localMetrics.algoReason})` : '';
              return {
                  title: "托单出货 (诱多)",
                  color: "bg-red-950 from-black to-red-900 border-red-600 shadow-red-900/50",
                  textColor: "text-red-400 font-black animate-pulse",
                  icon: <UserMinus className="w-8 h-8 text-red-600 animate-ping" />,
                  advice: `【态势】盘口显示上方支撑极强，但股价滞涨。\n【内幕】检测到"托单欺诈" (系数${decoyScore.toFixed(0)})${reason}。主力在下方挂巨额买单假装支撑，实则正在通过小单密集出货。\n【指令】千万别信下方的买单，立即离场！`
              };
          }
      }

      // --- TIER 2: HIGH PROBABILITY OPPORTUNITIES (Override if AI agrees or is neutral) ---
      // V47.1 FIX: Trend Dominance Filter.
      // If stock is rising (>2%) or breaking out, DO NOT trigger "Dip Buy" (Golden Pit).
      // Golden Pit is strictly for pullbacks. Mixing them causes "Flickering".
      const isTrendDominant = (stock.changePercent || 0) > 2 || tech.dmi?.adx > 50;
      
      if (isGoldenPit && !isTrendDominant && (isOpportunitySignal || probVal < 50)) {
           return {
              title: "龙回头",
              color: "bg-amber-950 from-amber-900 to-black border-amber-600 shadow-amber-900/50",
              textColor: "text-amber-400 animate-pulse",
              icon: <Gem className="w-8 h-8 text-amber-500 animate-pulse" />,
              advice: "【态势】核心龙头缩量回调，虽然股价下跌但并未破位。\n【内幕】资金流向显示'逆势吸筹'，且板块逻辑依然硬挺。这是典型的主力洗盘动作。\n【指令】确认为'黄金坑'机会，建议左侧分批低吸。(高胜率)"
          };
      }

      if (isDragonPass && isOpportunitySignal && predictionDirection === 'UP' && predictionReliability !== 'LOW') {
           return {
              title: "钝化通行证",
              color: "bg-pink-950 from-pink-900 to-black border-pink-600 shadow-pink-900/50",
              textColor: "text-pink-400 animate-pulse font-black",
              icon: <Zap className="w-8 h-8 text-pink-500 animate-pulse" />,
              advice: "【态势】股价持续逼空，RSI进入长期超买区。\n【内幕】Alpha动能超强，资金无视一切技术背离。这是典型的'妖股模式'。\n【指令】忽略一切超买指标，卖出即卖飞。只要分时均线不破坚决锁仓！"
           };
      }

      // --- TIER 3: AI STRATEGY LOCK (If Confidence > 75%, Ignore minor technical noise) ---
      // V47.1 FIX: Prevent "Flickering" between Main Wave and Dip Buy.
      // If AI is confident in "Main Wave", we must explicitly suppressed "Dip Buy" signals 
      // derived from local cost calculation, unless there is a deep drop.
      if (isHighConfidence) {
          // Force override local "Golden Pit" if AI says "Main Wave" and price is strong
          // V59.2: 排除"假主升" — isFakeMainWave 已在上方拦截并 return，此处为防御性兜底
          if (isBullishAI && (summary.includes('主升') || summary.includes('MAIN'))) {
              // Override local visuals completely
              return {
                  title: "主升浪 (确信)",
                  color: "bg-sky-600 from-sky-600 to-sky-700 border-sky-500 shadow-sky-500/30",
                  textColor: "text-white",
                  icon: <Rocket className="w-8 h-8 text-white animate-pulse" />,
                  advice: `【态势】模型判定为"主升浪"形态，置信度高达${probVal}%。\n【内幕】${pred?.strategy || '主力资金合力做多，盘面结构稳固。'}\n【指令】AI锁仓信号生效，无视盘中关于成本线的扰动，坚定持股。`
              };
          }

          // Construct the visual based on the AI Summary for other cases
          let visuals = {
              title: summary,
              color: "bg-slate-800",
              textColor: "text-slate-200",
              icon: <Target className="w-8 h-8 text-slate-500" />,
              advice: `【态势】模型判定为"${summary}"形态，置信度高达${probVal}%。\n【内幕】${pred?.strategy || '主力资金合力做多，盘面结构稳固。'}\n【指令】${isRiskSignal ? '建议坚决执行风控。' : '建议坚定持股，无视盘中杂波。'}`
          };

          // Map AI summaries to visuals
          if (summary.includes('锁仓') || summary.includes('LOCK')) {
              visuals.color = "bg-red-600 from-red-600 to-red-700 border-red-500 shadow-red-500/30";
              visuals.textColor = "text-white";
              visuals.icon = <Shield className="w-8 h-8 text-white animate-pulse" />;
          } else if (!isFakeMainWave && (summary.includes('主升') || summary.includes('MAIN'))) {
              visuals.color = "bg-sky-600 from-sky-600 to-sky-700 border-sky-500 shadow-sky-500/30";
              visuals.textColor = "text-white";
              visuals.icon = <Rocket className="w-8 h-8 text-white animate-pulse" />;
          } else if (summary.includes('博弈') || summary.includes('GAMBLE')) {
               visuals.color = "bg-purple-900 from-purple-900 to-black border-purple-700 shadow-purple-900/50";
               visuals.textColor = "text-purple-400";
               visuals.icon = <Rocket className="w-8 h-8 text-purple-500 animate-pulse" />;
          }
          // V67.2: SELL signals in high-confidence block need danger visuals (were generic gray)
          else if (isRiskSignal) {
               visuals.color = "bg-red-950 from-red-900 to-black border-red-800 shadow-red-900/50";
               visuals.textColor = "text-red-400";
               visuals.icon = <TrendingDown className="w-8 h-8 text-red-500 animate-pulse" />;
          }

          // Inject Technical Warnings into the Advice text instead of overriding the card
          const techWarnings = [];
          
          // Check technical conditions that USED to override
          const avgVol = tech.avgVol5 || stock.volume || 1;
          if ((stock.changePercent || 0) > 5 && (stock.volume || 0) < avgVol * 0.8) techWarnings.push("盘中出现'缩量加速'迹象，需关注量能能否跟上。");
          if (tech.rsi?.rsi6 > 85 && !isDragonPass) techWarnings.push("RSI进入超买区，注意短期乖离。");
          if (decoyScore > 40 && decoyScore <= 65) techWarnings.push(`检测到轻微托单骚扰(系数${decoyScore.toFixed(0)})，主力可能有诱多意图。`);

          if (techWarnings.length > 0) {
              visuals.advice += `\n【警示】${techWarnings.join(' ')}`;
          }

          return visuals;
      }

      // --- TIER 4: TACTICAL SIGNALS (Only show if AI is not confident) ---

      // Technical Warning: Overbought
      if ((stock.changePercent || 0) > 3 && !isLimitUp) {
          const rsi6 = tech.rsi?.rsi6 || 0;
          if (rsi6 > 85) {
               return {
                  title: "严重超买",
                  color: "bg-blue-950 from-blue-900 to-black border-blue-800",
                  textColor: "text-blue-400",
                  icon: <Activity className="w-8 h-8 text-blue-500" />,
                  advice: `【态势】RSI(6)高达${rsi6.toFixed(1)}，进入极度超买区间。\n【内幕】技术指标严重钝化，多头动能边际递减。\n【指令】短期回调风险加剧，建议分仓止盈，切勿追高。`
              };
          }
          const avgVol = tech.avgVol5 || stock.volume || 1;
          if ((stock.changePercent || 0) > 5 && (stock.volume || 0) < avgVol * 0.8) {
               return {
                  title: "缩量加速",
                  color: "bg-indigo-950 from-indigo-900 to-black border-indigo-800",
                  textColor: "text-indigo-400",
                  icon: <TrendingUp className="w-8 h-8 text-indigo-500" />,
                  advice: "【态势】股价加速上涨但成交量显著萎缩(量价背离)。\n【内幕】多头动能不足，大概率为情绪惯性冲高。\n【指令】谨防随时力竭回落，建议锁定利润。"
              };
          }
      }
      
      // Decoy Accumulate (Lower priority than distribute)
      if (decoyScore > 60 && intent === 'Accumulate') {
           const reason = localMetrics?.algoReason ? ` (${localMetrics.algoReason})` : '';
           return {
              title: "压盘吸筹 (隐形多头)",
              color: "bg-emerald-950 from-black to-emerald-900 border-emerald-600 shadow-emerald-900/50",
              textColor: "text-emerald-400 font-black animate-pulse",
              icon: <Gem className="w-8 h-8 text-emerald-500 animate-bounce" />,
              advice: `【态势】盘口显示上方抛压极重，但股价并未深跌。\n【内幕】检测到"压盘吸筹" (系数${decoyScore.toFixed(0)})${reason}。主力在上方挂巨额卖单制造恐慌，实则正在暗中疯狂吸筹。\n【指令】这是股价起爆前的最后洗盘，坚决上车！`
          };
      }

      // --- TIER 5: DEFAULT AI PREDICTION (Fallback) ---
      let visuals = {
          title: `${summary} (${summary === '观望' ? '观望' : '信号'})`,
          color: "bg-slate-800 from-slate-800 to-slate-900 border-slate-700",
          textColor: "text-slate-400",
          icon: <Target className="w-8 h-8 text-slate-500" />,
          advice: pred?.strategy || "【态势】当前多空博弈焦灼。\n【内幕】主力意图不明确，无明显资金流向。\n【指令】建议空仓等待明确信号。"
      };

      if (summary.includes('锁仓') || summary.includes('LOCK')) {
          visuals.title = "锁仓";
          visuals.color = "bg-red-600 from-red-600 to-red-700 border-red-500 shadow-red-500/30";
          visuals.textColor = "text-white";
          visuals.icon = <Shield className="w-8 h-8 text-white animate-pulse" />;
      }
      else if (summary.includes('出逃') || summary.includes('EVAC')) {
          visuals.title = "出逃";
          visuals.color = "bg-red-950 from-red-900 to-black border-red-800 shadow-red-900/50";
          visuals.textColor = "text-red-500";
          visuals.icon = <TrendingDown className="w-8 h-8 text-red-600 animate-bounce" />;
      }
      else if (summary.includes('止损') || summary.includes('CUT')) {
          visuals.title = "止损";
          visuals.color = "bg-slate-900 from-slate-900 to-black border-slate-800";
          visuals.textColor = "text-emerald-500";
          visuals.icon = <TriangleAlert className="w-8 h-8 text-emerald-600" />;
      }
      else if (summary.includes('博弈') || summary.includes('GAMBLE')) {
          visuals.title = "博弈";
          visuals.color = "bg-purple-900 from-purple-900 to-black border-purple-700 shadow-purple-900/50";
          visuals.textColor = "text-purple-400";
          visuals.icon = <Rocket className="w-8 h-8 text-purple-500 animate-pulse" />;
      }
      else if (summary.includes('突击') || summary.includes('ASSAULT')) {
          visuals.title = "突击";
          visuals.color = "bg-red-600 from-red-600 to-red-700 border-red-500 shadow-red-600/30";
          visuals.textColor = "text-white";
          visuals.icon = <Zap className="w-8 h-8 text-white animate-pulse" />;
      }
      else if (summary.includes('主升') || summary.includes('MAIN')) {
          visuals.title = "主升";
          visuals.color = "bg-sky-600 from-sky-600 to-sky-700 border-sky-500 shadow-sky-500/30";
          visuals.textColor = "text-white";
          visuals.icon = <Rocket className="w-8 h-8 text-white animate-pulse" />;
      }
      else if (summary.includes('弱转强') || summary.includes('WTS')) {
          visuals.title = "弱转强";
          visuals.color = "bg-orange-600 from-orange-600 to-orange-700 border-orange-500 shadow-orange-500/30";
          visuals.textColor = "text-white";
          visuals.icon = <Zap className="w-8 h-8 text-white" />;
      }
      else if (summary.includes('回马枪') || summary.includes('RETURN')) {
          visuals.title = "回马枪";
          visuals.color = "bg-emerald-600 from-emerald-600 to-emerald-700 border-emerald-500 shadow-emerald-500/30";
          visuals.textColor = "text-white";
          visuals.icon = <Anchor className="w-8 h-8 text-white animate-bounce" />;
      }
      else if (summary.includes('伏击') || summary.includes('AMBUSH')) {
          visuals.title = "伏击";
          visuals.color = "bg-indigo-600 from-indigo-600 to-indigo-700 border-indigo-500 shadow-indigo-500/30";
          visuals.textColor = "text-white";
          visuals.icon = <Crosshair className="w-8 h-8 text-white" />;
      }
      else if (summary.includes('诱多') || summary.includes('TRAP')) {
          visuals.title = "诱多";
          visuals.color = "bg-orange-800 from-orange-800 to-orange-900 border-orange-600";
          visuals.textColor = "text-orange-200";
          visuals.icon = <Fingerprint className="w-8 h-8 text-orange-500" />;
      }
      else if (summary.includes('埋人') || summary.includes('BURY')) {
          visuals.title = "埋人";
          visuals.color = "bg-slate-950 from-slate-900 to-black border-slate-800 shadow-inner";
          visuals.textColor = "text-emerald-500";
          visuals.icon = <TrendingDown className="w-8 h-8 text-emerald-600" />;
      }
      // V67.2: Missing SELL signal visual mappings — were falling through to neutral gray
      else if (summary.includes('离场') || summary.includes('ESCAPE') || summary.includes('EXIT')) {
          visuals.title = "离场";
          visuals.color = "bg-slate-950 from-slate-900 to-black border-red-800 shadow-red-900/50";
          visuals.textColor = "text-red-500";
          visuals.icon = <TrendingDown className="w-8 h-8 text-red-600 animate-bounce" />;
      }
      else if (summary.includes('撤退') || summary.includes('FLEE')) {
          visuals.title = "撤退";
          visuals.color = "bg-red-950 from-red-900 to-black border-red-800 shadow-red-900/50";
          visuals.textColor = "text-red-400 animate-pulse";
          visuals.icon = <UserMinus className="w-8 h-8 text-red-500 animate-bounce" />;
      }
      else if (summary.includes('天量') || summary.includes('VOL_TOP')) {
          visuals.title = "天量见顶";
          visuals.color = "bg-red-950 from-red-900 to-black border-red-700 shadow-red-900/50";
          visuals.textColor = "text-red-400";
          visuals.icon = <BarChart3 className="w-8 h-8 text-red-500 animate-pulse" />;
      }
      else if (summary.includes('分歧') || summary.includes('SPLIT')) {
          visuals.title = "分歧";
          visuals.color = "bg-orange-950 from-orange-900 to-black border-orange-700 shadow-orange-900/50";
          visuals.textColor = "text-orange-400";
          visuals.icon = <Activity className="w-8 h-8 text-orange-500 animate-pulse" />;
      }
      else if (summary.includes('避险') || summary.includes('AVOID')) {
          visuals.title = "避险";
          visuals.color = "bg-slate-900 from-slate-900 to-black border-orange-800 shadow-orange-900/20";
          visuals.textColor = "text-orange-400";
          visuals.icon = <Ban className="w-8 h-8 text-orange-500" />;
      }

      // Add structure to default advice if missing
      if (!visuals.advice.includes('【态势】')) {
           visuals.advice = `【态势】${pred?.strategy || '当前走势符合模型预期。'}\n【证据】方向置信度${probVal}%，需结合数据可靠度与风险约束。\n【指令】按模型策略执行。`;
      }

      // v45.0: PRECISION TRADING POINTS CALCULATOR
      // Calculate dynamic Support/Resistance based on Game State
      let supportLine = ma5;
      let resistanceLine = tech.atrBands?.upperResistance || (current * 1.1);
      
      // Adjust based on strategy
      if (visuals.title.includes('被套') || visuals.title.includes('洗盘') || visuals.title.includes('伏击')) {
          // Defense Strategy: Support is Main Force Cost
          supportLine = estimatedMFCost;
          resistanceLine = ma20 > 0 ? ma20 : current * 1.05; // Rebound target is trend line
      } else if (visuals.title.includes('拉升') || visuals.title.includes('共舞') || visuals.title.includes('主升')) {
          // Momentum Strategy: Support is MA5
          supportLine = ma5 > 0 ? ma5 : current * 0.95;
          resistanceLine = isLimitUp ? (limitUpPrice * 1.1) : (limitUpPrice * 0.99); // Target is Limit Up
      } else if (visuals.title.includes('高位') || visuals.title.includes('鱼尾') || visuals.title.includes('出逃') || visuals.title.includes('止损')) {
          // Exit Strategy: Tight Stop
          supportLine = current * 0.97; // Trailing stop 3%
          resistanceLine = current * 1.02; // Take profit quickly
      }

      const rrRatioVal = (Math.max(0.01, resistanceLine - current)) / (Math.max(0.01, current - supportLine));
      const rrDesc = rrRatioVal > 2 ? "优秀" : (rrRatioVal > 1.2 ? "一般" : "极差");
      
      const actionFooter = `\n━━━━━━━━━━━━━━\n【操盘精算】\n🛑 铁底防守: ¥${supportLine.toFixed(2)}\n🎯 目标压力: ¥${resistanceLine.toFixed(2)}\n⚖️ 盈亏比: 1:${rrRatioVal.toFixed(1)} (${rrDesc})`;
      
      const hiddenProfitNote = isProfitHidden ? `\n⚠️ 注意：检测到主力底仓锁定，真实浮盈(${mfProfitRatio.toFixed(1)}%)远高于市场均值。` : "";

      return {
          ...visuals,
          advice: visuals.advice + hiddenProfitNote + actionFooter
      };
  };

  let signal = getSignalVisuals();
  const diagnosisRiskSignal = ['出逃', '止损', '诱多', '埋人', '核按钮', '烂板', '炸板', '拉高出货', '离场', '撤退', '天量', '避险', '风险', '陷阱']
      .some(keyword => signal.title.includes(keyword));
  const predictionSignalType = stock.aiPrediction?.signalType;
  const historicalBacktest = stock.aiPrediction?.smartEntry?.backtest;
  const isPositionManagementSignal = predictionSignalType === 'SELL' || predictionSignalType === 'HOLD';

  // Explicit engine exits must remain visible even when bullish evidence is
  // weak. Low-confidence data can veto a new BUY, but must not suppress a
  // stop-loss, take-profit, reduction, or hold-with-stop decision.
  if (predictionSignalType === 'SELL' && !diagnosisRiskSignal) {
      signal = {
          title: "卖出/减仓 (SELL)",
          color: "bg-red-950 from-red-900 to-black border-red-700 shadow-red-900/50",
          textColor: "text-red-300",
          icon: <TrendingDown className="w-8 h-8 text-red-500 animate-pulse" />,
          advice: `【态势】预测引擎已输出卖出信号，不再按买入置信门槛进行覆盖。\n【证据】${pred?.strategy || `方向为${pred?.prediction?.direction || 'DOWN'}，方向置信度${pred?.prediction?.probability || 50}%。`}\n【指令】${pred?.positionAdvice || `优先执行减仓或离场；参考卖出位${pred?.sellPoint || '按实时压力位'}。`}`
      };
  }

  signal = {
    ...signal,
    title: sanitizeAdvisoryLanguage(signal.title),
    advice: sanitizeAdvisoryLanguage(signal.advice),
  };

  if (
      shouldApplyEntryWaitGate(predictionSignalType, stock.aiPrediction?.prediction) &&
      !diagnosisRiskSignal &&
      !isPositionManagementSignal
  ) {
      const prediction = stock.aiPrediction?.prediction;
      const waitReason = getPredictionWaitReason(prediction);
      const waitCopy = {
          INSUFFICIENT_EVIDENCE: {
              title: "证据不足 (WAIT)",
              advice: `【态势】当前个股数据可靠度为${prediction?.dataReliability || 'LOW'}，市场状态为${prediction?.marketDataStatus || 'UNAVAILABLE'}。\n【证据】非重叠滚动验证样本 ${prediction?.sampleSize || 0} 笔；至少10笔且形成正期望后才允许输出买入结论。\n【指令】保持观察，不依据量价估算成本或单一资金因子开仓。`
          },
          DIRECTION_NOT_BULLISH: {
              title: "方向未转强 (WAIT)",
              advice: `【态势】当前预测方向为${prediction?.direction || 'SIDEWAYS'}，校准概率为${prediction?.probability || 50}%。\n【证据】已有 ${prediction?.sampleSize || 0} 笔非重叠滚动验证样本，但当前方向尚未满足看涨条件。\n【指令】等待方向转为UP并通过风险校准，不把“有样本”等同于“可以买入”。`
          },
          PROBABILITY_TOO_LOW: {
              title: "置信度不足 (WAIT)",
              advice: `【态势】当前方向看涨，但校准概率仅为${prediction?.probability || 50}%，低于70%的执行门槛。\n【证据】非重叠滚动验证样本 ${prediction?.sampleSize || 0} 笔，证据等级为${prediction?.evidenceReliability || 'LOW'}。\n【指令】保留观察价值，等待量价、市场环境与历史正期望共同增强。`
          },
          RELIABILITY_TOO_LOW: {
              title: "数据可靠度不足 (WAIT)",
              advice: `【态势】方向与概率已达到基础条件，但综合可靠度仍为LOW。\n【证据】个股数据${prediction?.dataReliability || 'LOW'}、市场数据${prediction?.marketDataReliability || 'LOW'}、历史样本 ${prediction?.sampleSize || 0} 笔。\n【指令】等待行情与市场宽度数据恢复，不在低可靠度状态下执行预测。`
          },
          OTHER: {
              title: "暂不满足入场条件 (WAIT)",
              advice: `【态势】当前预测尚未通过全部执行门槛。\n【证据】方向${prediction?.direction || 'SIDEWAYS'}、概率${prediction?.probability || 50}%、样本 ${prediction?.sampleSize || 0} 笔。\n【指令】继续观察，等待方向、概率和可靠度同时达标。`
          }
      }[waitReason];
      signal = {
          title: waitCopy.title,
          color: "bg-slate-900 from-slate-900 to-black border-slate-700",
          textColor: "text-slate-200",
          icon: <ShieldCheck className="w-8 h-8 text-slate-300" />,
          advice: waitCopy.advice
      };
  }
  
  // V21.5: T+1 Overnight Deduction
  // Calculate potential based on real-time metrics, with entropy fallback for missing data
  let overnight;
  try {
      overnight = calculateOvernightPotential(stock, localMetrics, phase);
  } catch (e) {
      console.error("Overnight Calc Failed", e);
  }

  // Safety fallback
  overnight = overnight || {
      score: 50,
      probability: "计算中...",
      expectedOpen: "--",
      riskType: "等待数据",
      strategy: "正在分析..."
  };

  const isSurging = (stock.changePercent || 0) > 3;
  let dynamicStopLoss = 0;
  let stopLossType = "硬性风控";
  
  if (isSurging) {
      const estimatedAvg = (current + (stock.open || current) + (stock.low || current)) / 3;
      const avgPrice = stock.avgPrice || estimatedAvg;
      const trailingLimit = high * 0.92; 
      dynamicStopLoss = Math.max(avgPrice, trailingLimit);
      stopLossType = "动态护盘";
  } else {
      const validMa5 = ma5 > 0 ? ma5 : current * 0.95;
      dynamicStopLoss = Math.max(validMa5, current * 0.95);
      stopLossType = "支撑防守";
  }

  if (Math.abs(dynamicStopLoss - current) < 0.01) {
      dynamicStopLoss = current * 0.98;
  }
  
  const distToStop = ((current - dynamicStopLoss) / current) * 100;
  const isDanger = distToStop < 1.5;

  const buyPoint = stock.aiPrediction?.buyPoint || (current * 0.98).toFixed(2);
  const sellPoint = stock.aiPrediction?.sellPoint || (current * 1.05).toFixed(2);
  const displaySellPoint = /^¥/.test(String(sellPoint))
      ? String(sellPoint)
      : /^\d+(\.\d+)?$/.test(String(sellPoint))
          ? `¥${sellPoint}`
          : String(sellPoint);
  const exitTimingCopy = predictionSignalType === 'SELL'
      ? {
          label: '优先评估退出',
          tone: 'text-red-600 bg-red-50 border-red-200',
          instruction: stock.aiPrediction?.positionAdvice || '当前可交易时段优先减仓或离场，不等待买入证据恢复。'
      }
      : predictionSignalType === 'HOLD'
          ? {
              label: '持有设防',
              tone: 'text-amber-700 bg-amber-50 border-amber-200',
              instruction: stock.aiPrediction?.positionAdvice || '触及目标位分批止盈；跌破动态防守位执行退出。'
          }
          : predictionSignalType === 'BUY'
              ? {
                  label: '入场即设',
                  tone: 'text-blue-700 bg-blue-50 border-blue-200',
                  instruction: '买入后同步设置止盈与止损条件，任一条件先触发就先执行。'
              }
              : {
                  label: '仅做风控',
                  tone: 'text-slate-600 bg-slate-50 border-slate-200',
                  instruction: '空仓继续观察；若已有持仓，止盈与止损条件仍然有效。'
              };
  const hasDivergence = stock.trapSignals?.some(s => s.type === 'VolumeDivergence' || s.type === 'Divergence');
  const gateLevel = stock.stargate?.gateLevel || 0;
  
  let conflictStrategy = null;
  if (hasDivergence && gateLevel >= 2) {
      if (gateLevel >= 3 || (stock.isLimitUp && (stock.moneyQualityScore || 0) > 65)) {
          conflictStrategy = {
              mode: 'OVERRIDE',
              title: '星门力场压制',
              desc: `当前规则等级 LV.${gateLevel}，量价趋势仍强，但背离风险不能被完全排除。`,
              action: '最终建议：维持防守位，跌破即减仓',
              style: 'bg-indigo-50 border-indigo-200 text-indigo-900',
              iconColor: 'text-indigo-600',
              icon: Shield
          };
      } else {
          conflictStrategy = {
              mode: 'CAUTION',
              title: '动能衰减预警',
              desc: `虽然处于星门通道(LV.${gateLevel})，但背离信号持续扩大且封板质量一般，存在炸板风险。`,
              action: '👉 最终决策：建议半仓止盈，保留底仓',
              style: 'bg-amber-50 border-amber-200 text-amber-900',
              iconColor: 'text-amber-600',
              icon: TriangleAlert
          };
      }
  }

  const { riskScore: smashRisk, warning: smashWarning } = predictSmashRisk(stock, phase);
  const isHighRiskFund = fundEvidence === 'DIRECT_SEAT' && smashRisk > 70;
  const closeNow = current;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="z-[110] max-w-[90vw] max-h-[90vh] overflow-y-auto no-scrollbar rounded-3xl border-slate-200 shadow-2xl p-0 bg-white">
        <DialogHeader className="sr-only">
          <DialogTitle>{stock.name} 深度诊断</DialogTitle>
          <DialogDescription>对 {stock.name} 的分析。</DialogDescription>
        </DialogHeader>
        <div className="relative min-w-0 w-full">
            <div className={cn("p-4 pr-14 sm:pr-4 md:p-6 lg:p-8 border-b flex items-center justify-between gap-3 md:gap-4 sticky top-0 bg-white z-50 shadow-sm transition-all duration-200 will-change-transform",
                isLimitUp ? "border-red-100" : "border-slate-100")}>
                <div className="flex items-center gap-2 md:gap-3 lg:gap-6 min-w-0">
                    <div className={cn("w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-xl md:rounded-2xl flex items-center justify-center text-white font-black text-lg md:text-xl lg:text-2xl shadow-xl ring-2 md:ring-4 ring-white shrink-0", 
                        isLimitUp ? "bg-red-600 shadow-red-200" : "bg-slate-900 shadow-slate-200")}>
                        {stock.name.substring(0, 1)}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3 mb-1">
                            <h2 className="text-lg md:text-xl lg:text-2xl xl:text-3xl font-black text-slate-900 tracking-tighter italic truncate">{stock.name}</h2>
                            <span className="text-[10px] md:text-xs lg:text-sm font-mono font-bold text-slate-400 bg-slate-50 px-1.5 md:px-2 py-0.5 rounded-md border border-slate-100 shrink-0">{stock.code}</span>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3 flex-wrap">
                            <Badge variant="outline" className="text-[8px] md:text-[9px] lg:text-[10px] font-black uppercase tracking-widest border-slate-200 text-slate-500">{stock.concept || '核心概念'}</Badge>
                            <Badge className={cn("text-[8px] md:text-[9px] lg:text-[10px] font-black uppercase tracking-widest border-none", 
                                stock.role === "Leader" ? "bg-red-600 text-white shadow-sm shadow-red-200" :
                                stock.role === "Vice" ? "bg-orange-500 text-white shadow-sm shadow-orange-200" :
                                stock.role === "Substitute" ? "bg-blue-600 text-white shadow-sm shadow-blue-200" :
                                "bg-slate-100 text-slate-500")}>
                                {stock.role === "Leader" ? "核心龙头" : stock.role === "Vice" ? "强力副龙" : stock.role === "Substitute" ? "中位补涨" : stock.role}
                            </Badge>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 shrink-0">
                    <div className="hidden text-right sm:block">
                        <div className={cn("text-xl md:text-2xl lg:text-3xl xl:text-4xl font-black font-mono tracking-tighter leading-none mb-1",
                            (stock.changePercent || 0) >= 0 ? "text-red-600" : "text-green-600")}>
                            {(stock.changePercent || 0) > 0 ? "+" : ""}{stock.changePercent}%
                        </div>
                        <div className="text-[9px] md:text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">¥{current.toFixed(2)}</div>
                    </div>
                    <DialogClose asChild>
                        <button
                            type="button"
                            aria-label="关闭龙头详情"
                            title="关闭"
                            className="absolute right-3 top-3 flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 sm:static"
                        >
                            <X className="size-5" aria-hidden="true" />
                        </button>
                    </DialogClose>
                </div>
            </div>

            <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 lg:space-y-10">
                <div className={cn("rounded-3xl p-1 shadow-2xl bg-gradient-to-br border mb-6", signal.color)}>
                    <div className="bg-white/5 rounded-[20px] p-4 md:p-6 backdrop-blur-sm">
                        <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:gap-8">
                            <div className="flex shrink-0 flex-col items-center gap-2 self-center">
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/10 flex items-center justify-center shadow-inner border border-white/20">
                                    {signal.icon}
                                </div>
                                <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Signal</span>
                            </div>
                            <div className="w-full min-w-0 flex-1 space-y-3 text-center md:text-left">
                                <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-2 md:gap-4">
                                    <h4 className={cn("break-words text-xl font-black italic tracking-tighter uppercase drop-shadow-md md:text-2xl lg:text-3xl", signal.textColor)}>{signal.title}</h4>
                                    <Badge variant="outline" className="text-white/80 border-white/20 bg-white/10 backdrop-blur-md text-[10px]">
                                      规则信心 {stock.aiPrediction?.prediction?.probability || 50}%
                                      {stock.aiPrediction?.prediction?.confidenceLow !== undefined &&
                                        stock.aiPrediction?.prediction?.confidenceHigh !== undefined &&
                                        ` · 参考区间 ${stock.aiPrediction.prediction.confidenceLow}-${stock.aiPrediction.prediction.confidenceHigh}%`}
                                    </Badge>
                                </div>
                                
                                {signal.advice.includes('【态势】') ? (
                                    <div className="space-y-2 mt-1">
                                        {signal.advice.split('\n').filter(Boolean).map((line, idx) => {
                                            const [label, content] = line.split('】');
                                            if (!content) return null;
                                            const cleanLabel = label.replace('【', '');
                                            return (
                                                <div key={idx} className="flex min-w-0 items-start gap-2 text-xs md:text-sm">
                                                    <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border",
                                                        cleanLabel === '态势' ? "bg-blue-500/20 text-blue-200 border-blue-500/30" :
                                                        cleanLabel === '依据' ? "bg-purple-500/20 text-purple-200 border-purple-500/30" :
                                                        "bg-emerald-500/20 text-emerald-200 border-emerald-500/30"
                                                    )}>{cleanLabel}</span>
                                                    <span className="min-w-0 break-words text-white/90 leading-relaxed font-medium pt-0.5">{content}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-xs md:text-sm font-medium text-white/90 leading-relaxed opacity-90 whitespace-pre-line bg-black/20 p-3 rounded-lg border border-white/5">{signal.advice}</div>
                                )}
                            </div>
                            <div className="flex w-full shrink-0 flex-row gap-2 md:w-auto md:flex-col md:gap-3">
                                 {(() => {
                                    const se = (stock.aiPrediction as any)?.smartEntry;
                                    if (se && se.urgency !== 'NO_ENTRY' && se.primary > 0) {
                                        return (
                                            <div className="flex-1 p-2 md:p-3 rounded-xl bg-white/10 border border-white/10 backdrop-blur-md text-center">
                                                <span className="text-[9px] font-black text-white/50 uppercase block mb-1">
                                                    {se.urgency === 'NOW' ? '立即介入' : '条件单价'}
                                                </span>
                                                <span className="text-base md:text-lg font-mono font-black text-white">¥{se.primary.toFixed(2)}</span>
                                                <span className="text-[8px] font-bold text-white/30 block mt-0.5">{se.method?.split('，')[0]}</span>
                                            </div>
                                        );
                                    }
                                    return null;
                                 })()}
                                 <div className={cn("flex-1 p-2 md:p-3 rounded-xl border backdrop-blur-md text-center transition-all", 
                                     isDanger ? "bg-red-900/40 border-red-500/50 animate-pulse" : "bg-white/10 border-white/10")}>
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <span className="text-[9px] font-black text-white/50 uppercase block">{stopLossType}</span>
                                    </div>
                                    <span className={cn("text-base md:text-lg font-mono font-black", isDanger ? "text-red-400" : "text-white/60")}>¥{dynamicStopLoss.toFixed(2)}</span>
                                 </div>
                            </div>
                        </div>
                    </div>
                </div>

                {stock.factorScore !== undefined && (
                    <div className="rounded-3xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm md:p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <BarChart3 className="size-4 text-indigo-600" />
                                    <h3 className="text-sm font-black tracking-wider text-slate-800">量化因子截面</h3>
                                    <Badge variant="outline" className="border-indigo-200 bg-white text-[9px] font-black text-indigo-700">
                                        {stock.factorRegime || 'UNKNOWN'}
                                    </Badge>
                                </div>
                                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                                    同一批 A 股标的内的分位数排序；覆盖率不足时只作辅助，不等同于主力身份判断。
                                </p>
                            </div>
                            <div className="text-left sm:text-right">
                                <div className="font-mono text-2xl font-black text-indigo-700">{stock.factorScore.toFixed(0)}</div>
                                <div className="text-[9px] font-bold text-slate-500">综合因子 · 覆盖 {(stock.factorCoverage || 0) * 100 >= 1 ? `${((stock.factorCoverage || 0) * 100).toFixed(0)}%` : '不足'}</div>
                            </div>
                        </div>
                        {Object.keys(stock.factorBreakdown || {}).length > 0 && (
                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {(Object.entries(stock.factorBreakdown || {}) as [string, number][]).map(([key, value]) => (
                                    <div key={key} className="rounded-xl border border-indigo-100 bg-white/80 p-2.5">
                                        <div className="flex items-center justify-between gap-2 text-[10px] font-black text-slate-600">
                                            <span>{ASHARE_FACTOR_LABELS[key as AShareFactorName] || key}</span>
                                            <span className="font-mono text-indigo-700">{value.toFixed(0)}</span>
                                        </div>
                                        <Progress value={value} className="mt-1 h-1 bg-indigo-100" indicatorClassName="bg-indigo-500" />
                                    </div>
                                ))}
                            </div>
                        )}
                        {stock.factorWarnings?.length ? (
                            <div className="mt-3 text-[10px] leading-4 text-amber-700">提示：{stock.factorWarnings.join('；')}</div>
                        ) : null}
                    </div>
                )}

                <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
                        <div className="flex items-center gap-2">
                            <TrendingDown className="size-5 text-red-600" />
                            <h3 className="text-sm font-black tracking-wider text-slate-800">卖出 / 风控计划</h3>
                        </div>
                        <Badge variant="outline" className={cn("w-fit text-[10px] font-black", exitTimingCopy.tone)}>
                            {exitTimingCopy.label}
                        </Badge>
                    </div>
                    <div className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_2fr] md:p-6">
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                            <div className="text-[10px] font-black tracking-wider text-emerald-700">止盈 / 卖出参考</div>
                            <div className="mt-1 font-mono text-lg font-black text-emerald-800">{displaySellPoint}</div>
                        </div>
                        <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3">
                            <div className="text-[10px] font-black tracking-wider text-red-700">动态防守线</div>
                            <div className="mt-1 font-mono text-lg font-black text-red-800">¥{dynamicStopLoss.toFixed(2)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-[10px] font-black tracking-wider text-slate-500">执行时机</div>
                            <div className="mt-1 text-sm font-semibold leading-6 text-slate-700">{exitTimingCopy.instruction}</div>
                        </div>
                    </div>
                    {historicalBacktest?.direction === 'EXIT' && (
                        <div className="border-t border-slate-100 px-4 py-3 md:px-6">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <div className="text-[10px] font-black tracking-wider text-slate-500">卖出历史代理 · 继续持有对照</div>
                                    <div className="mt-1 text-xs font-semibold text-slate-700">
                                        5日有效样本 {historicalBacktest.sampleSize} 笔，规避下跌命中 {historicalBacktest.winRate.toFixed(1)}%，
                                        持有差值 {historicalBacktest.expectancy > 0 ? '+' : ''}{historicalBacktest.expectancy.toFixed(2)}%
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
                                    {historicalBacktest.horizonEvidence?.map(item => (
                                        <span key={item.horizonDays}>
                                            {item.horizonDays}日 {item.winRate.toFixed(0)}%
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-2 text-[9px] leading-4 text-slate-400">
                                历史状态代理直接样本 {historicalBacktest.exactRegimeSampleSize || 0}/{historicalBacktest.totalSampleSize || 0}；
                                近120日权重占比 {historicalBacktest.recentSampleShare?.toFixed(0) || 0}%。正值表示卖出相对继续持有减少了后续损失，并不代表可做空收益。
                            </div>
                        </div>
                    )}
                </div>

                {/* V60.0: Smart Entry - 条件单建议 */}
                {(() => {
                    const se = (stock.aiPrediction as any)?.smartEntry;
                    if (!se || se.urgency === 'NO_ENTRY') return null;
                    
                    const urgencyConfig: Record<string, { label: string; color: string; bg: string }> = {
                        'NOW': { label: '立即介入', color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
                        'WAIT_DIP': { label: '回踩挂单', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
                        'WAIT_BREAK': { label: '突破追单', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
                        'NEXT_DAY': { label: '次日竞价', color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200' },
                    };
                    const uc = urgencyConfig[se.urgency] || urgencyConfig['WAIT_DIP'];
                    const rrColor = se.rrRatio >= 2.5 ? 'text-red-600' : se.rrRatio >= 1.5 ? 'text-orange-600' : se.rrRatio >= 1.0 ? 'text-blue-600' : 'text-slate-400';
                    const rrLabel = se.rrRatio >= 2.5 ? '优秀' : se.rrRatio >= 1.5 ? '良好' : se.rrRatio >= 1.0 ? '一般' : '较差';
                    
                    const handleCopy = () => {
                        const text = [
                            `${stock.name}(${stock.code}) 条件单建议`,
                            `━━━━━━━━━━━━━━`,
                            `介入方式: ${se.method}`,
                            `主买点: ¥${se.primary.toFixed(2)} (${se.primaryLabel})`,
                            se.scaleIn > 0 ? `加仓位: ¥${se.scaleIn.toFixed(2)} (${se.scaleInLabel})` : null,
                            `止损位: ¥${se.stopLoss.toFixed(2)} (${se.stopLossLabel})`,
                            `目标价: ¥${se.target.toFixed(2)} (${se.targetLabel})`,
                            `盈亏比: 1:${se.rrRatio.toFixed(1)}`,
                            se.backtest ? `━━ 历史回测(${se.backtest.sampleSize}笔) ━━` : null,
                            se.backtest ? `滚动代理命中: ${se.backtest.winRate.toFixed(1)}% | 期望: ${se.backtest.expectancy > 0 ? '+' : ''}${se.backtest.expectancy.toFixed(2)}%` : null,
                            se.backtest ? `盈亏因子: ${se.backtest.profitFactor.toFixed(2)} | 最优止损: ${se.backtest.optimalStopMult.toFixed(1)}×ATR` : null,
                            se.chipPeaks?.supportPeaks.length ? `━━ 筹码峰(集中度${se.chipPeaks.chipConcentration.toFixed(0)}%) ━━` : null,
                            ...(se.chipPeaks?.supportPeaks.map(p => `支撑: ¥${p.price.toFixed(2)} (${p.label})`) || []),
                            ...(se.chipPeaks?.resistancePeaks.map(p => `阻力: ¥${p.price.toFixed(2)} (${p.label})`) || []),
                        ].filter(Boolean).join('\n');
                        navigator.clipboard.writeText(text).catch(() => {});
                    };
                    
                    return (
                        <div className="rounded-3xl border border-slate-200 bg-white shadow-lg overflow-hidden mb-6">
                            <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Crosshair className="w-5 h-5 text-red-600" />
                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">条件单建议 (SMART ENTRY)</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge className={cn("text-[10px] font-black uppercase border", uc.bg, uc.color)}>
                                        {uc.label}
                                    </Badge>
                                    <button 
                                        onClick={handleCopy}
                                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                                        title="复制条件单"
                                    >
                                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="p-4 md:p-6">
                                {/* 介入方式 */}
                                <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">介入策略</div>
                                    <div className="text-sm font-bold text-slate-800">{se.method}</div>
                                </div>
                                
                                {/* 四个关键价位 */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                    {/* 主买点 */}
                                    <div className="p-3 rounded-xl bg-red-50 border border-red-100 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-8 h-8 bg-red-100 rounded-bl-2xl flex items-center justify-center">
                                            <ArrowDownToLine className="w-3.5 h-3.5 text-red-500" />
                                        </div>
                                        <div className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">主买点</div>
                                        <div className="text-lg md:text-xl font-black font-mono text-red-600 tracking-tight">
                                            ¥{se.primary.toFixed(2)}
                                        </div>
                                        <div className="text-[9px] font-medium text-red-400/80 mt-1 leading-tight truncate" title={se.primaryLabel}>
                                            {se.primaryLabel}
                                        </div>
                                        {current > 0 && (
                                            <div className="text-[9px] font-mono font-bold text-red-500/60 mt-0.5">
                                                距现价 {((se.primary - current) / current * 100).toFixed(1)}%
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* 加仓位 */}
                                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-8 h-8 bg-blue-100 rounded-bl-2xl flex items-center justify-center">
                                            <Layers className="w-3.5 h-3.5 text-blue-500" />
                                        </div>
                                        <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">加仓位</div>
                                        <div className="text-lg md:text-xl font-black font-mono text-blue-600 tracking-tight">
                                            {se.scaleIn > 0 ? `¥${se.scaleIn.toFixed(2)}` : '--'}
                                        </div>
                                        <div className="text-[9px] font-medium text-blue-400/80 mt-1 leading-tight truncate" title={se.scaleInLabel}>
                                            {se.scaleInLabel}
                                        </div>
                                        {current > 0 && se.scaleIn > 0 && (
                                            <div className="text-[9px] font-mono font-bold text-blue-500/60 mt-0.5">
                                                距现价 {((se.scaleIn - current) / current * 100).toFixed(1)}%
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* 止损位 */}
                                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-100 rounded-bl-2xl flex items-center justify-center">
                                            <Shield className="w-3.5 h-3.5 text-emerald-500" />
                                        </div>
                                        <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">止损位</div>
                                        <div className="text-lg md:text-xl font-black font-mono text-emerald-600 tracking-tight">
                                            ¥{se.stopLoss.toFixed(2)}
                                        </div>
                                        <div className="text-[9px] font-medium text-emerald-400/80 mt-1 leading-tight truncate" title={se.stopLossLabel}>
                                            {se.stopLossLabel}
                                        </div>
                                        {current > 0 && (
                                            <div className="text-[9px] font-mono font-bold text-emerald-500/60 mt-0.5">
                                                距现价 {((se.stopLoss - current) / current * 100).toFixed(1)}%
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* 目标价 */}
                                    <div className="p-3 rounded-xl bg-orange-50 border border-orange-100 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-8 h-8 bg-orange-100 rounded-bl-2xl flex items-center justify-center">
                                            <Target className="w-3.5 h-3.5 text-orange-500" />
                                        </div>
                                        <div className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-1">目标价</div>
                                        <div className="text-lg md:text-xl font-black font-mono text-orange-600 tracking-tight">
                                            ¥{se.target.toFixed(2)}
                                        </div>
                                        <div className="text-[9px] font-medium text-orange-400/80 mt-1 leading-tight truncate" title={se.targetLabel}>
                                            {se.targetLabel}
                                        </div>
                                        {current > 0 && (
                                            <div className="text-[9px] font-mono font-bold text-orange-500/60 mt-0.5">
                                                距现价 +{((se.target - current) / current * 100).toFixed(1)}%
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {/* 盈亏比可视化 */}
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className="flex items-center gap-2 shrink-0">
                                        <CircleDot className="w-4 h-4 text-slate-400" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">盈亏比</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="relative h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                            {/* Risk portion (red) */}
                                            <div 
                                                className="absolute left-0 top-0 bottom-0 bg-emerald-400 rounded-l-full"
                                                style={{ width: `${Math.min(50, 50 / (1 + se.rrRatio))}%` }}
                                            />
                                            {/* Reward portion (green) */}
                                            <div 
                                                className="absolute right-0 top-0 bottom-0 bg-red-400 rounded-r-full"
                                                style={{ width: `${Math.min(50, 50 * se.rrRatio / (1 + se.rrRatio))}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[8px] font-bold text-emerald-500">风险</span>
                                            <span className="text-[8px] font-bold text-red-500">收益</span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className={cn("text-lg font-black font-mono", rrColor)}>
                                            1:{se.rrRatio.toFixed(1)}
                                        </div>
                                        <div className={cn("text-[9px] font-black", rrColor)}>{rrLabel}</div>
                                    </div>
                                </div>
                                
                                {/* V60.1: 决策因子摘要 */}
                                {(() => {
                                    const factors: { icon: string; text: string; color: string }[] = [];
                                    if (se.primaryLabel?.includes('缩量确认')) factors.push({ icon: '🔇', text: '缩量支撑(可信度↑)', color: 'text-emerald-600' });
                                    else if (se.primaryLabel?.includes('放量存疑')) factors.push({ icon: '⚠️', text: '放量支撑(可信度↓)', color: 'text-amber-600' });
                                    if (se.method?.includes('放量下杀')) factors.push({ icon: '📊', text: '放量下杀·等企稳', color: 'text-amber-600' });
                                    if (se.primaryLabel?.includes('跳空缺口') || se.scaleInLabel?.includes('跳空缺口')) factors.push({ icon: '📐', text: '跳空缺口支撑(强)', color: 'text-blue-600' });
                                    if (se.targetLabel?.includes('缺口压制')) factors.push({ icon: '🚧', text: '向下缺口压制目标', color: 'text-amber-600' });
                                    if (se.stopLossLabel?.includes('紧凑止损')) factors.push({ icon: '🎯', text: '规则型窄止损模式', color: 'text-emerald-600' });
                                    else if (se.stopLossLabel?.includes('极宽止损')) factors.push({ icon: '🛡️', text: '背离型宽止损模式', color: 'text-blue-600' });
                                    else if (se.stopLossLabel?.includes('宽幅止损')) factors.push({ icon: '📏', text: '左侧宽幅止损模式', color: 'text-blue-600' });
                                    if (se.stopLossLabel?.includes('风险修正')) factors.push({ icon: '💰', text: '高砸盘风险·止损放宽', color: 'text-amber-600' });
                                    if (se.primaryLabel?.includes('防御修正')) factors.push({ icon: '🏛️', text: '机构股·保守买点', color: 'text-blue-600' });
                                    if (se.primaryLabel?.includes('激进修正')) factors.push({ icon: '⚡', text: '游资股·激进买点', color: 'text-red-600' });
                                    if (se.method?.includes('大盘风险')) factors.push({ icon: '❄️', text: '大盘冰点·降级紧迫度', color: 'text-blue-600' });
                                    if (se.method?.includes('盈亏比')) factors.push({ icon: '⚖️', text: 'R/R偏低·等更佳位置', color: 'text-amber-600' });
                                    
                                    // V60.2: 新增筹码峰和回测因子
                                    if (se.primaryLabel?.includes('筹码峰') || se.scaleInLabel?.includes('筹码峰')) factors.push({ icon: '🏔️', text: '筹码密集峰支撑', color: 'text-purple-600' });
                                    if (se.targetLabel?.includes('筹码峰')) factors.push({ icon: '🏔️', text: '筹码峰阻力压制', color: 'text-amber-600' });
                                    if (se.method?.includes('筹码密集区')) factors.push({ icon: '📊', text: '筹码密集区·等突破', color: 'text-amber-600' });
                                    if (se.stopLossLabel?.includes('滚动代理止损')) factors.push({ icon: '📈', text: `滚动历史代理止损`, color: 'text-purple-600' });
                                    if (se.method?.includes('历史负期望')) factors.push({ icon: '⚠️', text: '历史负期望信号', color: 'text-red-600' });
                                    
                                    if (factors.length === 0) return null;
                                    return (
                                        <div className="mt-3 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100/50">
                                            <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">决策因子 V60.2</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {factors.map((f, i) => (
                                                    <span key={i} className={cn("inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/80 border border-indigo-100/50 shadow-sm", f.color)}>
                                                        <span>{f.icon}</span> {f.text}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                                
                                {/* V60.2: 历史回测统计面板 */}
                                {se.backtest && se.backtest.sampleSize >= 10 && (
                                    <div className="mt-3 p-3 rounded-xl bg-purple-50/60 border border-purple-100/50">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-[9px] font-black text-purple-400 uppercase tracking-widest">分层样本外代理 ({se.backtest.sampleSize}笔)</div>
                                            <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full",
                                                se.backtest.winRate >= 60 ? "bg-emerald-100 text-emerald-700" :
                                                se.backtest.winRate >= 45 ? "bg-amber-100 text-amber-700" :
                                                "bg-red-100 text-red-700"
                                            )}>
                                                滚动代理命中 {se.backtest.winRate.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="p-2 rounded-lg bg-white/70 text-center">
                                                <div className="text-[8px] font-bold text-slate-400">平均盈利</div>
                                                <div className="text-sm font-black text-red-600 font-mono">+{se.backtest.avgWinPct.toFixed(1)}%</div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-white/70 text-center">
                                                <div className="text-[8px] font-bold text-slate-400">平均亏损</div>
                                                <div className="text-sm font-black text-emerald-600 font-mono">-{se.backtest.avgLossPct.toFixed(1)}%</div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-white/70 text-center">
                                                <div className="text-[8px] font-bold text-slate-400">期望值</div>
                                                <div className={cn("text-sm font-black font-mono", se.backtest.expectancy > 0 ? "text-red-600" : "text-emerald-600")}>
                                                    {se.backtest.expectancy > 0 ? '+' : ''}{se.backtest.expectancy.toFixed(2)}%
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-center gap-3">
                                            {/* 胜率进度条 */}
                                            <div className="flex-1 relative h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div className="absolute left-0 top-0 bottom-0 bg-red-400 rounded-l-full" style={{ width: `${Math.min(100, se.backtest.winRate)}%` }} />
                                            </div>
                                            <div className="shrink-0 flex items-center gap-2">
                                                <div className="text-[8px] font-bold text-slate-400">
                                                    盈亏因子 <span className={cn("font-mono", se.backtest.profitFactor >= 1.5 ? "text-red-600" : se.backtest.profitFactor >= 1 ? "text-amber-600" : "text-emerald-600")}>{se.backtest.profitFactor.toFixed(2)}</span>
                                                </div>
                                                <div className="text-[8px] font-bold text-slate-400">
                                                    最优止损 <span className="text-purple-600 font-mono">{se.backtest.optimalStopMult.toFixed(1)}×ATR</span>
                                                </div>
                                            </div>
                                        </div>
                                        {se.backtest.validationType === 'REGIME_WEIGHTED_WALK_FORWARD' && (
                                            <div className="mt-2 text-[8px] leading-4 text-purple-500/80">
                                                历史状态代理 {se.backtest.exactRegimeSampleSize || 0} 笔 · 个股 {se.backtest.ownStockSampleSize || 0} · 同题材 {se.backtest.sectorSampleSize || 0} · 候选池 {se.backtest.poolSampleSize || 0} · 近120日权重 {se.backtest.recentSampleShare?.toFixed(0) || 0}%
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {/* V60.2: 筹码峰分布面板 */}
                                {se.chipPeaks && (se.chipPeaks.supportPeaks.length > 0 || se.chipPeaks.resistancePeaks.length > 0) && (
                                    <div className="mt-3 p-3 rounded-xl bg-violet-50/60 border border-violet-100/50">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-[9px] font-black text-violet-400 uppercase tracking-widest">筹码峰分布</div>
                                            <span className="text-[10px] font-bold text-violet-500 px-2 py-0.5 rounded-full bg-violet-100">
                                                集中度 {se.chipPeaks.chipConcentration.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="space-y-1.5">
                                            {/* 阻力峰 (上方) */}
                                            {se.chipPeaks.resistancePeaks.map((peak, i) => (
                                                <div key={`r-${i}`} className="flex items-center gap-2">
                                                    <div className="w-12 text-[8px] font-bold text-amber-500 text-right shrink-0">阻力R{i+1}</div>
                                                    <div className="flex-1 relative h-3 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="absolute right-0 top-0 bottom-0 bg-amber-300/70 rounded-r-full" style={{ width: `${Math.min(100, peak.strength)}%` }} />
                                                    </div>
                                                    <div className="w-16 text-right text-[9px] font-black font-mono text-amber-600">¥{peak.price.toFixed(2)}</div>
                                                    <div className="w-8 text-[8px] font-bold text-amber-400">{peak.strength.toFixed(0)}%</div>
                                                </div>
                                            ))}
                                            {/* 现价标记 */}
                                            <div className="flex items-center gap-2 py-0.5">
                                                <div className="w-12 text-[8px] font-bold text-slate-500 text-right shrink-0">现价</div>
                                                <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                                                <div className="w-16 text-right text-[9px] font-black font-mono text-slate-800">¥{(stock.currentPrice || 0).toFixed(2)}</div>
                                                <div className="w-8" />
                                            </div>
                                            {/* 支撑峰 (下方) */}
                                            {se.chipPeaks.supportPeaks.map((peak, i) => (
                                                <div key={`s-${i}`} className="flex items-center gap-2">
                                                    <div className="w-12 text-[8px] font-bold text-blue-500 text-right shrink-0">支撑S{i+1}</div>
                                                    <div className="flex-1 relative h-3 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="absolute left-0 top-0 bottom-0 bg-blue-300/70 rounded-l-full" style={{ width: `${Math.min(100, peak.strength)}%` }} />
                                                    </div>
                                                    <div className="w-16 text-right text-[9px] font-black font-mono text-blue-600">¥{peak.price.toFixed(2)}</div>
                                                    <div className="w-8 text-[8px] font-bold text-blue-400">{peak.strength.toFixed(0)}%</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* V61.0: Board Tier Strategy Card */}
                {(() => {
                    const bt = (stock.aiPrediction as any)?.boardTier;
                    if (!bt || bt.tier === 'NONE') return null;
                    
                    const tierConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
                        'FIRST':        { label: '首板', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: '1️⃣' },
                        'SECOND':       { label: '2板·分歧', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: '2️⃣' },
                        'THIRD':        { label: '3板·确认', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: '3️⃣' },
                        'DRAGON_HIGH':  { label: `${bt.boardHeight}板·空间`, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: '🐉' },
                        'POST_BREAK':   { label: `断板(${bt.priorBoardHeight}板后)`, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-300', icon: '⚡' },
                    };
                    const tc = tierConfig[bt.tier] || tierConfig['FIRST'];
                    
                    return (
                        <div className="rounded-3xl border-2 border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 shadow-lg overflow-hidden mb-6">
                            <div className="px-6 py-4 border-b border-indigo-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-indigo-600" />
                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">连板梯队策略 (BOARD TIER V61)</h3>
                                </div>
                                <Badge variant="outline" className={cn("font-black text-base px-3 py-1", tc.color, tc.bg)}>
                                    {tc.icon} {tc.label}
                                </Badge>
                            </div>
                            <div className="p-6 space-y-4">
                                {/* T+1 Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="rounded-2xl bg-white border border-slate-100 p-4 space-y-1">
                                        <div className="text-xs font-bold text-slate-400 uppercase">明日开盘预期</div>
                                        <div className="text-lg font-black text-slate-800">{bt.t1Opening}</div>
                                    </div>
                                    <div className="rounded-2xl bg-white border border-slate-100 p-4 space-y-1">
                                        <div className="text-xs font-bold text-slate-400 uppercase">T+1 剧本</div>
                                        <div className="text-lg font-black text-indigo-700">{bt.t1Script}</div>
                                    </div>
                                    <div className="rounded-2xl bg-white border border-slate-100 p-4 space-y-1">
                                        <div className="text-xs font-bold text-slate-400 uppercase">量能特征</div>
                                        <div className="text-lg font-black text-slate-800">
                                            {bt.yesterdayVolShrink ? '🔇 昨日缩量(一致性强)' : bt.yesterdayVolHeavy ? '🔊 昨日天量(分歧/出货)' : '📊 量能正常'}
                                        </div>
                                    </div>
                                </div>
                                {/* Action Plan */}
                                <div className="rounded-2xl bg-indigo-900 text-white p-4">
                                    <div className="text-xs font-bold text-indigo-300 uppercase mb-2">📋 操作指令</div>
                                    <div className="text-sm font-bold leading-relaxed">{bt.t1Action}</div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* V21.5: T+1 Overnight Deduction Engine */}
                <div className="rounded-3xl border border-slate-100 bg-white shadow-lg overflow-hidden mb-6">
                    <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-indigo-600" />
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">T+1 隔日规则推演</h3>
                        </div>
                        <Badge variant="outline" className={cn("font-bold border-indigo-200 text-indigo-700 bg-indigo-50")}>
                            {overnight.riskType}
                        </Badge>
                    </div>
                    <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="space-y-1">
                            <div className="text-xs font-bold text-slate-400">接力评分</div>
                            <div className="text-2xl font-black font-mono text-slate-800 flex items-baseline gap-1">
                                {overnight.score}
                                <span className="text-xs font-bold text-slate-400">/100</span>
                            </div>
                            <Progress value={overnight.score} className="h-1.5 bg-slate-100" indicatorClassName={overnight.score >= 80 ? "bg-red-500" : overnight.score >= 60 ? "bg-orange-500" : "bg-blue-500"} />
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs font-bold text-slate-400">晋级等级</div>
                            <div className={cn("text-xl md:text-2xl font-black", overnight.score >= 70 ? "text-red-600" : "text-slate-700")}>
                                {overnight.probability}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">规则评分，非统计概率</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs font-bold text-slate-400">预期开盘</div>
                            <div className="text-xl md:text-2xl font-black font-mono text-slate-800">{overnight.expectedOpen}</div>
                            <div className="text-[10px] text-slate-400 font-medium">基于量价规则推演</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs font-bold text-slate-400">核心指令</div>
                            <div className="text-sm font-bold text-indigo-700 leading-tight">{overnight.strategy}</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-100 bg-white shadow-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Swords className="w-5 h-5 text-slate-800" />
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">量价成本结构 (ESTIMATE)</h3>
                        </div>
                        <Badge variant="secondary" className={cn("font-bold", gameState.color, gameState.bg)}>
                            {gameState.status}
                        </Badge>
                    </div>
                    <div className="p-6">
                         <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-amber-800">
                           本区成本与持仓状态来自量价模型估算，并非机构持仓数据；供应商大单净额单独展示，不能用于识别具体参与者。
                         </div>
                         <div className="flex flex-col md:flex-row gap-8 items-center">
                             <div className="flex-1 w-full space-y-6">
                                 <div className="flex items-end justify-between">
                                     <div>
                                         <div className="text-xs font-bold text-slate-400 mb-1">量价估算成本</div>
                                         <div className="text-2xl font-black font-mono text-slate-700">¥{estimatedMFCost.toFixed(2)}</div>
                                     </div>
                                     <div className="text-right">
                                         <div className="text-xs font-bold text-slate-400 mb-1">现价相对偏离</div>
                                         <div className={cn("text-2xl font-black font-mono", mfProfitRatio > 0 ? "text-red-500" : "text-blue-500")}>
                                             {mfProfitRatio > 0 ? "+" : ""}{mfProfitRatio.toFixed(2)}%
                                         </div>
                                     </div>
                                 </div>
                                 
                                 <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                                     <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-300 z-10"></div>
                                     <div 
                                         className={cn("absolute top-0 bottom-0 transition-all duration-500", 
                                            mfProfitRatio > 0 ? "left-1/2 bg-gradient-to-r from-red-200 to-red-500" : "right-1/2 bg-gradient-to-l from-blue-200 to-blue-500"
                                         )}
                                         style={{ width: `${Math.min(Math.abs(mfProfitRatio) * 2, 50)}%` }} 
                                     ></div>
                                 </div>
                                 <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                     <span>低于估算成本</span>
                                     <span>估算成本线</span>
                                     <span>高于估算成本</span>
                                 </div>

                                 {/* v44.0 KDJ & Trading Trajectory Visualization */}
                                 <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                                     <div className="space-y-2">
                                         <div className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                            <Waves className="w-3 h-3" />
                                            <span>操盘轨迹 (Trajectory)</span>
                                         </div>
                                         <div className="relative h-2 bg-slate-100 rounded-full w-full overflow-hidden">
                                             <div className="absolute top-0 bottom-0 left-0 w-[20%] bg-emerald-400/30"></div> {/* 黄金坑 */}
                                             <div className="absolute top-0 bottom-0 left-[20%] w-[20%] bg-blue-400/30"></div>    {/* 吸筹 */}
                                             <div className="absolute top-0 bottom-0 left-[40%] w-[30%] bg-orange-400/30"></div>  {/* 拉升 */}
                                             <div className="absolute top-0 bottom-0 right-0 w-[30%] bg-red-400/30"></div>        {/* 出货 */}
                                             
                                             {/* Indicator Dot */}
                                             <div 
                                                className="absolute top-0 bottom-0 w-1 bg-slate-800 shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-all duration-1000"
                                                style={{ 
                                                    left: `${Math.min(98, Math.max(2, (mfProfitRatio + 20) / 40 * 100))}%` 
                                                }}
                                             />
                                         </div>
                                         <div className="flex justify-between text-[8px] font-bold text-slate-400">
                                            <span>挖坑</span>
                                            <span>吸筹</span>
                                            <span>拉升</span>
                                            <span>出货</span>
                                         </div>
                                     </div>

                                     <div className="space-y-2">
                                         <div className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1">
                                            <Activity className="w-3 h-3" />
                                            <span>KDJ 动能 (9,3,3)</span>
                                         </div>
                                         <div className="flex items-center gap-2">
                                             {tech.kdj ? (
                                                <>
                                                    <div className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-bold border", 
                                                        tech.kdj.k > tech.kdj.d ? "bg-red-50 text-red-600 border-red-200" : "bg-green-50 text-green-600 border-green-200")}>
                                                        K {tech.kdj.k.toFixed(1)}
                                                    </div>
                                                    <div className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-bold border", 
                                                        tech.kdj.d > 50 ? "bg-slate-50 text-slate-600 border-slate-200" : "bg-slate-50 text-slate-400 border-slate-200")}>
                                                        D {tech.kdj.d.toFixed(1)}
                                                    </div>
                                                    <div className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-bold border", 
                                                        tech.kdj.j > 100 ? "bg-purple-50 text-purple-600 border-purple-200" : (tech.kdj.j < 0 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-slate-50 text-slate-400 border-slate-200"))}>
                                                        J {tech.kdj.j.toFixed(1)}
                                                    </div>
                                                </>
                                             ) : (
                                                <span className="text-[10px] text-slate-300">数据不足</span>
                                             )}
                                         </div>
                                         <div className="text-[9px] font-medium text-slate-400 truncate">
                                             {tech.kdj ? (
                                                 tech.kdj.j > 100 ? "⚠️ J值钝化(超买)" : (tech.kdj.j < 0 ? "💎 J值钝化(超卖)" : (tech.kdj.k > tech.kdj.d ? "📈 金叉向上区间" : "📉 死叉调整区间"))
                                             ) : "等待计算..."}
                                         </div>
                                     </div>
                                 </div>
                             </div>

                             <div className="shrink-0 w-full md:w-64 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                 <div className="flex items-start gap-3">
                                     <div className={cn("p-2 rounded-lg shrink-0", gameState.bg)}>
                                         <gameState.icon className={cn("w-5 h-5", gameState.color)} />
                                     </div>
                                     <div>
                                         <div className={cn("text-sm font-black mb-1", gameState.color)}>{gameState.status}</div>
                                         <div className="text-xs text-slate-500 leading-relaxed font-medium">
                                             {gameState.desc}
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 shadow-inner flex flex-col justify-between h-48">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">评分 (Score)</span>
                            <Zap className="w-4 h-4 text-orange-500" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className={cn("text-5xl font-black italic tracking-tighter", getScoreColor(score))}>{score.toFixed(0)}</span>
                            <span className="text-xs font-black text-slate-300">/ 100</span>
                        </div>
                        <div className="space-y-2 mt-4">
                            <div className="h-1.5 w-full bg-white rounded-full overflow-hidden shadow-sm">
                                <div className={cn("h-full transition-all duration-1000", score > 70 ? "bg-red-500" : "bg-blue-500")} style={{ width: `${score}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 shadow-inner flex flex-col justify-between h-48">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">进攻强度 (Attack)</span>
                            <Activity className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-black italic tracking-tighter text-slate-900">{refinedStrength.toFixed(0)}</span>
                            <span className="text-xs font-black text-slate-300">%</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <div className="text-center p-1.5 bg-white rounded-xl border border-slate-100">
                                <span className="text-[8px] font-black text-slate-400 uppercase block">Low</span>
                                <span className="text-[11px] font-mono font-bold text-green-600">¥{low.toFixed(2)}</span>
                            </div>
                            <div className="text-center p-1.5 bg-white rounded-xl border border-slate-100">
                                <span className="text-[8px] font-black text-slate-400 uppercase block">High</span>
                                <span className="text-[11px] font-mono font-bold text-red-600">¥{high.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-slate-900 text-white flex flex-col justify-between h-48 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-red-600/20 blur-3xl rounded-full -mr-8 -mt-8" />
                        <div className="flex items-center justify-between mb-4 relative z-10">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">诱多风险分 (Risk Score)</span>
                            <Fingerprint className="w-4 h-4 text-red-500 animate-pulse" />
                        </div>
                        <div className="flex items-baseline gap-2 relative z-10">
                            <span className={cn("text-5xl font-black italic tracking-tighter", 
                                refinedRisk > 60 ? "text-red-500" : refinedRisk > 40 ? "text-orange-500" : "text-green-500")}>
                                {refinedRisk.toFixed(0)}
                            </span>
                            <span className="text-xs font-black text-slate-500">/100</span>
                        </div>
                        <div className="space-y-2 relative z-10 mt-4">
                             <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className={cn("h-full transition-all duration-1000", 
                                    refinedRisk > 60 ? "bg-red-500" : refinedRisk > 40 ? "bg-orange-500" : "bg-green-500")} 
                                    style={{ width: `${refinedRisk}%` }} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-3xl bg-slate-900 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-slate-800/30 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className={cn("p-2 rounded-lg", 
                                intent === 'Distribute' ? "bg-red-500/20 text-red-400" : 
                                intent === 'Accumulate' ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700/50 text-slate-400")}>
                                <Crosshair className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="text-base font-black italic uppercase tracking-tight">盘口行为规则</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className={cn("text-[10px] border-none px-1.5", 
                                        intent === 'Distribute' ? "bg-red-900/50 text-red-200" : 
                                        intent === 'Accumulate' ? "bg-emerald-900/50 text-emerald-200" : "bg-slate-800 text-slate-400")}>
                                        {intent === 'Distribute' ? '派发风险' : intent === 'Accumulate' ? '承接特征' : '中性'}
                                    </Badge>
                                    <span className="text-[10px] text-slate-500 font-mono">挂单背离分: {decoyScore.toFixed(0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-10">
                         <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                             <span className="text-[9px] font-black text-slate-500 uppercase block mb-1">供应商大单净额</span>
                             <div className="flex items-end justify-between gap-2">
                                 <span className={cn(
                                   "text-base font-mono font-bold",
                                   largeOrderNetYuan === undefined ? "text-slate-500" : largeOrderNetYuan > 0 ? "text-red-400" : "text-emerald-400"
                                 )}>
                                     {formatCapitalFlowYuan(largeOrderNetYuan)}
                                 </span>
                                 <span className={cn(
                                   "text-[8px] font-black",
                                   capitalFlow.signal === 'CONFLICT' ? "text-amber-400" : "text-slate-500"
                                 )}>
                                   {capitalFlow.signal === 'CONFLICT' ? '量价冲突' : capitalFlow.source === 'NONE' || capitalFlow.source === 'OHLCV_PROXY' ? '缺失' : 'f62'}
                                 </span>
                             </div>
                         </div>
                         <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                             <span className="text-[9px] font-black text-slate-500 uppercase block mb-1">隐性承接评分</span>
                             <div className="flex items-end justify-between">
                                 <span className={cn("text-xl font-mono font-bold", localMetrics?.darkPoolMoney > 60 ? "text-emerald-400" : "text-slate-400")}>
                                     {localMetrics?.darkPoolMoney.toFixed(0) || 0}
                                 </span>
                                 <Activity className="w-4 h-4 text-slate-600" />
                             </div>
                         </div>
                         <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                             <span className="text-[9px] font-black text-slate-500 uppercase block mb-1">盘口集中度</span>
                             <div className="flex items-end justify-between">
                                 <span className={cn("text-xl font-mono font-bold", localMetrics?.mainForceChips > 60 ? "text-red-400" : "text-slate-400")}>
                                     {localMetrics?.mainForceChips.toFixed(0) || 0}
                                 </span>
                                 <Layers className="w-4 h-4 text-slate-600" />
                             </div>
                         </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <TimeSharingDivergence stock={stock} />
                    <ChipsDistribution stock={stock} />
                </div>
                
                {conflictStrategy && (
                    <div className={cn("p-4 rounded-xl border flex items-start gap-4", conflictStrategy.style)}>
                        <conflictStrategy.icon className={cn("w-6 h-6 mt-0.5 shrink-0", conflictStrategy.iconColor)} />
                        <div>
                            <h4 className="text-sm font-black uppercase tracking-tight mb-1">{conflictStrategy.title}</h4>
                            <p className="text-xs opacity-90 leading-relaxed mb-2">{conflictStrategy.desc}</p>
                            <div className="text-xs font-bold uppercase tracking-wide bg-white/20 inline-block px-2 py-1 rounded">
                                {conflictStrategy.action}
                            </div>
                        </div>
                    </div>
                )}
                
                {isHighRiskFund && (
                    <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 flex items-start gap-4">
                        <Siren className="w-6 h-6 text-orange-600 mt-0.5 shrink-0 animate-pulse" />
                        <div>
                            <h4 className="text-sm font-black text-orange-800 uppercase tracking-tight mb-1">
                                已披露席位行为风险（规则分 {smashRisk}）
                            </h4>
                            <p className="text-xs text-orange-700 leading-relaxed font-medium">
                                {smashWarning}
                            </p>
                            {fundName && (
                                <Badge variant="outline" className="mt-2 border-orange-200 text-orange-600 bg-white">
                                    龙虎榜席位：{fundName} · {fundProfile.name}
                                </Badge>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
