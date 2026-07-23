import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { calculateLimitState } from "./market_rules.ts";

// Monkey-patch console.error to suppress unavoidable Deno runtime errors
// The "Http: connection closed" error happens at the runtime layer when a client disconnects
// abruptly during a stream. It cannot always be caught by try/catch blocks.
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
    // Check first argument for error object or string
    const first = args[0];
    if (first) {
        // Check for the specific error object structure
        if (typeof first === 'object' && first.name === 'Http') {
            return;
        }
        // Check for error message string
        const msg = String(first);
        if (msg.includes("Http: connection closed") || 
            msg.includes("connection closed before message completed")) {
            return;
        }
    }
    originalConsoleError(...args);
};

// Helper to identify connection errors
const isConnectionError = (e: any) => {
    if (!e) return false;
    
    // 1. Direct Name check (Fastest)
    if (e.name === "Http") return true;
    if (e.name === "AbortError") return true;
    if (e.name === "BrokenPipe") return true;
    if (e.name === "ConnectionReset") return true;
    
    // 2. Message check
    const msg = (e.message || "").toLowerCase();
    const name = (e.name || "").toLowerCase();
    const code = e.code || "";
    
    return (
        name === "http" ||
        name === "brokenpipe" ||
        name === "connectionreset" ||
        name === "badresource" ||
        msg.includes("connection closed") ||
        msg.includes("broken pipe") ||
        msg.includes("network error") ||
        msg.includes("epipe") ||
        msg.includes("econnreset") ||
        msg.includes("stream") || 
        msg.includes("before message completed") ||
        code === "EPIPE" ||
        code === "ECONNRESET" ||
        code === "ECANCELED"
    );
};

// Helper for consistent error handling (v5.8.3 Defense)
// Suppresses "connection closed" errors to prevent log noise
const safeError = (c: any, e: any) => {
    // 1. Check for explicit client abort signal
    if (c.req.raw?.signal?.aborted) {
        return new Response(null, { status: 499 });
    }
    
    // 2. Check for connection errors
    if (isConnectionError(e)) {
        return new Response(null, { status: 499 });
    }
    
    // 3. Log real errors for debugging
    console.error(`[API Error] ${c.req.path}:`, e);
    
    // 4. Return standard error response
    return c.json({ error: e.message }, 500);
};

const parseTencentQuoteTimestamp = (value: unknown) => {
    const raw = String(value || "");
    if (!/^\d{14}$/.test(raw)) return undefined;
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+08:00`;
    const timestamp = Date.parse(iso);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
};

const app = new Hono();

// Global error handler for uncaught promise rejections (Deno specific)
if (typeof globalThis !== 'undefined' && globalThis.addEventListener) {
    globalThis.addEventListener("unhandledrejection", (e: any) => {
        if (isConnectionError(e.reason)) {
            e.preventDefault();
        }
    });
    
    // Add handler for uncaught exceptions (which 'Http: connection closed' might be)
    globalThis.addEventListener("error", (e: any) => {
        if (isConnectionError(e.error)) {
            e.preventDefault();
        }
    });
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Define API routes in a separate app instance to support flexible routing
const api = new Hono();

// Helper for robust KV access with retries
const safeKvGet = async (key: string, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
        try {
            return await kv.get(key);
        } catch (e) {
            if (i === retries) {
                console.error(`KV Get Failed for ${key} after ${retries} retries:`, e);
                return null;
            }
            // Exponential backoff: 50ms, 100ms, ...
            await new Promise(r => setTimeout(r, 50 * Math.pow(2, i)));
        }
    }
    return null;
};

// V67.8: Helper for robust KV writes with retries (fixes 520 transient Cloudflare errors on kv.set)
const safeKvSet = async (key: string, value: any, retries = 3) => {
    for (let i = 0; i <= retries; i++) {
        try {
            await kv.set(key, value);
            return;
        } catch (e: any) {
            const msg = String(e?.message || e || "");
            const isTransient = msg.includes("520") || msg.includes("502") || msg.includes("503")
                || msg.includes("unknown error") || msg.includes("ECONNRESET")
                || msg.includes("connection") || msg.includes("<!DOCTYPE");
            if (i === retries || !isTransient) {
                console.error(`KV Set Failed for ${key} after ${i + 1} attempts:`, msg.slice(0, 200));
                throw e;
            }
            // Exponential backoff: 200ms, 600ms, 1800ms
            const delay = 200 * Math.pow(3, i);
            console.log(`KV Set retry ${i + 1}/${retries} for ${key} after ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
};

// Helper to check for client abort (v9.8 Optimization)
const checkAbort = (c: any) => {
    try {
        if (c.req.raw?.signal?.aborted) return true;
    } catch (e) {}
    return false;
};

// Health check endpoint
api.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Load all trading data
api.get("/data", async (c) => {
  try {
    const [stocks, themes, metrics, journal] = await Promise.all([
      safeKvGet("trading:stocks"),
      safeKvGet("trading:themes"),
      safeKvGet("trading:metrics"),
      safeKvGet("trading:journal"),
    ]);

    if (checkAbort(c)) return new Response(null, { status: 499 });

    // Optimization: Always strip history from stocks before sending to client
    // This prevents "Broken Pipe" errors caused by massive payloads (5MB+)
    // The client is designed to re-fetch history if missing
    const lightweightStocks = Array.isArray(stocks) 
      ? stocks.map((s: any) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { history, ticks, ...rest } = s;
          return rest;
      })
      : [];

    if (checkAbort(c)) return new Response(null, { status: 499 });

    return c.json({
      stocks: lightweightStocks,
      themes: themes || [],
      metrics: metrics || null,
      journal: journal || null,
    });
  } catch (error) {
    return safeError(c, error);
  }
});

// Save trading data (partial updates supported)
api.post("/data", async (c) => {
  try {
    const body = await c.req.json();
    const { stocks, themes, metrics, journal } = body;
    
    const updates: Promise<void>[] = [];

    if (stocks !== undefined) {
      // Optimization: Strip heavy fields (history, ticks) before saving to KV
      // This prevents KV timeouts and keeps the database lightweight
      const lightweightStocks = Array.isArray(stocks) 
        ? stocks.map((s: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { history, ticks, ...rest } = s;
            return rest;
        })
        : [];
      updates.push(safeKvSet("trading:stocks", lightweightStocks));
    }
    if (themes !== undefined) updates.push(safeKvSet("trading:themes", themes));
    if (metrics !== undefined) updates.push(safeKvSet("trading:metrics", metrics));
    if (journal !== undefined) updates.push(safeKvSet("trading:journal", journal));

    await Promise.all(updates);

    return c.json({ status: "success" });
  } catch (error) {
    return safeError(c, error);
  }
});

// Personal fund state is intentionally device-local. The earlier implementation
// stored every visitor's portfolio under shared KV keys, allowing cross-user
// reads and overwrites on a public site. Keep the legacy routes explicitly
// closed so old clients fail safely instead of recreating a shared tenant.
const retiredPersonalFundState = (c: any) => c.json({
  error: "Personal fund state is stored on the current device only",
}, 410);
api.get("/user/funds", retiredPersonalFundState);
api.post("/user/funds", retiredPersonalFundState);
api.get("/user/fund-holdings", retiredPersonalFundState);
api.post("/user/fund-holdings", retiredPersonalFundState);

let marketThemesCache: { themes: any[]; storedAt: number } | null = null;
const MARKET_THEMES_CACHE_TTL_MS = 30_000;
const MARKET_THEMES_STALE_TTL_MS = 10 * 60_000;

