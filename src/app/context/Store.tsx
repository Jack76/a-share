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
import { inspectLocalHistoryBatch } from '../services/localDb';
import { detectMarketEvents } from "../utils/events";
import { getPresetStocks, detectEventDrivenMode, type EventDrivenDetection } from "../data/presetStocks";
import { calculateRealtimeMetrics } from "../utils/realtimeAnalysis";
import { detectBlackSwan, shouldOverrideSignal } from "../utils/blackSwanDetector";
import { calculateThemeBreadthConsensus, normalizeMarketConcept } from '../utils/marketConcepts';
import type { MarketRefreshStatus } from '../utils/dataHealth';
import { getDirectLargeOrderNetYuan } from '../utils/capitalFlow';
import { getChinaTradingClock } from '../utils/marketClock';
import { syncPredictionLedger } from '../utils/predictionLedger';
import { sanitizeAdvisoryLanguage } from '../utils/advisoryLanguage';
import { buildAShareFactorProfiles } from '../utils/aShareFactors';
import { STOCK_HISTORY_BACKGROUND_BARS } from '../services/historyCachePolicy';

interface TradingState {
  stocks?: Stock[];
  themes?: Theme[];
  journal?: JournalEntry;
  journalHistory?: JournalEntry[];
  phaseHistory?: PhaseRecord[];
}

const getCanonicalStockCode = (code: string) => code.replace(/^(sh|sz|bj)/i, '');

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

