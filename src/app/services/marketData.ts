import { Stock, MarketIndex, Theme } from '../types';
import {
    inspectLocalHistoryBatch,
    markLocalHistoryUpgradeAttempt,
    setLocalHistoryBatch,
    inspectLocalFundHistoryBatch,
    inspectLocalFundsBatch,
    markLocalFundHistoryUpgradeAttempt,
    setLocalFundHistoryBatch,
    setLocalFundsBatch,
    FUND_SNAPSHOT_TTL_MS,
    getLocalMarketSnapshot,
    setLocalMarketSnapshot 
} from './localDb';
import {
  assessFundHistoryCache,
  assessStockHistoryCache,
  FUND_HISTORY_REQUESTED_BARS,
  STOCK_HISTORY_REQUESTED_BARS,
} from './historyCachePolicy';

// Simple cache for stock data to deduplicate rapid requests
const stockDataCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 3000; // 3 seconds cache for live data
const STALE_STOCK_TTL = 15 * 60_000;
const lastGoodStockData = new Map<string, { data: Partial<Stock>; timestamp: number }>();
// Breadth is intentionally refreshed less often than individual quotes. The
// server keeps the expensive full-market snapshot warm for the same interval,
// so a 30-second polling cycle normally hits memory/edge cache instead of
// starting another paginated scan.
const MARKET_STATS_CACHE_TTL = 60_000;

// In-flight request deduplication
const inFlightRequests = new Map<string, Promise<any>>();
const marketStatsCache = new Map<string, { data: MarketStatsSnapshot; timestamp: number }>();
let lastGoodThemes: { data: Theme[]; timestamp: number } | null = null;
let lastGoodIndices: { data: MarketIndex[]; timestamp: number } | null = null;

const staleThemes = () => lastGoodThemes && Date.now() - lastGoodThemes.timestamp <= 5 * 60_000
  ? lastGoodThemes.data
  : [];
const staleIndices = () => lastGoodIndices && Date.now() - lastGoodIndices.timestamp <= 2 * 60_000
  ? lastGoodIndices.data
  : [];

export type MarketDataStatus = 'FRESH' | 'PARTIAL' | 'STALE' | 'UNAVAILABLE';

export interface MarketStatsQuality {
  status: MarketDataStatus;
  source: string[];
  asOf: string;
  ageMs: number;
  sourceAsOf?: string;
  sourceAgeMs?: number;
  sourceTimestampCoverage?: number;
  coverage: number;
  records: number;
  expectedRecords: number;
  segmentsSucceeded: number;
  segmentsTotal: number;
  pagesSucceeded: number;
  pagesRequested: number;
  durationMs: number;
  cache: 'MISS' | 'HIT' | 'COALESCED' | 'STALE';
}

export interface MarketStatsSnapshot {
  totalCount: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  limitUpCount: number;
  limitDownCount: number;
  avgChange: number;
  totalVolume: number;
  totalAmount?: number;
  list?: any[];
  quality?: MarketStatsQuality;
}

export interface StockHistoryPoint {
  day: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

const formatCode = (code: string): string => {
  if (!code) return '';
  const c = code.toLowerCase();
  if (c.startsWith('sh') || c.startsWith('sz') || c.startsWith('bj')) return c;
  if (c.startsWith('6') || c.startsWith('5')) return `sh${c}`;
  if (c.startsWith('0') || c.startsWith('3') || c.startsWith('1')) return `sz${c}`;
  if (c.startsWith('4') || c.startsWith('8')) return `bj${c}`;
  return c;
};

// Helper for robust fetching with retries
const fetchWithRetry = async (url: string, options: RequestInit, retries = 2, timeoutMs = 15000, silent = false): Promise<Response> => {
    let lastError: any;
    for (let i = 0; i <= retries; i++) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(`Timeout of ${timeoutMs}ms reached`), timeoutMs);
        try {
            const res = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            if (!res.ok) {
                // If 5xx, retry. If 4xx (except 429), throw.
                if (res.status >= 500 || res.status === 429) {
                     throw new Error(`Status ${res.status}`);
                }
                return res;
            }
            return res;
        } catch (e: any) {
            clearTimeout(id);
            lastError = e;
            const isAbort = e.name === 'AbortError';
            if (i < retries) {
                const wait = 1000 * (i + 1);
                if (!silent) {
                    console.warn(`Fetch failed (${url}), retrying in ${wait}ms...`, e.message);
                }
                await new Promise(r => setTimeout(r, wait));
            }
        }
    }
    throw lastError;
};

