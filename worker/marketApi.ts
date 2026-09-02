import { calculateLimitState } from '../src/shared/marketRules.ts';
import {
  parseMarginTradingRow,
  parseTencentTurnoverYuan,
  type MarginTradingSnapshot,
} from './marketDataParsers.ts';

type AnyRecord = Record<string, any>;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });

const noContent = (status = 499) => new Response(null, { status });

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError' ||
  (error as AnyRecord)?.name === 'AbortError';

const fetchWithTimeout = async (
  url: string,
  init: RequestInit = {},
  timeoutMs = 8_000,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

const decodeGbk = async (response: Response) => {
  const buffer = await response.arrayBuffer();
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
};

const parseLooseJson = (text: string): any => {
  const trimmed = text.trim().replace(/^null\(/, '').replace(/\)\s*;?$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const cleaned = trimmed.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
};

const parseFloatSafe = (value: unknown) => {
  if (value === undefined || value === null || value === '' || value === '-') return 0;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseTencentTimestamp = (value: unknown) => {
  const raw = String(value || '');
  if (!/^\d{14}$/.test(raw)) return undefined;
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+08:00`;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
};

const normalizeCode = (code: string) => {
  const lower = String(code || '').trim().toLowerCase();
  if (/^(sh|sz|bj)\d{6}$/.test(lower)) return lower;
  if (/^\d{6}$/.test(lower)) {
    if (lower.startsWith('6') || lower.startsWith('5')) return `sh${lower}`;
    if (lower.startsWith('0') || lower.startsWith('3') || lower.startsWith('1')) return `sz${lower}`;
    if (lower.startsWith('4') || lower.startsWith('8') || lower.startsWith('9')) return `bj${lower}`;
  }
  return lower;
};

const rawCode = (code: string) => String(code || '').replace(/^(sh|sz|bj)/i, '');

const requestJson = async (request: Request): Promise<AnyRecord> => {
  try {
    const value = await request.json();
    return value && typeof value === 'object' ? value as AnyRecord : {};
  } catch {
    return {};
  }
};

const requestAborted = (request: Request) => request.signal?.aborted === true;

let marketThemesCache: { themes: AnyRecord[]; storedAt: number } | null = null;
const MARKET_THEMES_TTL = 30_000;
const MARKET_THEMES_STALE_TTL = 10 * 60_000;

const fetchSinaThemes = async (node: string) => {
  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=15&sort=changepercent&asc=0&node=${node}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://finance.sina.com.cn/',
    },
  }, 5_000);
  if (!response.ok) throw new Error(`Sina status ${response.status}`);
  const parsed = parseLooseJson(await decodeGbk(response));
  return Array.isArray(parsed) ? parsed : [];
};

const handleThemes = async (request: Request) => {
  const now = Date.now();
  if (marketThemesCache && now - marketThemesCache.storedAt < MARKET_THEMES_TTL) {
    return json({ themes: marketThemesCache.themes }, 200, { 'X-Market-Data-Cache': 'HIT' });
  }

  try {
    const [conceptsResult, industriesResult] = await Promise.allSettled([
      fetchSinaThemes('gn_sina'),
      fetchSinaThemes('hy_sina'),
    ]);
    const concepts = conceptsResult.status === 'fulfilled' ? conceptsResult.value : [];
    const industries = industriesResult.status === 'fulfilled' ? industriesResult.value : [];
    const source = concepts.length > 0 ? concepts : industries;
    if (source.length === 0) {
      if (marketThemesCache && now - marketThemesCache.storedAt < MARKET_THEMES_STALE_TTL) {
        return json({ themes: marketThemesCache.themes }, 200, { 'X-Market-Data-Cache': 'STALE' });
      }
      return json({ themes: [] });
    }

    const themes = source.map((item: AnyRecord, index: number) => {
      const change = parseFloatSafe(item.changepercent);
      return {
        id: `sina-${item.symbol || index}`,
        name: item.name || '未命名板块',
        type: index < 3 && change > 1.5 ? 'Main' : 'Vice',
        logic: `板块涨幅 ${change}%`,
      };
    });
    marketThemesCache = { themes, storedAt: now };
    return json({ themes });
  } catch (error) {
    if (marketThemesCache && now - marketThemesCache.storedAt < MARKET_THEMES_STALE_TTL) {
      return json({ themes: marketThemesCache.themes }, 200, { 'X-Market-Data-Cache': 'STALE' });
    }
    console.warn('[market/themes] unavailable', error);
    return json({ themes: [] });
  }
};

const marginTradingCache = new Map<string, { data: MarginTradingSnapshot; storedAt: number }>();
const MARGIN_TRADING_TTL = 6 * 60 * 60 * 1000;

const fetchMarginTradingBatch = async (codes: string[]) => {
  const now = Date.now();
  const normalized = [...new Set(codes.map(rawCode).filter(code => /^\d{6}$/.test(code)))];
  const output: Record<string, MarginTradingSnapshot> = {};
  const missing: string[] = [];
  normalized.forEach(code => {
    const cached = marginTradingCache.get(code);
    if (cached && now - cached.storedAt < MARGIN_TRADING_TTL) output[code] = cached.data;
    else missing.push(code);
  });
  if (missing.length === 0) return output;

  const columns = 'DATE,SCODE,RZYE,RQYE,RZMRE,RZCHE,RZJME,RQMCL,RQCHL,RQJMG,SPJ,SZ,RZYEZB';
  const filter = `(scode in (${missing.map(code => `"${code}"`).join(',')}))`;
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_WEB_RZRQ_GGMX&columns=${columns}&source=WEB&sortColumns=date&sortTypes=-1&pageNumber=1&pageSize=${Math.max(15, missing.length * 5)}&filter=${encodeURIComponent(filter)}`;
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://data.eastmoney.com/rzrq/detail/all.html',
      },
    }, 5_000);
    if (!response.ok) throw new Error(`Margin status ${response.status}`);
    const rows = (await response.json() as AnyRecord)?.result?.data;
    if (!Array.isArray(rows)) return output;
    rows.forEach((row: AnyRecord) => {
      const code = String(row?.SCODE || '');
      if (!missing.includes(code) || output[code]) return;
      const data = parseMarginTradingRow(row);
      if (data) {
        output[code] = data;
        marginTradingCache.set(code, { data, storedAt: now });
      }
    });
  } catch (error) {
    console.warn('[market/stocks] margin enrichment unavailable', error);
  }
  return output;
};