// Proxy to fetch Real-time Market Themes (Sina Finance)
api.get("/market/themes", async (c) => {
  try {
    const cacheAgeMs = marketThemesCache ? Date.now() - marketThemesCache.storedAt : Infinity;
    if (marketThemesCache && cacheAgeMs < MARKET_THEMES_CACHE_TTL_MS) {
      c.header("X-Market-Data-Cache", "HIT");
      return c.json({ themes: marketThemesCache.themes });
    }

    const fetchSinaThemes = async (node: string) => {
        const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=15&sort=changepercent&asc=0&node=${node}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        try {
          const resp = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              "Referer": "https://finance.sina.com.cn/",
            },
            signal: controller.signal
          });
          clearTimeout(timeout);
          
          if (!resp.ok) throw new Error(`Status ${resp.status}`);
          
          const buffer = await resp.arrayBuffer();
          const decoder = new TextDecoder("gbk");
          let text = decoder.decode(buffer);
          
          // Sina returns loose JSON (unquoted keys) and sometimes null(...)
          text = text.trim();
          if (text.startsWith('null(')) {
              text = text.substring(5, text.length - 1);
          }
          
          // Clean up loose JSON keys
          const cleaned = text.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
          try {
              return JSON.parse(cleaned);
          } catch (e) {
              console.error("JSON Parse failed for themes", e);
              return [];
          }
        } catch (e) {
          clearTimeout(timeout);
          throw e;
        }
    };

    const [conceptsResult, industriesResult] = await Promise.allSettled([
      fetchSinaThemes("gn_sina"),
      fetchSinaThemes("hy_sina"),
    ]);
    const concepts = conceptsResult.status === "fulfilled" ? conceptsResult.value : [];
    const industries = industriesResult.status === "fulfilled" ? industriesResult.value : [];
    const data = concepts?.length > 0 ? concepts : industries;
    
    if (!data || data.length === 0) {
        console.warn("Real-time theme data unavailable from Sina.");
        if (marketThemesCache && cacheAgeMs < MARKET_THEMES_STALE_TTL_MS) {
          c.header("X-Market-Data-Cache", "STALE");
          return c.json({ themes: marketThemesCache.themes });
        }
        return c.json({ themes: [] });
    }
    
    // Safety check for client disconnect before sending heavy JSON
    try {
        if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });
    } catch(e) {}

    // Transform to our Theme format
    const themes = data.map((item: any, index: number) => {
      const change = parseFloat(item.changepercent);
      const isMain = index < 3 && change > 1.5;
      return {
        id: `sina-${item.symbol}`,
        name: item.name,
        type: isMain ? 'Main' : 'Vice',
        logic: `板块涨幅 ${change}%`,
      };
    });
    marketThemesCache = { themes, storedAt: Date.now() };

    try {
        if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });
        return c.json({ themes });
    } catch (e) {
        // Suppress broken pipe errors on response write
        return new Response(null, { status: 499 });
    }
  } catch (error) {
    console.error("Theme fetch error:", error);
    return c.json({ themes: [] });
  }
});

  // Proxy to fetch Stock Data (Tencent Finance)
  // v36.0 Update: Handle large batch requests by chunking
  api.get("/market/stocks", async (c) => {
    try {
      const codesParam = c.req.query("codes");
      if (!codesParam) return c.json({ error: "Codes required" }, 400);

      const codes = codesParam.split(',').filter(x => x);
      // Reduce batch size to prevent timeouts and rate limits
      const BATCH_SIZE = 15; 
      const results: Record<string, any> = {};

      const fetchBatch = async (batchCodes: string[]) => {
          // 1. Tencent L1 Data (Base)
          const tencentUrl = `https://web.sqt.gtimg.cn/q=${batchCodes.join(',')}`;
          
          // 2. Eastmoney Flow Data (Add-on)
          // Map sh/sz to 1/0
          const emIds = batchCodes.map(c => {
              if (c.startsWith('sh')) return `1.${c.slice(2)}`;
              if (c.startsWith('sz')) return `0.${c.slice(2)}`;
              if (c.startsWith('bj')) return `0.${c.slice(2)}`; 
              return `0.${c}`; // Default
          }).join(',');
          
          const emPath = `/api/qt/ulist.np/get?fltt=2&invt=2&secids=${emIds}&fields=f12,f14,f2,f3,f5,f6,f8,f15,f16,f17,f18,f62,f124,f184,f185,f186,f187,f188,f189`;
          const emUrls = [
              `https://push2.eastmoney.com${emPath}`,
              `https://push2delay.eastmoney.com${emPath}`,
          ];

          try {
              // Run both fetches in parallel, but handle failures independently
              // V49.5 FIX: Handle Eastmoney TLS Drop / Rate Limit gracefully
              // If EM fails, we still want the Tencent price data.
              const tencentPromise = (async () => {
                  const controller = new AbortController();
                  const timeout = setTimeout(() => controller.abort(), 8000);
                  try {
                      return await fetch(tencentUrl, {
                          signal: controller.signal,
                          headers: { "User-Agent": "Mozilla/5.0" }
                      });
                  } finally {
                      clearTimeout(timeout);
                  }
              })();

              // Add retry logic for Eastmoney
              const fetchEmWithRetry = async (retries = 1) => {
                  for (let i = 0; i <= retries; i++) {
                      const controller = new AbortController();
                      const timeout = setTimeout(() => controller.abort(), 8000);
                      try {
                          const resp = await fetch(emUrls[i % emUrls.length], {
                              signal: controller.signal,
                              headers: { 
                                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                                  "Referer": "https://quote.eastmoney.com/",
                                  "Accept": "application/json, text/plain, */*",
                                  "Connection": "keep-alive"
                              }
                          });
                          if (!resp.ok) throw new Error(`Eastmoney status ${resp.status}`);
                          return resp;
                      } catch (e: any) {
                          if (i === retries) throw e;
                          await new Promise(r => setTimeout(r, 200 * (i + 1)));
                      } finally {
                          clearTimeout(timeout);
                      }
                  }
              };

              // Use allSettled so one failure doesn't kill the other
              const [tencentResult, emResult] = await Promise.allSettled([
                  tencentPromise,
                  fetchEmWithRetry()
              ]);

              // Process Tencent Data
              if (tencentResult.status === 'fulfilled' && tencentResult.value.ok) {
                  const buffer = await tencentResult.value.arrayBuffer();
                  const decoder = new TextDecoder("gbk");
                  const text = decoder.decode(buffer);
                  const lines = text.split(';').filter(l => l.trim());
                  
                  lines.forEach(line => {
                      const match = line.match(/v_([a-z0-9]+)=\"(.+)\"/);
                      if (match) {
                          const code = match[1];
                          const data = match[2].split('~');
                          if (data.length > 30) {
                              const current = parseFloat(data[3]);
                              const prevClose = parseFloat(data[4]);
                              const changePercent = prevClose > 0
                                ? parseFloat((((current - prevClose) / prevClose) * 100).toFixed(2))
                                : 0;
                              const limitState = calculateLimitState({
                                  code: code.replace(/^(sh|sz|bj)/, ''),
                                  name: data[1],
                                  currentPrice: current,
                                  previousClose: prevClose,
                                  changePercent,
                                  sourceLimitUpPrice: parseFloat(data[47]),
                                  sourceLimitDownPrice: parseFloat(data[48]),
                              });
                              results[code] = {
                                  name: data[1],
                                  currentPrice: current,
                                  changePercent,
                                  high: parseFloat(data[33]),
                                  low: parseFloat(data[34]),
                                  open: parseFloat(data[5]),
                                  prevClose: prevClose,
                                  volume: parseFloat(data[6]),
                                  turnover: parseFloat(data[37]),
                                  turnoverRate: parseFloat(data[38]),
                                  limitUpPrice: limitState.limitUpPrice,
                                  limitDownPrice: limitState.limitDownPrice,
                                  isLimitUp: limitState.isLimitUp,
                                  isLimitDown: limitState.isLimitDown,
                                  lastUpdate: data[30],
                                  sourceAsOf: parseTencentQuoteTimestamp(data[30]),
                                  // V18.0: Real-time Order Book & Flow for Decoy Analysis
                                  buyVolume: parseFloat(data[7]),   // Active Buy (Outer)
                                  sellVolume: parseFloat(data[8]),  // Active Sell (Inner)
                                  bid1Amount: parseFloat(data[10]),
                                  bid2Amount: parseFloat(data[12]),
                                  bid3Amount: parseFloat(data[14]),
                                  bid4Amount: parseFloat(data[16]),
                                  bid5Amount: parseFloat(data[18]),
                                  ask1Amount: parseFloat(data[20]),
                                  ask2Amount: parseFloat(data[22]),
                                  ask3Amount: parseFloat(data[24]),
                                  ask4Amount: parseFloat(data[26]),
                                  ask5Amount: parseFloat(data[28]),
                                  // Aggregated for convenience
                                  bidAmount: parseFloat(data[10]) + parseFloat(data[12]) + parseFloat(data[14]) + parseFloat(data[16]) + parseFloat(data[18]),
                                  askAmount: parseFloat(data[20]) + parseFloat(data[22]) + parseFloat(data[24]) + parseFloat(data[26]) + parseFloat(data[28])
                              };
                          }
                      }
                  });
              }

              // Process Eastmoney Data (Flow & Margin)
              if (emResult.status === 'fulfilled') {
                  const emResp = emResult.value;
                  if (emResp && emResp.ok) {
                      try {
                          const emJson = await emResp.json();
                          const diff = emJson?.data?.diff;
                          if (diff) {
                              // diff can be Array or Object
                              const list = Array.isArray(diff) ? diff : Object.values(diff);
                              list.forEach((item: any) => {
                                  const rawCode = item.f12;
                                  const flow = parseFloat(item.f62);
                                  
                                  // Match back to the requested code key. Eastmoney is
                                  // also a complete quote fallback when Tencent L1 is
                                  // unavailable from the edge region.
                                  const possibleKeys = [`sh${rawCode}`, `sz${rawCode}`, `bj${rawCode}`, rawCode];
                                  const matchedKey = possibleKeys.find(k => batchCodes.includes(k))
                                    || possibleKeys.find(k => results[k]);

                                  if (matchedKey && !results[matchedKey]) {
                                      const numberOrZero = (value: unknown) => {
                                          const parsed = Number(value);
                                          return Number.isFinite(parsed) ? parsed : 0;
                                      };
                                      const sourceTimestamp = numberOrZero(item.f124) * 1000;
                                      const sourceAsOf = sourceTimestamp > 1_500_000_000_000
                                          ? new Date(sourceTimestamp).toISOString()
                                          : undefined;
                                      const currentPrice = numberOrZero(item.f2);
                                      const previousClose = numberOrZero(item.f18);
                                      const changePercent = numberOrZero(item.f3);
                                      const limitState = calculateLimitState({
                                          code: rawCode,
                                          name: String(item.f14 || rawCode),
                                          currentPrice,
                                          previousClose,
                                          changePercent,
                                      });
                                      results[matchedKey] = {
                                          name: String(item.f14 || rawCode),
                                          currentPrice,
                                          changePercent,
                                          high: numberOrZero(item.f15),
                                          low: numberOrZero(item.f16),
                                          open: numberOrZero(item.f17),
                                          prevClose: previousClose,
                                          volume: numberOrZero(item.f5),
                                          turnover: numberOrZero(item.f6),
                                          turnoverRate: numberOrZero(item.f8),
                                          limitUpPrice: limitState.limitUpPrice,
                                          limitDownPrice: limitState.limitDownPrice,
                                          isLimitUp: limitState.isLimitUp,
                                          isLimitDown: limitState.isLimitDown,
                                          sourceAsOf,
                                      };
                                  }
                                  
                                  if (matchedKey && results[matchedKey]) {
                                      if (!isNaN(flow)) {
                                          results[matchedKey].largeOrderNetYuan = flow;
                                          results[matchedKey].largeOrderNetSource = "eastmoney-f62";
                                          results[matchedKey].largeOrderNetAsOf = results[matchedKey].sourceAsOf;
                                      }

                                      // V17.5: Margin Data (T-1)
                                      const rzye = parseFloat(item.f184); // Financing Balance (Yuan)
                                      const rzmre = parseFloat(item.f185); // Financing Buy (Yuan)
                                      const rzche = parseFloat(item.f186); // Financing Repay (Yuan)
                                      const rqye = parseFloat(item.f187); // Short Balance (Yuan)
                                      const rqmcl = parseFloat(item.f188); // Short Sell Vol (Shares)
                                      const rqchl = parseFloat(item.f189); // Short Repay Vol (Shares)
                                      
                                      if (!isNaN(rzye)) {
                                          // Convert Yuan to Wan (10000)
                                          const currentP = results[matchedKey].currentPrice || 10;
                                          results[matchedKey].marginData = {
                                              financingBalance: rzye / 10000, 
                                              financingBuy: rzmre / 10000,
                                              financingNetBuy: (rzmre - rzche) / 10000,
                                              shortBalance: rqye / 10000,
                                              shortSellVolume: rqmcl / 100, // Shares -> Hands
                                              // Estimate Net Sell Value: (Sell - Repay) * Price
                                              shortNetSell: ((rqmcl - rqchl) * currentP) / 10000
                                          };
                                      }
                                  }
                              });
                          }
                      } catch (e) {
                          console.warn("EM JSON Parse error", e);
                      }
                  }
              } else {
                  console.warn(`EM Fetch Failed for batch ${batchCodes[0]}...`, emResult.reason);
              }

          } catch (error: any) {
              if (error.name === 'AbortError') {
                  console.warn(`Batch fetch timed out for codes: ${batchCodes.join(',')}`);
              } else {
                  console.error("Stock batch fetch error:", error);
              }
          }
      };

      // Check for client disconnect
      if (c.req.raw?.signal?.aborted) {
          return c.json({ data: {} });
      }

      // Sequential Execution to prevent resource exhaustion and rate limits
      for (let i = 0; i < codes.length; i += BATCH_SIZE) {
          if (c.req.raw?.signal?.aborted) break;
          await fetchBatch(codes.slice(i, i + BATCH_SIZE));
      }
      
      try {
          if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });
          return c.json({ data: results });
      } catch (e) {
          return new Response(null, { status: 499 });
      }
    } catch (error) {
      return safeError(c, error);
    }
  });

