import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Stock, Theme, MarketIndex, DailyMetrics, MarketPhase, MarketEvent } from '../types';
import { 
    calculateResonance, 
    analyzeThemes, 
    calculatePremiumExpectation, 
    calculateDivergenceIndex,
    calculateIndependenceScore,
    identifyRole,
    calculateHedgeFactor,
    calculateRelativeSectorStrength,
    simulateAuctionData,
    calculateMarketEntropy,
    calculateFullMarketEntropy,
    calculateDragonSurvival,
    detectInflection,
    calculateMoneyQuality,
    calculateLimitUpStrength,
    calculateChipPressure,
    calculateSealQuality,
    detectExhaustion,
    analyzeThemeDropout,
    calculateLiquidityEntropy,
    calculateConsecutiveLimitUps,
    calculateTrailingStop,
    calculateCrowdedness // Added missing import for WarRoomMatrix usage if needed or just for consistency
} from '../utils/scoring';
import { detectMarketPhase } from '../utils/algorithmV41';
import { analyzeTrapRiskV41 } from '../utils/trapGuardV41';
import {
  analyzeStockSignal,
  type MicroStructureContext,
  type PredatorSignal,
} from '../utils/predatorEngine';
import type { MarketCalibrationContext } from '../utils/predictionCalibration';
import { calculateIndicators, analyzeIntradayStructure } from '../utils/indicators';
import {
  fetchStockData,
  fetchMarketIndices,
  fetchStockHistoryBatch,
  fetchRealTimeThemes,
  fetchMarketStats,
  fetchStockTicks,
  fetchStockHistory,
  fetchIntradayBatch,
  type MarketStatsSnapshot,
} from '../services/marketData';
import { getLocalHistoryBatch, setLocalHistoryBatch } from '../services/localDb'; // Fix: Correct imports from localDb
import { detectMarketEvents } from "../utils/events";
import { getPresetStocks, detectEventDrivenMode, type EventDrivenDetection } from "../data/presetStocks";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { calculateRealtimeMetrics } from "../utils/realtimeAnalysis";
import { detectBlackSwan, shouldOverrideSignal } from "../utils/blackSwanDetector";
import { calculateThemeBreadthConsensus, normalizeMarketConcept } from '../utils/marketConcepts';
import type { MarketRefreshStatus } from '../utils/dataHealth';
import { getDirectLargeOrderNetYuan } from '../utils/capitalFlow';

interface TradingState {
  stocks?: Stock[];
  themes?: Theme[];
  metrics?: DailyMetrics;
  journal?: JournalEntry;
  phaseHistory?: PhaseRecord[];
  indexTechnicals?: IndexTechnicals;
}

export interface IndexTechnicals {
  ma5: number;
  ma20: number;
  isBull: boolean;
  isStrong: boolean;
}

interface SentimentPoint {
  time: string;
  score: number;
  temp: number;
}

interface PhaseRecord {
  date: string;
  phase: MarketPhase;
  metrics: DailyMetrics;
}

interface JournalEntry {
  date: string;
  phase: MarketPhase;
  whatWentRight: string;
  whatWentWrong: string;
  strategy: string;
}

interface TradingContextType {
  metrics: DailyMetrics;
  setMetrics: (metrics: DailyMetrics) => void;
  sentimentHistory: SentimentPoint[];
  phase: MarketPhase;
  phaseHistory: PhaseRecord[];
  marketEvents: MarketEvent[];
  themes: Theme[];
  addTheme: (theme: Theme) => void;
  removeTheme: (id: string) => void;
  stocks: Stock[];
  addStock: (stock: Stock) => void;
  addStocks: (stocks: Stock[]) => void;
  updateStock: (id: string, updates: Partial<Stock>) => void;
  updateStocks: (updates: { id: string; changes: Partial<Stock> }[], recalculate?: boolean) => void;
  removeStock: (id: string) => void;
  journal: JournalEntry;
  setJournal: (entry: JournalEntry) => void;
  marketIndices: MarketIndex[];
  marketStats: MarketStatsSnapshot | null;
  marketThemes: Theme[]; // v7.2 全市场题材数据
  indexTechnicals: IndexTechnicals | null;
  refreshData: () => Promise<void>;
  isMarketOpen: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  isSaving: boolean;
  localSaveStatus: 'saved' | 'saving' | 'error';
  marketRefreshStatus: MarketRefreshStatus;
  lastMarketRefreshAt: number | null;
  marketRefreshError: string | null;
  forceRefreshHistory: () => void;
  eventDrivenMode: EventDrivenDetection | null; // V64.0
  analyzeLiveStockSignal: (
    stock: Stock,
    manualVelocity?: number,
    microContext?: MicroStructureContext,
    intentContext?: {
      intent: 'Accumulate' | 'Distribute' | 'Neutral';
      decoyScore: number;
      algoReason?: string;
    },
  ) => PredatorSignal;
}

const defaultMetrics: DailyMetrics = {
  limitUpCount: 0,
  height: 0,
  leaderStrong: false,
  clearTheme: false,
  volumeHigh: false,
  leaderBreak: false,
  heightDrop: false,
  limitUpDrop: false,
  bigLosses: false,
  spaceHeight: 0,
  limitDownCount: 0,
  yesterdayLimitUpEffect: 0
};

const getMarketStatsAge = (snapshot: MarketStatsSnapshot) => {
  const reportedAge = snapshot.quality?.ageMs || 0;
  const parsedAsOf = snapshot.quality?.asOf ? Date.parse(snapshot.quality.asOf) : NaN;
  const asOfAge = Number.isFinite(parsedAsOf) ? Math.max(0, Date.now() - parsedAsOf) : 0;
  return Math.max(reportedAge, asOfAge);
};

const isChinaMarketSession = (date = new Date()) => {
  const china = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const weekday = china.getUTCDay();
  const minutes = china.getUTCHours() * 60 + china.getUTCMinutes();
  return weekday >= 1 && weekday <= 5 &&
    ((minutes >= 9 * 60 + 15 && minutes <= 11 * 60 + 35) ||
      (minutes >= 12 * 60 + 55 && minutes <= 15 * 60 + 5));
};

const isMarketStatsUsable = (snapshot: MarketStatsSnapshot | null): snapshot is MarketStatsSnapshot => {
  if (!snapshot || snapshot.totalCount < 1_000) return false;
  const directionalCoverage = (
    snapshot.upCount + snapshot.downCount + snapshot.flatCount
  ) / Math.max(1, snapshot.totalCount);
  if (directionalCoverage < 0.75) return false;

  const quality = snapshot.quality;
  if (!quality) return false;
  const maxSourceAgeMs = isChinaMarketSession() ? 180_000 : 7 * 24 * 60 * 60 * 1000;
  const sourceIsFreshEnough = !Number.isFinite(quality.sourceAgeMs) ||
    (quality.sourceAgeMs || 0) <= maxSourceAgeMs;
  return quality.status !== 'UNAVAILABLE' &&
    quality.coverage >= 0.75 &&
    quality.segmentsSucceeded >= 1 &&
    getMarketStatsAge(snapshot) <= 120_000 &&
    sourceIsFreshEnough;
};

const defaultJournal: JournalEntry = {
  date: new Date().toISOString().split('T')[0],
  phase: 'Chaos',
  whatWentRight: '',
  whatWentWrong: '',
  strategy: '',
};