const buildTencentStock = (code: string, fields: string[]) => {
  if (fields.length <= 30) return null;
  const current = parseFloatSafe(fields[3]);
  const previousClose = parseFloatSafe(fields[4]);
  const changePercent = previousClose > 0
    ? Number((((current - previousClose) / previousClose) * 100).toFixed(2))
    : 0;
  const limitState = calculateLimitState({
    code: rawCode(code),
    name: fields[1],
    currentPrice: current,
    previousClose,
    changePercent,
    sourceLimitUpPrice: parseFloatSafe(fields[47]),
    sourceLimitDownPrice: parseFloatSafe(fields[48]),
  });
  const turnoverYuan = parseTencentTurnoverYuan(fields);
  return {
    name: fields[1],
    currentPrice: current,
    changePercent,
    high: parseFloatSafe(fields[33]),
    low: parseFloatSafe(fields[34]),
    open: parseFloatSafe(fields[5]),
    prevClose: previousClose,
    volume: parseFloatSafe(fields[6]),
    turnover: turnoverYuan,
    amount: turnoverYuan,
    turnoverRate: parseFloatSafe(fields[38]),
    limitUpPrice: limitState.limitUpPrice,
    limitDownPrice: limitState.limitDownPrice,
    isLimitUp: limitState.isLimitUp,
    isLimitDown: limitState.isLimitDown,
    lastUpdate: fields[30],
    sourceAsOf: parseTencentTimestamp(fields[30]),
    buyVolume: parseFloatSafe(fields[7]),
    sellVolume: parseFloatSafe(fields[8]),
    bid1Amount: parseFloatSafe(fields[10]),
    bid2Amount: parseFloatSafe(fields[12]),
    bid3Amount: parseFloatSafe(fields[14]),
    bid4Amount: parseFloatSafe(fields[16]),
    bid5Amount: parseFloatSafe(fields[18]),
    ask1Amount: parseFloatSafe(fields[20]),
    ask2Amount: parseFloatSafe(fields[22]),
    ask3Amount: parseFloatSafe(fields[24]),
    ask4Amount: parseFloatSafe(fields[26]),
    ask5Amount: parseFloatSafe(fields[28]),
    bidAmount: [10, 12, 14, 16, 18].reduce((sum, index) => sum + parseFloatSafe(fields[index]), 0),
    askAmount: [20, 22, 24, 26, 28].reduce((sum, index) => sum + parseFloatSafe(fields[index]), 0),
  };
};

const buildEastmoneyStock = (item: AnyRecord, requestedCode: string) => {
  const code = String(item.f12 || rawCode(requestedCode));
  const name = String(item.f14 || code);
  const currentPrice = parseFloatSafe(item.f2);
  const previousClose = parseFloatSafe(item.f18);
  const changePercent = parseFloatSafe(item.f3);
  const limitState = calculateLimitState({
    code,
    name,
    currentPrice,
    previousClose,
    changePercent,
  });
  const sourceTimestamp = parseFloatSafe(item.f124) * 1000;
  return {
    name,
    currentPrice,
    changePercent,
    high: parseFloatSafe(item.f15),
    low: parseFloatSafe(item.f16),
    open: parseFloatSafe(item.f17),
    prevClose: previousClose,
    volume: parseFloatSafe(item.f5),
    turnover: parseFloatSafe(item.f6),
    amount: parseFloatSafe(item.f6),
    turnoverRate: parseFloatSafe(item.f8),
    limitUpPrice: limitState.limitUpPrice,
    limitDownPrice: limitState.limitDownPrice,
    isLimitUp: limitState.isLimitUp,
    isLimitDown: limitState.isLimitDown,
    sourceAsOf: sourceTimestamp > 1_500_000_000_000 ? new Date(sourceTimestamp).toISOString() : undefined,
  };
};