export const searchStockByName = async (query: string): Promise<{ code: string, name: string } | null> => {
  if (!query) return null;

  const url = `/api/market/search?q=${encodeURIComponent(query)}`;
  try {
    const resp = await fetchWithRetry(url, {});
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.result || null;
  } catch (e) {
    console.warn("Search failed via backend", e);
    return null;
  }
};

export const fetchRealTimeThemes = async (): Promise<Theme[]> => {
  const url = '/api/market/themes';
  
  try {
    const resp = await fetchWithRetry(url, {}, 0, 8000, true);

    if (!resp.ok) {
        // Suppress 404/500 errors from polluting console unless debugging
        // throw new Error(`Backend theme fetch failed: ${resp.status}`);
        return staleThemes();
    }

    const data = await resp.json();
    if (data && Array.isArray(data.themes)) {
        if (data.themes.length > 0) {
          lastGoodThemes = { data: data.themes, timestamp: Date.now() };
          return data.themes;
        }
        return staleThemes();
    }
    return staleThemes();
  } catch (e) {
    // console.warn(`Failed to fetch real-time themes`, e);
    return staleThemes();
  }
};

export const fetchStockHistory = async (code: string, period: 'daily' | '1min' | '5min' | '30min' = 'daily'): Promise<StockHistoryPoint[]> => {
  if (!code) return [];
  
  if (period === 'daily') {
      // Reuse the batch function to benefit from IndexedDB caching
      const result = await fetchStockHistoryBatch([code]);
      return result[code] || [];
  }

  // For single-code intraday, delegate to the batch function
  const result = await fetchIntradayBatch([code], period);
  return result[code] || [];
};

// V66.7: Batch intraday fetch — sends ALL codes in a single HTTP request
// Solves: individual requests per stock hammering the edge function → "Failed to fetch"
export const fetchIntradayBatch = async (
  codes: string[],
  period: '1min' | '5min' | '30min' = '1min'
): Promise<Record<string, { day: string; close: number; open: number; high: number; low: number; volume: number }[]>> => {
  if (codes.length === 0) return {};
  
  const periodMap = { '1min': '1', '5min': '5', '30min': '30' };
  const klt = periodMap[period];
  const formattedCodes = codes.map(formatCode).filter(Boolean);
  if (formattedCodes.length === 0) return {};
  
  // Send all codes in one request (server already supports comma-separated codes)
  const url = `/api/market/history?codes=${formattedCodes.join(',')}&period=${klt}`;
  
  try {
    const resp = await fetchWithRetry(url, {}, 2, 30000, true); // 2 retries, 30s timeout, silent
    
    if (!resp.ok) return {};
    
    const json = await resp.json();
    if (!json?.data) return {};
    
    const result: Record<string, { day: string; close: number; open: number; high: number; low: number; volume: number }[]> = {};
    
    for (let idx = 0; idx < formattedCodes.length; idx++) {
      const fc = formattedCodes[idx];
      const raw = json.data[fc];
      if (Array.isArray(raw) && raw.length > 0) {
        result[codes[idx]] = raw.map((item: any) => ({
          day: item.day || item.date,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume)
        }));
      }
    }
    
    return result;
  } catch (e) {
    console.warn(`[IntradayBatch] Failed for ${formattedCodes.length} codes:`, (e as any)?.message);
    return {};
  }
};

const mergeHistorySeries = (
  existing: StockHistoryPoint[] | undefined,
  incoming: StockHistoryPoint[] | undefined,
  maxBars: number,
) => {
  const byDay = new Map<string, StockHistoryPoint>();
  [...(existing || []), ...(incoming || [])].forEach(point => {
    if (point?.day) byDay.set(point.day, point);
  });
  return [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-Math.max(maxBars, existing?.length || 0));
};

