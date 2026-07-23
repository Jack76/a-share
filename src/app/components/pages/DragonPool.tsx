import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTrading } from '../../context/Store';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../ui/dialog';
import { Trash2, Plus, SquarePen, RefreshCw, Search, Sparkles, ArrowUpDown, ArrowUp, ArrowDown, Stethoscope, Zap, TriangleAlert, Rocket, Waves, Filter, X, Star, LayoutList, AlignJustify } from 'lucide-react';
import { toast } from 'sonner';
import { Stock } from '../../types';
import { fetchStockData, searchStockByName, fetchStockHistoryBatch, fetchMarketStats } from '../../services/marketData';

import { StockDiagnosisDialog } from './StockDiagnosisDialog';
import { SignalSystemGuide } from './SignalSystemGuide';
import { calculateIndicators, TechnicalIndicators } from '../../utils/indicators';
import { analyzeTrapRiskV41 } from '../../utils/trapGuardV41';
import { Sparkline } from '../Sparkline';
import { cn } from '../ui/utils';
import { ShieldCheck, Fingerprint, Activity, MousePointer2, Ghost } from 'lucide-react';
import { motion } from 'motion/react'; // Fix: Use motion/react instead of framer-motion

// Performance: Memoized Table Row for smoother list rendering
import { StockTableRow } from './StockTableRow';
import { StockMobileCard } from './StockMobileCard';
import { PRESET_THEMES } from '../../data/presetStocks';
import { isActionableBullishPrediction } from '../../utils/predictionCalibration';


// --- HELPER: Calculate Net Inflow from History (Enhanced V7.0) ---
const calculateNetInflow = (history: any[]) => {
    if (!history || history.length < 2) return 0;
    
    // Analyze last 5 days (Expanded from 3)
    const recent = history.slice(-5);
    let netFlow = 0;
    let totalWeight = 0;
    
    recent.forEach((day, index) => {
        const { open, close, high, low, volume } = day;
        if (!volume) return;
        
        // Time Decay Weight (Recent days matter more)
        // Index 0 (Oldest) -> Weight 1.0
        // Index 4 (Newest) -> Weight 2.0
        const weight = 1.0 + (index * 0.25);
        totalWeight += weight;

        // 1. Chaikin Money Flow Multiplier (Enhanced)
        // If Limit Up (High=Low=Close > Open), treat as Max Buy (1.0)
        // If Limit Down (High=Low=Close < Open), treat as Max Sell (-1.0)
        let multiplier = 0;
        const range = high - low;
        
        if (range === 0) {
            if (close > open) multiplier = 1.0; // Limit Up (One Word)
            else if (close < open) multiplier = -1.0; // Limit Down
            else multiplier = 0;
        } else {
            // Standard CMF: ((C-L) - (H-C)) / (H-L)
            // This measures where the close is within the range
            multiplier = ((close - low) - (high - close)) / range;
        }
        
        // 2. Volume Force
        // Correction v42.1: A-Share Volume is in 'Hands' (100 shares)
        // Previous logic missed the * 100 multiplier, causing 100x undervaluation
        const avgPrice = (open + close + high + low) / 4;
        const amount = volume * 100 * avgPrice; 
        
        // 3. Weighted Flow
        netFlow += (amount * multiplier * weight);
    });
    
    // Normalize (Average Weighted Flow per day)
    // Result / 1,000,000 for Millions (CNY)
    return Math.round((netFlow / totalWeight) / 1000000); 
};

// V65.0: analyzeIntradayStructure now runs in Store pipeline, DragonPool reads pre-computed stock.intradayIndicators