const fetchStockBatch = async (batchCodes: string[]) => {
  const results: Record<string, AnyRecord> = {};
  const tencentUrl = `https://web.sqt.gtimg.cn/q=${batchCodes.join(',')}`;
  const emIds = batchCodes.map(code => {
    const normalized = normalizeCode(code);
    return `${normalized.startsWith('sh') ? '1' : '0'}.${rawCode(normalized)}`;
  }).join(',');
  const emPath = `/api/qt/ulist.np/get?fltt=2&invt=2&secids=${emIds}&fields=f12,f14,f2,f3,f5,f6,f8,f15,f16,f17,f18,f62,f124`;
  const emUrls = [`https://push2.eastmoney.com${emPath}`, `https://push2delay.eastmoney.com${emPath}`];

  const [tencentResult, eastmoneyResult, marginResult] = await Promise.allSettled([
    fetchWithTimeout(tencentUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 8_000),
    (async () => {
      let lastError: unknown;
      for (const url of emUrls) {
        try {
          const response = await fetchWithTimeout(url, {
            headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://quote.eastmoney.com/' },
          }, 3_500);
          if (!response.ok) throw new Error(`Eastmoney status ${response.status}`);
          return response;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('Eastmoney unavailable');
    })(),
    fetchMarginTradingBatch(batchCodes),
  ]);

  if (tencentResult.status === 'fulfilled' && tencentResult.value.ok) {
    const text = await decodeGbk(tencentResult.value);
    text.split(';').forEach(line => {
      const match = line.match(/v_([a-z0-9]+)="([\s\S]*)"/);
      if (!match) return;
      const stock = buildTencentStock(match[1], match[2].split('~'));
      if (stock) results[match[1]] = stock;
    });
  }

  if (eastmoneyResult.status === 'fulfilled' && eastmoneyResult.value.ok) {
    try {
      const diff = (await eastmoneyResult.value.json() as AnyRecord)?.data?.diff;
      const list = Array.isArray(diff) ? diff : diff ? Object.values(diff) : [];
      list.forEach((item: AnyRecord) => {
        const code = String(item.f12 || '');
        const match = batchCodes.find(requested => rawCode(requested) === code) ||
          batchCodes.find(requested => results[requested]);
        if (!match) return;
        const target = results[match] || (results[normalizeCode(match)] ??= buildEastmoneyStock(item, match));
        const flow = Number(item.f62);
        if (Number.isFinite(flow)) {
          target.largeOrderNetYuan = flow;
          target.largeOrderNetSource = 'eastmoney-f62';
          target.largeOrderNetAsOf = target.sourceAsOf;
        }
      });
    } catch (error) {
      console.warn('[market/stocks] Eastmoney parse failed', error);
    }
  }

  if (marginResult.status === 'fulfilled') {
    Object.entries(marginResult.value).forEach(([code, marginData]) => {
      const match = batchCodes.find(requested => rawCode(requested) === code);
      if (match && results[match]) results[match].marginData = marginData;
    });
  }
  return results;
};

const handleStocks = async (request: Request, url: URL) => {
  const codesParam = url.searchParams.get('codes');
  if (!codesParam) return json({ error: 'Codes required' }, 400);
  const codes = codesParam.split(',').map(normalizeCode).filter(Boolean);
  const results: Record<string, AnyRecord> = {};
  for (let index = 0; index < codes.length; index += 15) {
    if (requestAborted(request)) return noContent();
    Object.assign(results, await fetchStockBatch(codes.slice(index, index + 15)));
  }
  if (requestAborted(request)) return noContent();
  return json({ data: results });
};

const INDEX_CODES = ['sh000001', 'sh000300', 'sh000905', 'sh000852', 'sz399001', 'sz399006', 'sh000688'];

const parseTencentIndices = (text: string) => {
  const results: AnyRecord[] = [];
  text.split(';').forEach(line => {
    const match = line.match(/v_([a-z0-9]+)="([\s\S]*)"/);
    if (!match) return;
    const fields = match[2].split('~');
    if (fields.length <= 5) return;
    const current = parseFloatSafe(fields[3]);
    const previousClose = parseFloatSafe(fields[4]);
    const change = current - previousClose;
    results.push({
      code: match[1],
      name: fields[1],
      current,
      change: Number(change.toFixed(2)),
      changePercent: previousClose > 0 ? Number(((change / previousClose) * 100).toFixed(2)) : 0,
    });
  });
  return results;
};

const parseSinaIndices = (text: string) => {
  const results: AnyRecord[] = [];
  text.split('\n').forEach(line => {
    const match = line.match(/hq_str_([a-z0-9]+)="([\s\S]*)"/);
    if (!match) return;
    const fields = match[2].split(',');
    if (fields.length <= 3) return;
    const current = parseFloatSafe(fields[3] || fields[2]);
    const previousClose = parseFloatSafe(fields[2]);
    const change = current - previousClose;
    results.push({
      code: match[1],
      name: fields[0],
      current,
      change: Number(change.toFixed(2)),
      changePercent: previousClose > 0 ? Number(((change / previousClose) * 100).toFixed(2)) : 0,
    });
  });
  return results;
};

const handleIndices = async (request: Request) => {
  if (requestAborted(request)) return noContent();
  const tencent = fetchWithTimeout(
    `https://qt.gtimg.cn/q=${INDEX_CODES.join(',')}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
    5_000,
  ).then(async response => {
    if (!response.ok) throw new Error(`Tencent status ${response.status}`);
    const data = parseTencentIndices(await decodeGbk(response));
    if (data.length === 0) throw new Error('Tencent returned no index data');
    return data;
  });
  const sina = fetchWithTimeout(
    `https://hq.sinajs.cn/list=${INDEX_CODES.join(',')}`,
    { headers: { Referer: 'https://finance.sina.com.cn/' } },
    5_000,
  ).then(async response => {
    if (!response.ok) throw new Error(`Sina status ${response.status}`);
    const data = parseSinaIndices(await decodeGbk(response));
    if (data.length === 0) throw new Error('Sina returned no index data');
    return data;
  });

  try {
    const winner = await Promise.race([
      Promise.any([tencent, sina]),
      new Promise<AnyRecord[]>(resolve => setTimeout(() => resolve([]), 8_000)),
    ]);
    return json({ data: Array.isArray(winner) ? winner : [] }, 200, {
      'Cache-Control': 'public, max-age=3, stale-while-revalidate=10',
    });
  } catch (error) {
    console.warn('[market/indices] unavailable', error);
    return json({ data: [] });
  }
};

const handleStockSearch = async (url: URL) => {
  const query = url.searchParams.get('q')?.trim();
  if (!query) return json({ error: 'Query required' }, 400);
  try {
    const response = await fetchWithTimeout(
      `https://suggest3.sinajs.cn/suggest/type=&key=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn/' } },
      8_000,
    );
    if (!response.ok) return json({ result: null });
    const match = (await decodeGbk(response)).match(/"([^"]+)"/);
    if (!match) return json({ result: null });
    const fields = match[1].split(',');
    const code = rawCode(fields[3] || '');
    return json({ result: /^\d{6}$/.test(code) ? { code, name: fields[4] || query } : null });
  } catch (error) {
    console.warn('[market/search] unavailable', error);
    return json({ result: null });
  }
};

const handleFundSearch = async (url: URL) => {
  const keyword = url.searchParams.get('q')?.trim();
  if (!keyword) return json({ error: 'Query required' }, 400);
  const results: { code: string; name: string; type: string }[] = [];
  const seen = new Set<string>();
  const add = (code: unknown, name: unknown, type: unknown) => {
    const normalizedCode = String(code || '');
    if (!/^\d{6}$/.test(normalizedCode) || seen.has(normalizedCode)) return;
    seen.add(normalizedCode);
    results.push({ code: normalizedCode, name: String(name || normalizedCode), type: String(type || '基金') });
  };
  const parseSearchPayload = (text: string) => {
    const parsed = parseLooseJson(text);
    const datas = Array.isArray(parsed?.Datas) ? parsed.Datas : [];
    datas.forEach((item: AnyRecord) => add(
      item.CODE || item.code,
      item.NAME || item.name || item.SHORTNAME,
      item.FundBaseInfo?.FTYPE || item.CATEGORYDESC || item.CATEGORY,
    ));
  };

  const requests = [
    fetchWithTimeout(
      `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNKeyWordSearch?plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=1&Ession=1&KeyWord=${encodeURIComponent(keyword)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13)' } },
      8_000,
    ).then(async response => { if (response.ok) parseSearchPayload(await response.text()); }),
    fetchWithTimeout(
      `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}&pageindex=0&pagesize=15`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://fund.eastmoney.com/' } },
      8_000,
    ).then(async response => { if (response.ok) parseSearchPayload(await response.text()); }),
    fetchWithTimeout(
      `https://suggest3.sinajs.cn/suggest/type=11,12&key=${encodeURIComponent(keyword)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn/' } },
      8_000,
    ).then(async response => {
      if (!response.ok) return;
      const match = (await decodeGbk(response)).match(/"([^"]*)"/);
      if (!match) return;
      match[1].split(';').filter(Boolean).slice(0, 10).forEach(item => {
        const fields = item.split(',');
        add(rawCode(fields[3]), fields[4], 'ETF/股票');
      });
    }),
  ];
  await Promise.allSettled(requests);
  return json({ results: results.slice(0, 20) });
};

type MarketDataStatus = 'FRESH' | 'PARTIAL' | 'STALE';
type MarketCacheState = 'MISS' | 'HIT' | 'COALESCED' | 'STALE';

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
  list: AnyRecord[];
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

const MARKET_STATS_TTL = 8_000;
const MARKET_STATS_STALE_TTL = 60_000;
let marketStatsCache: { snapshot: MarketStatsSnapshot; storedAt: number } | null = null;
let marketStatsInFlight: Promise<MarketStatsSnapshot> | null = null;
let marketStatsLastError: { message: string; at: string } | null = null;
const marketStatsHealthSamples: { ok: boolean; durationMs: number; at: number }[] = [];

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

const recordMarketStatsHealth = (ok: boolean, durationMs: number) => {
  marketStatsHealthSamples.push({ ok, durationMs, at: Date.now() });
  if (marketStatsHealthSamples.length > 100) marketStatsHealthSamples.shift();
};

const buildMarketStatsSnapshot = async (): Promise<MarketStatsSnapshot> => {
  const startedAt = Date.now();
  const marketFilter = 'm:1+t:2,m:1+t:23,m:0+t:6,m:0+t:80,m:0+t:81+s:2048';
  const pageSize = 100;
  const maxPages = 65;
  const pageConcurrency = 4;
  const fields = 'f12,f14,f2,f3,f4,f5,f6,f8,f15,f16,f17,f18,f51,f52,f62,f124';
  const hosts = ['push2.eastmoney.com', 'push2delay.eastmoney.com'];
  let pagesRequested = 0;
  let pagesSucceeded = 0;

  const fetchPage = async (page: number) => {
    pagesRequested++;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const host = hosts[attempt % hosts.length];
        const url = `https://${host}/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=${marketFilter}&fields=${fields}&_=${Date.now()}-${page}-${attempt}`;
        const response = await fetchWithTimeout(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://quote.eastmoney.com/' },
        }, 8_000);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const payload = await response.json() as AnyRecord;
        const diff = payload?.data?.diff;
        const items = Array.isArray(diff) ? diff : diff ? Object.values(diff) : [];
        if (items.length === 0) throw new Error('Empty market page');
        pagesSucceeded++;
        return { ok: true, items, total: Number(payload?.data?.total) || 0 };
      } catch {
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    return { ok: false, items: [] as AnyRecord[], total: 0 };
  };

  const firstPage = await fetchPage(1);
  if (!firstPage.ok || firstPage.total <= 0) throw new Error('Market universe unavailable');
  const expectedRecords = firstPage.total;
  const totalPages = Math.min(maxPages, Math.ceil(expectedRecords / pageSize));
  const pageNumbers = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);
  const pageResults = [firstPage];
  for (let index = 0; index < pageNumbers.length; index += pageConcurrency) {
    pageResults.push(...await Promise.all(pageNumbers.slice(index, index + pageConcurrency).map(fetchPage)));
  }

  const fetchedRecords = pageResults.reduce((sum, page) => sum + page.items.length, 0);
  const coverage = expectedRecords > 0 ? Math.min(1, fetchedRecords / expectedRecords) : 0;
  const stockByCode = new Map<string, AnyRecord>();
  pageResults.flatMap(page => page.items).forEach((item: AnyRecord) => {
    if (item?.f12) stockByCode.set(String(item.f12), item);
  });
  const stocks = [...stockByCode.values()];
  if (stocks.length < 1_000 || coverage < 0.75) {
    throw new Error(`Market coverage insufficient: records=${stocks.length}, coverage=${coverage.toFixed(3)}`);
  }

  const now = Date.now();
  const sourceTimestamps = stocks.map(stock => parseFloatSafe(stock.f124) * 1000)
    .filter(timestamp => timestamp > 1_500_000_000_000 && timestamp <= now + 300_000)
    .sort((a, b) => a - b);
  const sourceTimestampCoverage = sourceTimestamps.length / Math.max(1, stocks.length);
  const sourceTimestamp = sourceTimestamps.length > 0
    ? sourceTimestamps[Math.floor((sourceTimestamps.length - 1) * 0.1)]
    : now;
  const sourceAgeMs = Math.max(0, now - sourceTimestamp);
  if (isChinaMarketSession(new Date(now)) && sourceAgeMs > 180_000) {
    throw new Error(`Market source stale during session: ageMs=${sourceAgeMs}`);
  }

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let limitUpCount = 0;
  let limitDownCount = 0;
  let totalChange = 0;
  let totalAmount = 0;
  const list = stocks.flatMap(stock => {
    const code = String(stock.f12 || '');
    if (!/^\d{6}$/.test(code)) return [];
    const name = String(stock.f14 || code);
    const currentPrice = parseFloatSafe(stock.f2);
    const changePercent = parseFloatSafe(stock.f3);
    const amount = parseFloatSafe(stock.f6);
    const previousClose = parseFloatSafe(stock.f18);
    const limitState = calculateLimitState({
      code,
      name,
      currentPrice,
      previousClose,
      changePercent,
      sourceLimitUpPrice: parseFloatSafe(stock.f51),
      sourceLimitDownPrice: parseFloatSafe(stock.f52),
    });
    const timestamp = parseFloatSafe(stock.f124) * 1000;
    const largeOrderNetYuan = Number.isFinite(Number(stock.f62)) ? Number(stock.f62) : undefined;
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
      turnoverRate: parseFloatSafe(stock.f8),
      largeOrderNetYuan,
      largeOrderNetSource: largeOrderNetYuan !== undefined ? 'eastmoney-f62' : undefined,
      largeOrderNetAsOf: timestamp > 1_500_000_000_000 ? new Date(timestamp).toISOString() : undefined,
      isLimitUp: limitState.isLimitUp,
      isLimitDown: limitState.isLimitDown,
      limitUpPrice: limitState.limitUpPrice,
      limitDownPrice: limitState.limitDownPrice,
      limitRuleSource: limitState.source,
    }];
  });
  const asOf = new Date().toISOString();
  const status: MarketDataStatus = stocks.length >= 4_000 && coverage >= 0.97 && pagesSucceeded === pagesRequested
    ? 'FRESH' : 'PARTIAL';
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
      status,
      source: ['eastmoney'],
      asOf,
      ageMs: 0,
      sourceAsOf: new Date(sourceTimestamp).toISOString(),
      sourceAgeMs,
      sourceTimestampCoverage: Number(sourceTimestampCoverage.toFixed(4)),
      coverage: Number(coverage.toFixed(4)),
      records: list.length,
      expectedRecords,
      segmentsSucceeded: 1,
      segmentsTotal: 1,
      pagesSucceeded,
      pagesRequested,
      durationMs: Date.now() - startedAt,
      cache: 'MISS',
    },
  };
};