// Proxy to fetch Market Indices
api.get("/market/indices", async (c) => {
  const indices = ['sh000001', 'sh000300', 'sh000905', 'sh000852', 'sz399001', 'sz399006', 'sh000688'];
  
  // Helper to decode GBK safely
  const decodeGBK = async (resp: Response) => {
      const buffer = await resp.arrayBuffer();
      try {
          return new TextDecoder("gbk").decode(buffer);
      } catch (e) {
          console.warn("GBK decode failed, falling back to UTF-8");
          return new TextDecoder("utf-8").decode(buffer);
      }
  };

  // Strategy 1: Tencent (GTimg)
  const fetchTencent = async (signal: AbortSignal) => {
      const url = `https://qt.gtimg.cn/q=${indices.join(',')}`;
      
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      if (signal) signal.addEventListener('abort', onAbort);
      const id = setTimeout(() => controller.abort(), 5000); // Increased from 3000 to 5000

      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: controller.signal
        });
        clearTimeout(id);
        
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        
        const text = await decodeGBK(resp);
        const lines = text.split(';').filter(l => l.trim());
        const results: any[] = [];

        lines.forEach(line => {
          const match = line.match(/v_([a-z0-9]+)=\"(.+)\"/);
          if (match) {
            const parts = match[2].split('~');
            if (parts.length > 5) {
              const current = parseFloat(parts[3]);
              const prevClose = parseFloat(parts[4]);
              const change = current - prevClose;
              const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

              results.push({
                code: match[1],
                name: parts[1],
                current,
                change: parseFloat(change.toFixed(2)),
                changePercent: parseFloat(changePercent.toFixed(2))
              });
            }
          }
        });
        if (results.length === 0) throw new Error("No data parsed");
        return results;
      } catch (e) {
        throw e;
      } finally {
        clearTimeout(id);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
  };

  // Strategy 2: Sina Finance
  const fetchSina = async (signal: AbortSignal) => {
      const url = `https://hq.sinajs.cn/list=${indices.join(',')}`;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      if (signal) signal.addEventListener('abort', onAbort);
      const id = setTimeout(() => controller.abort(), 5000); // Increased from 3000 to 5000

      try {
          const resp = await fetch(url, {
             headers: { "Referer": "https://finance.sina.com.cn/" },
             signal: controller.signal 
          });
          clearTimeout(id);
          
          if (!resp.ok) throw new Error(`Status ${resp.status}`);
          
          const text = await decodeGBK(resp);
          const lines = text.split('\n').filter(l => l.trim());
          const results: any[] = [];
          
          lines.forEach(line => {
             const match = line.match(/hq_str_([a-z0-9]+)=\"(.+)\"/);
             if (match) {
                 const code = match[1];
                 const parts = match[2].split(',');
                 if (parts.length > 3) {
                     const name = parts[0];
                     const price = parseFloat(parts[3]) || parseFloat(parts[2]);
                     const prevClose = parseFloat(parts[2]);
                     const change = price - prevClose;
                     const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
                     
                     results.push({
                         code,
                         name,
                         current: price,
                         change: parseFloat(change.toFixed(2)),
                         changePercent: parseFloat(changePercent.toFixed(2))
                     });
                 }
             }
          });
          if (results.length === 0) throw new Error("No data parsed");
          return results;
      } catch (e) {
          throw e;
      } finally {
          clearTimeout(id);
          if (signal) signal.removeEventListener('abort', onAbort);
      }
  };

  // Wrap in try-catch to ensure response is always sent
  try {
    // Check if client already disconnected (Safe check)
    // NOTE: Accessing c.req.raw.signal might throw if request is already closed in some environments
    try {
        if (c.req.raw?.signal?.aborted) {
            return new Response(null, { status: 499 });
        }
    } catch (e) {
        // Ignore signal access errors
    }
    
    const raceSuccess = (promises: Promise<any>[]) => {
        return new Promise((resolve) => {
            let failureCount = 0;
            const total = promises.length;
            promises.forEach(p => {
                p.then(resolve).catch(() => {
                    failureCount++;
                    // If all sources fail, resolve with empty array instead of rejecting
                    // This prevents "Unhandled Rejection" if the parent Promise.race has already finished
                    if (failureCount === total) resolve([]);
                });
            });
        });
    };

    // Hard timeout for the entire route
    const hardTimeout = new Promise((resolve) => 
      setTimeout(() => resolve([]), 8000) 
    );
    
    const controller = new AbortController();
    const onClientAbort = () => controller.abort();
    
    // Safely add event listener
    try {
        if (c.req.raw && c.req.raw.signal) {
            c.req.raw.signal.addEventListener('abort', onClientAbort);
        }
    } catch (e) {}

    try {
        const data = await Promise.race([
            raceSuccess([fetchTencent(controller.signal), fetchSina(controller.signal)]),
            hardTimeout
        ]) as any[];
        
        controller.abort();
        try {
            if (c.req.raw && c.req.raw.signal) {
                c.req.raw.signal.removeEventListener('abort', onClientAbort);
            }
        } catch (e) {}
        
        if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });

        try {
            return c.json({ data });
        } catch (e) {
            return new Response(null, { status: 499 });
        }
    } catch (e) {
        controller.abort();
        try {
            if (c.req.raw && c.req.raw.signal) {
                c.req.raw.signal.removeEventListener('abort', onClientAbort);
            }
        } catch (e) {}
        
        // Silent fail on abort
        if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });

        console.warn("Indices fetch failed:", e);
        return c.json({ data: [] });
    }
  } catch (error) {
    return safeError(c, error);
  }
});

// Proxy to search stocks
api.get("/market/search", async (c) => {
  const query = c.req.query("q");
  if (!query) return c.json({ error: "Query required" }, 400);

  const url = `https://suggest3.sinajs.cn/suggest/type=&key=${encodeURIComponent(query)}`;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://finance.sina.com.cn/",
      }
    });
    const buffer = await resp.arrayBuffer();
    const decoder = new TextDecoder("gbk");
    const text = decoder.decode(buffer);

    const match = text.match(/"([^"]+)"/);
    if (match) {
        const dataStr = match[1];
        const parts = dataStr.split(',');
        if (parts.length > 3) {
            const symbol = parts[3];
            const name = parts[4];
            const rawCode = symbol.replace(/^(sh|sz|bj)/, '');
            try {
                return c.json({ result: { code: rawCode, name: name || query } });
            } catch (e) {
                return new Response(null, { status: 499 });
            }
        }
    }
    return c.json({ result: null });
  } catch (error) {
    return safeError(c, error);
  }
});