export interface HistoryLoadProgress {
  total: number;
  loaded: number;
  pending: number;
  failed: number;
  percent: number;
  isLoading: boolean;
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
  journalHistory: JournalEntry[];
  marketIndices: MarketIndex[];
  marketStats: MarketStatsSnapshot | null;
  marketThemes: Theme[]; // v7.2 全市场题材数据
  indexTechnicals: IndexTechnicals | null;
  refreshData: () => Promise<void>;
  isMarketOpen: boolean;
  localSaveStatus: 'saved' | 'saving' | 'error';
  marketRefreshStatus: MarketRefreshStatus;
  lastMarketRefreshAt: number | null;
  marketRefreshError: string | null;
  forceRefreshHistory: () => void;
  historyLoadProgress: HistoryLoadProgress;
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

const isChinaMarketSession = (date = new Date()) => getChinaTradingClock(date).isMarketOpen;

const isMarketStatsUsable = (snapshot: MarketStatsSnapshot | null): snapshot is MarketStatsSnapshot => {
  if (!snapshot || snapshot.totalCount < 1_000) return false;
  const directionalCoverage = (
    snapshot.upCount + snapshot.downCount + snapshot.flatCount
  ) / Math.max(1, snapshot.totalCount);
  if (directionalCoverage < 0.75) return false;

  const quality = snapshot.quality;
  if (!quality) return false;
  const duringSession = isChinaMarketSession();
  const maxSourceAgeMs = duringSession ? 180_000 : 7 * 24 * 60 * 60 * 1000;
  // A verified closing snapshot remains the correct market context after the
  // bell. Expiring it after two minutes caused late stock updates to revert
  // only a few rows back to UNAVAILABLE while the market was closed.
  const maxSnapshotAgeMs = duringSession ? 120_000 : 12 * 60 * 60 * 1000;
  const sourceIsFreshEnough = !Number.isFinite(quality.sourceAgeMs) ||
    (quality.sourceAgeMs || 0) <= maxSourceAgeMs;
  return quality.status !== 'UNAVAILABLE' &&
    quality.coverage >= 0.75 &&
    quality.segmentsSucceeded >= 1 &&
    getMarketStatsAge(snapshot) <= maxSnapshotAgeMs &&
    sourceIsFreshEnough;
};

// Breadth requires a paginated upstream scan. Give the first paint a bounded
// wait, then let the same request finish in the background and hydrate the
// verified market context when it is ready.
const MARKET_STATS_UI_BUDGET_MS = 3_500;
const resolveWithin = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>(resolve => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const defaultJournal: JournalEntry = {
  date: getChinaTradingClock().tradeDate,
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
  const [journalHistory, setJournalHistory] = useState<JournalEntry[]>([]);
  const [phase, setPhase] = useState<MarketPhase>('Chaos');
  const [phaseHistory, setPhaseHistory] = useState<PhaseRecord[]>([]);
  const [sentimentHistory, setSentimentHistory] = useState<SentimentPoint[]>([]);
  const [marketEvents, setMarketEvents] = useState<MarketEvent[]>([]);
  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>([]);
  const [marketStats, setMarketStats] = useState<MarketStatsSnapshot | null>(null);
  const [marketThemes, setMarketThemes] = useState<Theme[]>([]);
  const [indexTechnicals, setIndexTechnicals] = useState<IndexTechnicals | null>(null);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [localSaveStatus, setLocalSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [marketRefreshStatus, setMarketRefreshStatus] = useState<MarketRefreshStatus>('idle');
  const [lastMarketRefreshAt, setLastMarketRefreshAt] = useState<number | null>(null);
  const [marketRefreshError, setMarketRefreshError] = useState<string | null>(null);
  const [eventDrivenMode, setEventDrivenMode] = useState<EventDrivenDetection | null>(null); // V64.0
  const [historyLoadRevision, setHistoryLoadRevision] = useState(0);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

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
  const intradayAttemptedAtRef = useRef<Map<string, number>>(new Map());

  const indexHistoryRef = useRef<{ close: number }[]>([]);

  useEffect(() => { stocksRef.current = stocks; }, [stocks]);
  useEffect(() => { themesRef.current = themes; }, [themes]);
  useEffect(() => { metricsRef.current = metrics; }, [metrics]);
  useEffect(() => { historyRef.current = sentimentHistory; }, [sentimentHistory]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    if (!stocks.some(stock => stock.aiPrediction?.prediction)) return;
    const timer = window.setTimeout(() => {
      try {
        syncPredictionLedger(stocks);
      } catch (error) {
        console.warn('Prediction ledger update failed', error);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [stocks]);

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
      undefined,
      stocksRef.current,
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
      // A 股截面因子先于单股信号计算，确保每个标的都使用同一批可比较的
      // 数据，并在回放/实时刷新时遵守当前市场状态配权。
      const shIndex = currentIndices.find(i => i.code.includes('sh000001'));
      const factorContext: MarketCalibrationContext = {
        ...marketCalibration,
        indexChange: shIndex?.changePercent ?? marketCalibration?.indexChange,
        isIndexBull: indexTech?.isBull ?? marketCalibration?.isIndexBull,
        isIndexStrong: indexTech?.isStrong ?? marketCalibration?.isIndexStrong,
      };
      const factorProfiles = buildAShareFactorProfiles(updated, factorContext);
      const factorEnrichedStocks = updated.map(stock => {
        const profile = factorProfiles.get(stock.code);
        if (!profile) return stock;
        return {
          ...stock,
          factorScore: profile.score,
          factorCoverage: profile.coverage,
          factorRegime: profile.regime,
          factorBreakdown: profile.breakdown,
          factorSources: profile.sources,
          factorWarnings: profile.warnings,
        };
      });

      // V64.0: Detect event-driven mode ONCE for all stocks (cross-sector divergence scan)
      const eventDrivenDetection = detectEventDrivenMode(factorEnrichedStocks);
      if (eventDrivenDetection.mode !== 'NONE') {
        console.log(`[V64.0 EVENT MODE] ${eventDrivenDetection.mode} | ${eventDrivenDetection.description}`);
      }

      return factorEnrichedStocks.map(s => {
        const resonance = calculateResonance(s, factorEnrichedStocks, marketThemes);
        // v41.0 Upgrade: Use new TrapGuard and AI Prediction
        const trapResult = analyzeTrapRiskV41(s, currentPhase, factorEnrichedStocks);
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
            undefined,                                  // runtimeContext
            factorEnrichedStocks,                       // 分层历史样本池
        );
        
        const prediction = {
            trend: signal.trend,
            summary: sanitizeAdvisoryLanguage(signal.summary),
            strategy: sanitizeAdvisoryLanguage(signal.strategy),
            positionAdvice: sanitizeAdvisoryLanguage(signal.positionAdvice),
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
    const marketMap = new Map<string, Partial<Stock>>(
      (marketStats.list || []).map((stock: Partial<Stock> & { code: string }) => [stock.code, stock]),
    );
    const needsFlowHydration = marketMap.size > 0 && currentStocks.some(stock => {
      const marketStock = marketMap.get(stock.code.replace(/^(sh|sz|bj)/, ''));
      return marketStock?.largeOrderNetYuan !== undefined &&
        stock.largeOrderNetYuan !== marketStock.largeOrderNetYuan;
    });
    const needsQuoteHydration = marketMap.size > 0 && currentStocks.some(stock => {
      const marketStock = marketMap.get(stock.code.replace(/^(sh|sz|bj)/, ''));
      const marketPrice = Number(marketStock?.currentPrice);
      if (!Number.isFinite(marketPrice) || marketPrice <= 0) return false;
      return !Number.isFinite(stock.currentPrice) ||
        stock.currentPrice <= 0 ||
        stock.currentPrice !== marketPrice ||
        stock.changePercent !== marketStock?.changePercent;
    });
    if (!needsMarketRecalibration && !needsFlowHydration && !needsQuoteHydration) return;

    const enrichedStocks = currentStocks.map(stock => {
      const marketStock = marketMap.get(stock.code.replace(/^(sh|sz|bj)/, ''));
      if (!marketStock) return stock;
      const marketPrice = Number(marketStock.currentPrice);
      const hasMarketQuote = Number.isFinite(marketPrice) && marketPrice > 0;
      return {
        ...stock,
        ...(hasMarketQuote ? {
          currentPrice: marketPrice,
          changePercent: marketStock.changePercent,
          turnover: marketStock.amount,
          turnoverRate: marketStock.turnoverRate,
          limitUpPrice: marketStock.limitUpPrice,
          limitDownPrice: marketStock.limitDownPrice,
          isLimitUp: Boolean(marketStock.isLimitUp),
          isLimitDown: Boolean(marketStock.isLimitDown),
          sourceAsOf: marketStats.quality?.sourceAsOf || stock.sourceAsOf,
        } : {}),
        largeOrderNetYuan: marketStock.largeOrderNetYuan,
        largeOrderNetSource: marketStock.largeOrderNetSource,
        largeOrderNetAsOf: marketStock.largeOrderNetAsOf,
      };
    });

    const recalibratedStocks = recalculateStockScores(
      enrichedStocks,
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
    stocks,
  ]);

  useEffect(() => {
    const checkTime = () => {
      setIsMarketOpen(getChinaTradingClock().isMarketOpen);
    };
    checkTime();
    const timer = setInterval(checkTime, 60000);
    return () => clearInterval(timer);
  }, []);

  const isRefreshing = useRef(false);
  const LOCAL_STATE_KEY = 'dragon-quant-device-v2';

  const saveData = useCallback(async (partialData: Partial<TradingState>, _immediate = false) => {
    setLocalSaveStatus('saving');
    try {
        const payload: any = { ...partialData };
        if (Array.isArray(payload.stocks)) {
            const persistentStocks = payload.stocks.filter((s: Stock) => {
                const isAuto = s.tags?.includes('Auto-Discovered');
                const isImportant = s.status === 'Hold';
                return !(isAuto && !isImportant);
            });

            payload.stocks = persistentStocks.map((s: Stock) => ({
                id: s.id,
                code: s.code,
                name: s.name,
                concept: s.concept,
                role: s.role,
                status: s.status,
                notes: s.notes,
                theme: s.theme,
                costPrice: s.costPrice,
                buyDate: s.buyDate,
                trailingStopPrice: s.trailingStopPrice,
                trailingStopMode: s.trailingStopMode,
                profitTarget: s.profitTarget,
                tags: s.tags?.filter(tag => tag !== 'Auto-Discovered'),
            }));
        }

        delete payload.metrics;
        const saved = localStorage.getItem(LOCAL_STATE_KEY);
        const currentData = saved ? JSON.parse(saved) : {};
        localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
          ...currentData,
          ...payload,
          storageMode: 'device-local',
          version: 2,
        }));
        setLocalSaveStatus('saved');
    } catch (e) {
      console.error('Save data error:', e);
      setLocalSaveStatus('error');
    }
  }, []);

  const updateJournal = useCallback((entry: JournalEntry) => {
    setJournal(entry);
    setJournalHistory(previous => {
      const next = [
        entry,
        ...previous.filter(item => item.date !== entry.date),
      ].slice(0, 120);
      void saveData({ journal: entry, journalHistory: next }, true);
      return next;
    });
  }, [saveData]);

  const loadData = async () => {
    try {
      const saved = localStorage.getItem(LOCAL_STATE_KEY);
      const data: any = saved ? JSON.parse(saved) : {};
      let finalStocks: Stock[] = Array.isArray(data.stocks) ? data.stocks : [];
      
      // AUTO-MIGRATION LOGIC (v42.0):
      // Always enforce the latest metadata (concept, name, role) from presetStocks.ts
      const presets = Array.from(
        new Map(getPresetStocks().map(stock => [stock.code, stock])).values(),
      );
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
      const uniqueMap = new Map<string, Stock>();
      finalStocks.forEach(s => uniqueMap.set(getCanonicalStockCode(s.code), s));
      finalStocks = Array.from(uniqueMap.values());

      // If list is empty (first run), seed with presets
      if (finalStocks.length === 0 && !saved) {
          finalStocks = presets;
          hasChanges = true;
      } else {
          // Check if we need to merge new presets
          const existingCodes = new Set(finalStocks.map(s => getCanonicalStockCode(s.code)));
          const newStocks = presets.filter(p => !existingCodes.has(getCanonicalStockCode(p.code)));
          
          if (newStocks.length > 0) {
              console.log(`Adding ${newStocks.length} new preset stocks`);
              finalStocks = [...finalStocks, ...newStocks];
              hasChanges = true;
          }
      }

      finalStocks = Array.from(
        new Map(finalStocks.map(stock => [getCanonicalStockCode(stock.code), stock])).values(),
      );

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
      if (data.journal) setJournal(data.journal);
      if (Array.isArray(data.journalHistory)) setJournalHistory(data.journalHistory);
      if (data.phaseHistory) setPhaseHistory(data.phaseHistory);
    } catch (e) {
      console.warn('Local data load failed', e);
      setLocalSaveStatus('error');
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
      // Refresh only while the page is visible. A hidden tab does not need to
      // keep downloading and rescoring the same market snapshot.
      const refreshWhenVisible = () => {
        if (!document.hidden) void refreshData();
      };
      const timer = setInterval(refreshWhenVisible, 30000);
      document.addEventListener('visibilitychange', refreshWhenVisible);
      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', refreshWhenVisible);
      };
    }
  }, [isMarketOpen]);

  const refreshData = async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    setMarketRefreshStatus('refreshing');
    setMarketRefreshError(null);
    try {
        // Resolve the compact breadth summary before scoring stocks, but cap
        // how long a cold upstream scan can block the first usable quote wave.
        // The full-list background request below coalesces with this request
        // inside the worker and hydrates the market context when it completes.
        const marketStatsSummaryPromise = fetchMarketStats(false);
        const [{ data: indices }, marketStatsSummary, realTimeThemes] = await Promise.all([
          fetchMarketIndices(),
          resolveWithin(marketStatsSummaryPromise, MARKET_STATS_UI_BUDGET_MS, null),
          fetchRealTimeThemes()
        ]);
        let marketStatsResult = marketStatsSummary;
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

          // Commit the first quote wave immediately. Waiting for the remaining
          // history, scanner and intraday enrichment requests kept valid prices
          // hidden for tens of seconds and allowed later polling passes to keep
          // rendering the original empty preset values.
          stocksRef.current = nextStocks;
          setStocks(nextStocks);

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
              // Keep the unattempted state distinct from a failed request. The
              // history hydrator uses this distinction to retry empty results.
              history: undefined
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
                const lastAttemptedAt = intradayAttemptedAtRef.current.get(s.code) || 0;
                return (!cached?.fetchedAt || (nowTs - cached.fetchedAt > INTRADAY_CACHE_MS)) &&
                  nowTs - lastAttemptedAt >= 2 * 60 * 1000;
              })
              .slice(0, 15); // Hard cap

            if (intradayCandidates.length > 0) {
              console.log(`[V66.7 Intraday] Batch-fetching 1min data for ${intradayCandidates.length} key stocks`);
              // A short/failed upstream response is still an attempt. Keep it
              // out of the next 30-second refresh wave so retries cannot form
              // a tight loop while the market endpoint is degraded.
              intradayCandidates.forEach(stock => intradayAttemptedAtRef.current.set(stock.code, nowTs));
              
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

        }
        // Fetch the scanner-sized list after the quote wave regardless of
        // whether the soft summary budget elapsed. It is deduped locally and
        // coalesced by the worker, so this never creates a second cold scan.
        refreshMarketListInBackground();
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
      const existingIndex = stocks.findIndex(
        stock => getCanonicalStockCode(stock.code) === getCanonicalStockCode(s.code),
      );
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
      const stockMap = new Map<string, Stock>(
        stocks.map(stock => [getCanonicalStockCode(stock.code), stock]),
      );
      
      list.forEach(s => {
          const canonicalCode = getCanonicalStockCode(s.code);
          const existing = stockMap.get(canonicalCode);
          if (existing) {
              // If batch adding, we typically don't strip Auto-Discovered unless specified
              // But for safety, let's assume batch adds are explicit
              // For now, only update if the new one is NOT auto-discovered
              if (!s.tags?.includes('Auto-Discovered')) {
                  const newTags = existing.tags?.filter(t => t !== 'Auto-Discovered') || [];
                  stockMap.set(canonicalCode, { ...existing, ...s, tags: newTags });
              }
          } else {
              stockMap.set(canonicalCode, s);
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
      setHistoryLoadRevision(revision => revision + 1);
  };

  const historyLoadProgress = useMemo<HistoryLoadProgress>(() => {
    const total = stocks.length;
    const loaded = stocks.filter(stock => Array.isArray(stock.history) && stock.history.length > 0).length;
    const failed = stocks.filter(stock => Array.isArray(stock.history) && stock.history.length === 0).length;
    const pending = Math.max(0, total - loaded - failed);
    return {
      total,
      loaded,
      pending,
      failed,
      percent: total > 0 ? Math.round((loaded / total) * 100) : 100,
      isLoading: isHistoryLoading,
    };
  }, [isHistoryLoading, stocks]);

  // History Fetching Logic (Centralized)
  // The stock-code key changes only when the pool membership changes. History
  // updates therefore do not restart this loader or create a render loop.
  const historyUniverseKey = useMemo(
    () => stocks.map(stock => stock.code).sort().join(','),
    [stocks],
  );
  const isFetchingHistoryRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let nextBatchTimer: number | undefined;
    const retryAtByCode = new Map<string, number>();
    const retryCountByCode = new Map<string, number>();
    const retryDelaysMs = [5_000, 20_000, 60_000, 5 * 60_000, 15 * 60_000];

    const historySignature = (history: Stock['history']) => {
      if (!history?.length) return '';
      const first = history[0];
      const last = history[history.length - 1];
      return `${history.length}:${first.day}:${last.day}:${last.close}`;
    };

    const scheduleNextBatch = (delayMs = 750) => {
      if (cancelled || nextBatchTimer !== undefined) return;
      nextBatchTimer = window.setTimeout(() => {
        nextBatchTimer = undefined;
        void fetchMissingHistory();
      }, delayMs);
    };

    const markHistoryFailure = (code: string) => {
      const nextAttempt = (retryCountByCode.get(code) || 0) + 1;
      retryCountByCode.set(code, nextAttempt);
      const delay = retryDelaysMs[Math.min(nextAttempt - 1, retryDelaysMs.length - 1)];
      retryAtByCode.set(code, Date.now() + delay);
    };

    const fetchMissingHistory = async () => {
      if (cancelled) return;
      if (document.hidden) {
        setIsHistoryLoading(false);
        return;
      }
      const currentStocks = stocksRef.current;
      if (currentStocks.length === 0) {
        setIsHistoryLoading(false);
        return;
      }
      if (isFetchingHistoryRef.current) {
        scheduleNextBatch(500);
        return;
      }

      const now = Date.now();
      const missingHistory = currentStocks
        .filter(stock => {
          const hasHistory = Array.isArray(stock.history) && stock.history.length > 0;
          const retryAt = retryAtByCode.get(stock.code) || 0;
          return !hasHistory && retryAt <= now;
        })
        .sort((a, b) => {
          const priority = (stock: Stock) =>
            (stock.status === 'Hold' ? 4 : 0) +
            (stock.tags?.includes('SelfSelect') ? 2 : 0) +
            (stock.role === 'Leader' ? 1 : 0) +
            (stock.history === undefined ? 1 : 0);
          return priority(b) - priority(a);
        });
      if (missingHistory.length === 0) {
        const nextRetryAt = currentStocks.reduce((soonest, stock) => {
          if (Array.isArray(stock.history) && stock.history.length > 0) return soonest;
          const retryAt = retryAtByCode.get(stock.code) || 0;
          return retryAt > now ? Math.min(soonest, retryAt) : soonest;
        }, Number.POSITIVE_INFINITY);
        if (Number.isFinite(nextRetryAt)) {
          scheduleNextBatch(Math.max(750, nextRetryAt - now));
        }
        setIsHistoryLoading(false);
        return;
      }

      isFetchingHistoryRef.current = true;
      setIsHistoryLoading(true);
      
      const batchSize = 15;
      const batch = missingHistory.slice(0, batchSize);
      const codes = batch.map(s => s.code);

      try {
          // Stale-while-revalidate: show any local series immediately instead
          // of leaving trend cells blank while the network request is pending.
          const { entries: cachedEntries } = await inspectLocalHistoryBatch(codes);
          if (cancelled) return;
          const cachedUpdates = Object.entries(cachedEntries).flatMap(([code, entry]) => {
            const stock = stocksRef.current.find(item => item.code === code);
            return stock
              ? [{ id: stock.id, changes: { history: entry.data } }]
              : [];
          });
          if (cachedUpdates.length > 0) updateStocks(cachedUpdates);

          const refreshedMap = await fetchStockHistoryBatch(codes, {
            requestedBars: STOCK_HISTORY_BACKGROUND_BARS,
          });
          if (cancelled) return;
          const refreshedUpdates: { id: string; changes: Partial<Stock> }[] = [];

          codes.forEach(code => {
              const stock = stocksRef.current.find(item => item.code === code);
              if (!stock) return;
              const refreshed = refreshedMap[code];
              const cached = cachedEntries[code]?.data;
              const resolved = refreshed?.length ? refreshed : cached;

              if (resolved?.length) {
                retryAtByCode.delete(code);
                retryCountByCode.delete(code);
                if (historySignature(resolved) !== historySignature(stock.history)) {
                  refreshedUpdates.push({ id: stock.id, changes: { history: resolved } });
                }
              } else {
                markHistoryFailure(code);
                refreshedUpdates.push({ id: stock.id, changes: { history: [] } });
              }
          });

          if (refreshedUpdates.length > 0) updateStocks(refreshedUpdates);
      } catch (err) {
          console.error("History batch error", err);
          if (!cancelled) {
            codes.forEach(markHistoryFailure);
            updateStocks(codes.flatMap(code => {
              const stock = stocksRef.current.find(item => item.code === code);
              return stock ? [{ id: stock.id, changes: { history: [] } }] : [];
            }));
          }
      } finally {
          isFetchingHistoryRef.current = false;
          setIsHistoryLoading(false);
          if (!cancelled) scheduleNextBatch();
      }
    };

    const resumeWhenVisible = () => {
      if (!document.hidden) scheduleNextBatch(0);
    };
    document.addEventListener('visibilitychange', resumeWhenVisible);
    // Let the first quote wave and initial layout settle before starting the
    // background history drain. History remains lazy and stale-while-revalidate
    // but no longer competes with the critical first paint.
    scheduleNextBatch(1200);
    
    return () => {
      cancelled = true;
      setIsHistoryLoading(false);
      if (nextBatchTimer !== undefined) window.clearTimeout(nextBatchTimer);
      document.removeEventListener('visibilitychange', resumeWhenVisible);
    };
  }, [historyLoadRevision, historyUniverseKey]);

  // V65.1 PERF: Memoize context value to prevent unnecessary re-renders of all consumers
  // when unrelated parent state changes. Each state variable is a dependency.
  const contextValue = useMemo(() => ({
    metrics, setMetrics, sentimentHistory, phase, phaseHistory, marketEvents, themes,
    addTheme, removeTheme, stocks, addStock, addStocks, updateStock, updateStocks, removeStock,
    journal, setJournal: updateJournal, journalHistory, marketIndices, marketStats, marketThemes, indexTechnicals, refreshData, isMarketOpen, localSaveStatus,
    marketRefreshStatus, lastMarketRefreshAt, marketRefreshError,
    forceRefreshHistory, historyLoadProgress, eventDrivenMode, analyzeLiveStockSignal
  }), [
    metrics, sentimentHistory, phase, phaseHistory, marketEvents, themes, stocks,
    journal, journalHistory, marketIndices, marketStats, marketThemes, indexTechnicals, isMarketOpen, localSaveStatus,
    marketRefreshStatus, lastMarketRefreshAt, marketRefreshError, eventDrivenMode,
    historyLoadProgress, analyzeLiveStockSignal, updateJournal
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
      journalHistory: [],
      marketIndices: [],
      marketStats: null,
      marketThemes: [],
      indexTechnicals: null,
      refreshData: async () => {},
      isMarketOpen: false,
      localSaveStatus: 'saved' as const,
      marketRefreshStatus: 'idle' as const,
      lastMarketRefreshAt: null,
      marketRefreshError: null,
      forceRefreshHistory: () => {},
      historyLoadProgress: {
        total: 0,
        loaded: 0,
        pending: 0,
        failed: 0,
        percent: 100,
        isLoading: false,
      },
      eventDrivenMode: null,
      analyzeLiveStockSignal: (stock: Stock) => analyzeStockSignal(stock, 'Chaos'),
    } as TradingContextType;
  }
  return context;
};