const getMarketStatsSnapshot = async () => {
  const now = Date.now();
  if (marketStatsCache && now - marketStatsCache.storedAt < MARKET_STATS_TTL) {
    return { snapshot: marketStatsCache.snapshot, cache: 'HIT' as MarketCacheState };
  }
  if (marketStatsInFlight) {
    return { snapshot: await marketStatsInFlight, cache: 'COALESCED' as MarketCacheState };
  }
  const startedAt = Date.now();
  marketStatsInFlight = buildMarketStatsSnapshot();
  try {
    const snapshot = await marketStatsInFlight;
    marketStatsCache = { snapshot, storedAt: Date.now() };
    marketStatsLastError = null;
    recordMarketStatsHealth(true, Date.now() - startedAt);
    return { snapshot, cache: 'MISS' as MarketCacheState };
  } catch (error) {
    recordMarketStatsHealth(false, Date.now() - startedAt);
    marketStatsLastError = { message: String((error as AnyRecord)?.message || error), at: new Date().toISOString() };
    if (marketStatsCache && now - marketStatsCache.storedAt < MARKET_STATS_STALE_TTL) {
      return { snapshot: marketStatsCache.snapshot, cache: 'STALE' as MarketCacheState };
    }
    throw error;
  } finally {
    marketStatsInFlight = null;
  }
};