export const fetchStockHistoryBatch = async (
  codes: string[],
  options: { forceRefresh?: boolean; requestedBars?: number } = {},
): Promise<Record<string, StockHistoryPoint[]>> => {
  if (codes.length === 0) return {};

  // Keep background/list hydration bounded while allowing detail and manual
  // refresh flows to request the full window. The worker clamps this value as
  // well, so malformed callers cannot turn a request into an unbounded query.
  const requestedBarsInput = Number(options.requestedBars ?? STOCK_HISTORY_REQUESTED_BARS);
  const requestedBars = Number.isFinite(requestedBarsInput)
    ? Math.min(STOCK_HISTORY_REQUESTED_BARS, Math.max(30, Math.round(requestedBarsInput)))
    : STOCK_HISTORY_REQUESTED_BARS;

  // 0. Inspect IndexedDB without discarding expired entries. Stale data remains
  // a usable fallback while the network refresh runs.
  const { entries, missing } = await inspectLocalHistoryBatch(codes);
  
  // V8.2: Data Sufficiency & Freshness Check
  // We need to check TWO things:
  // 1. Quantity: Do we have enough history for indicators? (Min 30 days, preferred 60)
  // 2. Freshness: Is the data up to date? (Last date matches recent trading days)
  
  const validLocalData: Record<string, StockHistoryPoint[]> = {};
  const refreshCodes: string[] = [];
  const upgradeCodes: string[] = [];
  const now = Date.now();

  Object.entries(entries).forEach(([code, entry]) => {
      const assessment = assessStockHistoryCache(entry.data, {
        cachedAt: entry.cachedAt,
        requestedBars: entry.requestedBars,
        upgradeAttemptedAt: entry.upgradeAttemptedAt,
      }, now, requestedBars);

      if (assessment.canRender) validLocalData[code] = entry.data;
      if (options.forceRefresh || assessment.shouldRefresh) refreshCodes.push(code);
      if (assessment.shouldUpgrade) upgradeCodes.push(code);
  });
  
  const finalMissing = options.forceRefresh
    ? [...new Set(codes)]
    : [...new Set([...missing, ...refreshCodes])];
  
  if (finalMissing.length === 0) {
      // console.log(`[Cache] All ${codes.length} stocks loaded from IndexedDB`);
      return validLocalData;
  }

  if (Object.keys(validLocalData).length > 0) {
      console.log(`[Cache] Hit: ${Object.keys(validLocalData).length}, Insufficient/Miss: ${finalMissing.length}`);
  }

  // 1. Micro-slicing Strategy: Batch size 10 (Matches backend optimized batch)
  const batchSize = 8;
  const chunks: string[][] = [];
  for (let i = 0; i < finalMissing.length; i += batchSize) {
    chunks.push(finalMissing.slice(i, i + batchSize));
  }

  const apiResults: Record<string, StockHistoryPoint[]> = {};

  // Persist the attempt independently from success. A temporary upstream
  // failure must not restart a full legacy-cache upgrade on every page load.
  if (upgradeCodes.length > 0 && requestedBars >= STOCK_HISTORY_REQUESTED_BARS) {
    await markLocalHistoryUpgradeAttempt(upgradeCodes, now);
  }
  
  // 2. Max concurrency 3 (Improved wave strategy)
  const concurrency = 2;
  for (let i = 0; i < chunks.length; i += concurrency) {
    const wave = chunks.slice(i, i + concurrency);
    
    await Promise.all(wave.map(async (batchCodes) => {
        const list = batchCodes.join(',');
        // Request stock history data (default from backend)
        const url = `/api/market/history?codes=${list}&bars=${requestedBars}`;

        try {
            // 3. Timeout 90s (Increased from 60s for stability)
            const resp = await fetchWithRetry(url, {}, 2, 90000, true); // V67.7: silent mode to reduce console spam

            if (!resp.ok) return;

            const json = await resp.json();
            if (json && json.data) {
                Object.keys(json.data).forEach(key => {
                    const arr = json.data[key];
                    if (Array.isArray(arr)) {
                        apiResults[key] = arr.map((item: any) => ({
                            day: item.day,
                            open: parseFloat(item.open),
                            high: parseFloat(item.high),
                            low: parseFloat(item.low),
                            close: parseFloat(item.close),
                            volume: parseFloat(item.volume)
                        }));
                    }
                });
            }
        } catch (e) {
            console.warn("Batch history fetch failed for chunk", batchCodes, e);
        }
    }));
    // V67.7: Inter-wave delay to prevent edge function overload
    if (i + concurrency < chunks.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Preserve a previously cached long window when a compact background refresh
  // returns fewer bars. This keeps stale-but-useful older bars available for a
  // later detail/replay request instead of silently shrinking the cache.
  const resolvedApiResults: Record<string, StockHistoryPoint[]> = {};
  Object.entries(apiResults).forEach(([code, data]) => {
    resolvedApiResults[code] = mergeHistorySeries(entries[code]?.data, data, requestedBars);
  });

  // 3. Save new data to IndexedDB
  if (Object.keys(resolvedApiResults).length > 0) {
      await setLocalHistoryBatch(resolvedApiResults, {
        requestedBars,
        // A compact list request is not an attempted full-history upgrade. Do
        // not make a later detail request wait for the seven-day upgrade retry
        // window just because the background request completed.
        ...(requestedBars >= STOCK_HISTORY_REQUESTED_BARS ? { upgradeAttemptedAt: now } : {}),
      });
  }
  
  return { ...validLocalData, ...resolvedApiResults };
};

// V8.0 Fetch Fund Historical NAV Data (Batch Support)
// Separate from stock history because funds use different API (Eastmoney NAV)
export const fetchFundHistoryBatch = async (
  codes: string[],
  options: { forceRefresh?: boolean } = {},
): Promise<Record<string, { day: string; close: number }[]>> => {
  if (!codes || codes.length === 0) return {};
  
  // Fund NAV history has its own namespace. Sharing the stock-history prefix
  // allowed identical six-digit fund and stock codes to overwrite each other.
  const { entries, missing } = await inspectLocalFundHistoryBatch(codes);
  
  // V8.2: Data Sufficiency & Freshness Check for Funds
  // V10.0 Upgrade: Increased to 260 to support 1-Year Performance calculation
  // V66.5: Relaxed to 30 — strict 260 minimum caused most funds to re-fetch every time
  //        because many funds or newly added ones have < 260 cached records.
  //        Year-perf now gracefully falls back to API-provided values.
  const validLocalData: Record<string, { day: string; close: number }[]> = {};
  const refreshCodes: string[] = [];
  const upgradeCodes: string[] = [];
  const now = Date.now();
  
  Object.entries(entries).forEach(([code, entry]) => {
      const assessment = assessFundHistoryCache(entry.data, {
        cachedAt: entry.cachedAt,
        requestedBars: entry.requestedBars,
        upgradeAttemptedAt: entry.upgradeAttemptedAt,
      }, now);
      if (assessment.canRender) validLocalData[code] = entry.data;
      if (options.forceRefresh || assessment.shouldRefresh) refreshCodes.push(code);
      if (assessment.shouldUpgrade) upgradeCodes.push(code);
  });

  const finalMissing = options.forceRefresh
    ? [...new Set(codes)]
    : [...new Set([...missing, ...refreshCodes])];
  
  if (finalMissing.length === 0) {
      return validLocalData;
  }

  console.log(`[FundHistory] Fetching history for ${finalMissing.length} funds (Cache Hit: ${Object.keys(validLocalData).length})...`);
  
  // Batch size 5 for fund API (Reduced from 10 to prevent Deno connection drop)
  const batchSize = 5;
  const chunks: string[][] = [];
  for (let i = 0; i < finalMissing.length; i += batchSize) {
    chunks.push(finalMissing.slice(i, i + batchSize));
  }

  const apiResults: Record<string, { day: string; close: number }[]> = {};

  if (upgradeCodes.length > 0) {
    await markLocalFundHistoryUpgradeAttempt(upgradeCodes, now);
  }

  // Max concurrency 2
  const concurrency = 2;
  for (let i = 0; i < chunks.length; i += concurrency) {
    const wave = chunks.slice(i, i + concurrency);
    
    await Promise.all(wave.map(async (batchCodes) => {
        const list = batchCodes.join(',');
        // V8.1: Default history length
        // V10.0: Request 365 days for Annual Return calculation
        const url = `/api/market/fund-history?codes=${list}&limit=365`;

        try {
            const resp = await fetchWithRetry(url, {}, 2, 90000); // Increased timeout to 90s for safety

            if (!resp.ok) return;

            const json = await resp.json();
            // console.log('[FundHistoryDebug]', batchCodes[0], JSON.stringify(json).slice(0, 200)); 
            
            if (json && json.data) {
                Object.keys(json.data).forEach(key => {
                    const arr = json.data[key];
                    if (Array.isArray(arr) && arr.length > 0) {
                        apiResults[key] = arr.map((item: any) => ({
                            day: item.day || item.date, // Try 'date' if 'day' is missing
                            open: parseFloat(item.open || item.value || item.nav || 0),
                            high: parseFloat(item.high || item.value || item.nav || 0),
                            low: parseFloat(item.low || item.value || item.nav || 0),
                            close: parseFloat(item.close || item.value || item.nav || 0),
                            volume: parseFloat(item.volume || 0),
                            // V10.0: Capture Accumulated NAV for accurate long-term return calculation
                            accumulated: item.ljjz ? parseFloat(item.ljjz) : (item.accumulated ? parseFloat(item.accumulated) : undefined)
                        }));
                    }
                });
            }
        } catch (e) {
            console.warn("Fund history batch fetch failed for chunk", batchCodes, e);
        }
    }));
  }
  
  // 3. Save new data to IndexedDB
  if (Object.keys(apiResults).length > 0) {
      await setLocalFundHistoryBatch(apiResults, {
        requestedBars: FUND_HISTORY_REQUESTED_BARS,
        upgradeAttemptedAt: now,
      });
  }
  
  console.log(`[FundHistory] Fetched ${Object.keys(apiResults).length} fund histories`);
  return { ...validLocalData, ...apiResults };
};

export const fetchStockTicks = async (code: string): Promise<any[]> => {
  if (!code) return [];

  const formattedCode = formatCode(code);
  // v7.2 Fix: Use standard query parameter format to match server route '/market/ticks'
  // Also switched from /stock/ticks/:code to /market/ticks?code=... for consistency
  const url = `/api/market/ticks?code=${formattedCode}`;

  try {
    const resp = await fetchWithRetry(url, {}, 1, 15000, true); // 1 retry, 15s timeout, silent

    if (!resp.ok) return [];

    const json = await resp.json();
    return json.data || [];
  } catch (e: any) {
    // Only warn for non-network errors to keep console clean
    if (e.message !== 'Failed to fetch' && e.name !== 'TypeError') {
         console.warn(`Ticks fetch failed for ${code}:`, e);
    }
    return [];
  }
};

export const fetchFunds = async (codes: string[], forceRefresh = false): Promise<any[]> => {
  if (codes.length === 0) return [];

  // Keep expired snapshots as a visible fallback while refreshing them.
  const { entries, missing } = await inspectLocalFundsBatch(codes);
  const localData = Object.fromEntries(
    Object.entries(entries).map(([code, entry]) => [code, entry.data]),
  ) as Record<string, any>;
  const now = Date.now();
  const staleCodes = Object.entries(entries)
    .filter(([, entry]) => now - entry.cachedAt >= FUND_SNAPSHOT_TTL_MS)
    .map(([code]) => code);

  // V10.1 Cache Invalidation: Check if cache is legacy (missing 'ytdChangePercent')
  // Refresh only affected entries; keep them as fallback if the request fails.
  const legacyCodes = Object.entries(localData)
    .filter(([, fund]: [string, any]) => fund.ytdChangePercent === undefined)
    .map(([code]) => code);
  const refreshCodes = forceRefresh
    ? [...new Set(codes)]
    : [...new Set([...missing, ...staleCodes, ...legacyCodes])];

  if (refreshCodes.length === 0) {
      // console.log(`[Cache] All ${codes.length} funds loaded from IndexedDB`);
      return Object.values(localData);
  }

  // 2. Fetch Missing only
  // Batching Strategy: Split into chunks of 10 to avoid server timeout (Edge Function limitation)
  const BATCH_SIZE = 10;
  const chunks: string[][] = [];
  for (let i = 0; i < refreshCodes.length; i += BATCH_SIZE) {
    chunks.push(refreshCodes.slice(i, i + BATCH_SIZE));
  }

  const apiResultsMap: Record<string, any> = {};

  // Fetch batches in parallel
  await Promise.all(chunks.map(async (batchCodes) => {
    const url = `/api/market/funds?codes=${batchCodes.join(',')}`;

    try {
      const resp = await fetchWithRetry(url, {}, 2, 45000); // Increased timeout to 45s for safety

      if (!resp.ok) return;

      const json = await resp.json();
      const list = json.data || [];
      
      // Map to record for storage
      list.forEach((item: any) => {
          if (item && item.code) {
             // console.log('[FundSnapshotDebug]', item.code, Object.keys(item));
              apiResultsMap[item.code] = item;
          }
      });
    } catch (e) {
      console.warn(`Funds batch fetch failed for chunk size ${batchCodes.length}`, e);
    }
  }));

  // 3. Save new data to IndexedDB
  if (Object.keys(apiResultsMap).length > 0) {
      await setLocalFundsBatch(apiResultsMap);
  }

  // 4. Merge Local + New
  const finalMap = { ...localData, ...apiResultsMap };
  return Object.values(finalMap).map((f: any) => ({
      ...f,
      // Map Eastmoney API fields if available (fallback for missing history)
      quarterChangePercent: f.quarterChangePercent ?? (f.SYL_3Y ? parseFloat(f.SYL_3Y) : undefined),
      monthChangePercent: f.monthChangePercent ?? (f.SYL_Y ? parseFloat(f.SYL_Y) : undefined),
      weekChangePercent: f.weekChangePercent ?? (f.SYL_Z ? parseFloat(f.SYL_Z) : undefined),
      yearChangePercent: f.yearChangePercent ?? (f.SYL_1N ? parseFloat(f.SYL_1N) : (f.SYL_JN ? parseFloat(f.SYL_JN) : undefined))
  }));
};


// V67: Search funds/ETFs by name keyword
export type FundSearchResult = { code: string; name: string; type: string };
export const searchFundByKeyword = async (keyword: string): Promise<FundSearchResult[]> => {
  if (!keyword.trim()) return [];
  try {
    const url = `/api/market/fund-search?q=${encodeURIComponent(keyword.trim())}`;
    const resp = await fetchWithRetry(url, {}, 1, 10000, true);
    if (!resp.ok) return [];
    const json = await resp.json();
    return json.results || [];
  } catch (e) {
    console.warn('[FundSearch] Search failed:', e);
    return [];
  }
};

export const fetchStockData = async (codes: string[], forceRefresh = false): Promise<{ data: Record<string, Partial<Stock>>, isMock: boolean }> => {
  if (codes.length === 0) return { data: {}, isMock: false };

  // v9.0 Optimization: Chunking for massive requests
  // If we request > 15 stocks, split into multiple parallel backend calls
  // to prevent single request timeout (35s) and URL length limits.
  // V62.1 Fix: Reduced chunk size from 30→15 to prevent edge function overload
  if (codes.length > 15) {
    const CHUNK_SIZE = 15;
    const results: Record<string, Partial<Stock>> = {};
    const chunks = [];
    for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
      chunks.push(codes.slice(i, i + CHUNK_SIZE));
    }

    // Process chunks with controlled concurrency (sequential waves)
    // V62.1 Fix: Reduced concurrency from 2→1 to avoid simultaneous edge function pressure
    const CONCURRENCY = 1;
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const wave = chunks.slice(i, i + CONCURRENCY);
      const waveResults = await Promise.all(wave.map(chunk => fetchStockData(chunk, forceRefresh)));
      waveResults.forEach(res => {
        Object.assign(results, res.data);
      });
      // Pause between waves to let the edge function breathe
      if (i + CONCURRENCY < chunks.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    return { data: results, isMock: false };
  }

  const cacheKey = [...codes].sort().join(',');
  const now = Date.now();

  // 1. Check Cache
  const cached = stockDataCache.get(cacheKey);
  if (!forceRefresh && cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  // 2. Check in-flight requests
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const formattedCodes = codes.map(formatCode).filter(c => c);
  const list = formattedCodes.join(',');
  const url = `/api/market/stocks?codes=${list}`;

  const requestPromise = (async () => {
    try {
      const resp = await fetchWithRetry(url, {}, 0, 22000, true);
      
      if (!resp.ok) throw new Error(`Backend stock fetch failed with status ${resp.status}`);
      const json = await resp.json();
      
      const results: Record<string, Partial<Stock>> = {};
      codes.forEach((originalCode, index) => {
          const formatted = formattedCodes[index];
          if (json.data && json.data[formatted]) {
              results[originalCode] = json.data[formatted];
              lastGoodStockData.set(originalCode, {
                data: json.data[formatted],
                timestamp: Date.now(),
              });
          } else {
              const stale = lastGoodStockData.get(originalCode);
              if (stale && Date.now() - stale.timestamp <= STALE_STOCK_TTL) {
                results[originalCode] = stale.data;
              }
          }
      });

      const finalData = { data: results, isMock: false };
      stockDataCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
      return finalData;
    } catch (error: any) {
      console.error("Fetch stock data failed", error);
      const staleResults: Record<string, Partial<Stock>> = {};
      codes.forEach(code => {
        const stale = lastGoodStockData.get(code);
        if (stale && Date.now() - stale.timestamp <= STALE_STOCK_TTL) {
          staleResults[code] = stale.data;
        }
      });
      return { data: staleResults, isMock: false };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

export const fetchMarketIndices = async (): Promise<{ data: MarketIndex[], isMock: boolean }> => {
  const dedupeKey = 'market:indices';
  if (inFlightRequests.has(dedupeKey)) return inFlightRequests.get(dedupeKey);

  const url = '/api/market/indices';

  const requestPromise = (async () => {
    try {
      // Use fetchWithRetry but with shorter total timeout to avoid blocking UI
      // Enable silent mode to avoid console spam on failure
      const resp = await fetchWithRetry(url, {
        headers: { 'Accept': 'application/json' }
      }, 0, 8000, true);

      if (!resp.ok) {
          // If backend returns 500, we treat it as empty data, not a crash
          // console.warn(`Indices endpoint returned status ${resp.status}`);
          return { data: staleIndices(), isMock: false };
      }
      
      const json = await resp.json();
      const data = Array.isArray(json.data) ? json.data : [];
      if (data.length > 0) lastGoodIndices = { data, timestamp: Date.now() };
      return { data: data.length > 0 ? data : staleIndices(), isMock: false };
    } catch (e: any) {
      // Silently fail for indices (optional data), don't crash the app
      // console.warn(`Indices fetch failed silently: ${e.message}`);
      
      // Fallback: Return static data if fetch fails to prevent UI from looking broken
      return { 
          data: staleIndices(), 
          isMock: false 
      };
    }
  })();

  inFlightRequests.set(dedupeKey, requestPromise);
  try {
      return await requestPromise;
  } finally {
      inFlightRequests.delete(dedupeKey);
  }
};

// Summary is the hot path. The 5400-row list is fetched separately at a lower frequency.
export const fetchMarketStats = async (includeList = false): Promise<MarketStatsSnapshot | null> => {
  const cacheKey = includeList ? 'market:stats:full' : 'market:stats:summary';
  const now = Date.now();
  const memoryCached = marketStatsCache.get(cacheKey);
  if (memoryCached && now - memoryCached.timestamp < MARKET_STATS_CACHE_TTL) {
    return memoryCached.data;
  }

  if (inFlightRequests.has(cacheKey)) return inFlightRequests.get(cacheKey);

  // The full snapshot is persisted in IndexedDB. Reuse it for both the
  // compact breadth summary and the scanner list while it is still inside the
  // local freshness window. This makes a reload paint immediately instead of
  // waiting for the first cold paginated request.
  const cached = await getLocalMarketSnapshot();
  if (cached?.list?.length > 4000 && cached.totalAmount !== undefined) {
    const localResult = includeList ? cached : { ...cached, list: undefined };
    marketStatsCache.set(cacheKey, { data: localResult, timestamp: now });
    return localResult;
  }

  const url = `/api/market/stats${includeList ? '?includeList=true' : ''}`;
  const requestPromise = (async () => {
    try {
      const resp = await fetchWithRetry(url, {}, 0, 30000, true);

      if (!resp.ok) return null;

      const json = await resp.json();
      const result = json.data as MarketStatsSnapshot | null;
      if (!result || !Number.isFinite(result.totalCount) || result.totalCount < 1_000) return null;

      const directionalCoverage = (
        result.upCount + result.downCount + result.flatCount
      ) / Math.max(1, result.totalCount);
      if (directionalCoverage < 0.75 || result.quality?.status === 'UNAVAILABLE') return null;

      marketStatsCache.set(cacheKey, { data: result, timestamp: Date.now() });
      if (includeList) setLocalMarketSnapshot(result);
      return result;
    } catch (e) {
      console.warn('Market stats fetch failed', e);
      return null;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

export const fetchMarketHealth = async (): Promise<any | null> => {
  try {
    const resp = await fetchWithRetry(
      '/api/market/health',
      {},
      0,
      5000,
      true,
    );
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
};