const TradingContext = createContext<TradingContextType | undefined>(undefined);

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [metrics, setMetrics] = useState<DailyMetrics>(defaultMetrics);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [journal, setJournal] = useState<JournalEntry>(defaultJournal);
  const [phase, setPhase] = useState<MarketPhase>('Chaos');
  const [phaseHistory, setPhaseHistory] = useState<PhaseRecord[]>([]);
  const [sentimentHistory, setSentimentHistory] = useState<SentimentPoint[]>([]);
  const [marketEvents, setMarketEvents] = useState<MarketEvent[]>([]);
  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>([]);
  const [marketStats, setMarketStats] = useState<MarketStatsSnapshot | null>(null);
  const [marketThemes, setMarketThemes] = useState<Theme[]>([]);
  const [indexTechnicals, setIndexTechnicals] = useState<IndexTechnicals | null>(null);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [isSaving, setIsSaving] = useState(false);
  const [localSaveStatus, setLocalSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [marketRefreshStatus, setMarketRefreshStatus] = useState<MarketRefreshStatus>('idle');
  const [lastMarketRefreshAt, setLastMarketRefreshAt] = useState<number | null>(null);
  const [marketRefreshError, setMarketRefreshError] = useState<string | null>(null);
  const [eventDrivenMode, setEventDrivenMode] = useState<EventDrivenDetection | null>(null); // V64.0

  const stocksRef = useRef(stocks);
  const themesRef = useRef(themes);
  const metricsRef = useRef(metrics);
  const historyRef = useRef(sentimentHistory);
  const stockHistoryCache = useRef<Record<string, any>>({});
  const phaseRef = useRef<MarketPhase>(phase);
  const marketListRef = useRef<{ list: any[]; fetchedAt: number } | null>(null);
  const marketListInFlightRef = useRef<Promise<void> | null>(null);
  const lastGoodMarketStatsRef = useRef<{ snapshot: MarketStatsSnapshot; receivedAt: number } | null>(null);
  const quoteRefreshCursorRef = useRef(0);

  const indexHistoryRef = useRef<{ close: number }[]>([]);

  useEffect(() => { stocksRef.current = stocks; }, [stocks]);
  useEffect(() => { themesRef.current = themes; }, [themes]);
  useEffect(() => { metricsRef.current = metrics; }, [metrics]);
  useEffect(() => { historyRef.current = sentimentHistory; }, [sentimentHistory]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const analyzeLiveStockSignal = useCallback((
    stock: Stock,
    manualVelocity?: number,
    microContext?: MicroStructureContext,
    intentContext?: {
      intent: 'Accumulate' | 'Distribute' | 'Neutral';
      decoyScore: number;
      algoReason?: string;
    },
  ) => {
    const shIndex = marketIndices.find(index => index.code.includes('sh000001'));
    const currentMarketDataStatus = marketStats
      ? marketStats.quality?.status || 'PARTIAL'
      : 'UNAVAILABLE';
    const currentMarketCoverage = marketStats?.quality?.coverage ?? (marketStats
      ? (marketStats.upCount + marketStats.downCount + marketStats.flatCount) / Math.max(1, marketStats.totalCount)
      : 0);
    const marketContext: MarketCalibrationContext = {
      totalCount: marketStats?.totalCount,
      upCount: marketStats?.upCount,
      downCount: marketStats?.downCount,
      limitUpCount: marketStats?.limitUpCount,
      limitDownCount: marketStats?.limitDownCount,
      dataStatus: currentMarketDataStatus,
      coverage: currentMarketCoverage,
      sourceAgeMs: marketStats?.quality?.sourceAgeMs,
      isMarketOpen,
      phaseConfidence: metrics.phaseConfidence,
      indexChange: shIndex?.changePercent || 0,
      isIndexBull: indexTechnicals?.isBull,
      isIndexStrong: indexTechnicals?.isStrong,
    };
    const theme = marketThemes.find(item => item.name === normalizeMarketConcept(stock.concept));
    const sectorContext = theme ? {
      rank: marketThemes.indexOf(theme) + 1,
      name: theme.name,
      isMainline: theme.type === 'Main',
    } : undefined;

    return analyzeStockSignal(
      stock,
      phaseRef.current,
      marketContext,
      sectorContext,
      marketThemes,
      manualVelocity,
      microContext,
      intentContext,
      eventDrivenMode || undefined,
    );
  }, [eventDrivenMode, indexTechnicals, isMarketOpen, marketIndices, marketStats, marketThemes, metrics.phaseConfidence]);

  // Unified score recalculation logic
  const recalculateStockScores = (
    currentStocks: Stock[],
    currentPhase: MarketPhase,
    currentIndices: MarketIndex[],
    marketTemp: number,
    marketThemes: Theme[] = [],
    indexTech: IndexTechnicals | null = null,
    marketCalibration?: MarketCalibrationContext,
  ): Stock[] => {
      // Step 1: Basic identification, Technicals & Role assignment
      let updated = currentStocks.map(s => {
        const tech = calculateIndicators(s.history || [], s.currentPrice);
        
        return {
            ...s,
            technicals: {
                ...tech, // Fix: Use all technicals from indicator engine
                ma5: tech.ma5 || 0,
                ma10: tech.ma10 || 0,
                ma20: tech.ma20 || 0,
                ma60: tech.ma60 || 0,
                ma120: tech.ma120 || 0,
                ma250: tech.ma250 || 0,
                atr: tech.atr || 0,
                avgVol5: tech.avgVol5 || 0,
                recentHigh: tech.recentHigh || 0,
                recentLow: tech.recentLow || 0,
                rsi: tech.rsi || undefined,
                mfi: tech.mfi || undefined,
                chipPressure: tech.chipPressure ?? calculateChipPressure(s.history || [], s.currentPrice || 0)
            },
            role: identifyRole(s, currentStocks, currentIndices),
            strengthScore: calculateLimitUpStrength(s),
            independenceScore: calculateIndependenceScore(s, currentIndices),
        };
      });

      // Step 2: Complex metrics requiring role/all stocks
      // V64.0: Detect event-driven mode ONCE for all stocks (cross-sector divergence scan)
      const eventDrivenDetection = detectEventDrivenMode(updated);
      if (eventDrivenDetection.mode !== 'NONE') {
        console.log(`[V64.0 EVENT MODE] ${eventDrivenDetection.mode} | ${eventDrivenDetection.description}`);
      }

      return updated.map(s => {
        const resonance = calculateResonance(s, updated, marketThemes);
        // v41.0 Upgrade: Use new TrapGuard and AI Prediction
        const trapResult = analyzeTrapRiskV41(s, currentPhase, updated);
        const premium = calculatePremiumExpectation(s, marketTemp);
        
        // Use Predator Engine for consistent signaling
        const stockWithFreshRisk = { ...s, trapRiskScore: trapResult.score };
        // Pass global index context for Veto Logic
        const shIndex = currentIndices.find(i => i.code.includes('sh000001'));
        const indexChange = shIndex ? shIndex.changePercent : 0;
        
        // v16.2: Pass Index Trend Context
        const marketContext: MarketCalibrationContext = {
            ...marketCalibration,
            indexChange, 
            isIndexBull: indexTech?.isBull, 
            isIndexStrong: indexTech?.isStrong 
        };
        
        // v8.5 Fix: Pass Sector Context for Lone Wolf Punishment
        const myTheme = marketThemes.find(t => t.name === s.concept);
        const sectorContext = myTheme ? {
            rank: marketThemes.indexOf(myTheme) + 1,
            name: myTheme.name,
            isMainline: myTheme.type === 'Main'
        } : undefined;

        // V65.0: Build MicroStructureContext from intraday indicators + snapshot fallback
        const intraday = s.intradayIndicators;
        const microContext = {
          macdfs: intraday?.macdfs?.signal || 'None' as const,
          volumeRatio: intraday?.volumeStructure
            ? (intraday.volumeStructure.avgVol5 > 0 ? intraday.volumeStructure.lastVol / intraday.volumeStructure.avgVol5 : undefined)
            : (s.auctionData?.volumeRatio || undefined),
          largeOrderNetYuan: getDirectLargeOrderNetYuan(s),
          isHeavyVolume: intraday?.volumeStructure?.isHeavy || false,
        };
        // Only inject if we have meaningful data (avoid noise from empty contexts)
        const hasMicroData = microContext.macdfs !== 'None' ||
          microContext.volumeRatio !== undefined ||
          microContext.largeOrderNetYuan !== undefined;

        // V64.0: Pass event-driven context (传导时滞修正)
        const signal = analyzeStockSignal(
            stockWithFreshRisk, currentPhase, marketContext, sectorContext, marketThemes,
            undefined,                                  // manualVelocity
            hasMicroData ? microContext : undefined,     // V65.0: microContext (was undefined)
            undefined,                                  // intentContext
            eventDrivenDetection,                       // V64.0 event-driven context
        );
        
        const prediction = {
            trend: signal.trend,
            summary: signal.summary,
            strategy: signal.strategy,
            positionAdvice: signal.positionAdvice,
            winRate: signal.prediction?.probability || 50,
            confidence: signal.prediction?.probability || 50,
            buyPoint: `¥${signal.buyPoint.toFixed(2)}`,
            sellPoint: `¥${signal.sellPoint.toFixed(2)}`,
            prediction: signal.prediction,
            smartEntry: signal.smartEntry,
            signalType: signal.signalType,
        };
        
        // v27.0 & v28.0 New Metrics
        const moneyQuality = calculateMoneyQuality(s);
        const sealQuality = calculateSealQuality(s);
        const exhaustion = detectExhaustion(s);
        const themeDropout = s.concept ? analyzeThemeDropout(s.concept, updated) : false;
        const entropy = calculateLiquidityEntropy(s);
        
        // v33.0: Real-time Consecutive Limit Ups
        // Prioritize dynamic calculation to solve "Board Stairs" sync issue
        const consecutive = calculateConsecutiveLimitUps(s) || (s.isLimitUp ? 1 : 0);

        // v27.0 Profit Guard Auto-Calculation
        let trailingStop = s.trailingStopPrice;
        if (s.status === 'Hold' && s.trailingStopMode !== 'Manual') {
            trailingStop = calculateTrailingStop(s, currentPhase);
        }

        return {
          ...s,
          resonanceScore: resonance,
          trapRiskScore: trapResult.score,
          trapSignals: trapResult.signals,
          stargate: signal.stargate, // Added: Store stargate signals in stock state
          premiumExpectation: premium,
          aiPrediction: prediction as any, // Cast to match existing type if compatible, or update type definition
          moneyQualityScore: moneyQuality,
          sealQualityScore: sealQuality,
          exhaustionSignal: exhaustion,
          isThemeDropout: themeDropout,
          trailingStopPrice: trailingStop,
          liquidityEntropy: entropy,
          consecutiveLimitUps: consecutive
        };
      });
    };

  // Market breadth and stock histories complete on different async paths.
  // Recalibrate once when the verified market status changes so a prediction
  // created during the loading window cannot remain permanently UNAVAILABLE.
  useEffect(() => {
    if (!isMarketStatsUsable(marketStats)) return;
    const targetStatus = marketStats.quality?.status || 'PARTIAL';
    const currentStocks = stocksRef.current;
    const needsMarketRecalibration = currentStocks.some(
      stock => stock.aiPrediction?.prediction?.marketDataStatus !== targetStatus,
    );
    if (!needsMarketRecalibration) return;

    const recalibratedStocks = recalculateStockScores(
      currentStocks,
      phaseRef.current,
      marketIndices,
      metricsRef.current.marketTemp,
      marketThemes,
      indexTechnicals,
      {
        totalCount: marketStats.totalCount,
        upCount: marketStats.upCount,
        downCount: marketStats.downCount,
        limitUpCount: marketStats.limitUpCount,
        limitDownCount: marketStats.limitDownCount,
        dataStatus: targetStatus,
        coverage: marketStats.quality?.coverage,
        sourceAgeMs: marketStats.quality?.sourceAgeMs,
        isMarketOpen,
        phaseConfidence: metricsRef.current.phaseConfidence,
      },
    );
    setStocks(recalibratedStocks);
  }, [
    indexTechnicals,
    isMarketOpen,
    marketIndices,
    marketStats,
    marketThemes,
  ]);

  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;
      const isMorning = (hour === 9 && minute >= 15) || (hour === 10) || (hour === 11 && minute <= 30);
      const isAfternoon = (hour >= 13 && hour < 15);
      setIsMarketOpen(isWeekday && (isMorning || isAfternoon));
    };
    checkTime();
    const timer = setInterval(checkTime, 60000);
    return () => clearInterval(timer);
  }, []);

  const isRefreshing = useRef(false);
  const saveDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSavePayload = useRef<any>({});
  const MAX_SAVE_RETRIES = 2;

  // V66.5: Flush pending saves on page unload (survives tab close/refresh)
  // Uses fetch+keepalive instead of sendBeacon because Supabase requires Authorization header
  useEffect(() => {
    const handleUnload = () => {
      if (Object.keys(pendingSavePayload.current).length > 0 && projectId) {
        const bodyStr = JSON.stringify(pendingSavePayload.current);
        // keepalive fetch survives page unload (up to 64KB body) and supports custom headers
        if (bodyStr.length < 64000) {
          try {
            fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-545d7fd7/data`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
                body: bodyStr,
                keepalive: true,
              }
            );
          } catch (_) { /* best-effort */ }
        }
        pendingSavePayload.current = {};
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const saveData = async (partialData: Partial<TradingState>, immediate = false) => {
    setIsSaving(true);
    setLocalSaveStatus('saving');
    try {
        // Optimization: Create a lightweight version for persistence
        // Strip 'history' from stocks to prevent payload bloat and broken pipes
        const payload: any = { ...partialData };
        if (Array.isArray(payload.stocks)) {
            // v10.4 Optimization: Filter out auto-discovered stocks to prevent payload bloat
            const persistentStocks = payload.stocks.filter((s: Stock) => {
                const isAuto = s.tags?.includes('Auto-Discovered');
                const isImportant = s.status === 'Hold' || (s.status as string) === 'Buy';
                return !(isAuto && !isImportant);
            });

            payload.stocks = persistentStocks.map((s: Stock) => {
                // Strip ALL transient/derived data. Only keep core metadata and user settings.
                // V66.5: Comprehensive strip list — every field recalculated on refresh
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { 
                    history, technicals, realtimeMetrics, aiPrediction, trapSignals, stargate,
                    ticks, dragonTigerBoard, marginData, intradayIndicators,
                    // Order book data
                    buyVolume, sellVolume, bidAmount, askAmount,
                    bid1Amount, bid2Amount, bid3Amount, ask1Amount, ask2Amount, ask3Amount,
                    // Transient scores (recalculated from real-time data)
                    strengthScore, resonanceScore, independenceScore, trapRiskScore,
                    moneyQualityScore, sealIntensity, boardResilience, resonanceFactor,
                    exhaustionSignal, isThemeDropout,
                    // Real-time price data (re-fetched)
                    volume, turnoverRate, largeOrderNetYuan, largeOrderNetSource,
                    largeOrderNetAsOf, mainMoneyIn, committeeRatio,
                    avgVolume, sealAmount, bigBuyAmount,
                    // V66.5: Additional transient fields missed in V63.1
                    sealQualityScore, liquidityEntropy, consecutiveLimitUps,
                    auctionData, premiumExpectation,
                    ...rest 
                } = s as any; 
                return rest;
            });
        }

        let localSaved = false;
        try {
            const saved = localStorage.getItem('trading-system-v1');
            const currentData = saved ? JSON.parse(saved) : {};
            const newData = { ...currentData, ...payload };
            localStorage.setItem('trading-system-v1', JSON.stringify(newData));
            localSaved = true;
        } catch (lsErr) {
            console.warn('Local save failed, retrying with compact payload...', lsErr);
            try {
                localStorage.removeItem('trading-system-v1');
                localStorage.setItem('trading-system-v1', JSON.stringify(payload));
                localSaved = true;
            } catch (retryError) {
                console.error('Local save retry failed', retryError);
            }
        }
        setLocalSaveStatus(localSaved ? 'saved' : 'error');
        
        // Accumulate changes for network debounce
        pendingSavePayload.current = { ...pendingSavePayload.current, ...payload };

        if (projectId) {
          if (saveDebounceTimer.current) {
              clearTimeout(saveDebounceTimer.current);
          }

          const doFetch = async () => {
              // V66.5: Snapshot pending data and clear immediately to avoid double-send
              const dataToSend = { ...pendingSavePayload.current };
              pendingSavePayload.current = {};
              const finalBodyStr = JSON.stringify(dataToSend);

              const attemptFetch = async (body: string, maxAttempts: number): Promise<void> => {
                for (let attempt = 0; attempt <= maxAttempts; attempt++) {
                  try {
                    // V66.5: Skip if browser is offline
                    if (typeof navigator !== 'undefined' && !navigator.onLine) {
                      console.warn('[Save] Browser offline, deferring to next save cycle (LS has data)');
                      try { pendingSavePayload.current = { ...pendingSavePayload.current, ...JSON.parse(body) }; } catch (_) {}
                      setConnectionStatus('disconnected');
                      return;
                    }

                    const bodySizeKB = Math.round(body.length / 1024);
                    if (bodySizeKB > 500) {
                      console.warn(`[Save] Payload size: ${bodySizeKB}KB — may exceed Edge Function limits`);
                    }

                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 15000);
                    const useKeepalive = body.length < 64000;
                    
                    const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-545d7fd7/data`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
                      body, 
                      signal: controller.signal,
                      keepalive: useKeepalive,
                    });
                    
                    clearTimeout(timeout);
                    
                    if (response.ok) {
                      setConnectionStatus('connected');
                      return;
                    } else {
                      console.warn('Save failed with status:', response.status);
                      setConnectionStatus('disconnected');
                      return; // Server responded — not transient, don't retry
                    }
                  } catch (fetchError: any) {
                    if (fetchError.name === 'AbortError') {
                      console.warn('Save request timed out');
                      setConnectionStatus('disconnected');
                      return;
                    }
                    
                    if (attempt < maxAttempts) {
                      const backoff = 3000 * (attempt + 1);
                      console.warn(`[Save] Retry ${attempt + 1}/${maxAttempts} in ${backoff}ms — ${fetchError.message}`);
                      await new Promise(r => setTimeout(r, backoff));
                      continue;
                    }
                    
                    // Retries exhausted — re-queue for next save cycle
                    console.warn('[Save] Retries exhausted, re-queuing for next cycle:', fetchError.message);
                    try { pendingSavePayload.current = { ...pendingSavePayload.current, ...JSON.parse(body) }; } catch (_) {}
                    setConnectionStatus('disconnected');
                  }
                }
              };

              try {
                await attemptFetch(finalBodyStr, MAX_SAVE_RETRIES);
              } finally {
                setIsSaving(false);
                saveDebounceTimer.current = null;
              }
          };

          if (immediate) {
              doFetch();
          } else {
              saveDebounceTimer.current = setTimeout(doFetch, 2000);
          }
        } else {
             setIsSaving(false);
        }
    } catch (e) {
      console.error('Save data error:', e);
      setLocalSaveStatus('error');
      setConnectionStatus('disconnected');
      setIsSaving(false);
    }
  };

  const loadData = async () => {
    setConnectionStatus('connecting');
    try {
      let data: any = {};
      let cloudLoaded = false;
      
      if (projectId) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          
          const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-545d7fd7/data`, {
            headers: { 'Authorization': `Bearer ${publicAnonKey}` },
            signal: controller.signal
          });
          
          clearTimeout(timeout);
          
          if (res.ok) {
            data = await res.json();
            cloudLoaded = true;
            setConnectionStatus('connected');
          } else {
            console.warn('Load failed with status:', res.status);
            setConnectionStatus('disconnected');
          }
        } catch (fetchError: any) {
          if (fetchError.name === 'AbortError') {
            console.warn('Load request timed out');
          } else {
            console.warn('Load fetch error:', fetchError);
          }
          setConnectionStatus('disconnected');
        }
      }
      
      // Load Local Data as Backup / Merge Source
      const saved = localStorage.getItem('trading-system-v1');
      const localData = saved ? JSON.parse(saved) : {};

      if (!cloudLoaded) {
          // If cloud failed, use local entirely
          data = localData;
      }

      // Logic Change v32.1 & v43.0: 
      // Merge Strategy: Cloud is Truth, but Local might have unsaved new items (from offline/debounce gap)
      // We assume Cloud Data is array of stocks.
      let finalStocks: Stock[] = [];
      
      const cloudStocks = Array.isArray(data.stocks) ? data.stocks : [];
      const localStocks = Array.isArray(localData.stocks) ? localData.stocks : [];

      if (cloudLoaded && localStocks.length > 0) {
          // Smart Merge: Add local stocks that are NOT in cloud (by ID)
          // This rescues items added just before a refresh/crash
          const cloudIds = new Set(cloudStocks.map((s: any) => s.id));
          const unsavedLocals = localStocks.filter((s: any) => !cloudIds.has(s.id));
          
          if (unsavedLocals.length > 0) {
              console.log(`Rescuing ${unsavedLocals.length} unsaved stocks from local storage`);
              finalStocks = [...cloudStocks, ...unsavedLocals];
              // Trigger a background save to sync these rescued items back to cloud
              setTimeout(() => saveData({ stocks: finalStocks }, true), 5000);
          } else {
              finalStocks = cloudStocks;
          }
      } else {
          // Either cloud failed (use local) or no local data (use cloud)
          finalStocks = cloudLoaded ? cloudStocks : localStocks;
      }
      
      // AUTO-MIGRATION LOGIC (v42.0):
      // Always enforce the latest metadata (concept, name, role) from presetStocks.ts
      const presets = getPresetStocks();
      // Normalize preset keys for fuzzy matching (strip prefix)
      const presetMap = new Map(presets.map(p => [p.code, p]));
      const presetMapNoPrefix = new Map(presets.map(p => [p.code.replace(/^(sh|sz|bj)/, ''), p]));

      let hasChanges = false;

      finalStocks = finalStocks.map((s: Stock) => {
          // Try exact match first, then fuzzy match (no prefix)
          let preset = presetMap.get(s.code);
          
          if (!preset) {
              const rawCode = s.code.replace(/^(sh|sz|bj)/, '');
              preset = presetMapNoPrefix.get(rawCode);
              
              // If found via fuzzy match, detecting a "Zombie" (prefix-less) stock
              // Upgrade it to the correct prefixed code and ID
              if (preset) {
                   console.log(`Upgrading zombie stock ${s.code} to ${preset.code}`);
                   hasChanges = true;
                   return {
                       ...s,
                       id: preset.id, // Fix ID
                       code: preset.code, // Fix Code
                       concept: preset.concept,
                       name: preset.name,
                       role: preset.role,
                       notes: preset.notes,
                       status: 'Watch' // Reset status to ensure visibility
                   };
              }
          }

          if (preset) {
              // Exact match update
              if (s.concept !== preset.concept || s.role !== preset.role || s.name !== preset.name) {
                  hasChanges = true;
                  return {
                      ...s,
                      concept: preset.concept, 
                      name: preset.name,
                      role: preset.role,
                      notes: preset.notes // Sync notes too
                  };
              }
          }
          return s;
      });

      // Deduplicate after potential upgrades (in case both 600111 and sh600111 existed)
      const uniqueMap = new Map();
      finalStocks.forEach(s => uniqueMap.set(s.code, s));
      finalStocks = Array.from(uniqueMap.values());

      // If list is empty (first run), seed with presets
      if (finalStocks.length === 0 && !cloudLoaded && !saved) {
          finalStocks = presets;
          hasChanges = true;
      } else {
          // Check if we need to merge new presets
          const existingCodes = new Set(finalStocks.map(s => s.code));
          const newStocks = presets.filter(p => !existingCodes.has(p.code));
          
          if (newStocks.length > 0) {
              console.log(`Adding ${newStocks.length} new preset stocks`);
              finalStocks = [...finalStocks, ...newStocks];
              hasChanges = true;
          }
      }

      // Force Save if we made any migration changes
      if (hasChanges) {
          setTimeout(() => saveData({ stocks: finalStocks }, true), 2000);
      }

      // CRITICAL UPGRADE: Enforce 120-day history requirement for TrapGuard
      // UPDATE: Relaxed to prevent "Death Loop" of re-fetching.
      // If we have SOME history (e.g. > 30 days) and it looks valid, keep it.
      // The Service layer (marketData.ts) handles the "Freshness" check now.
      finalStocks = finalStocks.map(s => {
          // Only invalidate if truly broken/empty
          if (s.history && s.history.length < 5) {
              return { ...s, history: undefined };
          }
          return s;
      });

      setStocks(finalStocks);
      if (data.themes) setThemes(data.themes);
      if (data.metrics) setMetrics(data.metrics);
      if (data.journal) setJournal(data.journal);
      if (data.phaseHistory) setPhaseHistory(data.phaseHistory);
      setConnectionStatus(cloudLoaded ? 'connected' : 'disconnected');
    } catch (e) {
      setConnectionStatus('disconnected');
    }
  };

  useEffect(() => {
      // v16.3 Optimization: Load Index History ONCE on mount
      // We don't need to re-fetch daily history during the day, just use real-time price to update MA.
      const loadIndexHistory = async () => {
          try {
              const map = await fetchStockHistoryBatch(['sh000001']);
              if (map['sh000001']) {
                  indexHistoryRef.current = map['sh000001'];
                  console.log("[Index] History loaded for technical analysis");
              }
          } catch (e) {
              console.warn("Failed to load index history", e);
          }
      };
      loadIndexHistory();
  }, []);

  useEffect(() => {
    loadData().then(() => {
        // Wait for state to settle before initial refresh
        setTimeout(refreshData, 500);
    });
  }, []);

  const refreshMarketListInBackground = () => {
    const cached = marketListRef.current;
    if (cached && Date.now() - cached.fetchedAt < 120_000) return;
    if (marketListInFlightRef.current) return;

    const request = fetchMarketStats(true)
      .then(snapshot => {
        if (!isMarketStatsUsable(snapshot) || !snapshot.list || snapshot.list.length < 4_000) return;
        marketListRef.current = { list: snapshot.list, fetchedAt: Date.now() };
        lastGoodMarketStatsRef.current = { snapshot, receivedAt: Date.now() };
        setMarketStats(snapshot);
      })
      .finally(() => {
        marketListInFlightRef.current = null;
      });
    marketListInFlightRef.current = request;
  };

  useEffect(() => {
    if (isMarketOpen) {
      // User Request: Refresh every 30 seconds during trading hours
      // This reduces noise and aligns with the "Game Cycle" of large orders
      const timer = setInterval(refreshData, 30000);
      return () => clearInterval(timer);
    }
  }, [isMarketOpen]);

  const refreshData = async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    setMarketRefreshStatus('refreshing');
    setMarketRefreshError(null);
    try {
        // Resolve the compact breadth summary before scoring stocks. Starting
        // the full-list request at the same time creates two cold scans and can
        // let predictions permanently capture UNAVAILABLE while the market UI
        // recovers a few seconds later.
        const [{ data: indices }, marketStatsSummary, realTimeThemes] = await Promise.all([
          fetchMarketIndices(),
          fetchMarketStats(false),
          fetchRealTimeThemes()
        ]);
        let marketStatsResult = marketStatsSummary;
        if (!isMarketStatsUsable(marketStatsResult)) {
          const fullSnapshot = await fetchMarketStats(true);
          if (isMarketStatsUsable(fullSnapshot)) {
            marketStatsResult = fullSnapshot;
            if (fullSnapshot.list && fullSnapshot.list.length >= 4_000) {
              marketListRef.current = { list: fullSnapshot.list, fetchedAt: Date.now() };
            }
          }
        }
        if (isMarketStatsUsable(marketStatsResult)) {
          lastGoodMarketStatsRef.current = { snapshot: marketStatsResult, receivedAt: Date.now() };
        }
        const lastGood = lastGoodMarketStatsRef.current;
        const marketStatsBase = isMarketStatsUsable(marketStatsResult)
          ? marketStatsResult
          : lastGood && Date.now() - lastGood.receivedAt <= 60_000
            ? lastGood.snapshot
            : null;
        const marketStats = marketStatsBase
          ? { ...marketStatsBase, list: marketListRef.current?.list }
          : null;
        const marketDataStatus = marketStats
          ? marketStats.quality?.status || 'PARTIAL'
          : 'UNAVAILABLE';
        const marketDataCoverage = marketStats?.quality?.coverage ?? (marketStats
          ? (marketStats.upCount + marketStats.downCount + marketStats.flatCount) / Math.max(1, marketStats.totalCount)
          : 0);

        // v16.3: Calculate Real-Time Index Technicals
        // Combine cached history (Yesterday) + Real-time Price (Today) for Dynamic MA
        let newIndexTech: IndexTechnicals | null = null;
        const shIndexLive = indices.find(i => i.code.includes('000001') || i.name.includes('上证'));
        const history = indexHistoryRef.current;
        
        if (shIndexLive && history && history.length > 20) {
             const currentPrice = shIndexLive.currentPrice;
             
             // Dynamic MA Calculation
             // We assume 'history' contains closed candles (up to yesterday)
             // So MA5 = (Sum(Last 4 Days) + Today) / 5
             const last4 = history.slice(-4).map(h => h.close);
             const last19 = history.slice(-19).map(h => h.close);
             
             const sum4 = last4.reduce((a, b) => a + b, 0);
             const sum19 = last19.reduce((a, b) => a + b, 0);
             
             const rtMA5 = (sum4 + currentPrice) / 5;
             const rtMA20 = (sum19 + currentPrice) / 20;
             
             newIndexTech = {
                 ma5: rtMA5,
                 ma20: rtMA20,
                 isBull: currentPrice > rtMA20,
                 isStrong: currentPrice > rtMA5
             };
             setIndexTechnicals(newIndexTech);
        }
        
        // v43.0 DATA ENRICHMENT: Cross-reference MarketStats with PresetStocks to calculate accurate Sector Resonance
        // This solves the issue where "Sector Resonance" showed 0 because user didn't hold the stocks.
        const presets = getPresetStocks();
        const presetMap = new Map<string, string>(); // Code -> Concept
        
        // Build Knowledge Base (Presets + User Stocks)
        presets.forEach(p => presetMap.set(p.code.replace(/^(sh|sz|bj)/, ''), p.concept));
        stocksRef.current.forEach(s => {
             const raw = s.code.replace(/^(sh|sz|bj)/, '');
             if (s.concept) presetMap.set(raw, s.concept);
        });

        // Aggregation Containers
        const sectorStats: Record<string, { limitUps: number, totalChange: number, count: number }> = {};
        
        if (marketStats?.list) {
            marketStats.list.forEach((s: any) => {
                const concept = presetMap.get(s.code); // s.code is raw in marketStats
                if (concept) {
                    // Handle multi-tag concepts (e.g. "AI,SaaS")
                    const tags = concept.split(/[,/]/).map(t => t.trim());
                    
                    const isLimitUp = Boolean(s.isLimitUp);
                    
                    tags.forEach(tag => {
                        if (!sectorStats[tag]) sectorStats[tag] = { limitUps: 0, totalChange: 0, count: 0 };
                        
                        sectorStats[tag].count++;
                        sectorStats[tag].totalChange += s.changePercent || 0;
                        if (isLimitUp) sectorStats[tag].limitUps++;
                    });
                }
            });
        }

        // Inject Enrichment into Market Themes
        const enrichedThemes = realTimeThemes.map(t => {
            const stats = sectorStats[t.name];
            if (stats) {
                return {
                    ...t,
                    stockCount: stats.limitUps, // TRUE Limit Up Count from Full Market
                    strength: Math.min(100, (stats.limitUps * 10) + (stats.totalChange / (stats.count || 1) * 5))
                };
            }
            return t;
        });

        // V67.6: Fix GBK-corrupted index names with clean mapping
        const INDEX_NAME_FIX: Record<string, string> = {
          "sh000001": "上证指数", "sz399001": "深证成指", "sz399006": "创业板指", "sh000688": "科创50",
          "sh000300": "沪深300", "sz399005": "中小板指",
        };
        const cleanIndices = indices.map((idx: any) => ({
          ...idx,
          name: INDEX_NAME_FIX[idx.code] || idx.name || idx.code,
        }));

        setMarketIndices(cleanIndices);
        setMarketStats(marketStats);
        setMarketThemes(enrichedThemes);
        setMetrics(prev => ({
          ...prev,
          marketDataStatus,
          marketDataCoverage,
          marketDataAgeMs: marketStats?.quality?.sourceAgeMs,
        }));
        setLastMarketRefreshAt(Date.now());
        setMarketRefreshStatus('success');

        const currentStocks = stocksRef.current;
        if (currentStocks.length > 0) {
          // v7.7 性能优化：优先从全市场快照 (marketStats.list) 中更新自选股数据
          // 这免了额外的 /market/stocks 请求，且确保数据 100% 同步
          const marketList = marketStats?.list || [];
          const marketMap = new Map<string, Partial<Stock>>(
            marketList.map((stock: Partial<Stock> & { code: string }) => [stock.code, stock]),
          );

          const heldStocks = currentStocks.filter(stock => stock.status === 'Hold');
          const rotatingStocks = currentStocks.filter(stock =>
            stock.status !== 'Hold' && !stock.tags?.includes('Auto-Discovered')
          );
          const quoteCapacity = Math.max(0, 15 - heldStocks.length);
          const rotatingQuotes = Array.from({ length: Math.min(quoteCapacity, rotatingStocks.length) }, (_, offset) =>
            rotatingStocks[(quoteRefreshCursorRef.current + offset) % rotatingStocks.length]
          );
          if (rotatingStocks.length > 0) {
            quoteRefreshCursorRef.current = (quoteRefreshCursorRef.current + rotatingQuotes.length) % rotatingStocks.length;
          }
          const priorityStocks = [...heldStocks, ...rotatingQuotes]
            .filter((stock, index, list) => list.findIndex(item => item.code === stock.code) === index)
            .slice(0, Math.max(15, heldStocks.length));
          const priorityQuoteCodes = new Set(priorityStocks.map(stock => stock.code));
          const { data: priorityQuotes } = priorityStocks.length > 0
            ? await fetchStockData(priorityStocks.map(stock => stock.code))
            : { data: {} as Record<string, Partial<Stock>> };
          
          let nextStocks = currentStocks.map(stock => {
            // Remove prefix for lookup if needed, but Eastmoney code is raw (e.g. 600519)
            // Our stock codes might have prefix or not. Let's normalize.
            const rawCode = stock.code.replace(/^(sh|sz|bj)/, '');
            const update = marketMap.get(rawCode);
            
            if (update) {
                return { 
                    ...stock, 
                    currentPrice: update.currentPrice,
                    changePercent: update.changePercent,
                    turnover: update.amount, // Mapping f6 to turnover/amount
                    turnoverRate: update.turnoverRate, // Added: Real-time Turnover Rate
                    largeOrderNetYuan: update.largeOrderNetYuan,
                    largeOrderNetSource: update.largeOrderNetSource,
                    largeOrderNetAsOf: update.largeOrderNetAsOf,
                    limitUpPrice: update.limitUpPrice,
                    limitDownPrice: update.limitDownPrice,
                    isLimitUp: Boolean(update.isLimitUp),
                    isLimitDown: Boolean(update.isLimitDown),
                };
            }
            return stock;
          });

          nextStocks = nextStocks.map(stock => priorityQuotes[stock.code]
            ? { ...stock, ...priorityQuotes[stock.code] }
            : stock
          );

          // v8.0 全市场扫描补全：自动发现所有涨停/跌停/高标股
          // 确保连板天梯、龙头雷达和风险预警基于全市场数据，消除幸存者偏差
          const existingCodes = new Set(nextStocks.map(s => s.code.replace(/^(sh|sz|bj)/, '')));
          
          // Performance Protection: Limit total auto-discovered stocks to prevent UI freezing
          // Sort by "Importance" (Turnover Amount) to keep the most relevant ones
          const MAX_AUTO_ADD = 30; 
          
          let potentialFlyers = marketList.filter(s => {
              if (existingCodes.has(s.code)) return false;
              
              const isBig = (s.amount || 0) > 5000000000;
              
              return s.isLimitUp || s.isLimitDown || isBig;
          });

          // Sort by Amount (Turnover) descending to pick the most active ones
          potentialFlyers.sort((a, b) => (b.amount || 0) - (a.amount || 0));
          
          // Take top N
          const newHighFlyers = potentialFlyers.slice(0, MAX_AUTO_ADD).map(s => ({
              id: `auto-${s.code}`,
              code: s.code, // Note: raw code from Eastmoney usually matches needed format or needs prefix
              name: s.name,
              currentPrice: s.currentPrice,
              changePercent: s.changePercent,
              turnover: s.amount,
              turnoverRate: s.turnoverRate,
              largeOrderNetYuan: s.largeOrderNetYuan,
              largeOrderNetSource: s.largeOrderNetSource,
              largeOrderNetAsOf: s.largeOrderNetAsOf,
              limitUpPrice: s.limitUpPrice,
              limitDownPrice: s.limitDownPrice,
              isLimitUp: Boolean(s.isLimitUp),
              isLimitDown: Boolean(s.isLimitDown),
              concept: undefined,
              role: 'Observer',
              status: 'Watch',
              tags: ['Auto-Discovered'],
              history: [] // No history initially, will be fetched if needed
          } as Stock));

          if (newHighFlyers.length > 0) {
              // Normalize codes for new stocks (add prefix based on rule)
              const normalizedHighFlyers = newHighFlyers.map(s => {
                  let code = s.code;
                  if (/^\d{6}$/.test(code)) {
                      if (code.startsWith('6')) code = `sh${code}`;
                      else if (code.startsWith('0') || code.startsWith('3')) code = `sz${code}`;
                      else if (code.startsWith('8') || code.startsWith('4')) code = `bj${code}`;
                  }
                  return { ...s, code };
              });
              nextStocks = [...nextStocks, ...normalizedHighFlyers];
          }

          // 如果快照中没找全（比如新加入的或特殊标的），再按需补提
          const stillMissing = nextStocks.filter(s => {
              const rawCode = s.code.replace(/^(sh|sz|bj)/, '');
              return !marketMap.has(rawCode) && !priorityQuoteCodes.has(s.code);
          });

          if (stillMissing.length > 0) {
              const codes = stillMissing.map(s => s.code);
              const { data: remoteUpdates } = await fetchStockData(codes);
              nextStocks = nextStocks.map(stock => {
                  const update = remoteUpdates[stock.code];
                  return update ? { ...stock, ...update } : stock;
              });
          }

          // Dynamic Theme Analysis (v27.0 Fix: Added missing argument and auto-extraction)
          let currentThemes = themesRef.current;
          if (currentThemes.length === 0) {
              // Extract unique themes from current stocks if none exist
              const uniqueConcepts = Array.from(new Set(
                nextStocks.map(s => normalizeMarketConcept(s.concept)).filter((name): name is string => Boolean(name))
              ));
              currentThemes = uniqueConcepts.map(name => ({
                  id: `theme-${name}`,
                  name: name as string,
                  type: 'Main',
                  logic: '系统自动识主线',
                  strength: 0,
                  stockCount: 0
              }));
          }
          const analyzedThemes = analyzeThemes(currentThemes, nextStocks, realTimeThemes); // Fix: Pass realTimeThemes
          setThemes(analyzedThemes);

          // Improved sentiment calculation v4.0 -> v7.6
          // Use real market stats from backend to avoid estimation errors
          const limitUps = nextStocks.filter(s => s.isLimitUp).length;
          const limitDowns = nextStocks.filter(s => s.isLimitDown).length;
          
          // v7.6: Prioritize real market stats for sentiment
          const realMarketLimitUps = marketStats?.limitUpCount || 0;
          const realMarketLimitDowns = marketStats?.limitDownCount || 0;
          const effectiveLimitUps = marketStats ? realMarketLimitUps : limitUps;
          const effectiveLimitDowns = marketStats ? realMarketLimitDowns : limitDowns;

          // 市场宽度因子：当全市场涨停数 > 50只时，说明市场普涨（加分）
          //                当全市场涨停数 < 20只时，说明市场分歧（减分）
          // v7.6 Fix: Use real market stats instead of estimation
          const breadthFactor = marketStats
            ? effectiveLimitUps > 50 ? 20 : (effectiveLimitUps < 20 ? -15 : 0)
            : 0;
          
          const highHeightStocks = nextStocks.filter(s => parseInt(s.notes?.match(/(\d+)连板/)?.[1] || '0') >= 3);
          const highHeightProfit = highHeightStocks.length > 0 
            ? highHeightStocks.reduce((acc, s) => acc + (s.changePercent || 0), 0) / highHeightStocks.length 
            : 0;
          
          // v7.1 优化：昨日涨停效应计算 - 加权量
          const yesterdayLimitUpStocks = nextStocks.filter(s => s.notes?.includes('昨曾涨停'));
          const yesterdayLimitUpEffect = yesterdayLimitUpStocks.length > 0
            ? yesterdayLimitUpStocks.reduce((acc, s) => {
                const change = s.changePercent || 0;
                const turnover = s.turnoverRate || 5;
                // 缩量溢价股（换手<3%）权重更高，炸板股权重降低
                const weight = turnover < 3 ? 1.5 : (turnover > 15 ? 0.5 : 1.0);
                return acc + (change * weight);
              }, 0) / yesterdayLimitUpStocks.length
            : 0;

          // v7.1 优化：封板质量评估（早盘板>午后板，缩量板>爆量板）
          const qualityLimitUps = nextStocks.filter(s => {
            if (!s.isLimitUp) return false;
            const turnover = s.turnoverRate || 5;
            const isEarlyBoard = s.notes?.includes('早盘') || s.notes?.includes('09:') || s.notes?.includes('10:');
            return turnover < 8 || isEarlyBoard; // 缩量板或早盘板
          }).length;

          // v7.1 优化：连板梯队质量（1板、2板、3板+ 都有才是健康结构）
          const board1 = nextStocks.filter(s => s.isLimitUp && !s.notes?.includes('连板')).length;
          const board2 = nextStocks.filter(s => s.notes?.includes('2连板')).length;
          const board3Plus = nextStocks.filter(s => {
            const height = parseInt(s.notes?.match(/(\d+)连板/)?.[1] || '0');
            return height >= 3;
          }).length;
          const hasHealthyLadder = board1 > 0 && board2 > 0 && board3Plus > 0;
          const ladderBonus = hasHealthyLadder ? 15 : 0;

          // Energy Factor v7.7: 
          // 混合公式：全市场宽度(Real Stats) + 核心池质量(Sample Quality)
          const energy = (qualityLimitUps * 2.5) + (limitUps * 0.8) - (effectiveLimitDowns * 1.5) 
            + (highHeightProfit * 2.5) + (yesterdayLimitUpEffect * 4) + ladderBonus + breadthFactor;
          
          const newTemp = Math.min(100, Math.max(0, 50 + energy));
          const currentHedgeFactor = calculateHedgeFactor({ limitDownCount: effectiveLimitDowns, marketTemp: newTemp }); 

          const shIndexVal = indices.find(i => i.code.includes('sh000001'))?.changePercent || 0;
          const divergenceIdx = calculateDivergenceIndex(shIndexVal, energy / 10);
          
          // New v24.0 Metrics
          const hasFullMarketCrossSection = marketList.length >= 4_000;
          const entropy = hasFullMarketCrossSection
            ? calculateFullMarketEntropy(marketList)
            : calculateMarketEntropy(nextStocks);
          const themeConsensus = calculateThemeBreadthConsensus(enrichedThemes);

          // v41.0 Market Phase Detection
          const phaseResult = detectMarketPhase(
            { 
                ...metrics, 
                marketTemp: newTemp, 
                limitUpCount: effectiveLimitUps,
                limitDownCount: effectiveLimitDowns,
                // Fix: Calculate spaceHeight from consecutiveLimitUps instead of notes regex
                spaceHeight: Math.max(
                  ...nextStocks.map(s => s.consecutiveLimitUps || 0),
                  0
                ),
                marketEntropy: entropy 
            } as DailyMetrics, 
            nextStocks, 
            phaseRef.current,
            metricsRef.current,
            {
              fullMarketEntropy: entropy,
              themeConsensus,
              fullMarketSampleSize: marketList.length,
            },
          );
          const nextPhase = phaseResult.phase;

          // ═══════════════════════════════════════════════════════════════
          // V65.0: INTRADAY MICRO-STRUCTURE DATA PIPELINE (分时数据管道)
          // ═══════════════════════════════════════════════════════════════
          // Fetch 1min K-line for key stocks (涨停/持仓/龙头/高涨幅) to power
          // MACDFS, volume structure, and trend analysis in the Predator Engine.
          // Cost control: max 15 stocks per refresh, 5-min cache, market hours only.
          const INTRADAY_CACHE_MS = 5 * 60 * 1000; // 5 minutes
          const nowTs = Date.now();
          const isInTradingHours = (() => {
            const h = new Date().getHours(), m = new Date().getMinutes();
            const t = h * 100 + m;
            return (t >= 930 && t <= 1130) || (t >= 1300 && t <= 1500);
          })();

          if (isInTradingHours) {
            // Priority: Hold > LimitUp > Leader > High change (>5%)
            const intradayCandidates = nextStocks
              .filter(s => s.code && (
                s.status === 'Hold' ||
                s.isLimitUp ||
                s.role === 'Leader' || s.role === 'Main' ||
                Math.abs(s.changePercent || 0) > 5
              ))
              .filter(s => {
                // Skip if cache is still fresh
                const cached = s.intradayIndicators;
                return !cached?.fetchedAt || (nowTs - cached.fetchedAt > INTRADAY_CACHE_MS);
              })
              .slice(0, 15); // Hard cap

            if (intradayCandidates.length > 0) {
              console.log(`[V66.7 Intraday] Batch-fetching 1min data for ${intradayCandidates.length} key stocks`);
              
              // V66.7: Single batch request instead of N individual requests
              // Fixes "Failed to fetch" caused by edge function overload
              const intradayMap = await fetchIntradayBatch(
                intradayCandidates.map(s => s.code),
                '1min'
              );

              // Compute IntradayIndicators and attach to stocks
              nextStocks = nextStocks.map(s => {
                const minuteData = intradayMap[s.code];
                if (!minuteData || minuteData.length < 30) return s;
                
                const indicators = analyzeIntradayStructure(minuteData);
                return {
                  ...s,
                  intradayIndicators: { ...indicators, fetchedAt: nowTs }
                };
              });

              console.log(`[V65.0 Intraday] Computed indicators for ${Object.keys(intradayMap).filter(k => intradayMap[k]?.length >= 30).length} stocks`);
            }
          }
          // ═══════════════════════════════════════════════════════════════

          const analyzedStocks = recalculateStockScores(
            nextStocks,
            nextPhase,
            indices,
            newTemp,
            enrichedThemes,
            newIndexTech || indexTechnicals,
            {
              totalCount: marketStats?.totalCount,
              upCount: marketStats?.upCount,
              downCount: marketStats?.downCount,
              limitUpCount: marketStats?.limitUpCount,
              limitDownCount: marketStats?.limitDownCount,
              dataStatus: marketDataStatus,
              coverage: marketDataCoverage,
              sourceAgeMs: marketStats?.quality?.sourceAgeMs,
              isMarketOpen,
              phaseConfidence: phaseResult.confidence,
            },
          );

          // V64.0: Persist event-driven detection to state (for UI display)
          const latestEventMode = detectEventDrivenMode(analyzedStocks);
          setEventDrivenMode(latestEventMode.mode !== 'NONE' ? latestEventMode : null);

          // ═══════════════════════════════════════════════════════════════
          // V62.0: BLACK SWAN CIRCUIT BREAKER (组合级熔断)
          // V62.1: + EUPHORIA CIRCUIT BREAKER (狂热熔断)
          // ═══════════════════════════════════════════════════════════════
          // Post-processing: Override individual stock signals when portfolio-level
          // systemic risk is detected (crash OR euphoria blow-off).
          // - Crash: held positions get emergency evacuation orders
          // - Euphoria: held positions get profit-locking orders
          const blackSwanResult = detectBlackSwan(analyzedStocks, indices, {
            ...metrics,
            limitUpCount: effectiveLimitUps,
            limitDownCount: effectiveLimitDowns,
            marketTemp: newTemp,
            phaseConfidence: phaseResult.confidence,
          } as DailyMetrics, nextPhase);

          // Apply BEARISH emergency overrides to held stocks' signals
          let finalStocks = blackSwanResult.level >= 2
            ? analyzedStocks.map(s => {
                if (s.status !== 'Hold') return s;
                const override = shouldOverrideSignal(s.id, blackSwanResult.emergencyActions);
                if (!override) return s;

                const overrideSignalType = override.action === 'EMERGENCY_SELL' ? 'SELL'
                  : override.action === 'REDUCE_50' ? 'SELL'
                  : s.aiPrediction?.signalType || 'WAIT';

                return {
                  ...s,
                  aiPrediction: {
                    ...s.aiPrediction,
                    signalType: overrideSignalType,
                    strategy: `[V62熔断] ${override.reason}`,
                    positionAdvice: override.action === 'EMERGENCY_SELL'
                      ? '建议仓位: 0% [紧急清仓]'
                      : override.action === 'REDUCE_50'
                        ? '建议仓位: 50% [危机减仓]'
                        : s.aiPrediction?.positionAdvice,
                  },
                  alerts: [...(s.alerts || []), 'circuit-breaker'],
                };
              })
            : analyzedStocks;

          // V62.1: Apply EUPHORIA profit-locking overrides (only if bearish didn't already override)
          if (blackSwanResult.euphoriaLevel >= 2 && blackSwanResult.level < 2) {
            finalStocks = finalStocks.map(s => {
              if (s.status !== 'Hold') return s;
              const override = shouldOverrideSignal(s.id, blackSwanResult.euphoriaActions);
              if (!override) return s;

              const euphoriaSignalType = override.action === 'LOCK_PROFIT' ? 'SELL'
                : override.action === 'REDUCE_WINNER' ? 'SELL'
                : s.aiPrediction?.signalType || 'WAIT';

              return {
                ...s,
                aiPrediction: {
                  ...s.aiPrediction,
                  signalType: euphoriaSignalType,
                  strategy: `[V62.1狂热] ${override.reason}`,
                  positionAdvice: override.action === 'LOCK_PROFIT'
                    ? '建议仓位: 30% [锁定利润]'
                    : override.action === 'REDUCE_WINNER'
                      ? '建议仓位: 50% [止盈减仓]'
                      : s.aiPrediction?.positionAdvice,
                },
                alerts: [...(s.alerts || []), 'euphoria-breaker'],
              };
            });
          }

          // V65.0: Tick预加载已被1min分时管道取代 (在recalculateStockScores之前注入)
          // 分时MACDFS/量比/趋势数据现已通过 intradayIndicators → microContext 注入引擎
          setStocks(finalStocks);

          // Calculate Leader Survival Probability for the current actual leader
          const currentLeader = analyzedStocks.find(s => s.role === 'Leader');
          const survivalProb = currentLeader ? calculateDragonSurvival(currentLeader, newTemp, nextPhase, analyzedStocks) : 0;

          // Add to history
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          const nextSentimentHistory = (() => {
            const last = historyRef.current[historyRef.current.length - 1];
            if (last && last.time === timeStr) return historyRef.current;
            return [...historyRef.current, { time: timeStr, score: energy / 10, temp: newTemp }].slice(-50);
          })();

          // Detect Inflection Signal (v25.0)
          const inflection = detectInflection({ 
              ...metrics, 
              marketTemp: newTemp, 
              limitDownCount: effectiveLimitDowns 
          } as DailyMetrics, nextSentimentHistory);

          // Generate Events
          const newEvents = detectMarketEvents(analyzedStocks, { 
              ...metrics, 
              marketTemp: newTemp, 
              divergenceIndex: divergenceIdx 
          } as DailyMetrics, nextPhase, entropy);

          // V59.6 FIX: Removed duplicate setStocks(analyzedStocks) — already called at line ~944.
          setSentimentHistory(nextSentimentHistory);
          
          // Update Global Metrics
          setPhase(nextPhase);
          setMetrics(prev => ({
            ...prev,
            limitUpCount: effectiveLimitUps,
            limitDownCount: effectiveLimitDowns,
            marketTemp: newTemp,
            phaseConfidence: phaseResult.confidence,
            marketDataStatus,
            marketDataCoverage,
            marketDataAgeMs: marketStats?.quality?.sourceAgeMs,
            hedgeFactor: currentHedgeFactor, // v7.2 Added
            divergenceIndex: divergenceIdx,
            yesterdayLimitUpEffect: yesterdayLimitUpEffect,
            marketEntropy: entropy,
            leaderSurvivalProb: survivalProb,
            inflectionSignal: inflection,
            // Fix: Use consecutiveLimitUps to calculate spaceHeight
            spaceHeight: Math.max(
              ...analyzedStocks.map(s => s.consecutiveLimitUps || 0),
              0
            ),
            marketEvents: [...newEvents, ...(prev.marketEvents || [])].slice(0, 20)
          }));

          // Only fetch the scanner-sized list after the summary has already
          // calibrated this refresh. The edge cache then makes this request
          // cheap, and it cannot race the prediction status.
          refreshMarketListInBackground();
        }
    } catch (error) {
        console.error("Refresh failed", error);
        const message = error instanceof Error ? error.message : '行情服务暂时不可用';
        setMarketRefreshError(message);
        setMarketRefreshStatus('error');
        setMetrics(prev => ({ ...prev, marketDataStatus: 'UNAVAILABLE', marketDataCoverage: 0 }));
    } finally {
        isRefreshing.current = false;
    }
  };

  const addTheme = (t: Theme) => { const n = [...themes, t]; setThemes(n); saveData({ themes: n }, true); };
  const removeTheme = (id: string) => { const n = themes.filter(t => t.id !== id); setThemes(n); saveData({ themes: n }, true); };
  
  // V46.1 FIX: Persistence Logic Upgrade
  // 1. Promote "Auto-Discovered" stocks to "Manual" when added/touched
  // 2. Ensure duplicates update the existing record instead of being ignored
  const addStock = (s: Stock) => { 
      const existingIndex = stocks.findIndex(x => x.code === s.code);
      let n = [...stocks];
      
      if (existingIndex >= 0) {
          // Exists: Update it and strip 'Auto-Discovered' tag to ensure persistence
          const existing = stocks[existingIndex];
          
          // V46.3 Fix: Merge tags correctly. Preserve existing Manual tags + Add new tags from s
          const existingBase = existing.tags?.filter(t => t !== 'Auto-Discovered') || [];
          const incomingBase = s.tags?.filter(t => t !== 'Auto-Discovered') || [];
          const mergedTags = Array.from(new Set([...existingBase, ...incomingBase]));

          n[existingIndex] = { ...existing, ...s, tags: mergedTags };
      } else {
          // New: Add it and ensure no 'Auto-Discovered' tag
          const newTags = s.tags?.filter(t => t !== 'Auto-Discovered') || [];
          n = [...n, { ...s, tags: newTags }];
      }
      
      setStocks(n); 
      saveData({ stocks: n }, true); 
      // Only refresh if it was a new add, to fetch data
      if (existingIndex === -1) refreshData(); 
  };

  const addStocks = (list: Stock[]) => { 
      // Merge list into stocks, promoting duplicates
      const stockMap = new Map<string, Stock>(stocks.map(s => [s.code, s]));
      
      list.forEach(s => {
          const existing = stockMap.get(s.code);
          if (existing) {
              // If batch adding, we typically don't strip Auto-Discovered unless specified
              // But for safety, let's assume batch adds are explicit
              // For now, only update if the new one is NOT auto-discovered
              if (!s.tags?.includes('Auto-Discovered')) {
                  const newTags = existing.tags?.filter(t => t !== 'Auto-Discovered') || [];
                  stockMap.set(s.code, { ...existing, ...s, tags: newTags });
              }
          } else {
              stockMap.set(s.code, s);
          }
      });
      
      const n = Array.from(stockMap.values());
      setStocks(n); 
      saveData({ stocks: n }, true); 
      refreshData(); 
  };

  const updateStock = (id: string, u: Partial<Stock>) => { 
      const n = stocks.map(s => {
          if (s.id === id) {
             // Fix V46.2: Correctly merge tags from update (u) while removing Auto-Discovered
             // Previous fix erroneously overwrote u.tags with s.tags
             const currentTags = u.tags || s.tags || [];
             const cleanTags = currentTags.filter(t => t !== 'Auto-Discovered');
             return { ...s, ...u, tags: cleanTags };
          }
          return s;
      }); 
      setStocks(n); 
      saveData({ stocks: n }); 
  };
  // V65.1 PERF: Added `recalculate` flag. Signal-only updates (DragonPool velocity)
  // skip the expensive full recalculation; history updates still trigger it.
  const updateStocks = (list: any[], recalculate = true) => { 
      setStocks(prev => {
          const map = new Map(list.map(x => [x.id, x.changes]));
          const nextRaw = prev.map(s => map.has(s.id) ? { ...s, ...map.get(s.id) } : s);
          
          if (!recalculate) {
              setTimeout(() => saveData({ stocks: nextRaw }), 0);
              return nextRaw;
          }

          const currentIndices = marketIndices; 
          const marketTemp = metrics.marketTemp || 50;
          const currentPhase = phaseRef.current;
          const currentMarketDataStatus = marketStats
            ? marketStats.quality?.status || 'PARTIAL'
            : 'UNAVAILABLE';
          const currentMarketCoverage = marketStats?.quality?.coverage ?? (marketStats
            ? (marketStats.upCount + marketStats.downCount + marketStats.flatCount) / Math.max(1, marketStats.totalCount)
            : 0);
          
          const analyzed = recalculateStockScores(
            nextRaw,
            currentPhase,
            currentIndices,
            marketTemp,
            marketThemes,
            indexTechnicals,
            {
              totalCount: marketStats?.totalCount,
              upCount: marketStats?.upCount,
              downCount: marketStats?.downCount,
              limitUpCount: marketStats?.limitUpCount,
              limitDownCount: marketStats?.limitDownCount,
              dataStatus: currentMarketDataStatus,
              coverage: currentMarketCoverage,
              sourceAgeMs: marketStats?.quality?.sourceAgeMs,
              isMarketOpen,
              phaseConfidence: metrics.phaseConfidence,
            },
          );
          
          setTimeout(() => saveData({ stocks: analyzed }), 0);
          return analyzed;
      });
  };
  const removeStock = (id: string) => { const n = stocks.filter(s => s.id !== id); setStocks(n); saveData({ stocks: n }, true); };

  const forceRefreshHistory = () => {
      setStocks(prev => prev.map(s => (s.history && s.history.length === 0) ? { ...s, history: undefined } : s));
  };

  // History Fetching Logic (Centralized)
  // V59.6 FIX: Replaced [stocks] dependency with polling to break infinite render loop.
  // Old pattern: useEffect([stocks]) → updateStocks → recalculateStockScores (new objects for ALL stocks)
  //   → stocks reference changes → useEffect fires again → cascade until "Maximum update depth exceeded".
  // New pattern: Poll via interval using stocksRef (no dependency on stocks state).
  const isFetchingHistoryRef = useRef(false);
  useEffect(() => {
    const fetchMissingHistory = () => {
      const currentStocks = stocksRef.current;
      if (currentStocks.length === 0) return;
      if (isFetchingHistoryRef.current) return;

      const missingHistory = currentStocks.filter(s => s.history === undefined);
      if (missingHistory.length === 0) return;

      isFetchingHistoryRef.current = true;
      
      const batchSize = 15;
      const batch = missingHistory.slice(0, batchSize);
      const codes = batch.map(s => s.code);

      fetchStockHistoryBatch(codes).then(map => {
          const updates: { id: string, changes: Partial<Stock> }[] = [];
          
          Object.keys(map).forEach(code => {
               const stock = stocksRef.current.find(s => s.code === code);
               if (stock && map[code] && map[code].length > 0) {
                   updates.push({ id: stock.id, changes: { history: map[code] } });
               }
          });

          codes.forEach(code => {
              if (!map[code] || map[code].length === 0) {
                  const stock = stocksRef.current.find(s => s.code === code);
                  if (stock) {
                       updates.push({ id: stock.id, changes: { history: [] } });
                  }
              }
          });

          if (updates.length > 0) {
              updateStocks(updates);
          }
      }).catch(err => {
          console.error("History batch error", err);
      }).finally(() => {
          isFetchingHistoryRef.current = false;
      });
    };

    // Initial fetch after a short delay (let loadData settle)
    const initialTimer = setTimeout(fetchMissingHistory, 1000);
    // Poll every 3 seconds to pick up remaining batches
    const interval = setInterval(fetchMissingHistory, 3000);
    
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  // V65.1 PERF: Memoize context value to prevent unnecessary re-renders of all consumers
  // when unrelated parent state changes. Each state variable is a dependency.
  const contextValue = useMemo(() => ({
    metrics, setMetrics, sentimentHistory, phase, phaseHistory, marketEvents, themes,
    addTheme, removeTheme, stocks, addStock, addStocks, updateStock, updateStocks, removeStock,
    journal, setJournal, marketIndices, marketStats, marketThemes, indexTechnicals, refreshData, isMarketOpen, connectionStatus, isSaving, localSaveStatus,
    marketRefreshStatus, lastMarketRefreshAt, marketRefreshError,
    forceRefreshHistory, eventDrivenMode, analyzeLiveStockSignal
  }), [
    metrics, sentimentHistory, phase, phaseHistory, marketEvents, themes, stocks,
    journal, marketIndices, marketStats, marketThemes, indexTechnicals, isMarketOpen, connectionStatus, isSaving, localSaveStatus,
    marketRefreshStatus, lastMarketRefreshAt, marketRefreshError, eventDrivenMode,
    analyzeLiveStockSignal
  ]);

  return (
    <TradingContext.Provider value={contextValue}>
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const context = useContext(TradingContext);
  if (context === undefined) {
    // Return a dummy context to prevent crash during hot-reload or initialization glitches
    // This is safer than throwing in environments where context might be temporarily lost
    return {
      metrics: defaultMetrics,
      setMetrics: () => {},
      sentimentHistory: [],
      phase: 'Chaos' as MarketPhase,
      phaseHistory: [],
      marketEvents: [],
      themes: [],
      addTheme: () => {},
      removeTheme: () => {},
      stocks: [],
      addStock: () => {},
      addStocks: () => {},
      updateStock: () => {},
      updateStocks: () => {},
      removeStock: () => {},
      journal: defaultJournal,
      setJournal: () => {},
      marketIndices: [],
      marketStats: null,
      marketThemes: [],
      indexTechnicals: null,
      refreshData: async () => {},
      isMarketOpen: false,
      connectionStatus: 'connecting' as const,
      isSaving: false,
      localSaveStatus: 'saved' as const,
      marketRefreshStatus: 'idle' as const,
      lastMarketRefreshAt: null,
      marketRefreshError: null,
      forceRefreshHistory: () => {},
      eventDrivenMode: null,
      analyzeLiveStockSignal: (stock: Stock) => analyzeStockSignal(stock, 'Chaos'),
    } as TradingContextType;
  }
  return context;
};