const handleMarketHealth = () => {
  const ageMs = marketStatsCache ? Date.now() - marketStatsCache.storedAt : null;
  const recent = marketStatsHealthSamples.filter(sample => Date.now() - sample.at <= 30 * 60_000);
  const durations = recent.map(sample => sample.durationMs);
  const successes = recent.filter(sample => sample.ok).length;
  return json({
    status: ageMs === null ? 'COLD' : ageMs < MARKET_STATS_STALE_TTL ? 'HEALTHY' : 'DEGRADED',
    marketStats: {
      cacheAgeMs: ageMs,
      inFlight: Boolean(marketStatsInFlight),
      lastError: marketStatsLastError,
      samples: recent.length,
      successRate: recent.length > 0 ? Number((successes / recent.length).toFixed(3)) : null,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
    },
    checkedAt: new Date().toISOString(),
  });
};

const handleMarketStats = async (url: URL) => {
  const includeList = url.searchParams.get('includeList') === 'true';
  try {
    const { snapshot, cache } = await getMarketStatsSnapshot();
    const quality = {
      ...snapshot.quality,
      status: cache === 'STALE' ? 'STALE' : snapshot.quality.status,
      ageMs: Math.max(0, Date.now() - Date.parse(snapshot.quality.asOf)),
      sourceAgeMs: snapshot.quality.sourceAsOf
        ? Math.max(0, Date.now() - Date.parse(snapshot.quality.sourceAsOf))
        : snapshot.quality.sourceAgeMs,
      cache,
    } as MarketStatsSnapshot['quality'];
    return json({ data: { ...snapshot, list: includeList ? snapshot.list : undefined, quality } }, 200, {
      'Cache-Control': 'public, max-age=3, stale-while-revalidate=10',
      'X-Market-Data-Status': quality.status,
      'X-Market-Data-Coverage': String(quality.coverage),
    });
  } catch (error) {
    return json({
      error: 'MARKET_DATA_UNAVAILABLE',
      message: String((error as AnyRecord)?.message || error),
      data: null,
      quality: { status: 'UNAVAILABLE', source: ['eastmoney'], asOf: new Date().toISOString(), coverage: 0 },
    }, 503);
  }
};

const normalizeTick = (code: string) => normalizeCode(code);

const parseTencentTicks = (text: string) => {
  const match = text.match(/v_detail_data=\[([\s\S]*)\];/);
  if (!match || !match[1].trim()) return [];
  const typeMap: Record<string, string> = { B: '买盘', S: '卖盘', M: '中性盘' };
  const rows: AnyRecord[] = [];
  const rowRegex = /"([^"]+)"/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(match[1])) !== null) {
    const fields = rowMatch[1].split('/');
    if (fields.length >= 4) rows.push({
      time: fields[0],
      price: parseFloatSafe(fields[1]),
      volume: parseFloatSafe(fields[2]),
      type: typeMap[fields[3]] || '中性盘',
    });
  }
  return rows;
};

const handleTicks = async (request: Request, url: URL) => {
  const code = url.searchParams.get('code');
  if (!code) return json({ error: 'Code required' }, 400);
  const symbol = normalizeTick(code);
  try {
    const response = await fetchWithTimeout(
      `https://stock.gtimg.cn/data/index.php?appn=detail&action=data&c=${symbol}&p=0&_=${Date.now()}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gu.qq.com/' } },
      10_000,
    );
    if (response.ok) {
      const ticks = parseTencentTicks(await response.text());
      if (ticks.length > 0) return json({ data: ticks });
    }
  } catch {
    // Sina is a fallback for regions where Tencent rejects the edge request.
  }

  if (requestAborted(request)) return noContent();
  try {
    const response = await fetchWithTimeout(
      `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_Transactions.getCNTransactions?symbol=${symbol}&num=40&_=${Date.now()}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn/' } },
      8_000,
    );
    if (response.ok) {
      const parsed = parseLooseJson(await response.text());
      if (Array.isArray(parsed) && parsed.length > 0) return json({ data: parsed });
    }
  } catch {
    // Optional diagnostic data; an empty result keeps the page usable.
  }
  return requestAborted(request) ? noContent() : json({ data: [] });
};