// V67: Fund search by name/keyword (supports ETF + OTC funds)
// V67.1: Fixed – added Eastmoney mobile API (reliable JSON), JSONP parser fallback, proper logging
api.get("/market/fund-search", async (c) => {
  const keyword = c.req.query("q");
  if (!keyword) return c.json({ error: "Query required" }, 400);

  try {
    const results: { code: string; name: string; type: string }[] = [];
    const seenCodes = new Set<string>();

    // Helper: parse JSON or JSONP (var x={...} / callback({...}))
    const parseJsonOrJsonp = (text: string): any => {
      try { return JSON.parse(text); } catch {}
      const m = text.match(/[=(]\s*(\{[\s\S]*\})\s*[);]?\s*$/);
      if (m) { try { return JSON.parse(m[1]); } catch {} }
      const m2 = text.match(/[=(]\s*(\[[\s\S]*\])\s*[);]?\s*$/);
      if (m2) { try { return JSON.parse(m2[1]); } catch {} }
      return null;
    };

    // 1. Eastmoney Mobile Fund Search API (most reliable for OTC funds, returns clean JSON)
    const emMobileUrl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNKeyWordSearch?plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=1&Ession=1&KeyWord=${encodeURIComponent(keyword)}`;
    const emMobilePromise = fetch(emMobileUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13)" }
    }).then(async (resp) => {
      const text = await resp.text();
      const json = parseJsonOrJsonp(text);
      console.log(`[fund-search] EM-mobile for "${keyword}": status=${resp.status}, parsed=${!!json}, count=${json?.Datas?.length || 0}`);
      if (!json) { console.log(`[fund-search] EM-mobile raw (first 300): ${text.slice(0, 300)}`); return; }
      const datas = json?.Datas || [];
      for (const d of datas) {
        const code = d.CODE || d.code || "";
        const name = d.NAME || d.name || d.SHORTNAME || "";
        const fundType = d.FundBaseInfo?.FTYPE || d.CATEGORYDESC || d.CATEGORY || "";
        if (code && /^\d{6}$/.test(code) && !seenCodes.has(code)) {
          seenCodes.add(code);
          results.push({ code, name, type: fundType || "基金" });
        }
      }
    }).catch((e) => { console.log(`[fund-search] EM-mobile error for "${keyword}":`, e?.message || e); });

    // 2. Eastmoney Web Fund Suggest API (fallback, may return JSONP)
    const emWebUrl = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}&pageindex=0&pagesize=15`;
    const emWebPromise = fetch(emWebUrl, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://fund.eastmoney.com/" }
    }).then(async (resp) => {
      const text = await resp.text();
      const json = parseJsonOrJsonp(text);
      console.log(`[fund-search] EM-web for "${keyword}": status=${resp.status}, parsed=${!!json}, count=${json?.Datas?.length || 0}`);
      if (!json) { console.log(`[fund-search] EM-web raw (first 300): ${text.slice(0, 300)}`); return; }
      const datas = json?.Datas || [];
      for (const d of datas) {
        const code = d.CODE || d.code || "";
        const name = d.NAME || d.name || "";
        const fundType = d.FundBaseInfo?.FTYPE || d.CATEGORY || "";
        if (code && /^\d{6}$/.test(code) && !seenCodes.has(code)) {
          seenCodes.add(code);
          results.push({ code, name, type: fundType || "基金" });
        }
      }
    }).catch((e) => { console.log(`[fund-search] EM-web error for "${keyword}":`, e?.message || e); });

    // 3. Sina suggest (covers stocks + ETFs by name)
    const sinaUrl = `https://suggest3.sinajs.cn/suggest/type=11,12&key=${encodeURIComponent(keyword)}`;
    const sinaPromise = fetch(sinaUrl, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://finance.sina.com.cn/" }
    }).then(async (resp) => {
      const buffer = await resp.arrayBuffer();
      const text = new TextDecoder("gbk").decode(buffer);
      const match = text.match(/"([^"]*)"/);
      if (match && match[1]) {
        const items = match[1].split(";").filter(Boolean);
        for (const item of items.slice(0, 10)) {
          const parts = item.split(",");
          if (parts.length >= 5) {
            const rawCode = (parts[3] || "").replace(/^(sh|sz|bj)/, "");
            const name = parts[4] || "";
            if (rawCode && /^\d{6}$/.test(rawCode) && !seenCodes.has(rawCode)) {
              seenCodes.add(rawCode);
              results.push({ code: rawCode, name, type: "ETF/股票" });
            }
          }
        }
      }
    }).catch((e) => { console.log(`[fund-search] Sina error for "${keyword}":`, e?.message || e); });

    await Promise.all([emMobilePromise, emWebPromise, sinaPromise]);

    console.log(`[fund-search] FINAL "${keyword}": ${results.length} results – ${results.slice(0, 5).map(r => r.code + ':' + r.name).join(', ')}`);

    try {
      return c.json({ results: results.slice(0, 20) });
    } catch (e) {
      return new Response(null, { status: 499 });
    }
  } catch (error) {
    console.log(`[fund-search] Fatal error for "${keyword}":`, error);
    return safeError(c, error);
  }
});

type MarketDataStatus = "FRESH" | "PARTIAL" | "STALE";
type MarketCacheState = "MISS" | "HIT" | "COALESCED" | "STALE";

interface MarketStatsSnapshot {
  totalCount: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  limitUpCount: number;
  limitDownCount: number;
  avgChange: number;
  totalVolume: number;
  totalAmount: number;
  list: any[];
  quality: {
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
    cache: MarketCacheState;
  };
}

const MARKET_STATS_CACHE_TTL_MS = 8_000;
const MARKET_STATS_STALE_TTL_MS = 60_000;
let marketStatsCache: { snapshot: MarketStatsSnapshot; storedAt: number } | null = null;
let marketStatsInFlight: Promise<MarketStatsSnapshot> | null = null;
let marketStatsLastError: { message: string; at: string } | null = null;
const marketStatsHealthSamples: { ok: boolean; durationMs: number; at: number }[] = [];

const recordMarketStatsHealth = (ok: boolean, durationMs: number) => {
  marketStatsHealthSamples.push({ ok, durationMs, at: Date.now() });
  if (marketStatsHealthSamples.length > 100) marketStatsHealthSamples.shift();
};

const percentile = (values: number[], ratio: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
};

const isChinaMarketSession = (date: Date) => {
  const china = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const weekday = china.getUTCDay();
  const minutes = china.getUTCHours() * 60 + china.getUTCMinutes();
  return weekday >= 1 && weekday <= 5 &&
    ((minutes >= 9 * 60 + 15 && minutes <= 11 * 60 + 35) ||
      (minutes >= 12 * 60 + 55 && minutes <= 15 * 60 + 5));
};

const buildMarketStatsSnapshot = async (): Promise<MarketStatsSnapshot> => {
  const startedAt = Date.now();
  // Eastmoney accepts a combined market filter. Fetching the five boards as
  // one paginated universe cuts cold-start waves roughly in half and avoids
  // returning a board-biased partial sample.
  const MARKET_FILTER = "m:1+t:2,m:1+t:23,m:0+t:6,m:0+t:80,m:0+t:81+s:2048";
  const BATCH_SIZE = 100; // Upstream silently caps pages at 100 records.
  const MAX_PAGES = 65;
  const PAGE_CONCURRENCY = 4;
  const FIELDS = "f12,f14,f2,f3,f4,f5,f6,f8,f15,f16,f17,f18,f51,f52,f62,f124";
  const EASTMONEY_HOSTS = ["push2.eastmoney.com", "push2delay.eastmoney.com"];
  let pagesRequested = 0;
  let pagesSucceeded = 0;

  const fetchPage = async (page: number) => {
    pagesRequested++;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8_000);
      const host = EASTMONEY_HOSTS[attempt % EASTMONEY_HOSTS.length];
      const url = `https://${host}/api/qt/clist/get?pn=${page}&pz=${BATCH_SIZE}&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${MARKET_FILTER}&fields=${FIELDS}&_=${Date.now()}-${page}-${attempt}`;
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://quote.eastmoney.com/",
          },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const json = await response.json();
        const diff = json?.data?.diff;
        const items = Array.isArray(diff) ? diff : diff ? Object.values(diff) : [];
        if (items.length === 0) throw new Error("Empty market page");
        pagesSucceeded++;
        return { ok: true, items, total: Number(json?.data?.total) || 0 };
      } catch (error) {
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      } finally {
        clearTimeout(timeoutId);
      }
    }
    return { ok: false, items: [] as any[], total: 0 };
  };

  const firstPage = await fetchPage(1);
  if (!firstPage.ok || firstPage.total <= 0) {
    throw new Error("Market universe unavailable");
  }
  const expectedRecords = firstPage.total;
  const totalPages = Math.min(MAX_PAGES, Math.ceil(expectedRecords / BATCH_SIZE));
  const pageNumbers = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);
  const pageResults = [firstPage];
  for (let start = 0; start < pageNumbers.length; start += PAGE_CONCURRENCY) {
    pageResults.push(...await Promise.all(
      pageNumbers.slice(start, start + PAGE_CONCURRENCY).map(fetchPage),
    ));
  }
  const segmentsSucceeded = 1;
  const segmentsTotal = 1;
  const fetchedRecords = pageResults.reduce((sum, page) => sum + page.items.length, 0);
  const coverage = expectedRecords > 0 ? Math.min(1, fetchedRecords / expectedRecords) : 0;

  const stockByCode = new Map<string, any>();
  pageResults.flatMap(page => page.items).forEach((item: any) => {
    if (item?.f12) stockByCode.set(item.f12, item);
  });
  const stocks = Array.from(stockByCode.values());

  const now = Date.now();
  const sourceTimestamps = stocks
    .map((stock: any) => Number(stock.f124) * 1000)
    .filter(timestamp => Number.isFinite(timestamp) && timestamp > 1_500_000_000_000 && timestamp <= now + 300_000);
  sourceTimestamps.sort((a, b) => a - b);
  const sourceTimestampCoverage = sourceTimestamps.length / Math.max(1, stocks.length);
  // Use the 10th percentile so a handful of freshly updated symbols cannot
  // disguise a broadly stale snapshot.
  const sourceTimestamp = sourceTimestamps.length > 0
    ? sourceTimestamps[Math.floor((sourceTimestamps.length - 1) * 0.1)]
    : now;
  const sourceAgeMs = Math.max(0, now - sourceTimestamp);

  if (stocks.length < 1_000 || coverage < 0.75) {
    throw new Error(
      `Market coverage insufficient: records=${stocks.length}, pages=${pagesSucceeded}/${pagesRequested}, coverage=${coverage.toFixed(3)}`,
    );
  }
  if (isChinaMarketSession(new Date(now)) && sourceAgeMs > 180_000) {
    throw new Error(`Market source stale during session: ageMs=${sourceAgeMs}`);
  }
  if (isChinaMarketSession(new Date(now)) && sourceTimestampCoverage < 0.85) {
    throw new Error(`Market timestamps incomplete during session: coverage=${sourceTimestampCoverage.toFixed(3)}`);
  }

  const safeFloat = (value: any) => {
    if (value === undefined || value === null || value === "" || value === "-") return 0;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let limitUpCount = 0;
  let limitDownCount = 0;
  let totalChange = 0;
  let totalAmount = 0;

  const list = stocks.flatMap((stock: any) => {
    const code = String(stock.f12 || "");
    if (!/^\d{6}$/.test(code)) return [];

    const name = String(stock.f14 || code);
    const currentPrice = safeFloat(stock.f2);
    const changePercent = safeFloat(stock.f3);
    const amount = safeFloat(stock.f6);
    const turnoverRate = safeFloat(stock.f8);
    const previousClose = safeFloat(stock.f18);
    const parsedLargeOrderNet = parseFloat(stock.f62);
    const largeOrderNetYuan = Number.isFinite(parsedLargeOrderNet)
      ? parsedLargeOrderNet
      : undefined;
    const stockSourceTimestamp = Number(stock.f124) * 1000;
    const largeOrderNetAsOf = Number.isFinite(stockSourceTimestamp) &&
      stockSourceTimestamp > 1_500_000_000_000
      ? new Date(stockSourceTimestamp).toISOString()
      : undefined;
    const limitState = calculateLimitState({
      code,
      name,
      currentPrice,
      previousClose,
      changePercent,
      sourceLimitUpPrice: safeFloat(stock.f51),
      sourceLimitDownPrice: safeFloat(stock.f52),
    });

    totalChange += changePercent;
    totalAmount += amount;
    if (changePercent > 0) upCount++;
    else if (changePercent < 0) downCount++;
    else flatCount++;
    if (limitState.isLimitUp) limitUpCount++;
    if (limitState.isLimitDown) limitDownCount++;

    return [{
      code,
      name,
      currentPrice,
      changePercent,
      amount,
      turnoverRate,
      largeOrderNetYuan,
      largeOrderNetSource: largeOrderNetYuan !== undefined ? "eastmoney-f62" : undefined,
      largeOrderNetAsOf,
      isLimitUp: limitState.isLimitUp,
      isLimitDown: limitState.isLimitDown,
      limitUpPrice: limitState.limitUpPrice,
      limitDownPrice: limitState.limitDownPrice,
      limitRuleSource: limitState.source,
    }];
  });

  const dataStatus: MarketDataStatus = stocks.length >= 4_000 &&
    segmentsSucceeded === segmentsTotal &&
    coverage >= 0.97 &&
    pagesSucceeded === pagesRequested
    ? "FRESH"
    : "PARTIAL";
  const asOf = new Date().toISOString();

  return {
    totalCount: list.length,
    upCount,
    downCount,
    flatCount,
    limitUpCount,
    limitDownCount,
    avgChange: list.length > 0 ? Number((totalChange / list.length).toFixed(2)) : 0,
    totalVolume: Math.round(totalAmount / 100_000_000),
    totalAmount,
    list,
    quality: {
      status: dataStatus,
      source: ["eastmoney"],
      asOf,
      ageMs: 0,
      sourceAsOf: new Date(sourceTimestamp).toISOString(),
      sourceAgeMs,
      sourceTimestampCoverage: Number(sourceTimestampCoverage.toFixed(4)),
      coverage: Number(coverage.toFixed(4)),
      records: list.length,
      expectedRecords,
      segmentsSucceeded,
      segmentsTotal,
      pagesSucceeded,
      pagesRequested,
      durationMs: Date.now() - startedAt,
      cache: "MISS",
    },
  };
};