export const DragonPool: React.FC = () => {
  const { stocks, addStock, addStocks, updateStock, updateStocks, removeStock, refreshData, isMarketOpen, phase, forceRefreshHistory, analyzeLiveStockSignal } = useTrading();
  const processedRef = useRef<Set<string>>(new Set());
  const velocityTracker = useRef<Map<string, { price: number, time: number, velocity: number }>>(new Map());

  // V10.0 Real-time Velocity & Signal Monitor
  // V65.1 PERF FIX: Break cascade loop that caused 4x recalculation per refresh.
  // Root cause: useEffect[stocks] → updateStocks → new stocks ref → re-trigger → infinite.
  // Fix: (1) Interval polling with ref (no stocks dep), (2) correct {id,changes} format,
  //      (3) only process key stocks, (4) wider diff threshold (>3 not >1)
  const velocityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stocksRefLocal = useRef(stocks);
  stocksRefLocal.current = stocks;

  useEffect(() => {
    const runVelocityPass = () => {
      const currentStocks = stocksRefLocal.current;
      if (currentStocks.length === 0) return;

      const now = Date.now();
      // V65.1: Only process key stocks to limit CPU cost (was ALL stocks)
      const keyStocks = currentStocks.filter(s =>
        s.status === 'Hold' || s.isLimitUp || s.role === 'Leader' || s.role === 'Main' ||
        (s.stargate?.gateLevel || 0) >= 3
      );

      const pendingUpdates: { id: string; changes: Partial<Stock> }[] = [];

      keyStocks.forEach(stock => {
        const tracker = velocityTracker.current.get(stock.id);
        let currentVelocity = 0;

        if (tracker) {
          const timeDeltaMinutes = (now - tracker.time) / 60000;
          if (timeDeltaMinutes > 0.08) {
            const priceDeltaPercent = tracker.price > 0
              ? ((stock.currentPrice - tracker.price) / tracker.price) * 100 : 0;
            currentVelocity = priceDeltaPercent / timeDeltaMinutes;
            velocityTracker.current.set(stock.id, { price: stock.currentPrice, time: now, velocity: currentVelocity });
          } else {
            currentVelocity = tracker.velocity;
          }
        } else {
          velocityTracker.current.set(stock.id, { price: stock.currentPrice, time: now, velocity: 0 });
          return; // First observation, skip analysis
        }

        const intraday = stock.intradayIndicators;
        const microContext = {
          macdfs: (intraday?.macdfs?.signal || 'None') as 'GoldenCross' | 'DeadCross' | 'None',
          volumeRatio: intraday?.volumeStructure?.avgVol5
            ? intraday.volumeStructure.lastVol / intraday.volumeStructure.avgVol5
            : (stock.auctionData?.volumeRatio || stock.volumeRatio),
          netInflow: stock.mainForceInflow,
          isHeavyVolume: intraday?.volumeStructure?.isHeavy || false,
        };

        const signal = analyzeLiveStockSignal(stock, currentVelocity, microContext);

        const oldScore = stock.stargate?.score || 0;
        const newScore = signal.stargate?.score || 0;
        const oldGate = stock.stargate?.gateLevel || 0;
        const newGate = signal.stargate?.gateLevel || 0;

        // V65.1: Wider threshold (>3) to reduce unnecessary state churn
        if (Math.abs(newScore - oldScore) > 3 || newGate !== oldGate) {
          pendingUpdates.push({
            id: stock.id,
            changes: {
              aiPrediction: {
                trend: signal.trend,
                summary: signal.summary,
                strategy: signal.strategy,
                positionAdvice: signal.positionAdvice,
                winRate: signal.prediction?.probability || 50,
                buyPoint: `¥${signal.buyPoint.toFixed(2)}`,
                sellPoint: `¥${signal.sellPoint.toFixed(2)}`,
                prediction: signal.prediction,
                smartEntry: signal.smartEntry,
                signalType: signal.signalType,
              } as any,
              stargate: signal.stargate
            }
          });
        }
      });

      if (pendingUpdates.length > 0) {
        updateStocks(pendingUpdates, false); // V65.1: Skip recalc, signals already computed
      }
    };

    // Initial run after 2s (let first render settle), then poll every 8s
    const initialTimer = setTimeout(runVelocityPass, 2000);
    velocityTimerRef.current = setInterval(runVelocityPass, 8000);

    return () => {
      clearTimeout(initialTimer);
      if (velocityTimerRef.current) clearInterval(velocityTimerRef.current);
    };
  }, [phase]); // V65.1: Only re-setup on phase change, NOT on stocks change

  // V11.0: Real-time "Stealth Order" Toast Notifications
  // Listens for "GUARD" signal override (Ghost Protocol)
  useEffect(() => {
    stocks.forEach(stock => {
      // If signal just flipped to GUARD from something else (implied by current state)
      // We check if prediction contains "幽灵协议" text which is unique to this override
      const strategyText = stock.aiPrediction?.strategy || "";
      if (strategyText.includes("幽灵协议") && !processedRef.current.has(`ghost-${stock.id}-${Date.now().toString().slice(0, 8)}`)) {
          // Add debounce key (roughly 100s uniqueness)
          // Ideally we need a better "lastSignalTime" tracking, but for now this prevents rapid spam
          
           toast('幽灵协议启动 (GHOST PROTOCOL)', {
              description: `${stock.name}: 检测到拆单吸筹，已强制熔断卖出信号。`,
              icon: <Ghost className="w-5 h-5 text-indigo-500" />,
              duration: 5000,
              className: "bg-indigo-50 border-indigo-200"
           });
           
           // Mark as notified recently
           // We cheat a bit by using a time-bucket key
           processedRef.current.add(`ghost-${stock.id}-${Date.now().toString().slice(0, 8)}`);
      }
    });
  }, [stocks]);

  // Background Job: Calculate Real Inflow for stocks lacking it
  useEffect(() => {
      const targets = stocks.filter(s => s.mainForceInflow === 0 && !processedRef.current.has(s.id));
      if (targets.length === 0) return;

      const codes = targets.map(s => s.code);
      // Mark as processed to prevent loops
      targets.forEach(s => processedRef.current.add(s.id));

      const fetchFlow = async () => {
          try {
              const historyMap = await fetchStockHistoryBatch(codes);
              // V65.1 PERF: Batch all updates into one call (was: individual updateStock per stock → O(n) full recalcs)
              const pendingBatchUpdates: { id: string; changes: Partial<Stock> }[] = [];

              Object.entries(historyMap).forEach(([code, history]) => {
                  const inflow = calculateNetInflow(history);
                  const stockToUpdate = stocks.find(s => s.code === code);
                  const tech = calculateIndicators(history, stockToUpdate?.currentPrice);
                  
                  if (stockToUpdate) {
                      let tempStock = { ...stockToUpdate, technicals: tech, mainForceInflow: inflow };
                      
                      // V7.1: Calculate Real-time Trap Risk
                      const trapAnalysis = analyzeTrapRiskV41(tempStock, phase, stocks);
                      tempStock = { 
                          ...tempStock, 
                          trapRiskScore: trapAnalysis.score, 
                          trapSignals: trapAnalysis.signals 
                      };

                      // V8.6 Context Integration
                      // V65.0: Inject micro-context from intraday indicators
                      const _ind2 = tempStock.intradayIndicators;
                      const _mc2 = {
                        macdfs: (_ind2?.macdfs?.signal || 'None') as 'GoldenCross' | 'DeadCross' | 'None',
                        volumeRatio: _ind2?.volumeStructure?.avgVol5 ? _ind2.volumeStructure.lastVol / _ind2.volumeStructure.avgVol5 : tempStock.volumeRatio,
                        netInflow: tempStock.mainForceInflow,
                        isHeavyVolume: _ind2?.volumeStructure?.isHeavy || false,
                      };
                      const _hm2 = _mc2.macdfs !== 'None' || _mc2.volumeRatio !== undefined || _mc2.netInflow !== undefined;

                      const signal = analyzeLiveStockSignal(tempStock, undefined, _hm2 ? _mc2 : undefined);
                      
                      const newPrediction = {
                          trend: signal.trend,
                          summary: signal.summary,
                          strategy: signal.strategy,
                          positionAdvice: signal.positionAdvice,
                          winRate: signal.prediction?.probability || 50,
                          buyPoint: `¥${signal.buyPoint.toFixed(2)}`,
                          sellPoint: `¥${signal.sellPoint.toFixed(2)}`,
                          prediction: signal.prediction,
                          smartEntry: signal.smartEntry,
                      };
                      
                      pendingBatchUpdates.push({
                          id: stockToUpdate.id,
                          changes: {
                              mainForceInflow: inflow,
                              technicals: tech,
                              trapRiskScore: trapAnalysis.score,
                              trapSignals: trapAnalysis.signals,
                              aiPrediction: newPrediction as any,
                              stargate: signal.stargate
                          }
                      });
                  }
              });

              // V65.1: Single batched update, skip full recalc (signals already computed above)
              if (pendingBatchUpdates.length > 0) {
                  updateStocks(pendingBatchUpdates, false);
              }
          } catch (e) {
              console.error("Failed to calc inflow", e);
          }
      };
      
      // Debounce slightly
      const timer = setTimeout(fetchFlow, 1000);
      return () => clearTimeout(timer);
  }, [stocks, analyzeLiveStockSignal]);

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [diagnosisStock, setDiagnosisStock] = useState<Stock | null>(null);
  
  // Filter State
  const [filterText, setFilterText] = useState('');
  const [filterRole, setFilterRole] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterSignal, setFilterSignal] = useState<string>('All');
  const [filterConcept, setFilterConcept] = useState<string>('All'); // Added Concept Filter
  const [showAutoDiscovered, setShowAutoDiscovered] = useState(false); // New: Toggle for Auto-Discovered stocks
  const [showSelfSelectOnly, setShowSelfSelectOnly] = useState(false); // New: Filter for SelfSelect tag

  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: keyof Stock | 'prediction' | 'quality' | 'trap', direction: 'asc' | 'desc' }>({ key: 'changePercent', direction: 'desc' });
  
  // View State (Mobile Toggle)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table'); // Default to Table per user request

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [concept, setConcept] = useState('');
  const [customConcept, setCustomConcept] = useState(''); // V67.7: Custom concept input when "自定义" selected
  const [role, setRole] = useState<Stock['role']>('Potential');
  const [status, setStatus] = useState<Stock['status']>('Watch');
  const [costPrice, setCostPrice] = useState<string>(''); // Added as string for input
  const [buyDate, setBuyDate] = useState<string>(new Date().toISOString().split('T')[0]); // Added
  const [notes, setNotes] = useState('');

  // Helper for sorting by quality (Predator V16.0 Algorithm - Relative Logic)
  const calculateQuality = (stock: Stock) => {
    let score = 50; // Base Score

    // 1. Price Momentum (Fact)
    if (stock.isLimitUp) score += 25;
    else if ((stock.changePercent || 0) > 5) score += 15;
    else if ((stock.changePercent || 0) < -5) score -= 15;
    
    // 2. Market Phase Alignment (Context)
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

    // 3. Main Force & Flow (Truth) - V16.0: Relative Ratio
    if (stock.mainForceInflow && stock.currentPrice && stock.volume) {
         // Estimate Turnover Amount
         const estTurnover = stock.volume * stock.currentPrice;
         const flowRatio = estTurnover > 0 ? (stock.mainForceInflow / estTurnover) : 0;
         
         if (flowRatio > 0.1) score += 15; // > 10% Net Inflow
         else if (flowRatio > 0.05) score += 5; 
         else if (flowRatio < -0.05) score -= 20; 
    } else {
        const flowQuality = stock.moneyQualityScore || 50;
        if (flowQuality > 75) score += 15; 
        if (flowQuality < 30) score -= 20; 
    }

    // 4. Technical Structure (V7.0 Deep Dive)
    const tech = (stock.technicals || {}) as Partial<TechnicalIndicators>;
    
    // A. Chip Pressure
    if (tech.chipPressure && tech.chipPressure > 80) score -= 15;
    if (tech.profitRatio && tech.profitRatio > 95) score += 10;

    // B. Divergence
    if (tech.macdDivergence === 'bear' || tech.rsiDivergence === 'bear') score -= 30;
    if (tech.macdDivergence === 'bull' && (stock.changePercent || 0) > 0) score += 20;

    // C. ATR Bands
    if (tech.atrBands && stock.currentPrice) {
        if (stock.currentPrice > tech.atrBands.upperResistance) {
            if (phase === 'Chaos' || phase === 'Ebb') {
                if (!stock.isLimitUp) score -= 10;
            } else {
                score += 5; 
            }
        }
        if (stock.currentPrice < tech.atrBands.lowerSupport) {
            score -= 20; 
        }
    }

    // D. MFI
    if (tech.mfi !== undefined) {
        if (tech.mfi > 90) score -= 5; 
        else if (tech.mfi < 15) score += 10; 
    }

    // 5. Risk Control (TrapGuard)
    if ((stock.trapRiskScore || 0) > 60) score -= 30; 

    // 6. Turnover Constraint - V16.0: Volume Ratio
    // If turnover is high (>15%) AND Volume Ratio > 2.0 (Overheat) -> Penalize
    // But allow high turnover if it's first board (Leader + LimitUp + Height=1)
    const volRatio = stock.auctionData?.volumeRatio || stock.volRatio || 1.0;
    
    if ((stock.turnoverRate || 0) > 15 && volRatio > 2.5 && !stock.isLimitUp) {
        score -= 10; // High churn without sealing
    }
    
    // Absolute Death Line
    if ((stock.turnoverRate || 0) > 50) score -= 30;

    // V17.2: Golden Pit Bonus (Sync with TableRow)
    const isCore = ['Leader', 'Vice', 'Main'].includes(stock.role);
    const isDrop = (stock.changePercent || 0) < -3 && !stock.isLimitDown;
    const isMoneyIn = (stock.mainForceInflow || 0) > 0;
    const isShrinking = (stock.turnoverRate || 0) < 15;
    
    // Strict Gates
    const isSectorSafe = !stock.isThemeDropout && (stock.resonanceScore || 0) > 50;
    const isHighConfidence = isActionableBullishPrediction(stock.aiPrediction?.prediction);
    
    if (isCore && isDrop && isMoneyIn && isShrinking && isSectorSafe && isHighConfidence) {
        score += 30; // Significant boost
    }

    return Math.min(100, Math.max(0, score));
  };

  const sortedStocks = useMemo(() => {
    let sortableItems = [...stocks];

    // Filter Logic
    if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        sortableItems = sortableItems.filter(s => 
            s.name.toLowerCase().includes(lowerFilter) || 
            s.code.includes(lowerFilter) || 
            (s.concept && s.concept.toLowerCase().includes(lowerFilter)) ||
            (s.role && s.role.toLowerCase().includes(lowerFilter))
        );
    }
    
    if (filterRole !== 'All') {
        sortableItems = sortableItems.filter(s => s.role === filterRole);
    }

    if (filterStatus !== 'All') {
        sortableItems = sortableItems.filter(s => s.status === filterStatus);
    }

    if (filterSignal !== 'All') {
        sortableItems = sortableItems.filter(s => {
            const trend = s.aiPrediction?.trend;
            // Safe access to keyFactors from updated Type or runtime 'any'
            const factors = s.aiPrediction?.keyFactors || [];

            if (filterSignal === 'Bullish') return trend === 'Accelerate' || trend === 'Rebound'; // General Bullish
            if (filterSignal === 'Bearish') return trend === 'Divergence' || trend === 'Top';     // General Bearish
            
            // V41.2 Advanced Filters
            if (filterSignal === 'AerialRefuel') return factors.includes('空中加油');
            if (filterSignal === 'DualGold') return factors.includes('双金叉');
            if (filterSignal === 'HighDeadCross') return factors.includes('高位死叉');
            if (filterSignal === 'WeakStrong') return factors.includes('超预期') || (s.aiPrediction?.summary || '').includes('弱转强');
            
            // Strict Filter for Accelerate (Hidden "Weak/Gamble" signals)
            if (filterSignal === 'Accelerate') {
                const confidence = s.aiPrediction?.confidence || s.aiPrediction?.winRate || 0;
                // If confidence < 70, UI displays it as "GAMBLE" or "WEAK", so exclude it from pure "Accelerate" filter
                // Exception: Limit Up stocks are always considered Accelerate/Lock
                return trend === 'Accelerate' && (confidence >= 70 || s.isLimitUp);
            }

            return trend === filterSignal;
        });
    }

    if (filterConcept !== 'All') {
        sortableItems = sortableItems.filter(s => s.concept === filterConcept);
    }

    // New: Filter Auto-Discovered stocks by default
    if (!showAutoDiscovered) {
        // Fix: Even if hidden, if user marked it as SelfSelect, it should stay visible
        sortableItems = sortableItems.filter(s => 
            !s.tags?.includes('Auto-Discovered') || s.tags?.includes('SelfSelect')
        );
    }

    // New: Filter SelfSelect
    if (showSelfSelectOnly) {
        sortableItems = sortableItems.filter(s => s.tags?.includes('SelfSelect'));
    }

    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof Stock];
        let bValue: any = b[sortConfig.key as keyof Stock];

        if (sortConfig.key === 'prediction') {
            // Sort by prediction trend severity (approx)
            const trendOrder = { 'Accelerate': 5, 'Divergence': 4, 'Rebound': 3, 'Neutral': 2, 'Top': 1, undefined: 0 };
            aValue = trendOrder[a.aiPrediction?.trend || 'undefined'] || 0;
            bValue = trendOrder[b.aiPrediction?.trend || 'undefined'] || 0;
        } else if (sortConfig.key === 'quality') {
            aValue = calculateQuality(a);
            bValue = calculateQuality(b);
        } else if (sortConfig.key === 'trap') {
            aValue = a.trapRiskScore || 0;
            bValue = b.trapRiskScore || 0;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [stocks, sortConfig, phase, filterText, filterRole, filterStatus, filterSignal, filterConcept]);

  const requestSort = (key: keyof Stock | 'prediction' | 'quality' | 'trap') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
        // Optional: Toggle back to default or remain desc? Let's just swap.
        direction = 'asc';
    } else {
        // Default new sort direction
        if (key === 'changePercent' || key === 'currentPrice' || key === 'prediction' || key === 'quality' || key === 'trap') direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
      if (sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 ml-1 text-muted-foreground/50" />;
      if (sortConfig.direction === 'asc') return <ArrowUp className="w-3 h-3 ml-1 text-primary" />;
      return <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  };

  const fetchDetails = async (inputCode?: string) => {
    const targetCode = inputCode || code;
    if (!targetCode) return;
    
    // Allow slightly shorter codes for testing, but typically 6
    if (targetCode.length < 5) return; 

    setIsFetching(true);
    try {
      const { data } = await fetchStockData([targetCode]);
      const stockInfo = data[targetCode];
      
      if (stockInfo) {
        // If we fetched by code and name was empty, update name
        if (!name) setName(stockInfo.name || '');
        
        // Auto-guess Role based on performance
        let newRole: Stock['role'] = 'Potential';
        if (stockInfo.isLimitUp) {
            newRole = 'Leader';
        } else if ((stockInfo.changePercent || 0) > 5) {
            newRole = 'Vice';
        }
        setRole(newRole);

        // Auto-fill Notes
        let autoNote = '';
        if (stockInfo.isLimitUp) {
            autoNote = '强势涨停';
        } else if ((stockInfo.changePercent || 0) !== 0) {
            const sign = (stockInfo.changePercent || 0) > 0 ? '+' : '';
            autoNote = `涨幅 ${sign}${stockInfo.changePercent}%`;
        } else {
            autoNote = '平盘';
        }
        
        // Update notes if empty or system generated
        setNotes(prev => (!prev || prev.includes('涨幅') || prev === '强势涨停' || prev === '平盘') ? autoNote : prev);
        
        // Show a temporary success message with price to confirm data is real
        toast.success(`行情已更新: 现价 ${stockInfo.currentPrice} (${stockInfo.changePercent}%)`);

        // Auto-fill Concept from Presets
        if (!concept) {
             const matchedTheme = PRESET_THEMES.find(t => t.stocks.some(s => s.code.endsWith(targetCode) || targetCode.endsWith(s.code)));
             if (matchedTheme) {
                 setConcept(matchedTheme.name);
                 toast.success(`已自动匹配核心板块: ${matchedTheme.name}`);
             }
        }
      } else {
          toast.warning("无法获取该代码的详细行情数据");
      }
    } catch (e) {
      console.error("Failed to fetch stock details", e);
      toast.error("获取行情数据失败");
    } finally {
      setIsFetching(false);
    }
  };

  const handleNameBlur = async () => {
      // Only auto-search if name is present AND code is empty
      if (name && !code) {
          setIsFetching(true);
          try {
              const result = await searchStockByName(name);
              if (result && result.code) {
                  const newCode = result.code;
                  
                  // Force state update
                  setCode(newCode);
                  
                  toast.success(`已匹配代码: ${newCode}`);
                  
                  // Add a small delay to ensure state propagation before heavy fetch, 
                  // though passing newCode directly to fetchDetails handles the logic.
                  setTimeout(() => {
                      fetchDetails(newCode);
                  }, 100);
              } else {
                  toast.error("未找到匹配的股票代码，请检查名称");
              }
          } catch (e) {
              console.error("Search failed", e);
              toast.error("自动匹配失败");
          } finally {
              setIsFetching(false);
          }
      }
  };

  const handleScanAndAdd = async () => {
    setIsScanning(true);
    try {
      // Scan the verified full-market snapshot instead of a hand-picked sample.
      const snapshot = await fetchMarketStats(true);
      if (
        !snapshot?.list ||
        snapshot.list.length < 4_000 ||
        !snapshot.quality ||
        !["FRESH", "PARTIAL"].includes(snapshot.quality.status) ||
        snapshot.quality.coverage < 0.85
      ) {
        throw new Error('全市场快照覆盖不足');
      }
      const potentialDragons = snapshot.list
        .filter(stock => {
          const code = String(stock.code || '').replace(/^(sh|sz|bj)/i, '');
          // Exclude if already in pool
          if (stocks.some(s => s.code.replace(/^(sh|sz|bj)/i, '') === code)) return false;
          // Criteria: Limit Up OR Change > 5%
          return stock.isLimitUp || (stock.changePercent || 0) > 5.0;
        })
        .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
        .slice(0, 100);

      const newStocksList: Stock[] = [];
      
      potentialDragons.forEach(stock => {
         const code = String(stock.code).replace(/^(sh|sz|bj)/i, '');
         // Try to find concept from presets to replace generic 'Auto Scan'
         const matchedTheme = PRESET_THEMES.find(t => t.stocks.some(s => s.code.endsWith(code) || code.endsWith(s.code)));
         
         // REAL COMBAT MODE: Use Actual Market Data
         // We do not simulate data. If backend provides turnoverRate, use it.
         // If MainForceInflow is not available (Tencent L1 Quote), we set to 0 to avoid misleading.
         
         const newStock: Stock = {
            id: Date.now().toString() + Math.random().toString().slice(2, 5),
            code,
            name: stock.name || code,
            concept: matchedTheme ? matchedTheme.name : '自动扫描', 
            role: 'Potential',
            status: 'Watch',
            notes: stock.isLimitUp ? '核心样本-涨停' : '核心样本-大涨',
            currentPrice: stock.currentPrice,
            changePercent: stock.changePercent,
            isLimitUp: stock.isLimitUp,
            sourceAsOf: snapshot.quality?.sourceAsOf || snapshot.quality?.asOf,
            
            // Hunter V5.0 Real Data Mapping
            turnoverRate: stock.turnoverRate || 0, // Use Real Turnover Rate from API
            turnoverAmount: stock.amount || 0,
            mainForceInflow: 0, // Pending L2 Data Integration (Do not simulate)
            moneyQualityScore: stock.isLimitUp ? 90 : 60 + (stock.changePercent || 0), // Basic score based on Price
            trapRiskScore: 0, // Pending real risk model
            aiPrediction: {
                trend: stock.isLimitUp ? 'Accelerate' : 'Neutral',
                summary: 'AI 初始扫',
                strategy: '等待进一步形态确认'
            }
         };
         newStocksList.push(newStock);
      });

      if (newStocksList.length > 0) {
        addStocks(newStocksList);
        toast.success(`扫描完成，已自动添加 ${newStocksList.length} 只活跃龙头！`);
      } else {
        toast.info("扫描完成，暂未发现符合条件的新核心标的。");
      }
      
    } catch (e) {
      console.error("Scan failed", e);
      toast.error("自动挖掘失败，请检查网络或稍后再试。");
    } finally {
      setIsScanning(false);
    }
  };



  const resetForm = () => {
    setCode('');
    setName('');
    setConcept('');
    setCustomConcept('');
    setRole('Potential');
    setStatus('Watch');
    setCostPrice('');
    setBuyDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!name || !code) return;

    // V67.7: Resolve final concept — use customConcept when "自定义" is chosen
    const finalConcept = concept === '__custom__' ? customConcept.trim() : concept;
    const stockData = { 
        code, 
        name, 
        concept: finalConcept, 
        role, 
        status, 
        notes,
        costPrice: costPrice ? parseFloat(costPrice) : undefined,
        buyDate: status === 'Hold' ? buyDate : undefined
    };

    if (editingId) {
      updateStock(editingId, stockData);
    } else {
      const newStock: Stock = {
        id: Date.now().toString(),
        ...stockData
      };
      addStock(newStock);
    }
    setIsOpen(false);
    resetForm();
    refreshData();
  };

  const openEdit = (stock: Stock) => {
    setEditingId(stock.id);
    setCode(stock.code);
    setName(stock.name || '');
    // V67.7: Check if concept matches a preset theme; if not, set to custom
    const isPreset = PRESET_THEMES.some(t => t.name === stock.concept);
    if (isPreset) {
      setConcept(stock.concept || '');
      setCustomConcept('');
    } else if (stock.concept) {
      setConcept('__custom__');
      setCustomConcept(stock.concept);
    } else {
      setConcept('');
      setCustomConcept('');
    }
    setRole(stock.role);
    setStatus(stock.status);
    setCostPrice(stock.costPrice?.toString() || '');
    setBuyDate(stock.buyDate || new Date().toISOString().split('T')[0]);
    setNotes(stock.notes || '');
    setIsOpen(true);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Leader': return <Badge className="bg-red-600 font-bold shadow-sm shadow-red-200">核心龙头</Badge>;
      case 'Vice': return <Badge className="bg-orange-500 font-bold shadow-sm shadow-orange-200">强力副龙</Badge>;
      case 'Substitute': return <Badge className="bg-blue-500 font-bold shadow-sm shadow-blue-200">中位补涨</Badge>;
      case 'Independent': return <Badge className="bg-purple-600 font-bold shadow-sm shadow-purple-200">独立妖股</Badge>;
      case 'Main': return <Badge className="bg-emerald-600 font-bold shadow-sm shadow-emerald-200">中军容量</Badge>;
      case 'Follower': return <Badge className="bg-slate-500 font-bold">跟风杂毛</Badge>;
      case 'Potential': return <Badge variant="outline" className="border-dashed border-slate-300 text-slate-500 font-bold">潜力潜伏</Badge>;
      default: return <Badge variant="outline" className="text-slate-400">普通观察</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Hold': return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">持仓 (Hold)</Badge>;
      case 'Sold': return <Badge variant="secondary">已卖出 (Sold)</Badge>;
      default: return <Badge variant="outline">观察 (Watch)</Badge>;
    }
  };

  const getPredictionBadge = (stock: Stock) => {
    // Alert Icons (Instant Movement)
    const renderAlerts = () => {
        if (!stock.alerts || stock.alerts.length === 0) return null;
        return (
            <div className="flex gap-1 mb-1">
                {stock.alerts.includes('rocket') && <Badge className="bg-red-500 animate-pulse text-[10px] px-1"><Rocket className="w-3 h-3 mr-1" /> 急拉</Badge>}
                {stock.alerts.includes('dive') && <Badge className="bg-green-600 animate-pulse text-[10px] px-1"><Waves className="w-3 h-3 mr-1" /> 跳水</Badge>}
                {stock.alerts.includes('broken') && <Badge className="bg-orange-500 animate-pulse text-[10px] px-1"><TriangleAlert className="w-3 h-3 mr-1" /> 炸板</Badge>}
            </div>
        );
    };

    if (!stock.aiPrediction) return renderAlerts();
    const { trend, summary, strategy, positionAdvice } = stock.aiPrediction;

    let badgeClass = "bg-slate-100 text-slate-700";
    if (trend === 'Accelerate') badgeClass = "bg-red-500 text-white hover:bg-red-600";
    if (trend === 'Divergence') badgeClass = "bg-orange-500 text-white hover:bg-orange-600";
    if (trend === 'Top') badgeClass = "bg-green-600 text-white hover:bg-green-700";
    if (trend === 'Rebound') badgeClass = "bg-blue-500 text-white hover:bg-blue-600";

    return (
      <div className="flex flex-col gap-1 items-start">
          {renderAlerts()}
          <Badge className={`${badgeClass} cursor-help border-0`} title={strategy}>
             {summary}
          </Badge>
          <div className="flex items-center gap-2 w-full justify-between">
              <span className="text-[10px] text-muted-foreground">{strategy}</span>
              {positionAdvice && (
                  <Badge variant="outline" className="text-[10px] px-1 h-4 border-slate-300">
                     {positionAdvice}
                  </Badge>
              )}
          </div>
      </div>
    );
  };

  // Use useCallback for handlers passed to memoized items
  const handleRemove = useCallback((id: string) => removeStock(id), [removeStock]);
  const handleEdit = useCallback((s: Stock) => openEdit(s), []);
  const handleDiagnose = useCallback((s: Stock) => setDiagnosisStock(s), []);
  
  const handleToggleWatch = useCallback((stock: Stock) => {
      const tags = stock.tags || [];
      const isSelfSelect = tags.includes('SelfSelect');
      let newTags;
      
      if (isSelfSelect) {
          newTags = tags.filter(t => t !== 'SelfSelect');
          toast.info(`已移除自选: ${stock.name}`);
      } else {
          newTags = [...tags, 'SelfSelect'];
          toast.success(`已加入自选: ${stock.name}`);
      }
      
      updateStock(stock.id, { tags: newTags });
  }, [updateStock]);

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
        forceRefreshHistory(); // Reset failed history items to trigger refetch
        await refreshData();
        
        // Force Refetch Inflow for ALL stocks (Real-time recalculation)
        const codes = stocks.map(s => s.code);
        if (codes.length > 0) {
            const historyMap = await fetchStockHistoryBatch(codes);
            // V65.1 PERF: Batch all updates (was: individual updateStock per stock → O(n) full recalcs)
            const batchUpdates: { id: string; changes: Partial<Stock> }[] = [];

            Object.entries(historyMap).forEach(([code, history]) => {
                const inflow = calculateNetInflow(history);
                const stock = stocks.find(s => s.code === code);
                const tech = calculateIndicators(history, stock?.currentPrice);
                
                if (stock) {
                    let tempStock = { ...stock, technicals: tech, mainForceInflow: inflow };
                    
                    const trapAnalysis = analyzeTrapRiskV41(tempStock, phase, stocks);
                    tempStock = { 
                        ...tempStock, 
                        trapRiskScore: trapAnalysis.score, 
                        trapSignals: trapAnalysis.signals 
                    };

                    const _ind3 = tempStock.intradayIndicators;
                    const _mc3 = {
                      macdfs: (_ind3?.macdfs?.signal || 'None') as 'GoldenCross' | 'DeadCross' | 'None',
                      volumeRatio: _ind3?.volumeStructure?.avgVol5 ? _ind3.volumeStructure.lastVol / _ind3.volumeStructure.avgVol5 : tempStock.volumeRatio,
                      netInflow: tempStock.mainForceInflow,
                      isHeavyVolume: _ind3?.volumeStructure?.isHeavy || false,
                    };
                    const _hm3 = _mc3.macdfs !== 'None' || _mc3.volumeRatio !== undefined || _mc3.netInflow !== undefined;

                    const signal = analyzeLiveStockSignal(tempStock, undefined, _hm3 ? _mc3 : undefined);
                    
                    batchUpdates.push({
                        id: stock.id,
                        changes: {
                            mainForceInflow: inflow,
                            technicals: tech,
                            trapRiskScore: trapAnalysis.score,
                            trapSignals: trapAnalysis.signals,
                            aiPrediction: {
                                trend: signal.trend,
                                summary: signal.summary,
                                strategy: signal.strategy,
                                positionAdvice: signal.positionAdvice,
                                winRate: signal.prediction?.probability || 50,
                                prediction: signal.prediction,
                                smartEntry: signal.smartEntry,
                            } as any,
                            stargate: signal.stargate
                        }
                    });
                }
            });

            if (batchUpdates.length > 0) {
                updateStocks(batchUpdates, false);
            }
        }
        
        toast.success("核心池数据及主力资金已实时更新");
    } catch (e) {
        toast.error("更新失败，请检查网络");
    } finally {
        setIsManualRefreshing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[1600px] mx-auto px-2 py-4 md:px-10 md:py-16 space-y-4 md:space-y-12 transform-gpu"
    >
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 md:gap-6 bg-white border border-slate-200 p-4 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl md:shadow-2xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl md:text-3xl font-black tracking-tighter italic uppercase text-slate-900">
                龙头核心池 (Dragon Core)
            </h2>
            {isMarketOpen && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/10 border border-red-600/20 text-[10px] text-red-600 uppercase tracking-widest font-black shadow-sm shrink-0">
                    <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                    Live
                </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] truncate max-w-[300px] md:max-w-none">Quantum Strategy Engine v8.5 | High-Frequency Awareness</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
           {/* Auto-Discovery Toggle */}
           <div className="flex items-center gap-2">
               <Button 
                   variant="outline" 
                   size="sm" 
                   onClick={() => setShowAutoDiscovered(!showAutoDiscovered)} 
                   className={cn(
                       "h-10 px-3 rounded-xl border-slate-200 text-[10px] font-black uppercase tracking-widest gap-2 transition-all", 
                       showAutoDiscovered ? "bg-red-50 text-red-600 border-red-200 shadow-sm shadow-red-100" : "text-slate-400 hover:text-slate-600"
                   )}
               >
                   {showAutoDiscovered ? <Fingerprint className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
                   <span className="hidden sm:inline">{showAutoDiscovered ? '隐藏自动捕获' : '显示全市场扫描'}</span>
               </Button>
           </div>

           <div className="flex gap-2 ml-auto xl:ml-0 flex-1 justify-end">
               {/* Mobile View Toggle */}
               <Button 
                   variant="outline" 
                   className="h-10 w-10 md:hidden rounded-xl border-slate-200 text-slate-500"
                   onClick={() => setViewMode(prev => prev === 'table' ? 'card' : 'table')}
               >
                   {viewMode === 'table' ? <AlignJustify className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
               </Button>

               <SignalSystemGuide />
               <Button 
                 variant="outline" 
                 className="h-10 md:h-12 w-10 md:w-auto px-0 md:px-6 rounded-xl md:rounded-2xl font-black border-slate-200 hover:bg-slate-50 text-[10px] uppercase tracking-widest shrink-0" 
                 onClick={handleManualRefresh} 
                 disabled={isManualRefreshing}
               >
                 <RefreshCw className={cn("w-4 h-4 md:mr-2 text-slate-600", isManualRefreshing && "animate-spin")} />
                 <span className="hidden md:inline">手动刷新</span>
               </Button>
               <Button variant="outline" className="h-10 md:h-12 px-3 md:px-6 rounded-xl md:rounded-2xl font-black border-slate-200 hover:bg-slate-50 text-[10px] uppercase tracking-widest shrink-0" onClick={handleScanAndAdd} disabled={isScanning}>
                 <Sparkles className={`w-4 h-4 mr-1 md:mr-2 text-red-600 ${isScanning ? 'animate-spin' : ''}`} />
                 {isScanning ? '挖掘...' : 'AI 挖掘'}
               </Button>
               <Button variant="default" className="h-10 md:h-12 px-3 md:px-6 rounded-xl md:rounded-2xl font-black shadow-xl shadow-red-600/20 bg-red-600 hover:bg-red-700 text-[10px] uppercase tracking-widest italic shrink-0" onClick={() => setIsOpen(true)}>
                <Plus className="w-4 h-4 mr-1 md:mr-2" />
                新增
              </Button>
           </div>
        </div>
      </div>
      
      {/* Search & Filters Bar */}
      <div className="flex flex-col gap-4">
         {/* Sector Tags Filter */}
         <div className="flex flex-wrap gap-2">
            <Button 
                variant={filterConcept === 'All' && !showSelfSelectOnly ? "default" : "outline"}
                size="sm"
                onClick={() => {
                    setFilterConcept('All');
                    setShowSelfSelectOnly(false);
                }}
                className="text-[11px] font-bold h-7 rounded-full"
            >
                全部
            </Button>
            <Button 
                variant={showSelfSelectOnly ? "default" : "outline"}
                size="sm"
                onClick={() => {
                    const newState = !showSelfSelectOnly;
                    setShowSelfSelectOnly(newState);
                    if (newState) setFilterConcept('All');
                }}
                className={cn(
                    "text-[11px] font-bold h-7 rounded-full gap-1",
                    showSelfSelectOnly ? "bg-yellow-500 hover:bg-yellow-600 text-white border-transparent" : "text-yellow-600 border-yellow-200 bg-yellow-50"
                )}
            >
                <Star className="w-3 h-3 fill-current" /> 自选
            </Button>
            {PRESET_THEMES.map(theme => (
                <Button
                    key={theme.name}
                    variant={filterConcept === theme.name ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                        setFilterConcept(theme.name);
                        setShowSelfSelectOnly(false);
                    }}
                    className={cn(
                        "text-[11px] font-bold h-7 rounded-full border-dashed border-slate-300",
                        filterConcept === theme.name && "border-solid border-transparent bg-slate-900 text-white"
                    )}
                >
                    {theme.name}
                </Button>
            ))}
         </div>

         {/* Search Inputs */}
         <div className="flex flex-wrap items-center gap-3">
             <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input 
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="全局搜索 (代码/名称/概念)..." 
                    className="pl-9 h-10 rounded-xl border-slate-200 bg-white focus:bg-white transition-all text-[11px] font-bold shadow-sm"
                />
            </div>

            <div className="flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                <Select value={filterRole} onValueChange={setFilterRole}>
                    <SelectTrigger className="w-[110px] h-10 rounded-xl border-slate-200 text-[10px] font-bold uppercase tracking-wider bg-white shadow-sm">
                        <SelectValue placeholder="角色" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">全部角色</SelectItem>
                        <SelectItem value="Leader">核心龙头</SelectItem>
                        <SelectItem value="Vice">强力副龙</SelectItem>
                        <SelectItem value="Substitute">中位补涨</SelectItem>
                        <SelectItem value="Independent">独立妖股</SelectItem>
                        <SelectItem value="Main">中军容量</SelectItem>
                        <SelectItem value="Follower">跟风杂毛</SelectItem>
                        <SelectItem value="Potential">潜力潜伏</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[90px] h-10 rounded-xl border-slate-200 text-[10px] font-bold uppercase tracking-wider bg-white shadow-sm">
                        <SelectValue placeholder="持仓" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">所有状态</SelectItem>
                        <SelectItem value="Hold">持仓中</SelectItem>
                        <SelectItem value="Watch">观察池</SelectItem>
                        <SelectItem value="Sold">已离场</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={filterSignal} onValueChange={setFilterSignal}>
                    <SelectTrigger className="w-[90px] h-10 rounded-xl border-slate-200 text-[10px] font-bold uppercase tracking-wider bg-white shadow-sm">
                        <SelectValue placeholder="预判" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">所有信号</SelectItem>
                        <SelectItem value="Accelerate">🚀 强攻加速</SelectItem>
                        <SelectItem value="Rebound">↩️ 缩量回调</SelectItem>
                        <SelectItem value="Divergence">⚠️ 诱多背离</SelectItem>
                        <SelectItem value="Top">📉 见顶回落</SelectItem>
                        <SelectItem value="AerialRefuel">⛽️ 空中加油</SelectItem>
                        <SelectItem value="DualGold">✨ 双金叉共振</SelectItem>
                        <SelectItem value="WeakStrong">💪 弱转强</SelectItem>
                        <SelectItem value="HighDeadCross">☠️ 高位死叉</SelectItem>
                    </SelectContent>
                </Select>

                {(filterRole !== 'All' || filterStatus !== 'All' || filterSignal !== 'All' || filterText || filterConcept !== 'All' || showSelfSelectOnly) && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-10 w-10 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50"
                        onClick={() => {
                            setFilterRole('All');
                            setFilterStatus('All');
                            setFilterSignal('All');
                            setFilterText('');
                            setFilterConcept('All');
                            setShowSelfSelectOnly(false);
                        }}
                    >
                       <X className="w-4 h-4" />
                    </Button>
                )}
            </div>
         </div>
      </div>



      {/* Mobile View: Cards (Optional) */}
      {viewMode === 'card' && (
        <div className="md:hidden space-y-4">
            {sortedStocks.map((stock) => (
                <StockMobileCard 
                    key={stock.id} 
                    stock={stock} 
                    phase={phase}
                    onEdit={handleEdit} 
                    onDiagnose={handleDiagnose} 
                    onRemove={handleRemove} 
                    onToggleWatch={handleToggleWatch}
                />
            ))}
        </div>
      )}

      {/* Desktop/Table View */}
      <Card className={cn(
          "border border-slate-200 shadow-2xl overflow-hidden bg-white rounded-[2.5rem] transform-gpu",
          viewMode === 'card' ? "hidden md:block" : "block"
      )}>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="w-full min-w-[350px]">
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead onClick={() => requestSort('name')} className="sticky left-0 z-20 bg-slate-50 cursor-pointer py-3 md:py-5 text-[10px] font-bold uppercase tracking-widest pl-2 md:pl-8 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] min-w-[100px]">
                    <div className="flex items-center">标的识别 {getSortIcon('name')}</div>
                </TableHead>
                <TableHead onClick={() => requestSort('changePercent')} className="cursor-pointer py-3 md:py-5 text-[10px] font-bold uppercase tracking-widest px-1 md:px-4">
                    <div className="flex items-center">涨跌 {getSortIcon('changePercent')}</div>
                </TableHead>
                <TableHead onClick={() => requestSort('prediction')} className="cursor-pointer py-3 md:py-5 text-[10px] font-bold uppercase tracking-widest px-1 md:px-4">
                    <div className="flex items-center">AI 预判 {getSortIcon('prediction')}</div>
                </TableHead>
                <TableHead onClick={() => requestSort('quality')} className="cursor-pointer py-3 md:py-5 text-[10px] font-bold uppercase tracking-widest px-1 md:px-4">
                    <div className="flex items-center">品质 {getSortIcon('quality')}</div>
                </TableHead>
                <TableHead onClick={() => requestSort('trap')} className="cursor-pointer py-3 md:py-5 text-[10px] font-bold uppercase tracking-widest px-1 md:px-4">
                    <div className="flex items-center">风险 {getSortIcon('trap')}</div>
                </TableHead>
                <TableHead onClick={() => requestSort('concept')} className="hidden md:table-cell cursor-pointer py-5 text-[10px] font-bold uppercase tracking-widest">
                    <div className="flex items-center">核心题材 {getSortIcon('concept')}</div>
                </TableHead>
                <TableHead className="hidden md:table-cell text-[10px] font-bold uppercase tracking-widest">趋势走势</TableHead>
                <TableHead onClick={() => requestSort('turnoverRate')} className="hidden md:table-cell cursor-pointer py-5 text-[10px] font-bold uppercase tracking-widest">
                    <div className="flex items-center">空间/换手 {getSortIcon('turnoverRate')}</div>
                </TableHead>
                <TableHead className="text-right py-3 md:py-5 text-[10px] font-bold uppercase tracking-widest pr-2 md:pr-8 w-[90px] md:w-auto">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStocks.map((stock) => (
                <StockTableRow 
                    key={stock.id} 
                    stock={stock} 
                    phase={phase}
                    onEdit={handleEdit} 
                    onDiagnose={handleDiagnose} 
                    onRemove={handleRemove} 
                    onToggleWatch={handleToggleWatch}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {diagnosisStock && (
        <StockDiagnosisDialog 
          isOpen={!!diagnosisStock} 
          onOpenChange={(open) => !open && setDiagnosisStock(null)} 
          stock={diagnosisStock}
          phase={phase}
        />
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white/90 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑标的' : '新增标的'}</DialogTitle>
            <DialogDescription>
              {editingId ? '修改现有的龙头标的信息' : '录入新的核心观察标的'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">代码</label>
                <div className="relative">
                    <Input 
                        value={code} 
                        onChange={(e) => setCode(e.target.value)} 
                        placeholder="600xxx" 
                        onBlur={() => fetchDetails()} 
                    />
                    {isFetching && <RefreshCw className="w-3 h-3 absolute right-3 top-3 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">名称</label>
                <Input 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="股票名称" 
                    onBlur={handleNameBlur} 
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">核心题材/概念</label>
              <Select value={concept || '__none__'} onValueChange={(v) => { setConcept(v === '__none__' ? '' : v); if (v !== '__custom__') setCustomConcept(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="选择板块..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none__">未分类</SelectItem>
                  {PRESET_THEMES.map(t => (
                    <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">✏️ 自定义...</SelectItem>
                </SelectContent>
              </Select>
              {concept === '__custom__' && (
                <Input 
                  value={customConcept} 
                  onChange={(e) => setCustomConcept(e.target.value)} 
                  placeholder="输入自定义板块名称" 
                  className="mt-1"
                  autoFocus 
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <label className="text-sm font-medium">角色定位</label>
                <Select value={role} onValueChange={(v: any) => setRole(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Leader">核心龙头</SelectItem>
                    <SelectItem value="Vice">强力副龙</SelectItem>
                    <SelectItem value="Substitute">中位补涨</SelectItem>
                    <SelectItem value="Independent">独立妖股</SelectItem>
                    <SelectItem value="Main">中军容量</SelectItem>
                    <SelectItem value="Follower">跟风杂毛</SelectItem>
                    <SelectItem value="Potential">潜力潜伏</SelectItem>
                    <SelectItem value="Normal">普通观察</SelectItem>
                  </SelectContent>
                </Select>
               </div>
               <div className="space-y-2">
                <label className="text-sm font-medium">状态</label>
                <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Watch">观察 (Watch)</SelectItem>
                    <SelectItem value="Hold">持仓 (Hold)</SelectItem>
                    <SelectItem value="Sold">已卖出 (Sold)</SelectItem>
                  </SelectContent>
                </Select>
               </div>
            </div>

            {status === 'Hold' && (
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">持仓成本</label>
                        <Input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">建仓日期</label>
                        <Input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
                    </div>
                </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">逻辑/备注</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="输入核心逻辑或备注..." />
            </div>
          </div>
          <div className="flex justify-end gap-3">
             <Button variant="outline" onClick={() => setIsOpen(false)}>取消</Button>
             <Button onClick={handleSubmit}>{editingId ? '更新' : '添加'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};