const parseFundEstimate = (text: string) => {
  const match = text.match(/jsonpgz\(([\s\S]+)\)/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
};

const fetchFund = async (code: string) => {
  try {
    const estimateUrl = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    const periodUrl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNPeriodIncrease?FCODE=${code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0`;
    const infoUrl = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInformation?FCODE=${code}&deviceid=1&plat=Android&product=EFund&Version=1`;
    const [estimateResponse, periodResponse, infoResponse] = await Promise.all([
      fetchWithTimeout(estimateUrl, { headers: { Referer: 'https://fund.eastmoney.com/' } }, 4_000),
      fetchWithTimeout(periodUrl, { headers: { Referer: 'https://fund.eastmoney.com/' } }, 4_000),
      fetchWithTimeout(infoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 4_000).catch(() => null),
    ]);
    const estimate = estimateResponse.ok ? parseFundEstimate(await estimateResponse.text()) : null;
    if (!estimate?.fundcode) return null;
    const period = periodResponse.ok ? await periodResponse.json() as AnyRecord : null;
    const periods = Array.isArray(period?.Datas) ? period.Datas : [];
    const findPeriod = (title: string) => periods.find((item: AnyRecord) => item.title === title)?.syl || '0.00';
    let fundType = '';
    let indexName = '';
    if (infoResponse?.ok) {
      try {
        const info = await infoResponse.json() as AnyRecord;
        fundType = String(info?.Datas?.FTYPE || '');
        indexName = String(info?.Datas?.INDEXNAME || '');
      } catch { /* optional classification */ }
    }
    return {
      code: estimate.fundcode,
      name: estimate.name,
      estimateNetValue: parseFloatSafe(estimate.gsz),
      estimateChangePercent: parseFloatSafe(estimate.gszzl),
      lastUpdate: estimate.gztime,
      yearChangePercent: findPeriod('1N'),
      halfYearChangePercent: findPeriod('6Y'),
      quarterChangePercent: findPeriod('3Y'),
      ytdChangePercent: findPeriod('JN'),
      fundType,
      indexName,
    };
  } catch (error) {
    console.warn(`[market/funds] failed for ${code}`, error);
    return null;
  }
};

const handleFunds = async (request: Request, url: URL) => {
  const codes = (url.searchParams.get('codes') || '').split(',').filter(Boolean);
  if (codes.length === 0) return json({ error: 'Codes required' }, 400);
  const results: any[] = [];
  for (let index = 0; index < codes.length; index += 5) {
    if (requestAborted(request)) return noContent();
    const batch = await Promise.all(codes.slice(index, index + 5).map(fetchFund));
    results.push(...batch.filter(Boolean));
  }
  return requestAborted(request) ? noContent() : json({ data: results });
};

const toHistorySymbol = (code: string) => normalizeCode(code);

const fetchStockHistoryOne = async (raw: string, period?: string) => {
  const symbol = toHistorySymbol(raw);
  const intraday = ['1', '5', '15', '30'].includes(period || '');
  const scale = intraday ? Number(period) : 240;
  const length = intraday ? (scale === 1 ? 240 : scale === 5 ? 120 : scale === 15 ? 80 : 60) : 640;
  if (intraday) {
    const key = scale === 1 ? 'm1' : scale === 5 ? 'm5' : scale === 15 ? 'm15' : 'm30';
    try {
      const response = await fetchWithTimeout(
        `https://web.ifzq.gtimg.cn/appstock/app/kline/mkline?param=${symbol},${key},,${length}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
        8_000,
      );
      if (response.ok) {
        const data = (await response.json() as AnyRecord)?.data?.[symbol]?.[key];
        if (Array.isArray(data) && data.length > 0) return data.map((item: any[]) => ({
          day: item[0], open: parseFloatSafe(item[1]), close: parseFloatSafe(item[2]),
          high: parseFloatSafe(item[3]), low: parseFloatSafe(item[4]), volume: parseFloatSafe(item[5]),
        }));
      }
    } catch { /* fallback below */ }
    try {
      const response = await fetchWithTimeout(
        `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=${scale}&ma=no&datalen=${length}`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn/' } },
        6_000,
      );
      return response.ok ? JSON.parse(await response.text()) : [];
    } catch { return []; }
  }

  try {
    const response = await fetchWithTimeout(
      `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${length},qfq`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      8_000,
    );
    if (response.ok) {
      const dataObj = (await response.json() as AnyRecord)?.data?.[symbol];
      const daily = dataObj?.qfqday || dataObj?.day;
      if (Array.isArray(daily)) return daily.map((item: any[]) => ({
        day: item[0], open: parseFloatSafe(item[1]), close: parseFloatSafe(item[2]),
        high: parseFloatSafe(item[3]), low: parseFloatSafe(item[4]), volume: parseFloatSafe(item[5]),
      }));
    }
  } catch { /* Sina fallback below */ }
  try {
    const response = await fetchWithTimeout(
      `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${length}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.sina.com.cn/' } },
      6_000,
    );
    return response.ok ? JSON.parse(await response.text()) : [];
  } catch { return []; }
};

const handleHistory = async (request: Request, url: URL) => {
  const code = url.searchParams.get('code');
  const codes = (url.searchParams.get('codes') || '').split(',').filter(Boolean);
  const period = url.searchParams.get('period') || undefined;
  if (codes.length > 0) {
    const results: Record<string, any[]> = {};
    for (let index = 0; index < Math.min(codes.length, 20); index += 5) {
      if (requestAborted(request)) return noContent();
      const batch = codes.slice(index, index + 5);
      const values = await Promise.all(batch.map(item => fetchStockHistoryOne(item, period)));
      batch.forEach((item, batchIndex) => { results[item] = values[batchIndex] || []; });
    }
    return requestAborted(request) ? noContent() : json({ data: results });
  }
  if (code) return json({ data: await fetchStockHistoryOne(code, period) });
  return json({ error: 'Code or codes required' }, 400);
};

const fetchFundHistoryOne = async (code: string) => {
  try {
    const response = await fetchWithTimeout(
      `https://fund.eastmoney.com/pingzhongdata/${code}.js?t=${Date.now()}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://fund.eastmoney.com/',
        },
      },
      10_000,
    );
    if (!response.ok) return [];
    const text = await response.text();
    const unitMatch = text.match(/Data_netWorthTrend\s*=\s*(\[.*?\]);/);
    const accumulatedMatch = text.match(/Data_ACWorthTrend\s*=\s*(\[.*?\]);/);
    let unit: any[] = [];
    let accumulated: any[] = [];
    try { if (unitMatch) unit = JSON.parse(unitMatch[1]); } catch { /* malformed upstream */ }
    try { if (accumulatedMatch) accumulated = JSON.parse(accumulatedMatch[1]); } catch { /* malformed upstream */ }
    if (unit.length === 0 && accumulated.length === 0) return [];
    const accumulatedMap = new Map<number, number>();
    accumulated.forEach(item => {
      const timestamp = Array.isArray(item) ? item[0] : item?.x;
      const value = Array.isArray(item) ? item[1] : item?.y;
      if (timestamp && value) accumulatedMap.set(Number(timestamp), parseFloatSafe(value));
    });
    const base = unit.length > 0 ? unit : accumulated;
    return base.map(item => {
      const timestamp = Number(Array.isArray(item) ? item[0] : item?.x);
      const value = parseFloatSafe(Array.isArray(item) ? item[1] : item?.y);
      if (!timestamp) return null;
      const day = new Date(timestamp).toISOString().slice(0, 10);
      const accumulatedValue = accumulatedMap.get(timestamp);
      return {
        day,
        close: value,
        open: value,
        high: value,
        low: value,
        volume: 0,
        ...(accumulatedValue !== undefined ? { accumulated: accumulatedValue } : {}),
      };
    }).filter(Boolean).slice(-1000);
  } catch (error) {
    console.warn(`[market/fund-history] failed for ${code}`, error);
    return [];
  }
};

const handleFundHistory = async (request: Request, url: URL) => {
  const codes = (url.searchParams.get('codes') || '').split(',').filter(Boolean);
  if (codes.length === 0) return json({ error: 'Codes required' }, 400);
  const result: Record<string, any[]> = {};
  for (let index = 0; index < codes.length; index += 3) {
    if (requestAborted(request)) return noContent();
    const batch = codes.slice(index, index + 3);
    const values = await Promise.all(batch.map(fetchFundHistoryOne));
    batch.forEach((code, batchIndex) => { result[code] = values[batchIndex] || []; });
  }
  return requestAborted(request) ? noContent() : json({ data: result });
};

const handleLinkage = async (request: Request) => {
  const body = await requestJson(request);
  const { sectorCode, dayCount, coreStock, elasticStocks, sectorVolumeRatio } = body;
  const phase = Number(dayCount) || 1;
  if (phase > 2) return json({ adjusted: false, reason: 'Not Ignition Phase (Day > 2)', threshold: null });
  let scanList = Array.isArray(elasticStocks) ? elasticStocks : [];
  if (sectorCode) {
    try {
      const response = await fetchWithTimeout(
        `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=30&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=b:${encodeURIComponent(sectorCode)}&fields=f12,f14,f3,f2`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } },
        4_000,
      );
      if (response.ok) {
        const diff = (await response.json() as AnyRecord)?.data?.diff;
        if (Array.isArray(diff)) scanList = diff.map(item => ({
          code: item.f12,
          name: item.f14,
          changePercent: item.f3,
          currentPrice: item.f2,
        }));
      }
    } catch (error) {
      console.warn('[market/analyze-linkage] sector scan unavailable', error);
    }
  }
  const limitUps = scanList.filter(stock => Number(stock.changePercent ?? stock.f3) >= 9.8);
  const thresholdCount = scanList.length < 5 ? 2 : 3;
  const minLimitUps = Math.max(thresholdCount, Math.floor(scanList.length * 0.2));
  if (limitUps.length < minLimitUps) {
    return json({ adjusted: false, reason: `Insufficient Follower Strength (${limitUps.length}/${minLimitUps}) - Scanned ${scanList.length}`, threshold: null });
  }
  if (sectorVolumeRatio !== undefined && Number(sectorVolumeRatio) < 1.3) {
    return json({ adjusted: false, reason: 'Volume Trap Detected (Ratio < 1.3)', warning: 'Potential One-Day Tour: Prices up but volume missing', threshold: null });
  }
  if (coreStock && Number(coreStock.changePercent) < -1) {
    return json({ adjusted: false, reason: 'Core Divergence (Core < -1%)', threshold: null });
  }
  const threshold = Number(sectorVolumeRatio) > 2 ? 1.5 : 2;
  return json({
    adjusted: true,
    reason: 'Linkage Trigger Activated',
    threshold,
    meta: {
      limitUps: limitUps.length,
      scannedTotal: scanList.length,
      volumeRatio: sectorVolumeRatio,
      phase,
      usingWholeMarketData: Boolean(sectorCode),
    },
  });
};

const handleValidateSignal = async (request: Request) => {
  const body = await requestJson(request);
  const { signalType, winRate, alpha, trapGuard, volumeRatio } = body;
  let label = signalType || 'NEUTRAL';
  let action = 'HOLD';
  let subText = 'Signal looks normal';
  let riskLevel = 'LOW';
  let adjustedWinRate = Number(winRate) || 50;
  let style = 'normal';
  if (alpha !== undefined && Number(alpha) < -60) {
    if (signalType === 'ASSAULT' || signalType === 'BUY') {
      label = '诱多 (BAIT)';
      subText = `资金严重背离 (Alpha: ${alpha})，防范骗线`;
      action = 'SELL/AVOID';
      riskLevel = 'CRITICAL';
      adjustedWinRate = Math.min(adjustedWinRate, 30);
      style = 'critical';
    } else {
      label = '阴跌 (DECLINE)';
      action = 'CLEAR';
    }
  } else if (trapGuard !== undefined && Number(trapGuard) > 50) {
    label = '陷阱 (TRAP)';
    subText = `诱多风险值偏高 (${trapGuard}%)`;
    action = 'OBSERVE';
    riskLevel = 'HIGH';
    adjustedWinRate = Math.min(adjustedWinRate, 45);
    style = 'warning';
  } else if (alpha !== undefined && Number(alpha) < -30) {
    if (signalType === 'ASSAULT') {
      label = '虚假突破 (FALSE BREAKOUT)';
      subText = '上涨缺乏资金支撑';
      action = 'REDUCE';
      riskLevel = 'MEDIUM';
      adjustedWinRate *= 0.6;
      style = 'warning';
    }
  } else if (signalType === 'ASSAULT' && volumeRatio !== undefined && Number(volumeRatio) < 0.8) {
    label = '弱反 (WEAK PULLBACK)';
    subText = '无量拉升，空间有限';
    action = 'WATCH';
    adjustedWinRate -= 15;
    style = 'neutral';
  } else if (signalType === 'ASSAULT') {
    action = 'BUY';
    subText = '量价配合良好，资金共振';
    style = 'success';
  }
  return json({
    display: { label, subText, action, style },
    analytics: {
      originalWinRate: winRate,
      adjustedWinRate: Math.round(adjustedWinRate),
      riskLevel,
      conflictDetected: label !== signalType,
    },
  });
};

const handleHarvest = async (request: Request) => {
  const body = await requestJson(request);
  const { cost, current, high, isLimitUp, alpha, volumeRatio, daysHeld } = body;
  const costValue = Number(cost) || 0;
  const currentValue = Number(current) || 0;
  const highValue = Number(high) || currentValue;
  const roi = costValue > 0 ? ((currentValue - costValue) / costValue) * 100 : 0;
  const maxRoi = costValue > 0 ? ((highValue - costValue) / costValue) * 100 : 0;
  const drawdown = maxRoi - roi;
  let action = 'HOLD';
  let percentage = 0;
  let reason = 'TREND_CONTINUATION';
  let message = '趋势延续，建议持仓';
  let style = 'neutral';
  if (roi < -5) {
    action = 'CLEAR'; percentage = 100; reason = 'STOP_LOSS'; message = '触及硬性止损线 (-5%)'; style = 'destructive';
  } else if (maxRoi > 10 && drawdown > 5) {
    action = 'SELL'; percentage = 100; reason = 'PROFIT_GUARD'; message = `利润回撤保护 (最高 +${maxRoi.toFixed(1)}% -> 回撤 5%)`; style = 'warning';
  } else if (maxRoi > 9 && !isLimitUp && (highValue - currentValue) / Math.max(currentValue, 0.01) > 0.03 && Number(volumeRatio) > 2) {
    action = 'CLEAR'; percentage = 100; reason = 'LIMIT_UP_FAILURE'; message = '炸板且量能失控，不赌回封，建议离场'; style = 'destructive';
  } else if (roi > 7 && !isLimitUp && Number(alpha) < -20) {
    action = 'TRIM'; percentage = 50; reason = 'IMPULSE_EXHAUSTION'; message = '冲高缺乏资金支持 (Alpha负背离)，减仓锁定胜果'; style = 'success';
  } else if (roi > 20) {
    action = 'TRIM'; percentage = 30; reason = 'TARGET_ZONE_2'; message = '超额收益区间 (+20%)，建议分批兑现'; style = 'success';
  } else if (roi > 10 && Number(daysHeld) > 1) {
    action = 'TRIM'; percentage = 30; reason = 'TARGET_ZONE_1'; message = '目标位达成 (+10%)，首批止盈'; style = 'success';
  }
  return json({
    decision: { action, percentage, reason, message, style },
    metrics: { roi: roi.toFixed(2), maxRoi: maxRoi.toFixed(2), drawdown: drawdown.toFixed(2) },
  });
};

const retiredTradingState = () => json({
  error: 'Trading state is stored on the current device only',
}, 410);

const retiredPersonalFundState = () => json({
  error: 'Personal fund state is stored on the current device only',
}, 410);

/**
 * Handle the same-origin API surface used by the browser. Returning null lets
 * the worker continue with its static asset/Spa fallback for non-API paths.
 */
export const handleMarketApi = async (request: Request): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    });
  }

  try {
    switch (url.pathname) {
      case '/api/health':
        return json({ status: 'ok' });
      case '/api/data':
        return retiredTradingState();
      case '/api/user/funds':
      case '/api/user/fund-holdings':
        return retiredPersonalFundState();
      case '/api/market/themes':
        return request.method === 'GET' ? handleThemes(request) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/stocks':
        return request.method === 'GET' ? handleStocks(request, url) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/indices':
        return request.method === 'GET' ? handleIndices(request) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/search':
        return request.method === 'GET' ? handleStockSearch(url) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/fund-search':
        return request.method === 'GET' ? handleFundSearch(url) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/health':
        return request.method === 'GET' ? handleMarketHealth() : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/stats':
        return request.method === 'GET' ? handleMarketStats(url) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/ticks':
        return request.method === 'GET' ? handleTicks(request, url) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/funds':
        return request.method === 'GET' ? handleFunds(request, url) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/history':
        return request.method === 'GET' ? handleHistory(request, url) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/fund-history':
        return request.method === 'GET' ? handleFundHistory(request, url) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/analyze-linkage':
        return request.method === 'POST' ? handleLinkage(request) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/market/validate-signal':
        return request.method === 'POST' ? handleValidateSignal(request) : json({ error: 'Method Not Allowed' }, 405);
      case '/api/trade/harvest-protocol':
        return request.method === 'POST' ? handleHarvest(request) : json({ error: 'Method Not Allowed' }, 405);
      default:
        if (url.pathname.startsWith('/api/stock/ticks/')) {
          const code = url.pathname.slice('/api/stock/ticks/'.length);
          return request.method === 'GET'
            ? handleTicks(request, new URL(`/api/market/ticks?code=${encodeURIComponent(code)}`, url.origin))
            : json({ error: 'Method Not Allowed' }, 405);
        }
        return json({ error: 'Not Found' }, 404);
    }
  } catch (error) {
    if (requestAborted(request) || isAbort(error)) return noContent();
    console.error('[api] unhandled error', error);
    return json({ error: 'Internal Server Error', message: String((error as AnyRecord)?.message || error) }, 500);
  }
};