const getMarketStatsSnapshot = async (): Promise<{ snapshot: MarketStatsSnapshot; cache: MarketCacheState }> => {
  const now = Date.now();
  if (marketStatsCache && now - marketStatsCache.storedAt < MARKET_STATS_CACHE_TTL_MS) {
    return { snapshot: marketStatsCache.snapshot, cache: "HIT" };
  }

  if (marketStatsInFlight) {
    try {
      return { snapshot: await marketStatsInFlight, cache: "COALESCED" };
    } catch (error) {
      if (marketStatsCache && now - marketStatsCache.storedAt < MARKET_STATS_STALE_TTL_MS) {
        return { snapshot: marketStatsCache.snapshot, cache: "STALE" };
      }
      throw error;
    }
  }

  const requestStartedAt = Date.now();
  marketStatsInFlight = buildMarketStatsSnapshot();
  try {
    const snapshot = await marketStatsInFlight;
    marketStatsCache = { snapshot, storedAt: Date.now() };
    marketStatsLastError = null;
    recordMarketStatsHealth(true, Date.now() - requestStartedAt);
    return { snapshot, cache: "MISS" };
  } catch (error: any) {
    recordMarketStatsHealth(false, Date.now() - requestStartedAt);
    marketStatsLastError = { message: String(error?.message || error), at: new Date().toISOString() };
    if (marketStatsCache && now - marketStatsCache.storedAt < MARKET_STATS_STALE_TTL_MS) {
      return { snapshot: marketStatsCache.snapshot, cache: "STALE" };
    }
    throw error;
  } finally {
    marketStatsInFlight = null;
  }
};

api.get("/market/health", (c) => {
  const ageMs = marketStatsCache ? Date.now() - marketStatsCache.storedAt : null;
  const recentSamples = marketStatsHealthSamples.filter(sample => Date.now() - sample.at <= 30 * 60 * 1000);
  const durations = recentSamples.map(sample => sample.durationMs);
  const successes = recentSamples.filter(sample => sample.ok).length;
  const status = ageMs === null
    ? "COLD"
    : ageMs < MARKET_STATS_STALE_TTL_MS ? "HEALTHY" : "DEGRADED";
  return c.json({
    status,
    marketStats: {
      cacheAgeMs: ageMs,
      inFlight: Boolean(marketStatsInFlight),
      lastError: marketStatsLastError,
      samples: recentSamples.length,
      successRate: recentSamples.length > 0 ? Number((successes / recentSamples.length).toFixed(3)) : null,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
    },
    checkedAt: new Date().toISOString(),
  });
});

// Full-market breadth. Summary is the default; includeList=true is intended for
// lower-frequency scanners and shares the same server-side snapshot.
api.get("/market/stats", async (c) => {
  const includeList = c.req.query("includeList") === "true";
  try {
    const { snapshot, cache } = await getMarketStatsSnapshot();
    const ageMs = Math.max(0, Date.now() - Date.parse(snapshot.quality.asOf));
    const parsedSourceAsOf = snapshot.quality.sourceAsOf
      ? Date.parse(snapshot.quality.sourceAsOf)
      : NaN;
    const sourceAgeMs = Number.isFinite(parsedSourceAsOf)
      ? Math.max(0, Date.now() - parsedSourceAsOf)
      : snapshot.quality.sourceAgeMs;
    const status: MarketDataStatus = cache === "STALE" ? "STALE" : snapshot.quality.status;
    const quality = { ...snapshot.quality, status, ageMs, sourceAgeMs, cache };
    const data = {
      ...snapshot,
      list: includeList ? snapshot.list : undefined,
      quality,
    };

    c.header("Cache-Control", "public, max-age=3, stale-while-revalidate=10");
    c.header("X-Market-Data-Status", status);
    c.header("X-Market-Data-Coverage", String(quality.coverage));
    return c.json({ data });
  } catch (error: any) {
    return c.json({
      error: "MARKET_DATA_UNAVAILABLE",
      message: String(error?.message || error),
      data: null,
      quality: {
        status: "UNAVAILABLE",
        source: ["eastmoney"],
        asOf: new Date().toISOString(),
        coverage: 0,
      },
    }, 503);
  }
});

// Proxy to fetch Real-time Stock Ticks (Sina Finance) - v29.6
api.get("/market/ticks", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.json({ error: "Code required" }, 400);
  
  // Normalize Symbol: Force lowercase, add prefix if missing
  let symbol = code.toLowerCase();
  if (/^\d{6}$/.test(symbol)) {
    if (symbol.startsWith("6") || symbol.startsWith("5")) symbol = `sh${symbol}`;
    else if (symbol.startsWith("0") || symbol.startsWith("3") || symbol.startsWith("1")) symbol = `sz${symbol}`;
    else if (symbol.startsWith("8") || symbol.startsWith("4")) symbol = `bj${symbol}`;
  }

  // Strategy 1: Tencent (GTimg) - Preferred (Faster, clearer)
  try {
    const tencentUrl = `https://stock.gtimg.cn/data/index.php?appn=detail&action=data&c=${symbol}&p=0&_=${Date.now()}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const resp = await fetch(tencentUrl, {
        headers: {
             "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
             "Referer": "https://gu.qq.com/",
             "Accept": "*/*"
        },
        signal: controller.signal
    });
    clearTimeout(id);

    if (resp.ok) {
        const text = await resp.text();
        // Format: v_detail_data=["09:30:00/10.00/100/M/...", ...];
        const match = text.match(/v_detail_data=\[(.*)\];/);
        
        if (match) {
            const content = match[1]; // "row1", "row2"
            
            if (content.trim()) {
                // Manual regex parse to be safe against JSON.parse errors
                const rowRegex = /"([^"]+)"/g;
                let m;
                const data = [];
                
                while ((m = rowRegex.exec(content)) !== null) {
                    const row = m[1];
                    const parts = row.split('/');
                    if (parts.length >= 4) {
                        // Tencent Format: time/price/vol/type/volume_amt/id
                        const typeMap: Record<string, string> = { 'B': '买盘', 'S': '卖盘', 'M': '中性盘' };
                        data.push({
                            time: parts[0],
                            price: parts[1],
                            volume: parts[2],
                            type: typeMap[parts[3]] || '中性盘'
                        });
                    }
                }
                
                if (data.length > 0) {
                    if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
                    return c.json({ data });
                }
            }
        }
    }
  } catch (e) {
      console.warn(`Tencent ticks fetch error for ${symbol}`, e);
  }

  // Strategy 2: Sina L2 Ticks API (Fallback)
  try {
    if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });

    const sinaUrl = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_Transactions.getCNTransactions?symbol=${symbol}&num=40&_=${Date.now()}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000); 

    const resp = await fetch(sinaUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://finance.sina.com.cn/",
        },
        signal: controller.signal
    });
    clearTimeout(id);
    
    if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });

    if (resp.ok) {
        const text = await resp.text();
        let cleaned = text.trim();
        
        if (cleaned.startsWith('null(')) {
            cleaned = cleaned.substring(5, cleaned.length - 1);
        }
        
        const jsonStr = cleaned.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        
        try {
            const data = JSON.parse(jsonStr);
            if (Array.isArray(data) && data.length > 0) {
                if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
                return c.json({ data });
            }
        } catch (e) {
            // Ignore parse errors
        }
    }
  } catch (error) {
    console.warn(`Sina ticks fetch error for ${symbol}`, error);
  }

  if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
  return c.json({ data: [] });
});

// Proxy to fetch Fund Data (Tiantian Jijin / Eastmoney)
api.get("/market/funds", async (c) => {
  const codesStr = c.req.query("codes");
  if (!codesStr) return c.json({ error: "Codes required" }, 400);
  const codes = codesStr.split(',');

  const fetchFund = async (code: string) => {
    // 1. Fetch Real-time Estimate
    const estimateUrl = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    // 2. Fetch Period Performance (YTD, 1M, etc.)
    const periodUrl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNPeriodIncrease?FCODE=${code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0`;
    // 3. V67.4: Fetch Fund Classification Info (FTYPE + INDEXNAME for auto-categorization)
    const infoUrl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInformation?FCODE=${code}&deviceid=1&plat=Android&product=EFund&Version=1`;

    try {
        // Add timeout to prevent hanging requests from killing the server
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 3000); // 3s timeout per item

        const [estResp, periodResp, infoResp] = await Promise.all([
            fetch(estimateUrl, { headers: { "Referer": "https://fund.eastmoney.com/" }, signal: controller.signal }),
            fetch(periodUrl, { headers: { "Referer": "https://fund.eastmoney.com/" }, signal: controller.signal }),
            fetch(infoUrl, { headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13)" }, signal: controller.signal })
              .catch(() => null) // Non-critical: don't fail if classification API is down
        ]);
        clearTimeout(id);

        let estimateData: any = {};
        if (estResp.ok) {
            const text = await estResp.text();
            const match = text.match(/jsonpgz\((.+)\)/);
            if (match) {
                estimateData = JSON.parse(match[1]);
            }
        }

        let periodData: any = null;
        if (periodResp.ok) {
            const json = await periodResp.json();
            if (json && json.Datas && Array.isArray(json.Datas)) {
                periodData = json.Datas;
            }
        }

        // V67.4: Extract fund type + tracked index name for auto-categorization
        let fundType = "";
        let indexName = "";
        if (infoResp && infoResp.ok) {
            try {
                const infoJson = await infoResp.json();
                const d = infoJson?.Datas || {};
                fundType = d.FTYPE || "";      // e.g. "指数型-股票", "混合型-偏股", "QDII", "债券型-长债"
                indexName = d.INDEXNAME || "";  // e.g. "中证全指半导体芯片指数" (for index/ETF funds)
            } catch {}
        }

        // Extract Periods
        let ytd = "0.00";
        let year1 = "0.00";
        let month6 = "0.00";
        let month3 = "0.00";

        if (periodData) {
            const find = (t: string) => periodData.find((p: any) => p.title === t)?.syl || "0.00";
            ytd = find("JN");
            year1 = find("1N");
            month6 = find("6Y");
            month3 = find("3Y");
        }

        if (estimateData.fundcode) {
            return {
                code: estimateData.fundcode,
                name: estimateData.name,
                estimateNetValue: parseFloat(estimateData.gsz || "0"),
                estimateChangePercent: parseFloat(estimateData.gszzl || "0"),
                lastUpdate: estimateData.gztime,
                yearChangePercent: year1, // Real 1-Year Return
                halfYearChangePercent: month6,
                quarterChangePercent: month3,
                ytdChangePercent: ytd,
                fundType,     // V67.4: e.g. "指数型-股票", "混合型-偏股", "QDII", "债券型-长债"
                indexName,    // V67.4: e.g. "中证全指半导体芯片指数" (index/ETF funds only)
            };
        }
    } catch (e) {
        console.warn(`Fund fetch failed for ${code}`, e);
    }
    return null;
  };

  try {
      // Limit concurrency to 5 (was 10) to avoid hitting API limits too hard
      const results = [];
      const batchSize = 5;
      
      if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });

      for (let i = 0; i < codes.length; i += batchSize) {
          if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });

          const batch = codes.slice(i, i + batchSize);
          const batchResults = await Promise.all(batch.map(fetchFund));
          results.push(...batchResults);
          
          // Yield to event loop to prevent CPU timeout
          if (i + batchSize < codes.length) {
              await new Promise(r => setTimeout(r, 50)); 
          }
      }
      
      const filtered = results.filter(r => r !== null);
      if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });
      try {
          return c.json({ data: filtered });
      } catch (e) {
          return new Response(null, { status: 499 });
      }
  } catch (error) {
      return c.json({ data: [] });
  }
});

// Proxy to fetch Stock History (Sina Finance)
// Supports single 'code' or multiple 'codes' (comma separated)
api.get("/market/history", async (c) => {
  try {
    const codeParam = c.req.query("code");
  const codesParam = c.req.query("codes");

  // V65.0: Support intraday periods via 'period' query param
  // period=1 (1min), period=5 (5min), period=30 (30min), default=daily
  const periodParam = c.req.query("period");
  const isIntraday = periodParam && ['1', '5', '15', '30'].includes(periodParam);
  const intradayScale = isIntraday ? parseInt(periodParam) : 240;
  // Intraday: 240 bars ≈ 1 full trading day for 1min, 48 bars for 5min
  const intradayDataLen = isIntraday ? (intradayScale === 1 ? 240 : intradayScale === 5 ? 120 : 60) : 300;

  const fetchOne = async (rawCode: string) => {
      let symbol = rawCode;
      if (/^\d{6}$/.test(rawCode)) {
        if (rawCode.startsWith("6") || rawCode.startsWith("5")) symbol = `sh${rawCode}`;
        else if (rawCode.startsWith("0") || rawCode.startsWith("3") || rawCode.startsWith("1")) symbol = `sz${rawCode}`;
        else if (rawCode.startsWith("8") || rawCode.startsWith("4")) symbol = `bj${rawCode}`;
      }
      
      if (isIntraday) {
        // ═══════════════════════════════════════════════════════════
        // V65.0: INTRADAY K-LINE (分时K线)
        // Use Tencent minute kline API, fallback to Sina scale param
        // ═══════════════════════════════════════════════════════════
        const periodKey = intradayScale === 1 ? 'm1' : intradayScale === 5 ? 'm5' : intradayScale === 15 ? 'm15' : 'm30';
        
        // Strategy 1: Tencent minute kline
        try {
          const tencentUrl = `https://web.ifzq.gtimg.cn/appstock/app/kline/mkline?param=${symbol},${periodKey},,${intradayDataLen}`;
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 8000); // V66.7: 6s→8s for batch stability
          
          const resp = await fetch(tencentUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: controller.signal
          });
          clearTimeout(id);
          
          if (resp.ok) {
            const json = await resp.json();
            const dataObj = json?.data?.[symbol];
            const minuteData = dataObj?.[periodKey];
            if (Array.isArray(minuteData) && minuteData.length > 0) {
              return minuteData.map((item: any[]) => ({
                day: item[0],         // "202603041001"
                open: parseFloat(item[1]),
                close: parseFloat(item[2]),
                high: parseFloat(item[3]),
                low: parseFloat(item[4]),
                volume: parseFloat(item[5])
              }));
            }
          }
        } catch (e) {
          // Silent fallback to Sina
        }
        
        // Strategy 2: Sina intraday kline
        try {
          const sinaUrl = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=${intradayScale}&ma=no&datalen=${intradayDataLen}`;
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 5000);
          
          const resp = await fetch(sinaUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Referer": "https://finance.sina.com.cn/",
            },
            signal: controller.signal
          });
          clearTimeout(id);
          
          if (!resp.ok) return [];
          const text = await resp.text();
          return JSON.parse(text);
        } catch (e) {
          console.warn(`All intraday sources failed for ${symbol}`);
          return [];
        }
      }
      
      // ═══════════════════════════════════════════════════════════
      // DAILY K-LINE (日线 - original logic)
      // ═══════════════════════════════════════════════════════════
      // Strategy 1: Tencent (GTimg) - Preferred (Stable, HTTPS, Fast, Adjusted)
      try {
          // Request roughly 2.5 years so non-overlapping walk-forward evidence
          // can reach the public HIGH threshold. Tencent currently caps this
          // endpoint at about 640 adjusted daily bars.
          const tencentUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,640,qfq`;
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 8000); // 8s per stock
          
          const resp = await fetch(tencentUrl, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: controller.signal
          });
          clearTimeout(id);
          
          if (resp.ok) {
              const json = await resp.json();
              // Structure: data: { sh600519: { day: [...], qfqday: [...] } }
              const dataObj = json?.data?.[symbol];
              if (dataObj) {
                  // Prefer Adjusted Data (qfqday), fallback to Raw (day)
                  const dayData = dataObj.qfqday || dataObj.day;
                  if (Array.isArray(dayData)) {
                      return dayData.map((item: any[]) => ({
                          day: item[0],
                          open: parseFloat(item[1]),
                          close: parseFloat(item[2]),
                          high: parseFloat(item[3]),
                          low: parseFloat(item[4]),
                          volume: parseFloat(item[5])
                      }));
                  }
              }
          }
      } catch (e) {
          console.warn(`Tencent history failed for ${symbol}, trying Sina fallback...`, e);
      }
      
      // Strategy 2: Sina (Fallback) - Note: Often blocks IPs
      const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=640`;
      
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000); // Reduced to 5s
        
        const resp = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              "Referer": "https://finance.sina.com.cn/",
            },
            signal: controller.signal
        });
        clearTimeout(id);
        
        if (!resp.ok) return [];
        const text = await resp.text();
        return JSON.parse(text);
      } catch (e) {
          console.error(`All history sources failed for ${symbol}:`, e);
          return [];
      }
  };

  if (codesParam) {
      const codes = codesParam.split(',').filter(x => x);
      // Limit to 20 to prevent total timeout (Reverted from 30)
      const targets = codes.slice(0, 20);
      
      const results: { code: string; data: any }[] = [];
      const BATCH_SIZE = 5; // Reduced from 10 to improve stability
      
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
          if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });

          const chunk = targets.slice(i, i + BATCH_SIZE);
          const chunkResults = await Promise.all(chunk.map(async (code) => {
              try {
                  if (c.req.raw?.signal?.aborted) return { code, data: [] };
                  const data = await fetchOne(code);
                  return { code, data: data || [] };
              } catch (e) {
                  return { code, data: [] };
              }
          }));
          results.push(...chunkResults);
          
          // Increased delay to avoid rate limits
          if (i + BATCH_SIZE < targets.length) {
              await new Promise(r => setTimeout(r, 300));
          }
      }
      
      if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });

      // Return object { [code]: data }
      const map = results.reduce((acc, cur) => {
          acc[cur.code] = cur.data;
          return acc;
      }, {} as Record<string, any>);
      
      if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });

      try {
          return c.json({ data: map });
      } catch (e) {
          return new Response(null, { status: 499 });
      }
  }

  if (codeParam) {
      const data = await fetchOne(codeParam);
      try {
          return c.json({ data });
      } catch (e) {
          return new Response(null, { status: 499 });
      }
  }

    return c.json({ error: "Code or codes required" }, 400);
  } catch (error) {
    return safeError(c, error);
  }
});

// v8.0 获取基金历史净值数据 (Fund Historical NAV)
// Supports batch requests with 'codes' parameter
api.get("/market/fund-history", async (c) => {
  const codesParam = c.req.query("codes");
  if (!codesParam) return c.json({ error: "Codes required" }, 400);

  const codes = codesParam.split(',').filter(x => x);
  
  console.log(`[FundHistory API] Received ${codes.length} fund codes, samples:`, codes.slice(0, 3));
  
  const fetchFundHistory = async (code: string) => {
    try {
      // V8.3 Upgrade: Use PingZhong Data (Static JS) which is more reliable than the dynamic API
      // Source: https://fund.eastmoney.com/pingzhongdata/${code}.js
      const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?t=${Date.now()}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://fund.eastmoney.com/",
          "Accept": "*/*"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!resp.ok) return [];
      
      const text = await resp.text();
      
      // Extract Data_netWorthTrend = [...] (Unit NAV)
      const match = text.match(/Data_netWorthTrend\s*=\s*(\[.*?\]);/);
      // Extract Data_ACWorthTrend = [...] (Accumulated NAV)
      const acMatch = text.match(/Data_ACWorthTrend\s*=\s*(\[.*?\]);/);
      
      let unitNavData: any[] = [];
      let acNavData: any[] = [];
      
      if (match) {
         try { unitNavData = JSON.parse(match[1]); } catch(e) {}
      }
      
      if (acMatch) {
         try { acNavData = JSON.parse(acMatch[1]); } catch(e) {}
      }
      
      if (unitNavData.length === 0 && acNavData.length === 0) return [];
      
      // Create a map of Accumulated NAV for easy lookup by timestamp
      const acMap = new Map<number, number>();
      acNavData.forEach((item: any) => {
          // ACWorthTrend format is usually [timestamp, value]
          const ts = Array.isArray(item) ? item[0] : item.x;
          const val = Array.isArray(item) ? item[1] : item.y;
          if (ts && val) acMap.set(ts, parseFloat(val));
      });
      
      // If we have Unit NAV, use it as base. If not, fallback to AC NAV as base.
      const baseList = unitNavData.length > 0 ? unitNavData : acNavData;
      
      return baseList.map((item: any) => {
        // Handle both Object {x,y} and Array [x,y] formats
        const ts = item.x || (Array.isArray(item) ? item[0] : 0);
        const val = item.y || (Array.isArray(item) ? item[1] : 0);
        
        if (!ts) return null;
        
        const date = new Date(ts);
        const dayStr = date.toISOString().split('T')[0];
        
        // Try to find matching accumulated value
        const accumulated = acMap.get(ts);
        
        return {
            day: dayStr,
            close: parseFloat(val),
            open: parseFloat(val),
            high: parseFloat(val),
            low: parseFloat(val),
            volume: 0,
            accumulated: accumulated !== undefined ? accumulated : undefined
        };
      }).filter(x => x !== null).slice(-1000); // Limit to last 1000 days
      
    } catch (e) {
      console.warn(`Fund history (PingZhong) fetch failed for ${code}:`, e);
      return [];
    }
  };

  try {
    const results: { code: string; data: any[] }[] = [];
    const BATCH_SIZE = 3; // Conservative batch size for fund API
    
    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
      if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });

      const chunk = codes.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.all(chunk.map(async (code) => {
        if (c.req.raw?.signal?.aborted) return { code, data: [] };
        const data = await fetchFundHistory(code);
        return { code, data };
      }));
      results.push(...chunkResults);
      
      // Small delay between batches
      if (i + BATCH_SIZE < codes.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    
    if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });

    // Return object { [code]: data }
    const map = results.reduce((acc, cur) => {
      acc[cur.code] = cur.data;
      return acc;
    }, {} as Record<string, any>);
    
    console.log(`[FundHistory API] Returning ${Object.keys(map).length} results, sample lengths:`, 
      Object.entries(map).slice(0, 3).map(([code, data]) => `${code}:${data.length}`));
    
    if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });

    try {
        return c.json({ data: map });
    } catch (e) {
        return new Response(null, { status: 499 });
    }
  } catch (error) {
    return safeError(c, error);
  }
});

// v7.2 获取单只股票的分时Tick数据（用于实时盘口分析） - Robust Version
api.get("/stock/ticks/:code", async (c) => {
  try {
    const rawCode = c.req.param("code");
    if (!rawCode) {
      return c.json({ data: [] });
    }

    // Normalize Symbol
    let symbol = rawCode.toLowerCase();
    if (/^\d{6}$/.test(symbol)) {
      if (symbol.startsWith("6") || symbol.startsWith("5")) symbol = `sh${symbol}`;
      else if (symbol.startsWith("0") || symbol.startsWith("3") || symbol.startsWith("1")) symbol = `sz${symbol}`;
      else if (symbol.startsWith("8") || symbol.startsWith("4")) symbol = `bj${symbol}`;
    }

    // Strategy 1: Tencent (GTimg) - Preferred
    try {
      const tencentUrl = `https://stock.gtimg.cn/data/index.php?appn=detail&action=data&c=${symbol}&p=0&_=${Date.now()}`;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000); // 4s timeout

      const resp = await fetch(tencentUrl, {
          headers: {
               "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
               "Referer": "https://gu.qq.com/",
               "Accept": "*/*"
          },
          signal: controller.signal
      });
      clearTimeout(id);

      if (resp.ok) {
          const text = await resp.text();
          const match = text.match(/v_detail_data=\[(.*)\];/);
          
          if (match) {
              const content = match[1];
              if (content.trim()) {
                  const rowRegex = /"([^"]+)"/g;
                  let m;
                  const data = [];
                  
                  while ((m = rowRegex.exec(content)) !== null) {
                      const row = m[1];
                      const parts = row.split('/');
                      if (parts.length >= 4) {
                          const typeMap: Record<string, string> = { 'B': '买盘', 'S': '卖盘', 'M': '中性盘' };
                          data.push({
                              time: parts[0],
                              price: parseFloat(parts[1]),
                              volume: parseFloat(parts[2]),
                              type: typeMap[parts[3]] || '中性盘'
                          });
                      }
                  }
                  
                  if (data.length > 0) {
                      if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
                      return c.json({ data });
                  }
              }
          }
      }
    } catch (e) {
        // Silent fail for Tencent, fallback to Sina
    }

    // Strategy 2: Sina Finance (Fallback with Retry)
    const fetchSina = async () => {
        if (c.req.raw.signal.aborted) return null;

        const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_Transactions.getAllTransactions?symbol=${symbol}&num=120`;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 6000);
        
        try {
            const resp = await fetch(url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://finance.sina.com.cn/",
                "Connection": "close" // Attempt to avoid HTTP/2 issues
              },
              signal: controller.signal
            });
            clearTimeout(id);

            if (c.req.raw.signal.aborted) return null;
            if (!resp.ok) return null;

            const text = await resp.text();
            
            // Clean non-standard JSON
            let cleaned = text.trim();
            if (cleaned.startsWith('null(')) cleaned = cleaned.substring(5, cleaned.length - 1);
            
            // Sina often returns loose JSON keys
            const jsonStr = cleaned.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":').replace(/'/g, '"');
            
            const ticks = JSON.parse(jsonStr);
            if (Array.isArray(ticks) && ticks.length > 0) {
                return ticks.map((t: any) => ({
                    time: t.time || t[0],
                    price: parseFloat(t.price || t[1]),
                    volume: parseFloat(t.volume || t[2]),
                    type: t.type || t[3] 
                }));
            }
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
        return null;
    };

    try {
        const data = await fetchSina();
        if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
        if (data) return c.json({ data });
    } catch (e) {
        console.warn(`Sina ticks error for ${symbol}: ${e.message}`);
    }

    if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });
    try {
        return c.json({ data: [] });
    } catch (e) {
        return new Response(null, { status: 499 });
    }
  } catch (error) {
    return safeError(c, error);
  }
});

// v5.8 Algorithm: Linkage Trigger Mechanism (联动触发机制)
// Purpose: Dynamically adjust Core Stock thresholds during "Ignition Phase"
// to avoid missing out, while filtering "One-Day Tour" traps.
api.post("/market/analyze-linkage", async (c) => {
    try {
        const body = await c.req.json();
        const { sectorCode, sectorName, dayCount, coreStock, elasticStocks, sectorVolumeRatio } = body;

        // 1. Phase Validation: Only active on Day 1-2 (Ignition Phase)
        const phase = dayCount || 1;
        if (phase > 2) {
            return c.json({
                adjusted: false,
                reason: "Not Ignition Phase (Day > 2)",
                threshold: null
            });
        }

        // V5.8 UPGRADE: Whole-Market Sector Scan (全市场板块扫描)
        // If sectorCode is provided (e.g., "BK0475"), fetch REAL-TIME top gainers
        // instead of relying solely on the client's potentially limited 'elasticStocks'.
        let scanList = elasticStocks || [];
        
        if (sectorCode) {
            try {
                // Eastmoney Format: b:BK0xxx for blocks
                const fs = `b:${sectorCode}`;
                const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=30&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${fs}&fields=f12,f14,f3,f2`;
                
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 4000); // Fast timeout

                const resp = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);

                if (resp.ok) {
                    const json = await resp.json();
                    const list = json?.data?.diff;
                    if (Array.isArray(list)) {
                        scanList = list.map((item: any) => ({
                            code: item.f12,
                            name: item.f14,
                            changePercent: item.f3, // f3 is Change%
                            currentPrice: item.f2
                        }));
                        console.log(`[Linkage] Scanned ${scanList.length} stocks for sector ${sectorCode}`);
                    }
                }
            } catch (e) {
                console.warn("[Linkage] Sector scan failed, falling back to client list", e);
            }
        }

        // 2. Elasticity Check: Count "Follower" Limit Ups from the SCAN LIST
        // Definition of Limit Up: > 9.8% or explicitly flagged
        const limitUps = scanList.filter((s: any) => {
            const cp = s.changePercent !== undefined ? s.changePercent : s.f3;
            return cp >= 9.8; // Hard check for 9.8%+, captures 10% and 20% limit ups
        });

        // REQUIREMENT: "Batch Limit Up" -> At least 3 or 20% of list
        // If list is small (e.g. < 5), require at least 2
        const listSize = scanList.length;
        const thresholdCount = listSize < 5 ? 2 : 3;
        const minLimitUps = Math.max(thresholdCount, Math.floor(listSize * 0.2));
        
        if (limitUps.length < minLimitUps) {
             return c.json({
                adjusted: false,
                reason: `Insufficient Follower Strength (${limitUps.length}/${minLimitUps}) - Scanned ${listSize}`,
                threshold: null
            });
        }

        // 3. TRAP AVOIDANCE: "One-Day Tour" Filter (一日游防御)
        if (sectorVolumeRatio !== undefined && sectorVolumeRatio < 1.3) {
             return c.json({
                adjusted: false,
                reason: "Volume Trap Detected (Ratio < 1.3)",
                warning: "Potential One-Day Tour: Prices up but volume missing",
                threshold: null
            });
        }

        // 4. TRAP AVOIDANCE: Core Deviation
        if (coreStock && coreStock.changePercent < -1.0) {
             return c.json({
                adjusted: false,
                reason: "Core Divergence (Core < -1%)",
                threshold: null
            });
        }

        // 5. Calculate Dynamic Threshold
        let newThreshold = 2.0; 

        // Aggressive Mode: If Volume is massive (> 2.0x), lower further
        if (sectorVolumeRatio > 2.0) {
            newThreshold = 1.5;
        }

        return c.json({
            adjusted: true,
            reason: "Linkage Trigger Activated",
            threshold: newThreshold,
            meta: {
                limitUps: limitUps.length,
                scannedTotal: listSize,
                volumeRatio: sectorVolumeRatio,
                phase: phase,
                usingWholeMarketData: !!sectorCode // Flag to client
            }
        });

    } catch (e: any) {
        return safeError(c, e);
    }
});

// v5.8.2 Signal Decorator & Risk Controller (信号风控清洗)
// Purpose: Resolve conflicts between Technical Signals (e.g., Assault) and Internal Metrics (e.g., Alpha).
// Implements the "Copywriting Override" logic for Trap Detection.
api.post("/market/validate-signal", async (c) => {
    try {
        const body = await c.req.json();
        const { signalType, winRate, alpha, trapGuard, volumeRatio } = body;

        // Default: Trust the original AI signal
        let finalLabel = signalType || "NEUTRAL";
        let finalAction = "HOLD"; 
        let finalSubText = "Signal looks normal";
        let riskLevel = "LOW";
        let adjustedWinRate = winRate || 50;
        let style = "normal"; // normal, warning, critical

        // --- CORE ALGORITHM: 4-Stage Filtering ---

        // Stage 1: The "Death Sentence" (Alpha Check)
        // If Alpha is severely negative (< -60), the foundation is broken.
        if (alpha !== undefined && alpha < -60) {
            // COPYWRITING OVERRIDE: ASSAULT -> BAIT
            if (signalType === "ASSAULT" || signalType === "BUY") {
                finalLabel = "诱多 (BAIT)";
                finalSubText = `资金严重背离 (Alpha: ${alpha})，防范骗线`;
                finalAction = "SELL/AVOID";
                riskLevel = "CRITICAL";
                adjustedWinRate = Math.min(adjustedWinRate, 30); // Cap win rate at 30%
                style = "critical"; // Purple/Grey UI
            } else {
                finalLabel = "阴跌 (DECLINE)";
                finalAction = "CLEAR";
            }
        }
        // Stage 2: The "Trap" Check
        // If TrapGuard is active (> 50%), it's a structural trap.
        else if (trapGuard !== undefined && trapGuard > 50) {
            finalLabel = "陷阱 (TRAP)";
            finalSubText = `诱多风险值偏高 (${trapGuard}%)`;
            finalAction = "OBSERVE";
            riskLevel = "HIGH";
            adjustedWinRate = Math.min(adjustedWinRate, 45);
            style = "warning";
        }
        // Stage 3: Divergence Check (Alpha Weakness)
        // Alpha between -30 and -60
        else if (alpha !== undefined && alpha < -30) {
            if (signalType === "ASSAULT") {
                finalLabel = "虚假突破 (FALSE BREAKOUT)";
                finalSubText = "上涨缺乏资金支撑";
                finalAction = "REDUCE"; // Suggest reducing position
                riskLevel = "MEDIUM";
                adjustedWinRate = adjustedWinRate * 0.6; // Discount win rate by 40%
                style = "warning";
            }
        }
        // Stage 4: Volume Confirmation (For Assault)
        else if (signalType === "ASSAULT" && volumeRatio !== undefined && volumeRatio < 0.8) {
            finalLabel = "弱反 (WEAK PULLBACK)";
            finalSubText = "无量拉升，空间有限";
            finalAction = "WATCH";
            adjustedWinRate = adjustedWinRate - 15;
            style = "neutral";
        }
        // Stage 5: Validation Success (Green Light)
        else if (signalType === "ASSAULT") {
            finalAction = "BUY";
            finalSubText = "量价配合良好，资金共振";
            style = "success"; // Red/Orange (Bullish)
        }

        return c.json({
            display: {
                label: finalLabel,      // The new sophisticated text
                subText: finalSubText,  // Reason
                action: finalAction,    // Concrete advice
                style: style            // For UI coloring (critical=purple, success=red)
            },
            analytics: {
                originalWinRate: winRate,
                adjustedWinRate: Math.round(adjustedWinRate), // Rounded for cleanliness
                riskLevel,
                conflictDetected: finalLabel !== signalType
            }
        });

    } catch (e: any) {
        return safeError(c, e);
    }
});

// v5.9 Harvest Protocol (收割协议 - 智能止盈系统)
// Purpose: Provide dynamic "Take Profit" signals based on price action, volume, and alpha.
// Prevents "Round Trip" (profits turning into losses) and "Limit Up Failures".
api.post("/trade/harvest-protocol", async (c) => {
    try {
        const body = await c.req.json();
        const { code, cost, current, high, isLimitUp, alpha, volumeRatio, daysHeld } = body;

        // Basic Math
        const roi = ((current - cost) / cost) * 100;
        const maxRoi = ((high - cost) / cost) * 100;
        const drawdown = maxRoi - roi;

        let action = "HOLD"; // HOLD, TRIM, SELL, CLEAR
        let percentage = 0;
        let reason = "TREND_CONTINUATION";
        let message = "趋势延续，建议持仓";
        let style = "neutral"; // neutral, warning, success (for taking profit), destructive (for stop loss)

        // --- STRATEGY LAYERS ---

        // 1. PROFIT GUARD (The Shield) - Stop Loss / Trailing Stop
        // ---------------------------------------------------------
        if (roi < -5) {
            // Hard Stop Loss: -5%
            action = "CLEAR";
            percentage = 100;
            reason = "STOP_LOSS";
            message = "触及硬性止损线 (-5%)";
            style = "destructive";
        } else if (maxRoi > 10 && drawdown > 5) {
            // Trailing Stop: If gained >10% but fell back 5% from top
            action = "SELL";
            percentage = 100; // Protect the remaining 5% profit
            reason = "PROFIT_GUARD";
            message = `利润回撤保护 (最高 +${maxRoi.toFixed(1)}% -> 回撤 5%)`;
            style = "warning";
        }

        // 2. HARVEST PROTOCOL (The Scythe) - Active Take Profit
        // ---------------------------------------------------------
        else {
            // A. Limit-Up Breaker (炸板熔断)
            // If it WAS high (close to limit up) but is NOT limit up now, and volume is exploding
            // Assuming Limit Up is roughly +10% or +20%. If High > current + 2%
            if (maxRoi > 9 && !isLimitUp && (high - current)/current > 0.03 && volumeRatio > 2.0) {
                 action = "CLEAR";
                 percentage = 100;
                 reason = "LIMIT_UP_FAILURE";
                 message = "炸板且量能失控，不赌回封，建议离场";
                 style = "destructive";
            }
            // B. Impulse Harvest (冲高无力 - 诱多)
            // Price is surging (+7%) but Alpha is negative (Smart money selling)
            else if (roi > 7 && !isLimitUp && alpha < -20) {
                action = "TRIM";
                percentage = 50;
                reason = "IMPULSE_EXHAUSTION";
                message = "冲高缺乏资金支持 (Alpha负背离)，减仓锁定胜果";
                style = "success";
            }
            // C. Tiered Lock (阶梯止盈)
            // Simple ROI based scaling out
            else if (roi > 20) {
                action = "TRIM";
                percentage = 30; // Scale out another 30%
                reason = "TARGET_ZONE_2";
                message = "超额收益区间 (+20%)，建议分批兑现";
                style = "success";
            }
            else if (roi > 10 && daysHeld > 1) {
                 action = "TRIM";
                 percentage = 30;
                 reason = "TARGET_ZONE_1";
                 message = "目标位达成 (+10%)，首批止盈";
                 style = "success";
            }
        }

        return c.json({
            decision: {
                action,
                percentage,
                reason,
                message,
                style
            },
            metrics: {
                roi: roi.toFixed(2),
                maxRoi: maxRoi.toFixed(2),
                drawdown: drawdown.toFixed(2)
            }
        });

    } catch (e: any) {
        return safeError(c, e);
    }
});

// Mount routes: Support BOTH prefixed and non-prefixed paths
// This solves issues where Supabase Gateway might or might not strip the function name
app.route("/", api);
app.route("/make-server-545d7fd7", api);

app.onError((err, c) => {
  // If client disconnected, suppress the error and return empty 499 response
  if (c.req.raw?.signal?.aborted || isConnectionError(err)) {
     // Explicitly return a 499 Response to stop propagation
     return new Response(null, { status: 499 });
  }

  console.error(`Unhandled Error: ${err.message}`, err);
  
  // Return a proper JSON error response
  try {
    // Check one last time before writing error
    if (c.req.raw?.signal?.aborted) return new Response(null, { status: 499 });
    return c.json({ error: "Internal Server Error", message: err.message }, 500);
  } catch(e) {
    // Last resort
    return new Response(null, { status: 499 });
  }
});

// Add a catch-all handler for unmatched routes
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

Deno.serve({ 
  onError: (error) => {
    if (isConnectionError(error)) {
        return new Response(null, { status: 499 });
    }
    console.error("Deno serve error:", error);
    return new Response(JSON.stringify({ error: "Server Error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}, app.fetch);
