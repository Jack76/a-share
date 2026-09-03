import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTrading } from "../../context/Store";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import {
  fetchFunds,
  fetchMarketIndices,
  fetchStockHistoryBatch,
  fetchFundHistoryBatch,
  fetchStockData,
  searchFundByKeyword,
  type FundSearchResult,
} from "../../services/marketData";
import { Fund } from "../../types";
import {
  calculateIndicators,
} from "../../utils/indicators";
import {
  evaluateFundDataFreshness,
  predictFundPriceAction,
  resolveFundBenchmark,
  type FundDataStatus,
  type FundTrendPrediction,
} from "../../utils/fundStrategy";
import {
  alignFundComparisonSeries,
  buildActualPortfolioCurve,
  type FundNavPoint,
} from "../../utils/fundPortfolio";
import { Skeleton } from "../ui/skeleton";
import {
  RefreshCw,
  Zap,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  Trash2,
  Target,
  BrainCircuit,
  Microscope,
  LayoutGrid,
  List,
  Wallet,
  ShoppingCart,
  Check,
  Briefcase,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Scale,
  AlertTriangle,
  Trophy,
  Activity,
  GitCompare,
  X,
  Download,
  Calculator,
  TrendingUp,
  Tag,
  Flame,
  Eye,
  LogOut,
  CalendarDays,
  Lightbulb,
  ArrowRightLeft,
  ShieldAlert,
  ChevronRight,
  HeartPulse,
  Gauge,
  ArrowUpFromLine,
  ArrowDownFromLine,
  Sparkles,
  RotateCcw,
  Filter,
  Search,
  Star,
  StarOff,
  ImageUp,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "../ui/utils";
import { motion, AnimatePresence } from "motion/react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { toast } from "sonner";

// ===================== DATA STRUCTURES =====================

type SmartPrediction = FundTrendPrediction;

interface InstitutionalTrace {
  inflowScore: number;
  divergence: boolean;
  elasticity: number;
}

interface ExtendedFund extends Fund {
  volatility: number;
  maxDrawdown: number;
  volumeRatio: number;
  rsi: number;
  mfi: number;
  atr: number;
  isEtf: boolean;
  historyData: FundNavPoint[];
  sourceAsOf?: string | number;
  dataStatus: FundDataStatus;
  dataAgeMs: number | null;
  benchmarkName?: string;
  halfYearChangePercent?: number;
  yearChangePercent?: number;
  quarterChangePercent?: number;
  trendData: { date: string; value: number }[];
  score: number;
  prediction: SmartPrediction;
  smartTrace: InstitutionalTrace;
  signal: {
    action: string;
    color: string;
    desc: string;
    tag: "Alpha" | "Beta" | "Danger" | "Sleep";
  };
  guidance: {
    title: string;
    action: "Buy" | "Sell" | "Hold" | "Wait";
    position: string;
    reason: string;
    riskLevel: "Low" | "Medium" | "High";
  };
  pressureLevel: number;
  supportLevel: number;
}

// V66.1: Transaction-based holdings
interface FundTransaction {
  id: string;
  type: "buy" | "sell";
  pricePerUnit: number;
  shares: number;
  date: string;
  note?: string;
}

interface FundHolding {
  id: string;
  code: string;
  name: string;
  costPerUnit: number;   // weighted avg cost
  shares: number;        // current net shares
  buyDate: string;       // first buy date
  transactions?: FundTransaction[];
  realizedPnL?: number;  // cumulative realized PnL from sells
  tag?: "core" | "watch" | "exit";  // V66.3: watchlist tag
}

interface MarketContext {
  marketChange: number;
  benchmarkAvailable: boolean;
  csi300Change: number;
  marketYtd: number;
  marketVolatility: number;
  trend: "Bull" | "Bear" | "Choppy";
  sectorPerformance: Record<string, number>;
}

interface IndexData {
  code: string;
  name: string;
  current: number;
  changePercent: number;
}

interface FundPageSessionCache {
  funds: ExtendedFund[];
  indices: IndexData[];
  lastRefresh: string;
}

// App tab changes unmount FundRadar. Preserve the last computed view for the
// current browser session so returning to the tab is instant while fresh data
// is loaded in the background.
let fundPageSessionCache: FundPageSessionCache | null = null;

// ===================== CONFIGURATION =====================

const FUND_CATEGORIES = [
  // ═══ 科技成长 ═══
  { name: "半导体/芯片", codes: ["512480", "159813", "512760", "017117", "012804", "019388", "004854"] },
  { name: "AI/算力", codes: ["159819", "515050", "512720", "012729", "011513", "014389", "019002"] },
  { name: "机器人/智造", codes: ["562500", "159770", "013853", "016006", "015540", "010061"] },
  { name: "通信/数据", codes: ["515880", "159522", "162605", "015216", "012760"] },
  { name: "算电协同", codes: ["159611", "159623", "516610", "159658", "562800", "017649", "015582"] },
  { name: "传媒/游戏", codes: ["159805", "516770", "012712", "012954", "004752"] },
  { name: "计算机/软件", codes: ["515230", "159998", "014130", "008974", "012580"] },
  // ═══ 新能源 ═══
  { name: "新能源车", codes: ["515030", "159806", "516390", "014320", "013328", "012574"] },
  { name: "光伏/风电", codes: ["516580", "159875", "515790", "012364", "013091", "014771"] },
  { name: "锂电/储能", codes: ["159840", "516460", "159566", "014856", "013178"] },
  // ═══ 大消费 ═══
  { name: "消费/食饮", codes: ["159928", "159867", "515170", "012365", "005063", "012778"] },
  { name: "白酒", codes: ["512690", "161725", "015802", "013171"] },
  { name: "医药/生物", codes: ["512010", "159992", "512290", "003096", "012695", "012230"] },
  { name: "医疗器械", codes: ["159883", "159898", "013400", "014070"] },
  // ═══ 大金融 ═══
  { name: "银行", codes: ["512800", "515280", "159887", "013302", "016090"] },
  { name: "券商/保险", codes: ["512880", "512070", "159842", "512950", "006098", "015880"] },
  { name: "红利/低波", codes: ["510880", "512890", "563020", "159905", "009052", "015693"] },
  // ═══ 周期资源 ═══
  { name: "黄金/贵金属", codes: ["518880", "159937", "159934", "001302", "018392"] },
  { name: "有色/资源", codes: ["510980", "159865", "512400", "004253", "015041"] },
  { name: "煤炭/钢铁", codes: ["515220", "516150", "168204", "008279"] },
  { name: "化工/材料", codes: ["516220", "159870", "516120"] },
  // ═══ 跨境 ═══
  { name: "美股/纳指", codes: ["513100", "513500", "159941", "017093", "012301", "006328", "015061"] },
  { name: "港股/恒科", codes: ["513060", "513130", "159740", "513330", "012348", "016252"] },
  { name: "日韩/亚太", codes: ["513520", "159866", "164824", "018712"] },
  // ═══ 宽基指数 ═══
  { name: "沪深300", codes: ["510300", "159919", "510310", "007339"] },
  { name: "中证500/1000", codes: ["510500", "159845", "512500", "560002", "015140"] },
  { name: "创业板/科创", codes: ["159915", "588000", "588050", "159688", "510050"] },
  { name: "微盘/量化", codes: ["159667", "560050", "014838", "014134", "009557", "019253"] },
  // ═══ 稳健 ═══
  { name: "债券/固收", codes: ["511260", "511010", "511220", "003003", "001753", "007364"] },
  // ═══ 行业主题 ═══
  { name: "军工/航天", codes: ["512660", "512810", "159516", "004224", "011609"] },
  { name: "房地产/基建", codes: ["512200", "159768", "516970", "008387"] },
  { name: "环保/碳交易", codes: ["516030", "159861", "512580", "012049", "011840"] },
  { name: "旅游/酒店", codes: ["159766", "159936", "001383", "004850"] },
  { name: "农业/畜牧", codes: ["159825", "516670", "012724"] },
  { name: "交运/物流", codes: ["159666", "516110", "001637", "012073"] },
  // ═══ 主动精选 ═══
  { name: "主动精选", codes: ["005394", "002939", "009776", "007119", "001500", "000411", "001938"] },
];

/**
 * V67.4: 基金名称→板块自动推断
 * 自选添加的基金不在 FUND_CATEGORIES.codes 精确列表中时，通过名称关键词匹配自动归类
 * 注意顺序：更具体的关键词必须在更宽泛的之前（如"医疗器械"先于"医药"，"白酒"先于"消费"）
 */
const CATEGORY_KEYWORD_MAP: [string[], string][] = [
  // 科技成长
  [["半导体", "芯片", "集成电路", "IC"], "半导体/芯片"],
  [["人工智能", "AI", "算力", "智能计算", "大数据", "大模型", "ChatGPT"], "AI/算力"],
  [["机器人", "智能制造", "智造", "先进制造", "自动化", "工业母机"], "机器人/智造"],
  [["通信", "5G", "数据中心", "云计算", "物联网"], "通信/数据"],
  [["算电", "电力算力", "数据中心电力", "AI电力", "算力电力", "UPS", "液冷"], "算电协同"],
  [["传媒", "游戏", "动漫", "影视", "网络游戏"], "传媒/游戏"],
  [["计算机", "软件", "信息技术", "互联网", "信创", "网络安全"], "计算机/软件"],
  // 新能源
  [["新能源车", "新能源汽车", "电动车", "智能汽车", "汽车"], "新能源车"],
  [["光伏", "风电", "太阳能", "风能", "清洁能源", "绿色电力"], "光伏/风电"],
  [["锂电", "储能", "电池", "锂"], "锂电/储能"],
  // 大消费（白酒/器械 在前，避免被宽泛的"消费""医药"吃掉）
  [["白酒", "酿酒"], "白酒"],
  [["医疗器械", "器械"], "医疗器械"],
  [["消费", "食品", "饮料", "食饮", "家电", "零售", "纺织服装"], "消费/食饮"],
  [["医药", "生物", "医疗", "创新药", "中药", "疫苗", "CXO"], "医药/生物"],
  // 大金融
  [["银行"], "银行"],
  [["券商", "证券", "保险", "非银金融", "非银"], "券商/保险"],
  [["红利", "低波", "高股息", "股息", "央企回报"], "红利/低波"],
  // 周期资源
  [["黄金", "贵金属"], "黄金/贵金属"],
  [["有色", "资源", "稀土", "矿业", "铜"], "有色/资源"],
  [["煤炭", "钢铁"], "煤炭/钢铁"],
  [["化工", "新材料", "材料"], "化工/材料"],
  // 跨境
  [["纳斯达克", "纳指", "纳100", "标普", "美股", "美国", "道琼斯"], "美股/纳指"],
  [["港股", "恒生", "恒指", "恒科", "香港", "中概互联"], "港股/恒科"],
  [["日经", "日本", "东证", "韩国", "亚太", "印度", "越南", "德国", "法国"], "日韩/亚太"],
  // 宽基指数
  [["沪深300", "沪深三百"], "沪深300"],
  [["中证500", "中证1000", "中证800"], "中证500/1000"],
  [["创业板", "科创50", "科创板"], "创业板/科创"],
  [["微盘", "量化", "小盘", "中小盘", "国证2000"], "微盘/量化"],
  // 稳健
  [["债券", "固收", "纯债", "利率", "信用债", "短债", "国债", "同业存单", "货币"], "债券/固收"],
  // 行业主题
  [["军工", "国防", "航天", "航空"], "军工/航天"],
  [["房地产", "基建", "地产", "REITs", "公用事业"], "房地产/基建"],
  [["环保", "碳中和", "碳交易", "绿色"], "环保/碳交易"],
  [["旅游", "酒店", "餐饮"], "旅游/酒店"],
  [["农业", "畜牧", "养殖", "猪", "种业"], "农业/畜牧"],
  [["交运", "物流", "交通运输", "航运"], "交运/物流"],
  // 主动精选（关键词宽泛，放最后兜底）
  [["阿尔法", "先锋", "绩优"], "主动精选"],
];

const inferCategoryFromKeywords = (text: string): string => {
  if (!text) return "";
  for (const [keywords, category] of CATEGORY_KEYWORD_MAP) {
    if (keywords.some(kw => text.includes(kw))) return category;
  }
  return "";
};

/**
 * V67.4: 基于基金代码的完整信息自动推断板块
 * 优先级：FUND_CATEGORIES精确匹配 > API fundType大类 > indexName关键词 > 基金名称关键词 > "其他"
 * @param name      基金名称（API返回）
 * @param fundType  基金类型，如 "指数型-股票", "QDII", "债券型-长债"（API返回）
 * @param indexName 跟踪指数名，如 "中证全指半导体芯片指数"（API返回，仅指数基金有）
 */
const inferCategory = (name: string, fundType?: string, indexName?: string): string => {
  // 1. QDII类基金 → 先用名称/指数推断具体跨境板块，无法细分则归"美股/纳指"兜底
  if (fundType && /QDII/i.test(fundType)) {
    const crossBorder = inferCategoryFromKeywords(name) || inferCategoryFromKeywords(indexName || "");
    if (crossBorder) return crossBorder;
    return "美股/纳指"; // QDII but no specific region keyword
  }
  // 2. 债券/货币类基金 → 直接归类
  if (fundType && /债券|货币/.test(fundType)) return "债券/固收";
  // 3. 跟踪指数名关键词匹配（指数基金最精确的板块信号）
  if (indexName) {
    const fromIndex = inferCategoryFromKeywords(indexName);
    if (fromIndex) return fromIndex;
  }
  // 4. 基金名称关键词匹配（覆盖主动型基金+指数增强等）
  const fromName = inferCategoryFromKeywords(name || "");
  if (fromName) return fromName;
  // 5. 兜底
  return "其他";
};

const WATCHED_INDICES = ["sh000001", "sh000300", "sh000905", "sh000852", "sz399006", "sh000688"];
const INDEX_NAMES: Record<string, string> = {
  "sh000001": "上证",
  "sh000300": "沪深300",
  "sh000905": "中证500",
  "sh000852": "中证1000",
  "sz399006": "创业板",
  "sh000688": "科创50",
};

const isTradeableETF = (code: string) => /^(5[167890]|159|16)/.test(code);

// ===================== HELPERS =====================

const formatDataAge = (ageMs: number | null) => {
  if (ageMs === null) return "时间未知";
  if (ageMs < 60_000) return "1分钟内";
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}分钟前`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}小时前`;
  return `${Math.floor(ageMs / 86_400_000)}天前`;
};

/** Recalculate weighted avg cost & net shares from transaction list */
const recalcHolding = (h: FundHolding): FundHolding => {
  if (!h.transactions || h.transactions.length === 0) return h;
  let totalShares = 0;
  let totalCost = 0;
  let realizedPnL = 0;
  let avgCost = h.costPerUnit;

  for (const tx of [...h.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const validShares = Number.isFinite(tx.shares) ? Math.max(0, tx.shares) : 0;
    const validPrice = Number.isFinite(tx.pricePerUnit) ? Math.max(0, tx.pricePerUnit) : 0;
    if (tx.type === "buy") {
      totalCost += validPrice * validShares;
      totalShares += validShares;
      avgCost = totalShares > 0 ? totalCost / totalShares : 0;
    } else {
      // sell: realize PnL at avg cost
      const sharesSold = Math.min(totalShares, validShares);
      const pnl = (validPrice - avgCost) * sharesSold;
      realizedPnL += pnl;
      totalShares -= sharesSold;
      totalCost = avgCost * totalShares;
    }
  }

  return { ...h, costPerUnit: avgCost, shares: Math.max(0, totalShares), realizedPnL };
};

/** Migrate old single-record holdings to transaction-based */
const migrateHolding = (h: FundHolding): FundHolding => {
  if (h.transactions && h.transactions.length > 0) return h;
  return {
    ...h,
    transactions: [{
      id: `tx_${h.id}_0`,
      type: "buy",
      pricePerUnit: h.costPerUnit,
      shares: h.shares,
      date: h.buyDate,
    }],
    realizedPnL: 0,
  };
};

// ===================== TAG SYSTEM (V66.3) =====================

const HOLDING_TAGS = [
  { key: "core" as const, label: "核心", icon: Flame, color: "text-red-600 bg-red-50 border-red-200" },
  { key: "watch" as const, label: "观察", icon: Eye, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { key: "exit" as const, label: "待清", icon: LogOut, color: "text-green-700 bg-green-50 border-green-200" },
] as const;

const TAG_MAP: Record<string, typeof HOLDING_TAGS[number]> = Object.fromEntries(HOLDING_TAGS.map(t => [t.key, t]));

const TagSelector: React.FC<{
  current?: "core" | "watch" | "exit";
  onChange: (tag: "core" | "watch" | "exit" | undefined) => void;
}> = ({ current, onChange }) => (
  <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
    {HOLDING_TAGS.map(t => {
      const Icon = t.icon;
      const isActive = current === t.key;
      return (
        <button key={t.key} title={t.label}
          onClick={() => onChange(isActive ? undefined : t.key)}
          className={cn("flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all",
            isActive ? t.color : "text-slate-300 bg-transparent border-transparent hover:text-slate-500"
          )}>
          <Icon className="w-2.5 h-2.5" />
          {isActive && <span>{t.label}</span>}
        </button>
      );
    })}
  </div>
);

// ===================== ALGORITHM CORE =====================

/** V66.6: Calculate max drawdown from peak to trough (recent 120 bars) */
const calcMaxDrawdown = (hist: { close: number }[]): number => {
  if (hist.length < 2) return 0;
  const segment = hist.slice(-120);
  let peak = segment[0].close;
  let maxDD = 0;
  for (let i = 1; i < segment.length; i++) {
    if (segment[i].close > peak) peak = segment[i].close;
    const dd = (peak - segment[i].close) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
};

/** V66.6: Smooth scoring — maps value to 0~maxPts via tanh curve (no step functions) */
const smoothScore = (val: number, center: number, scale: number, maxPts: number): number => {
  const x = (val - center) / scale;
  return maxPts * Math.tanh(x); // Returns -maxPts..+maxPts smoothly
};

const calculatePredatorScore = (fund: ExtendedFund, context: MarketContext, activeThemes: string[]): number => {
  let score = 50;
  const { estimateChangePercent: daily, halfYearChangePercent: trend, volatility, rsi, mfi, maxDrawdown } = fund;
  const { marketChange } = context;
  const alpha = daily - marketChange;

  // --- 1. Alpha (excess daily return vs market) — smooth curve ---
  if (context.benchmarkAvailable && fund.isEtf) {
    score += smoothScore(alpha, 0, 1.5, 15); // ±3% alpha → ±15pts
  } else if (context.benchmarkAvailable) {
    score += smoothScore(alpha, 0, 2, 8); // ±4% alpha → ±8pts
    if ((fund.yearChangePercent || 0) > 10) score += 5;
    if ((fund.quarterChangePercent || 0) > 5) score += 3;
  }

  // --- 2. Medium-term trend — gradual curve replaces +20/-20 step ---
  score += smoothScore(trend || 0, 0, 15, 15); // ±20% → ±~13pts

  // --- 3. Volume dynamics (ETF only) ---
  if (fund.isEtf) {
    const vr = fund.volumeRatio;
    if (vr > 1.5 && daily > 0) score += Math.min(12, (vr - 1) * 8);
    if (vr > 1.5 && daily < -1) score -= Math.min(12, (vr - 1) * 8);
    if (vr < 0.6 && daily < 0) score += 4; // Low-vol dip = weak selling
  }

  // --- 4. RSI momentum (V66.6: was calculated but unused) ---
  if (rsi < 25) score += 8;
  else if (rsi < 35) score += 4;
  else if (rsi > 80) score -= 10;
  else if (rsi > 70) score -= 5;

  // --- 5. MFI money flow (V66.6: was calculated but unused) ---
  if (mfi > 70) score += 6;
  else if (mfi < 30) score -= 6;

  // --- 6. Max drawdown risk (V66.6: was always 0) ---
  if (maxDrawdown > 10) {
    score -= Math.min(8, smoothScore(maxDrawdown, 10, 20, 8));
  }

  // --- 7. Theme momentum ---
  const isActiveTheme = activeThemes.some(t => fund.name.includes(t) || fund.category.includes(t));
  if (isActiveTheme) { score += 12; if (daily > 0) score += 4; }

  // --- 8. High-vol crash penalty ---
  if (volatility > 4 && daily < -3) score -= 10;

  return Math.min(100, Math.max(0, score));
};

/**
 * V66.6: Upgraded strategy generation — 7 distinct signals (was 5):
 *  止损 / 警戒 / 止盈 / 减仓 / 主升浪 / 黄金坑 / 加仓 / 持仓 / 观望
 *  Priority: sell signals first (protect capital), then buy signals, then hold/wait
 */
const generatePredatorStrategy = (fund: ExtendedFund, score: number): { signal: ExtendedFund["signal"]; guidance: ExtendedFund["guidance"] } => {
  const { prediction, estimateChangePercent: daily, rsi, mfi, isEtf, maxDrawdown, volatility } = fund;
  let signal: ExtendedFund["signal"] = { action: "观望", color: "text-slate-500", desc: "多空平衡", tag: "Sleep" };
  let guidance: ExtendedFund["guidance"] = { title: "保持观望", action: "Wait", position: "0%", reason: "趋势不明朗，建议等待方向确认。", riskLevel: "Low" };
  const isOtcChasing = !isEtf && daily > 3.0; // V66.6: Relaxed from 2.5→3.0

  if (fund.dataStatus !== "FRESH") {
    signal = { action: "观望", color: "text-slate-500", desc: "数据过期或缺失", tag: "Sleep" };
    guidance = {
      title: "等待数据更新",
      action: "Wait",
      position: "不新增仓位",
      reason: fund.dataStatus === "STALE"
        ? "当前基金行情已过期，暂停生成交易建议。"
        : "无法确认行情数据时间，暂停生成交易建议。",
      riskLevel: "High",
    };
    return { signal, guidance };
  }

  // ==== SELL SIGNALS (highest priority — protect capital first) ====

  // 止损: Score critically low
  if (score < 25) {
    signal = { action: "止损", color: "text-green-700", desc: "趋势破位，建议赎回", tag: "Danger" };
    guidance = { title: "紧急撤离", action: "Sell", position: "清仓 0%", reason: isEtf ? "趋势完全破坏，支撑失效，立即止损。" : `长期趋势走坏 (Score ${score.toFixed(0)})，不接飞刀。`, riskLevel: "High" };
    return { signal, guidance };
  }

  // 止盈: Severely overbought
  if (rsi > 88 || (isEtf && daily > 6) || (!isEtf && daily > 4 && rsi > 80)) {
    signal = { action: "止盈", color: "text-orange-600", desc: "严重过热，立即兑现", tag: "Danger" };
    const reason = rsi > 88
      ? `RSI ${rsi.toFixed(0)} 处于极端高位，短期回撤风险显著上升。`
      : `单日涨幅 ${daily.toFixed(2)}% 超过过热阈值，价格波动风险上升；该判断不等同于 RSI 超买。`;
    guidance = { title: "止盈预警", action: "Sell", position: "减至 20%", reason, riskLevel: "High" };
    return { signal, guidance };
  }

  // V66.6 减仓: Moderately overbought — new intermediate sell signal
  if (rsi > 75 || (isEtf && daily > 4) || (!isEtf && daily > 3 && rsi > 68)) {
    signal = { action: "减仓", color: "text-amber-600", desc: "情绪偏热，分批减仓", tag: "Beta" };
    const riskNote = maxDrawdown > 25 ? `（历史最大回撤${maxDrawdown.toFixed(0)}%，注意风控）` : "";
    const reason = rsi > 75
      ? `RSI ${rsi.toFixed(0)} 进入高位区，可分批锁定利润。${riskNote}`
      : `单日涨幅 ${daily.toFixed(2)}% 超过减仓阈值，建议分批止盈；当前 RSI ${rsi.toFixed(0)} 并未构成高位依据。${riskNote}`;
    guidance = { title: "分批止盈", action: "Sell", position: "减至 50%", reason, riskLevel: "Medium" };
    return { signal, guidance };
  }

  // V66.6 警戒: Score trending toward danger + bearish direction
  if (score < 35 && prediction.direction === "Bear") {
    signal = { action: "警戒", color: "text-orange-500", desc: "趋势走弱，注意止损", tag: "Danger" };
    guidance = { title: "设好止损", action: "Sell", position: "减至 30%", reason: `Score ${score.toFixed(0)} 趋近危险区，趋势偏空。先减至底仓，跌破支撑 ${fund.supportLevel.toFixed(isEtf ? 3 : 4)} 清仓。`, riskLevel: "High" };
    return { signal, guidance };
  }

  // ==== BUY SIGNALS ====

  if (prediction.evidenceReliability === "LOW") {
    signal = { action: "观望", color: "text-slate-500", desc: "滚动验证证据不足", tag: "Sleep" };
    guidance = {
      title: "等待验证",
      action: "Wait",
      position: "不新增仓位",
      reason: `当前仅有 ${prediction.sampleSize} 个滚动验证样本，不足以支持买入建议。`,
      riskLevel: "Medium",
    };
    return { signal, guidance };
  }

  // 主升浪: Strong score + bullish trend
  if (score > 78 && prediction.direction === "Bull" && !isOtcChasing) {
    signal = { action: "趋势增强", color: "text-red-600", desc: "趋势稳健，仍需跟踪", tag: "Alpha" };
    const mfiNote = mfi > 70 ? "资金持续流入，" : "";
    guidance = { title: "趋势配置", action: "Buy", position: "60% → 80%", reason: isEtf ? `${mfiNote}滚动趋势指标向上，但不代表未来收益确定；建议分批并设置退出条件。` : `${mfiNote}长期趋势向好且未过热。建议在 14:50 前确认申购。`, riskLevel: "Medium" };
    return { signal, guidance };
  }

  // V67.2: Adaptive dip thresholds — type × trend × volatility
  // 悲观风控: Bear demands deeper dips; high-vol needs bigger pullbacks to filter noise
  const trend = prediction.direction;
  const trendMul = trend === "Bear" ? 2.5 : trend === "Bull" ? 1.0 : 1.5;
  const volScale = volatility > 3 ? 1.3 : volatility > 2 ? 1.15 : 1.0;
  //                      Bull/low-vol → Bear/high-vol
  // ETF  addThresh:      -0.30  →  -0.98
  // OTC  addThresh:      -0.15  →  -0.49
  // ETF  pitThresh:      -0.80  →  -2.08
  // OTC  pitThresh:      -0.50  →  -1.30
  const addThreshold = (isEtf ? -0.3 : -0.15) * trendMul * volScale;
  const pitThreshold = (isEtf ? -0.8 : -0.5) * trendMul * volScale;
  const addScoreBar = trend === "Bear" ? 68 : 60;
  const pitScoreBar = trend === "Bear" ? 62 : 55;

  // 黄金坑: Strong fund + deep pullback + RSI oversold
  if (score > pitScoreBar && daily < pitThreshold && rsi < 45) {
    signal = { action: "深度回调", color: "text-purple-600", desc: "回调达到观察阈值", tag: "Beta" };
    const ddNote = maxDrawdown > 20 ? ` 注意: 历史回撤${maxDrawdown.toFixed(0)}%，控制仓位。` : "";
    const trendTag = trend === "Bear" ? "（逆势）" : "";
    guidance = { title: `逆势布局${trendTag}`, action: "Buy", position: trend === "Bear" ? "20% → 35%" : "30% → 50%", reason: isEtf ? `回调 ${daily.toFixed(2)}%（阈值${pitThreshold.toFixed(2)}%），RSI ${rsi.toFixed(0)} 低位区。${ddNote}` : `净值回调 ${Math.abs(daily).toFixed(2)}%，RSI ${rsi.toFixed(0)}，适合"大跌大买"。${ddNote}`, riskLevel: trend === "Bear" ? "Medium" : "Low" };
    return { signal, guidance };
  }

  // 加仓: Decent score + meaningful dip + RSI neutral-low
  if (score > addScoreBar && daily < addThreshold && rsi < 55 && rsi > 30) {
    signal = { action: "加仓", color: "text-blue-600", desc: "温和回调，可加仓", tag: "Beta" };
    const volNote = volatility > 3 ? "（波动较大，分2-3笔买入）" : "";
    const trendNote = trend === "Bear" ? "（逆势需谨慎）" : "";
    guidance = { title: isEtf ? "低吸加仓" : "定投加仓", action: "Buy", position: trend === "Bear" ? "加至 30%~40%" : "加至 40%~60%", reason: isEtf ? `回调 ${daily.toFixed(2)}%（阈值${addThreshold.toFixed(2)}%），RSI ${rsi.toFixed(0)} 中性偏低。${volNote}${trendNote}` : `净值回调 ${daily.toFixed(2)}%，Score ${score.toFixed(0)} 偏强，适合追加。${volNote}${trendNote}`, riskLevel: trend === "Bear" ? "Medium" : "Low" };
    return { signal, guidance };
  }

  // ==== HOLD / DEFAULT ====
  signal = { action: "持仓", color: "text-blue-600", desc: "底仓观察，定投积累", tag: "Beta" };
  const holdExtra = rsi > 60 ? " RSI偏高不宜追涨。" : rsi < 40 ? " RSI偏低可小额买入。" : "";
  guidance = { title: isEtf ? "网格交易" : "定投积攒", action: "Hold", position: "保持 30%", reason: (isEtf ? `震荡区间 ${prediction.targetLow.toFixed(3)} - ${prediction.targetHigh.toFixed(3)}，适合高抛低吸。` : "震荡磨底期，建议开启周定投。") + holdExtra, riskLevel: "Low" };
  return { signal, guidance };
};

// ===================== SUB-COMPONENTS =====================

const PortfolioAllocationDonut = React.lazy(() => import("./FundCharts").then(module => ({ default: module.PortfolioAllocationDonut })));
const PortfolioEquityChart = React.lazy(() => import("./FundCharts").then(module => ({ default: module.PortfolioEquityChart })));
const FundComparisonChart = React.lazy(() => import("./FundCharts").then(module => ({ default: module.FundComparisonChart })));

const MiniTrendChart = React.memo(({ data, isPositive, height = 48 }: { data: { date: string; value: number }[]; isPositive: boolean; height?: number }) => {
  const id = React.useId().replace(/:/g, "");
  if (!data || data.length < 3) return null;
  const color = isPositive ? "#ef4444" : "#22c55e";
  const values = data.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.001);
  const points = data.map((point, index) => {
    const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
    const y = 2 + ((max - point.value) / range) * (height - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const areaPath = `M 0 ${height} L ${points.join(" L ")} L 100 ${height} Z`;
  const linePath = `M ${points.join(" L ")}`;
  return (
    <div style={{ height }} className="w-full" aria-hidden="true">
      <svg viewBox={`0 0 100 ${height}`} width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.15} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${id})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}, (p, n) => p.isPositive === n.isPositive && p.data?.length === n.data?.length && p.height === n.height);

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];

// ===================== MARKET STRIP =====================

const MarketStrip: React.FC<{ indices: IndexData[]; loading: boolean }> = React.memo(({ indices, loading }) => {
  if (loading) return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-100 min-w-[140px]">
          <Skeleton className="h-4 w-12" /><Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
  if (indices.length === 0) return null;
  return (
    <div
      className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 pr-10 scrollbar-none"
      role="region"
      aria-label="主要指数，横向滚动查看更多"
      tabIndex={0}
    >
      {indices.map(idx => {
        const isUp = idx.changePercent > 0;
        const isDown = idx.changePercent < 0;
        return (
          <div key={idx.code} className={cn(
            "flex min-w-[142px] snap-start items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors sm:min-w-[150px] sm:gap-2.5 sm:px-3",
            isUp ? "bg-red-50/60 border-red-100" : isDown ? "bg-green-50/60 border-green-100" : "bg-slate-50 border-slate-100"
          )}>
            <div className="text-xs font-bold text-slate-500 whitespace-nowrap">
              {INDEX_NAMES[idx.code] || idx.name}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-mono text-slate-600">{idx.current.toFixed(2)}</span>
              <span className={cn("text-xs font-black tabular-nums", isUp ? "text-red-600" : isDown ? "text-green-600" : "text-slate-400")}>
                {isUp ? "+" : ""}{idx.changePercent.toFixed(2)}%
              </span>
            </div>
            {isUp ? <ArrowUpRight className="w-3.5 h-3.5 text-red-400 shrink-0" /> : isDown ? <ArrowDownRight className="w-3.5 h-3.5 text-green-400 shrink-0" /> : null}
          </div>
        );
      })}
    </div>
  );
});

// ===================== PORTFOLIO SECTION (V66.1) =====================

const PortfolioSummary: React.FC<{
  holdings: FundHolding[];
  fundMap: Map<string, ExtendedFund>;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onAddTx: (holding: FundHolding, type: "buy" | "sell") => void;
  onViewTx: (holding: FundHolding) => void;
  onTagChange: (holdingId: string, tag: "core" | "watch" | "exit" | undefined) => void;
  tagFilter: string;
  onTagFilterChange: (f: string) => void;
  onSelectHolding: (holding: FundHolding) => void;
}> = ({ holdings, fundMap, onAdd, onRemove, onAddTx, onViewTx, onTagChange, tagFilter, onTagFilterChange, onSelectHolding }) => {
  type HoldingSortKey = "name" | "cost" | "value" | "pnl" | "pnlPct" | "today";
  const [holdingSort, setHoldingSort] = useState<HoldingSortKey>("pnlPct");
  const [holdingSortAsc, setHoldingSortAsc] = useState(false);

  const toggleHoldingSort = (key: HoldingSortKey) => {
    if (holdingSort === key) setHoldingSortAsc(!holdingSortAsc);
    else { setHoldingSort(key); setHoldingSortAsc(false); }
  };

  const portfolioStats = useMemo(() => {
    let totalCost = 0, totalCurrent = 0, todayPnL = 0, totalRealized = 0;
    const categoryAllocation: Record<string, number> = {};
    holdings.forEach(h => {
      const fund = fundMap.get(h.code);
      const currentNav = fund?.estimateNetValue || h.costPerUnit;
      const holdingCost = h.costPerUnit * h.shares;
      const holdingCurrent = currentNav * h.shares;
      const dailyChange = fund?.estimateChangePercent || 0;
      totalCost += holdingCost;
      totalCurrent += holdingCurrent;
      todayPnL += holdingCurrent * (dailyChange / 100);
      totalRealized += h.realizedPnL || 0;
      const cat = fund?.category || "其他";
      categoryAllocation[cat] = (categoryAllocation[cat] || 0) + holdingCurrent;
    });
    const unrealizedPnL = totalCurrent - totalCost;
    const totalPnL = unrealizedPnL + totalRealized;
    const totalPnLPct = totalCost > 0 ? (unrealizedPnL / totalCost) * 100 : 0;
    const todayPnLPct = totalCurrent > 0 ? (todayPnL / totalCurrent) * 100 : 0;
    const pieData = Object.entries(categoryAllocation).map(([name, value]) => ({ name, value: +value.toFixed(2) })).sort((a, b) => b.value - a.value);
    return { totalCost, totalCurrent, unrealizedPnL, totalRealized, totalPnL, totalPnLPct, todayPnL, todayPnLPct, pieData };
  }, [holdings, fundMap]);

  // V66.3: Must be before any early return (React hooks rule)
  const filteredHoldings = useMemo(() => {
    if (tagFilter === "all") return holdings;
    if (tagFilter === "untagged") return holdings.filter(h => !h.tag);
    return holdings.filter(h => h.tag === tagFilter);
  }, [holdings, tagFilter]);

  // V66.4: Sorted holdings
  const sortedHoldings = useMemo(() => {
    const withMetrics = filteredHoldings.map(h => {
      const fund = fundMap.get(h.code);
      const nav = fund?.estimateNetValue || h.costPerUnit;
      const val = nav * h.shares;
      const cost = h.costPerUnit * h.shares;
      const pnl = val - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      const todayPnl = val * ((fund?.estimateChangePercent || 0) / 100);
      return { holding: h, fund, val, cost, pnl, pnlPct, todayPnl, nav };
    });
    const mult = holdingSortAsc ? 1 : -1;
    withMetrics.sort((a, b) => {
      switch (holdingSort) {
        case "name": return mult * (a.fund?.name || a.holding.code).localeCompare(b.fund?.name || b.holding.code);
        case "cost": return mult * (a.cost - b.cost);
        case "value": return mult * (a.val - b.val);
        case "pnl": return mult * (a.pnl - b.pnl);
        case "pnlPct": return mult * (a.pnlPct - b.pnlPct);
        case "today": return mult * (a.todayPnl - b.todayPnl);
        default: return 0;
      }
    });
    return withMetrics;
  }, [filteredHoldings, fundMap, holdingSort, holdingSortAsc]);

  if (holdings.length === 0) {
    return (
      <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <Wallet className="w-12 h-12 text-slate-300" />
          <p className="text-sm text-slate-400 font-medium">尚未添加持仓记录</p>
          <p className="text-xs text-slate-300">添加持仓后可自动追踪盈亏、管理交易记录</p>
          <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5 mt-2">
            <Plus className="w-3.5 h-3.5" /> 添加首笔持仓
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { totalCost, totalCurrent, unrealizedPnL, totalRealized, totalPnL, totalPnLPct, todayPnL, todayPnLPct, pieData } = portfolioStats;

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="bg-white"><CardContent className="p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">总市值</div>
          <div className="text-lg font-black tabular-nums text-slate-900">¥{totalCurrent.toFixed(2)}</div>
          <div className="text-[10px] text-slate-400">成本 ¥{totalCost.toFixed(2)}</div>
        </CardContent></Card>
        <Card className="bg-white"><CardContent className="p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">浮动盈亏</div>
          <div className={cn("text-lg font-black tabular-nums", unrealizedPnL >= 0 ? "text-red-600" : "text-green-600")}>
            {unrealizedPnL >= 0 ? "+" : ""}{unrealizedPnL.toFixed(2)}
          </div>
          <div className={cn("text-xs font-bold", totalPnLPct >= 0 ? "text-red-500" : "text-green-500")}>
            {totalPnLPct >= 0 ? "+" : ""}{totalPnLPct.toFixed(2)}%
          </div>
        </CardContent></Card>
        <Card className="bg-white"><CardContent className="p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">已实现盈亏</div>
          <div className={cn("text-lg font-black tabular-nums", totalRealized >= 0 ? "text-red-600" : "text-green-600")}>
            {totalRealized >= 0 ? "+" : ""}{totalRealized.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400">卖出兑现收益</div>
        </CardContent></Card>
        <Card className="bg-white"><CardContent className="p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">今日盈亏</div>
          <div className={cn("text-lg font-black tabular-nums", todayPnL >= 0 ? "text-red-600" : "text-green-600")}>
            {todayPnL >= 0 ? "+" : ""}{todayPnL.toFixed(2)}
          </div>
          <div className={cn("text-xs font-bold", todayPnLPct >= 0 ? "text-red-500" : "text-green-500")}>
            {todayPnLPct >= 0 ? "+" : ""}{todayPnLPct.toFixed(2)}%
          </div>
        </CardContent></Card>
        <Card className="bg-white"><CardContent className="p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">板块分布</div>
          <div className="flex items-center gap-2">
            {pieData.length > 0 ? (
              <div className="h-12 w-12 shrink-0">
                <React.Suspense fallback={<Skeleton className="size-12 rounded-full" />}>
                  <PortfolioAllocationDonut data={pieData} colors={PIE_COLORS} />
                </React.Suspense>
              </div>
            ) : null}
            <div className="flex flex-col gap-0.5 overflow-hidden">
              {pieData.slice(0, 3).map((d, i) => (
                <div key={d.name} className="flex items-center gap-1 text-[9px]">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-slate-500 truncate">{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent></Card>
      </div>

      {/* V66.3: Tag Filter Bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Tag className="w-3 h-3 text-slate-400" />
        {[
          { key: "all", label: "全部", count: holdings.length },
          ...HOLDING_TAGS.map(t => ({ key: t.key, label: t.label, count: holdings.filter(h => h.tag === t.key).length })),
          { key: "untagged", label: "未分类", count: holdings.filter(h => !h.tag).length },
        ].map(f => (
          <button key={f.key} onClick={() => onTagFilterChange(f.key === tagFilter ? "all" : f.key)}
            aria-pressed={tagFilter === f.key}
            className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors",
              tagFilter === f.key ? "bg-slate-800 text-white border-slate-800" : "text-slate-400 border-slate-200 hover:text-slate-600"
            )}>
            {f.label} {f.count > 0 && <span className="ml-0.5 opacity-60">{f.count}</span>}
          </button>
        ))}
      </div>

      {/* Holdings: Desktop Table */}
      <Card className="bg-white overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {([
                  { key: "name" as HoldingSortKey, label: "基金", align: "text-left pl-4" },
                  { key: "cost" as HoldingSortKey, label: "成本", align: "text-right" },
                  { key: null, label: "现价", align: "text-right" },
                  { key: null, label: "份额", align: "text-right" },
                  { key: "value" as HoldingSortKey | null, label: "市值", align: "text-right" },
                  { key: "pnlPct" as HoldingSortKey | null, label: "浮动盈亏", align: "text-right" },
                  { key: "today" as HoldingSortKey | null, label: "今日", align: "text-right" },
                  { key: null, label: "标签", align: "text-center" },
                  { key: null, label: "操作", align: "text-right pr-4" },
                ] as { key: HoldingSortKey | null; label: string; align: string }[]).map(col => (
                  <th key={col.label} className={cn("p-3 select-none", col.align)}>
                    {col.key ? (
                      <button
                        className="inline-flex items-center gap-0.5 transition-colors hover:text-slate-600"
                        onClick={() => toggleHoldingSort(col.key!)}
                        aria-label={`按${col.label}${holdingSort === col.key && holdingSortAsc ? "降序" : "升序"}排列`}
                      >
                        {col.label}
                        {holdingSort === col.key && (
                          holdingSortAsc ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />
                        )}
                      </button>
                    ) : col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map(({ holding: h, fund, val: holdingValue, cost: holdingCost, pnl, pnlPct, todayPnl: todayPnlItem, nav: currentNav }) => {
                const dailyChange = fund?.estimateChangePercent || 0;
                const txCount = h.transactions?.length || 0;

                return (
                  <tr key={h.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => onSelectHolding(h)}>
                    <td className="p-3 pl-4">
                      <div className="flex items-center gap-1.5">
                        <Microscope className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 transition-colors shrink-0" />
                        <span className="font-bold text-slate-800 truncate max-w-[160px] group-hover:text-blue-600 transition-colors">{fund?.name || h.name || h.code}</span>
                        {h.tag && TAG_MAP[h.tag] && (() => { const t = TAG_MAP[h.tag!]; const Icon = t.icon; return <span className={cn("inline-flex items-center gap-0.5 text-[8px] font-bold px-1 py-0 rounded border", t.color)}><Icon className="w-2 h-2" />{t.label}</span>; })()}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-400 font-mono ml-5">{h.code}</span>
                        {txCount > 1 && <Badge variant="secondary" className="text-[8px] h-3.5 px-1">{txCount}笔</Badge>}
                        {(h.realizedPnL || 0) !== 0 && (
                          <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1", (h.realizedPnL || 0) >= 0 ? "text-red-500 border-red-200" : "text-green-500 border-green-200")}>
                            已实现 {(h.realizedPnL || 0) >= 0 ? "+" : ""}{(h.realizedPnL || 0).toFixed(2)}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="text-right p-3 font-mono text-xs text-slate-600">{h.costPerUnit.toFixed(4)}</td>
                    <td className="text-right p-3">
                      <span className={cn("font-mono text-xs font-bold", dailyChange > 0 ? "text-red-600" : dailyChange < 0 ? "text-green-600" : "text-slate-600")}>
                        {currentNav.toFixed(4)}
                      </span>
                    </td>
                    <td className="text-right p-3 font-mono text-xs text-slate-600">{h.shares.toFixed(2)}</td>
                    <td className="text-right p-3 font-mono text-xs font-bold text-slate-800">¥{holdingValue.toFixed(2)}</td>
                    <td className="text-right p-3">
                      <div className={cn("font-mono text-xs font-bold", pnl >= 0 ? "text-red-600" : "text-green-600")}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                      </div>
                      <div className={cn("text-[10px]", pnlPct >= 0 ? "text-red-400" : "text-green-400")}>
                        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                      </div>
                    </td>
                    <td className="text-right p-3">
                      <span className={cn("font-mono text-xs font-bold", todayPnlItem >= 0 ? "text-red-500" : "text-green-500")}>
                        {todayPnlItem >= 0 ? "+" : ""}{todayPnlItem.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-center p-3" onClick={e => e.stopPropagation()}>
                      <TagSelector current={h.tag} onChange={tag => onTagChange(h.id, tag)} />
                    </td>
                    <td className="text-right p-3 pr-4">
                      <div className="flex justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500" title="加仓" aria-label={`加仓 ${fund?.name || h.name || h.code}`} onClick={() => onAddTx(h, "buy")}>
                          <Plus className="w-3 h-3" />
                        </Button>
                        {h.shares > 0 && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-green-500" title="减仓" aria-label={`减仓 ${fund?.name || h.name || h.code}`} onClick={() => onAddTx(h, "sell")}>
                            <Minus className="w-3 h-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-500" title="交易记录" aria-label={`查看 ${fund?.name || h.name || h.code} 的交易记录`} onClick={() => onViewTx(h)}>
                          <History className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500" title="删除" aria-label={`删除持仓 ${fund?.name || h.name || h.code}`} onClick={() => onRemove(h.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Holdings: Mobile Cards */}
      <div className="md:hidden space-y-3">
        {/* Mobile sort pill */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <Gauge className="w-3 h-3 text-slate-400 shrink-0" />
          {([
            { key: "pnlPct" as HoldingSortKey, label: "盈亏%" },
            { key: "value" as HoldingSortKey, label: "市值" },
            { key: "today" as HoldingSortKey, label: "今日" },
            { key: "name" as HoldingSortKey, label: "名称" },
          ]).map(s => (
            <button key={s.key} onClick={() => toggleHoldingSort(s.key)}
              aria-pressed={holdingSort === s.key}
              className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap transition-colors",
                holdingSort === s.key ? "bg-slate-800 text-white border-slate-800" : "text-slate-400 border-slate-200"
              )}>
              {s.label}{holdingSort === s.key && (holdingSortAsc ? "↑" : "↓")}
            </button>
          ))}
        </div>
        {sortedHoldings.map(({ holding: h, fund, val: holdingValue, pnl, pnlPct }) => {
          const currentNav = fund?.estimateNetValue || h.costPerUnit;
          const dailyChange = fund?.estimateChangePercent || 0;

          return (
            <Card key={h.id} className="bg-white p-3.5 cursor-pointer active:bg-slate-50 transition-colors" onClick={() => onSelectHolding(h)}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-800">{fund?.name || h.name || h.code}</span>
                    {h.tag && TAG_MAP[h.tag] && (() => { const t = TAG_MAP[h.tag!]; const Icon = t.icon; return <span className={cn("inline-flex items-center gap-0.5 text-[8px] font-bold px-1 py-0 rounded border", t.color)}><Icon className="w-2 h-2" />{t.label}</span>; })()}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{h.code}</span>
                </div>
                <div className="text-right">
                  <div className={cn("text-sm font-black tabular-nums", pnl >= 0 ? "text-red-600" : "text-green-600")}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                  </div>
                  <div className={cn("text-[10px] font-bold", pnlPct >= 0 ? "text-red-400" : "text-green-400")}>
                    {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-[10px] mb-2">
                <div><div className="text-slate-400">成本</div><div className="font-mono font-bold text-slate-600">{h.costPerUnit.toFixed(4)}</div></div>
                <div><div className="text-slate-400">现价</div><div className={cn("font-mono font-bold", dailyChange > 0 ? "text-red-600" : "text-green-600")}>{currentNav.toFixed(4)}</div></div>
                <div><div className="text-slate-400">份额</div><div className="font-mono font-bold text-slate-600">{h.shares.toFixed(0)}</div></div>
                <div><div className="text-slate-400">市值</div><div className="font-mono font-bold text-slate-800">¥{holdingValue.toFixed(0)}</div></div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-50 pt-2" onClick={e => e.stopPropagation()}>
                <TagSelector current={h.tag} onChange={tag => onTagChange(h.id, tag)} />
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-red-500 px-2" onClick={() => onAddTx(h, "buy")}><Plus className="w-3 h-3 mr-0.5" />加仓</Button>
                  {h.shares > 0 && <Button variant="ghost" size="sm" className="h-6 text-[10px] text-green-500 px-2" onClick={() => onAddTx(h, "sell")}><Minus className="w-3 h-3 mr-0.5" />减仓</Button>}
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-blue-500 px-2" onClick={() => onViewTx(h)}><History className="w-3 h-3 mr-0.5" />记录</Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" aria-label={`删除持仓 ${fund?.name || h.name || h.code}`} onClick={() => onRemove(h.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ===================== PORTFOLIO INSIGHTS =====================

const PortfolioInsights: React.FC<{
  holdings: FundHolding[];
  fundMap: Map<string, ExtendedFund>;
}> = React.memo(({ holdings, fundMap }) => {
  const insights = useMemo(() => {
    if (holdings.length === 0) return null;

    const holdingMetrics = holdings.map(h => {
      const fund = fundMap.get(h.code);
      const currentNav = fund?.estimateNetValue || h.costPerUnit;
      const holdingValue = currentNav * h.shares;
      const holdingCost = h.costPerUnit * h.shares;
      const pnl = holdingValue - holdingCost;
      const pnlPct = holdingCost > 0 ? (pnl / holdingCost) * 100 : 0;
      const dailyPnl = holdingValue * ((fund?.estimateChangePercent || 0) / 100);
      return { ...h, fund, holdingValue, holdingCost, pnl, pnlPct, dailyPnl };
    });

    // Win rate
    const winners = holdingMetrics.filter(h => h.pnl > 0).length;
    const winRate = holdings.length > 0 ? (winners / holdings.length) * 100 : 0;

    // Best/worst by total PnL%
    const sorted = [...holdingMetrics].sort((a, b) => b.pnlPct - a.pnlPct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Best/worst today
    const sortedToday = [...holdingMetrics].sort((a, b) => b.dailyPnl - a.dailyPnl);
    const bestToday = sortedToday[0];
    const worstToday = sortedToday[sortedToday.length - 1];

    // Concentration
    const totalValue = holdingMetrics.reduce((s, h) => s + h.holdingValue, 0);
    const maxPct = totalValue > 0 ? (Math.max(...holdingMetrics.map(h => h.holdingValue)) / totalValue) * 100 : 0;
    const maxHolding = holdingMetrics.reduce((a, b) => a.holdingValue > b.holdingValue ? a : b);

    // Signal distribution
    const signalDist: Record<string, number> = { Alpha: 0, Beta: 0, Danger: 0, Sleep: 0 };
    holdingMetrics.forEach(h => { if (h.fund?.signal?.tag) signalDist[h.fund.signal.tag]++; });

    // Avg holding period
    const now = Date.now();
    const avgDays = holdingMetrics.reduce((s, h) => {
      const firstDate = h.transactions?.[0]?.date || h.buyDate;
      return s + (now - new Date(firstDate).getTime()) / 86400000;
    }, 0) / holdings.length;

    return { winRate, best, worst, bestToday, worstToday, maxPct, maxHolding, signalDist, avgDays, totalValue };
  }, [holdings, fundMap]);

  if (!insights) return null;
  const { winRate, best, worst, bestToday, worstToday, maxPct, maxHolding, signalDist, avgDays } = insights;

  const signalColors: Record<string, string> = { Alpha: "bg-red-500", Beta: "bg-blue-500", Danger: "bg-orange-500", Sleep: "bg-slate-300" };
  const signalTotal = (Object.values(signalDist) as number[]).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <Activity className="w-3.5 h-3.5" /> 持仓诊断
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Win Rate */}
        <Card className="bg-white"><CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">胜率</span>
          </div>
          <div className="text-xl font-black tabular-nums text-slate-800">{winRate.toFixed(0)}%</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            盈利 {holdings.filter((_, i) => {
              const fund = fundMap.get(holdings[i].code);
              const nav = fund?.estimateNetValue || holdings[i].costPerUnit;
              return (nav * holdings[i].shares) > (holdings[i].costPerUnit * holdings[i].shares);
            }).length} / 持仓 {holdings.length}
          </div>
        </CardContent></Card>

        {/* Concentration */}
        <Card className={cn("bg-white", maxPct > 50 && "border-orange-200")}><CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            {maxPct > 50 ? <AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> : <Scale className="w-3.5 h-3.5 text-blue-500" />}
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">集中度</span>
          </div>
          <div className={cn("text-xl font-black tabular-nums", maxPct > 50 ? "text-orange-600" : "text-slate-800")}>{maxPct.toFixed(0)}%</div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            最大: {maxHolding.fund?.name || maxHolding.code}
          </div>
        </CardContent></Card>

        {/* Best Performer */}
        <Card className="bg-white"><CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">最佳持仓</span>
          </div>
          <div className={cn("text-lg font-black tabular-nums", best.pnlPct >= 0 ? "text-red-600" : "text-green-600")}>
            {best.pnlPct >= 0 ? "+" : ""}{best.pnlPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">{best.fund?.name || best.code}</div>
        </CardContent></Card>

        {/* Worst Performer */}
        <Card className="bg-white"><CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowDownRight className="w-3.5 h-3.5 text-green-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">最差持仓</span>
          </div>
          <div className={cn("text-lg font-black tabular-nums", worst.pnlPct >= 0 ? "text-red-600" : "text-green-600")}>
            {worst.pnlPct >= 0 ? "+" : ""}{worst.pnlPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">{worst.fund?.name || worst.code}</div>
        </CardContent></Card>
      </div>

      {/* Signal distribution bar + holding period */}
      <div className="flex items-center gap-4 text-[10px]">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-slate-400 font-bold shrink-0">信号分布</span>
          {signalTotal > 0 && (
            <div className="flex h-2 flex-1 rounded-full overflow-hidden bg-slate-100">
              {(["Alpha", "Beta", "Danger", "Sleep"] as const).map(tag => {
                const pct = (signalDist[tag] / signalTotal) * 100;
                if (pct === 0) return null;
                return <div key={tag} className={cn("h-full", signalColors[tag])} style={{ width: `${pct}%` }} />;
              })}
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {(["Alpha", "Beta", "Danger", "Sleep"] as const).map(tag => signalDist[tag] > 0 && (
              <span key={tag} className="flex items-center gap-0.5">
                <div className={cn("w-1.5 h-1.5 rounded-full", signalColors[tag])} />
                {tag} {signalDist[tag]}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {HOLDING_TAGS.map(t => {
            const count = holdings.filter(h => h.tag === t.key).length;
            if (count === 0) return null;
            const Icon = t.icon;
            return <span key={t.key} className={cn("flex items-center gap-0.5", t.color.split(" ")[0])}><Icon className="w-2.5 h-2.5" />{count}</span>;
          })}
          <span className="text-slate-300">|</span>
          <span className="text-slate-400">均持 <span className="font-bold text-slate-600">{avgDays.toFixed(0)}</span>天</span>
        </div>
      </div>
    </div>
  );
});

// ===================== PORTFOLIO HEALTH SCORE (V66.4) =====================

const PortfolioHealthScore: React.FC<{
  holdings: FundHolding[];
  fundMap: Map<string, ExtendedFund>;
}> = React.memo(({ holdings, fundMap }) => {
  const health = useMemo(() => {
    if (holdings.length === 0) return null;

    let score = 100; // Start from perfect
    const reasons: { text: string; delta: number; severity: "good" | "warn" | "bad" }[] = [];

    const metrics = holdings.map(h => {
      const fund = fundMap.get(h.code);
      const nav = fund?.estimateNetValue || h.costPerUnit;
      const val = nav * h.shares;
      const cost = h.costPerUnit * h.shares;
      const pnlPct = cost > 0 ? ((val - cost) / cost) * 100 : 0;
      return { ...h, fund, val, cost, pnlPct };
    });
    const totalVal = metrics.reduce((s, m) => s + m.val, 0);

    // 1. Signal quality (-25 max)
    const dangerCount = metrics.filter(m => m.fund?.signal?.tag === "Danger").length;
    const alphaCount = metrics.filter(m => m.fund?.signal?.tag === "Alpha").length;
    if (dangerCount > 0) {
      const penalty = Math.min(25, dangerCount * 12);
      score -= penalty;
      reasons.push({ text: `${dangerCount}只持仓触发风险信号`, delta: -penalty, severity: "bad" });
    }
    if (alphaCount > 0) {
      const bonus = Math.min(10, alphaCount * 4);
      score += bonus;
      reasons.push({ text: `${alphaCount}只Alpha信号持仓`, delta: bonus, severity: "good" });
    }

    // 2. Diversification (-20 max)
    const cats: Record<string, number> = {};
    metrics.forEach(m => { const c = m.fund?.category || "其他"; cats[c] = (cats[c] || 0) + m.val; });
    const maxCatPct = totalVal > 0 ? Math.max(...Object.values(cats)) / totalVal * 100 : 0;
    if (maxCatPct > 60) {
      score -= 20;
      reasons.push({ text: `板块过于集中(${maxCatPct.toFixed(0)}%)`, delta: -20, severity: "bad" });
    } else if (maxCatPct > 40) {
      score -= 10;
      reasons.push({ text: `板块集中度偏高(${maxCatPct.toFixed(0)}%)`, delta: -10, severity: "warn" });
    } else if (Object.keys(cats).length >= 3) {
      score += 5;
      reasons.push({ text: `分散${Object.keys(cats).length}个板块`, delta: 5, severity: "good" });
    }

    // 3. Overall PnL health (-15 max)
    const totalCost = metrics.reduce((s, m) => s + m.cost, 0);
    const totalPnLPct = totalCost > 0 ? ((totalVal - totalCost) / totalCost) * 100 : 0;
    if (totalPnLPct < -10) {
      score -= 15;
      reasons.push({ text: `组合浮亏${totalPnLPct.toFixed(1)}%`, delta: -15, severity: "bad" });
    } else if (totalPnLPct < -3) {
      score -= 8;
      reasons.push({ text: `组合浮亏${totalPnLPct.toFixed(1)}%`, delta: -8, severity: "warn" });
    } else if (totalPnLPct > 5) {
      score += 5;
      reasons.push({ text: `组合盈利${totalPnLPct.toFixed(1)}%`, delta: 5, severity: "good" });
    }

    // 4. Tag discipline (-10 max)
    const taggedCount = holdings.filter(h => h.tag).length;
    const tagRatio = holdings.length > 0 ? taggedCount / holdings.length : 0;
    if (tagRatio === 0 && holdings.length >= 3) {
      score -= 10;
      reasons.push({ text: "未使用标签管理", delta: -10, severity: "warn" });
    } else if (tagRatio >= 0.8) {
      score += 5;
      reasons.push({ text: "标签分层管理到位", delta: 5, severity: "good" });
    }

    // 5. Exit discipline (-10 max)
    const exitNotSold = metrics.filter(m => m.tag === "exit" && m.shares > 0).length;
    if (exitNotSold > 0) {
      score -= 10;
      reasons.push({ text: `${exitNotSold}只待清仓未执行`, delta: -10, severity: "bad" });
    }

    // 6. Win rate bonus
    const winners = metrics.filter(m => m.pnlPct > 0).length;
    const winRate = holdings.length > 0 ? (winners / holdings.length) * 100 : 0;
    if (winRate >= 70) {
      score += 5;
      reasons.push({ text: `胜率${winRate.toFixed(0)}%`, delta: 5, severity: "good" });
    } else if (winRate < 30 && holdings.length >= 3) {
      score -= 10;
      reasons.push({ text: `胜率仅${winRate.toFixed(0)}%`, delta: -10, severity: "bad" });
    }

    score = Math.max(0, Math.min(100, score));

    const grade = score >= 85 ? { label: "A", color: "text-red-600 bg-red-50 border-red-200" }
      : score >= 70 ? { label: "B", color: "text-blue-600 bg-blue-50 border-blue-200" }
      : score >= 50 ? { label: "C", color: "text-amber-600 bg-amber-50 border-amber-200" }
      : { label: "D", color: "text-green-700 bg-green-50 border-green-200" };

    const tip = score >= 85 ? "组合状态优秀，继续保持" : score >= 70 ? "组合整体健康，有小幅优化空间" : score >= 50 ? "组合存在风险点，建议关注调仓建议" : "组合亟需调整，请重点处理风险项";

    return { score, grade, reasons: reasons.sort((a, b) => a.delta - b.delta), tip };
  }, [holdings, fundMap]);

  if (!health) return null;

  const { score, grade, reasons, tip } = health;
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - score / 100);
  const strokeColor = score >= 85 ? "#ef4444" : score >= 70 ? "#3b82f6" : score >= 50 ? "#f59e0b" : "#22c55e";

  return (
    <Card className="bg-white">
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <HeartPulse className="w-3.5 h-3.5 text-pink-500" />
          <span className="text-xs font-bold text-slate-600">组合健康度</span>
        </div>

        <div className="flex items-center gap-5">
          {/* Ring gauge */}
          <div className="relative shrink-0">
            <svg width="96" height="96" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="6" />
              <circle cx="48" cy="48" r="40" fill="none"
                stroke={strokeColor} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={dashOffset}
                transform="rotate(-90 48 48)" className="transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black tabular-nums" style={{ color: strokeColor }}>{score}</span>
              <span className={cn("text-[9px] font-black px-1.5 py-0 rounded border mt-0.5", grade.color)}>{grade.label}</span>
            </div>
          </div>

          {/* Reasons list */}
          <div className="flex-1 min-w-0 space-y-1">
            {reasons.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <span className={cn("font-black tabular-nums w-8 text-right shrink-0",
                  r.severity === "good" ? "text-red-500" : r.severity === "warn" ? "text-amber-500" : "text-green-600"
                )}>
                  {r.delta > 0 ? "+" : ""}{r.delta}
                </span>
                <span className="text-slate-500 truncate">{r.text}</span>
              </div>
            ))}
            <div className="text-[10px] text-slate-400 mt-1 italic">{tip}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ===================== PORTFOLIO EQUITY CURVE =====================

const PortfolioEquityCurve: React.FC<{
  holdings: FundHolding[];
  fundMap: Map<string, ExtendedFund>;
}> = React.memo(({ holdings, fundMap }) => {
  const chartData = useMemo(() => {
    if (holdings.length === 0) return [];
    const navByCode = new Map<string, FundNavPoint[]>();
    holdings.forEach(holding => {
      const fund = fundMap.get(holding.code);
      if (fund?.historyData.length) navByCode.set(holding.code, fund.historyData);
    });
    return buildActualPortfolioCurve(holdings, navByCode)
      .slice(-250)
      .map(point => ({
        date: point.date,
        portfolio: Number(point.returnPercent.toFixed(2)),
      }));
  }, [holdings, fundMap]);

  if (chartData.length < 5) return null;

  const lastVal = chartData[chartData.length - 1]?.portfolio || 0;
  const isPositive = lastVal >= 0;

  return (
    <Card className="bg-white">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-bold text-slate-600">组合收益曲线</span>
          </div>
          <span className={cn("text-sm font-black tabular-nums", isPositive ? "text-red-600" : "text-green-600")}>
            {isPositive ? "+" : ""}{lastVal.toFixed(2)}%
          </span>
        </div>
        <div className="h-[160px] relative">
          <React.Suspense fallback={<Skeleton className="h-full w-full" />}>
            <PortfolioEquityChart data={chartData} isPositive={isPositive} />
          </React.Suspense>
        </div>
        <div className="text-[10px] text-slate-400 mt-1 text-center">按实际交易日期、份额与历史净值计算</div>
      </CardContent>
    </Card>
  );
});

// ===================== DCA SIMULATOR =====================

const DCASimulatorDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  funds: ExtendedFund[];
}> = ({ open, onClose, funds }) => {
  const [selectedCode, setSelectedCode] = useState("");
  const [amount, setAmount] = useState("1000");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">("monthly");
  const [result, setResult] = useState<{
    totalInvested: number;
    currentValue: number;
    totalShares: number;
    avgCost: number;
    returnPct: number;
    lumpSumReturn: number;
    periods: number;
  } | null>(null);

  const selectedFund = useMemo(() => funds.find(f => f.code === selectedCode), [funds, selectedCode]);

  const runSimulation = useCallback(() => {
    if (!selectedFund || selectedFund.historyData.length < 30) {
      toast.error("该基金历史数据不足，无法模拟");
      return;
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("请输入有效金额"); return; }

    const navSeries = selectedFund.historyData;
    const step = frequency === "weekly" ? 5 : frequency === "biweekly" ? 10 : 21;
    let totalInvested = 0;
    let totalShares = 0;
    let periods = 0;

    for (let i = 0; i < navSeries.length; i += step) {
      const nav = navSeries[i].nav;
      if (nav > 0) {
        const shares = amt / nav;
        totalShares += shares;
        totalInvested += amt;
        periods++;
      }
    }

    const finalNav = navSeries[navSeries.length - 1].nav;
    const currentValue = totalShares * finalNav;
    const avgCost = totalShares > 0 ? totalInvested / totalShares : 0;
    const returnPct = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0;

    // Lump sum comparison: invest everything at the start
    const firstNav = navSeries[0].nav;
    const lumpSumShares = firstNav > 0 ? totalInvested / firstNav : 0;
    const lumpSumValue = lumpSumShares * finalNav;
    const lumpSumReturn = totalInvested > 0 ? ((lumpSumValue - totalInvested) / totalInvested) * 100 : 0;

    setResult({ totalInvested, currentValue, totalShares, avgCost, returnPct, lumpSumReturn, periods });
  }, [selectedFund, amount, frequency]);

  useEffect(() => { if (open) setResult(null); }, [open]);

  const freqLabel = { weekly: "周", biweekly: "双周", monthly: "月" };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-indigo-600" /> 定投模拟器
          </DialogTitle>
          <DialogDescription>基于历史数据回测定投收益，对比一次性买入。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Fund Selection */}
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">选择基金</label>
            <select
              value={selectedCode}
              onChange={e => { setSelectedCode(e.target.value); setResult(null); }}
              className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">请选择...</option>
              {funds.filter(f => f.historyData.length >= 30).map(f => (
                <option key={f.code} value={f.code}>{f.name} ({f.code})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">每期金额 (¥)</label>
              <Input value={amount} onChange={e => { setAmount(e.target.value); setResult(null); }} type="number" step="100" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">定投频率</label>
              <div className="flex bg-slate-100 rounded-md p-0.5 h-9">
                {(["weekly", "biweekly", "monthly"] as const).map(f => (
                  <button key={f} onClick={() => { setFrequency(f); setResult(null); }}
                    className={cn("flex-1 rounded text-xs font-bold transition-colors",
                      frequency === f ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"
                    )}>
                    {freqLabel[f]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5" onClick={runSimulation} disabled={!selectedCode}>
            <Calculator className="w-3.5 h-3.5" /> 开始回测
          </Button>

          {/* Results */}
          {result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-slate-50 border-slate-100"><CardContent className="p-3">
                  <div className="text-[10px] text-slate-400 font-bold">总投入</div>
                  <div className="text-sm font-black text-slate-800">¥{result.totalInvested.toFixed(0)}</div>
                  <div className="text-[10px] text-slate-400">{result.periods} 期 × ¥{parseFloat(amount).toFixed(0)}</div>
                </CardContent></Card>
                <Card className="bg-slate-50 border-slate-100"><CardContent className="p-3">
                  <div className="text-[10px] text-slate-400 font-bold">当前价值</div>
                  <div className={cn("text-sm font-black", result.returnPct >= 0 ? "text-red-600" : "text-green-600")}>¥{result.currentValue.toFixed(0)}</div>
                  <div className={cn("text-[10px] font-bold", result.returnPct >= 0 ? "text-red-400" : "text-green-400")}>
                    {result.returnPct >= 0 ? "+" : ""}{result.returnPct.toFixed(2)}%
                  </div>
                </CardContent></Card>
              </div>

              <Card className="bg-indigo-50/50 border-indigo-100"><CardContent className="p-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-600">定投 vs 一次性买入</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400 mb-0.5">定投收益</div>
                    <div className={cn("text-lg font-black tabular-nums", result.returnPct >= 0 ? "text-red-600" : "text-green-600")}>
                      {result.returnPct >= 0 ? "+" : ""}{result.returnPct.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-400">均价 {result.avgCost.toFixed(4)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 mb-0.5">一次性买入</div>
                    <div className={cn("text-lg font-black tabular-nums", result.lumpSumReturn >= 0 ? "text-red-600" : "text-green-600")}>
                      {result.lumpSumReturn >= 0 ? "+" : ""}{result.lumpSumReturn.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-400">期初一笔买入</div>
                  </div>
                </div>
                {result.returnPct > result.lumpSumReturn ? (
                  <div className="text-[10px] text-center text-indigo-600 font-bold mt-2">
                    定投跑赢 {(result.returnPct - result.lumpSumReturn).toFixed(2)}%，定投策略更优
                  </div>
                ) : (
                  <div className="text-[10px] text-center text-slate-500 mt-2">
                    一次性买入跑赢 {(result.lumpSumReturn - result.returnPct).toFixed(2)}%，但定投降低了择时风险
                  </div>
                )}
              </CardContent></Card>
            </motion.div>
          )}
        </div>

        <Button variant="outline" className="w-full" onClick={onClose}>关闭</Button>
      </DialogContent>
    </Dialog>
  );
};

// ===================== CSV EXPORT =====================

const TAG_LABELS: Record<string, string> = { core: "核心", watch: "观察", exit: "待清" };

const exportHoldingsCSV = (holdings: FundHolding[], fundMap: Map<string, ExtendedFund>) => {
  const headers = ["代码", "名称", "标签", "成本净值", "现价", "份额", "市值", "浮动盈亏", "盈亏%", "已实现盈亏", "买入日期", "交易笔数"];
  const rows = holdings.map(h => {
    const fund = fundMap.get(h.code);
    const nav = fund?.estimateNetValue || h.costPerUnit;
    const val = nav * h.shares;
    const cost = h.costPerUnit * h.shares;
    const pnl = val - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return [
      h.code, fund?.name || h.name || h.code,
      TAG_LABELS[h.tag || ""] || "",
      h.costPerUnit.toFixed(4), nav.toFixed(4), h.shares.toFixed(2),
      val.toFixed(2), pnl.toFixed(2), pnlPct.toFixed(2),
      (h.realizedPnL || 0).toFixed(2), h.buyDate, (h.transactions?.length || 1).toString(),
    ].join(",");
  });
  const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fund_holdings_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("持仓数据已导出");
};

// ===================== REBALANCE ADVISOR (V66.3) =====================

interface RebalanceSuggestion {
  type: "danger" | "warning" | "opportunity" | "info";
  icon: React.ReactNode;
  title: string;
  detail: string;
  action?: string;
}

const RebalanceAdvisor: React.FC<{
  holdings: FundHolding[];
  fundMap: Map<string, ExtendedFund>;
  allFunds: ExtendedFund[];
}> = React.memo(({ holdings, fundMap, allFunds }) => {
  const suggestions = useMemo((): RebalanceSuggestion[] => {
    if (holdings.length === 0) return [];
    const result: RebalanceSuggestion[] = [];

    // Compute holding metrics
    const holdingMetrics = holdings.map(h => {
      const fund = fundMap.get(h.code);
      const nav = fund?.estimateNetValue || h.costPerUnit;
      const val = nav * h.shares;
      const cost = h.costPerUnit * h.shares;
      return { ...h, fund, val, cost, pnlPct: cost > 0 ? ((val - cost) / cost) * 100 : 0 };
    });
    const totalValue = holdingMetrics.reduce((s, h) => s + h.val, 0);

    // 1. Danger signal holdings
    const dangerHoldings = holdingMetrics.filter(h => h.fund?.signal?.tag === "Danger");
    if (dangerHoldings.length > 0) {
      const names = dangerHoldings.map(h => h.fund?.name || h.code).join("、");
      const dangerVal = dangerHoldings.reduce((s, h) => s + h.val, 0);
      const dangerPct = totalValue > 0 ? (dangerVal / totalValue * 100).toFixed(0) : "0";
      result.push({
        type: "danger",
        icon: <ShieldAlert className="w-4 h-4 text-red-500" />,
        title: `${dangerHoldings.length}只持仓触发风险信号`,
        detail: `${names}，占组合${dangerPct}%。信号为止损/止盈，建议优先处理。`,
        action: dangerHoldings.some(h => h.fund?.guidance?.action === "Sell") ? "建议立即减仓或清仓" : "关注风险变化",
      });
    }

    // 2. Exit-tagged but not acted on
    const exitTagged = holdingMetrics.filter(h => h.tag === "exit" && h.shares > 0);
    if (exitTagged.length > 0) {
      result.push({
        type: "warning",
        icon: <LogOut className="w-4 h-4 text-orange-500" />,
        title: `${exitTagged.length}只标记"待清仓"但仍持有`,
        detail: `${exitTagged.map(h => h.fund?.name || h.code).join("、")}仍有份额，请确认是否执行清仓。`,
        action: "检查并执行卖出",
      });
    }

    // 3. Sector concentration
    const sectorAlloc: Record<string, number> = {};
    holdingMetrics.forEach(h => {
      const cat = h.fund?.category || "其他";
      sectorAlloc[cat] = (sectorAlloc[cat] || 0) + h.val;
    });
    const sectorEntries = Object.entries(sectorAlloc).sort((a, b) => b[1] - a[1]);
    const idealPct = 100 / Math.max(sectorEntries.length, 1);
    const overweightSectors = sectorEntries.filter(([, v]) => totalValue > 0 && (v / totalValue * 100) > idealPct * 2);
    if (overweightSectors.length > 0) {
      const top = overweightSectors[0];
      const topPct = (top[1] / totalValue * 100).toFixed(0);
      result.push({
        type: "warning",
        icon: <Scale className="w-4 h-4 text-amber-500" />,
        title: `板块偏离: "${top[0]}"占比${topPct}%`,
        detail: `均衡配置建议每板块≤${(idealPct * 1.5).toFixed(0)}%。${overweightSectors.length > 1 ? `另有${overweightSectors.length - 1}个板块超配。` : ""}`,
        action: `考虑减配${top[0]}，分散到其他板块`,
      });
    }

    // 4. Missing strong sectors
    const strongAlphaFunds = allFunds.filter(f => f.signal?.tag === "Alpha" && f.score > 75 && !holdingMetrics.some(h => h.code === f.code));
    const strongCategories = [...new Set<string>(strongAlphaFunds.map(f => f.category))];
    const missingStrong = strongCategories.filter(c => !sectorAlloc[c]);
    if (missingStrong.length > 0) {
      const topMissing = missingStrong[0];
      const topFund = strongAlphaFunds.find(f => f.category === topMissing);
      result.push({
        type: "opportunity",
        icon: <Lightbulb className="w-4 h-4 text-blue-500" />,
        title: `增配机会: ${topMissing}板块强势`,
        detail: topFund ? `${topFund.name}(${topFund.code}) Score ${topFund.score.toFixed(0)}，信号"${topFund.signal?.action}"，但组合中未持有该板块。` : `${topMissing}有Alpha信号基金但未持有。`,
        action: "考虑新建仓位",
      });
    }

    // 5. Deep losers worth averaging down (V66.6: tiered thresholds)
    const deepLosers = holdingMetrics.filter(h => h.pnlPct < -8 && h.fund?.signal?.tag !== "Danger" && h.fund?.prediction?.direction !== "Bear");
    if (deepLosers.length > 0) {
      const dl = deepLosers.sort((a, b) => a.pnlPct - b.pnlPct)[0]; // worst first
      const severity = dl.pnlPct < -20 ? "warning" as const : "info" as const;
      const actionText = dl.pnlPct < -20 ? "谨慎评估后分批补仓" : "酌情加仓或定投";
      result.push({
        type: severity,
        icon: <ArrowRightLeft className="w-4 h-4 text-indigo-500" />,
        title: `"${dl.fund?.name || dl.code}"浮亏${dl.pnlPct.toFixed(1)}%`,
        detail: `趋势未破位且非风险信号。${dl.pnlPct < -20 ? "亏损较深，补仓需控制追加比例≤当前持仓的50%。" : "当前处于低位，可考虑补仓摊低成本。"}`,
        action: actionText,
      });
    }

    // 6. Big winners to take profit (V66.6: tiered thresholds)
    const bigWinners = holdingMetrics.filter(h => h.pnlPct > 20 && h.tag !== "exit");
    if (bigWinners.length > 0) {
      const bw = bigWinners.sort((a, b) => b.pnlPct - a.pnlPct)[0]; // best first
      const severity = bw.pnlPct > 50 ? "warning" as const : "info" as const;
      result.push({
        type: severity,
        icon: <Trophy className="w-4 h-4 text-amber-500" />,
        title: `"${bw.fund?.name || bw.code}"盈利${bw.pnlPct.toFixed(1)}%`,
        detail: bw.pnlPct > 50
          ? `收益极为丰厚(${bw.pnlPct.toFixed(0)}%)，强烈建议至少兑现50%利润。剩余仓位可当"免费筹码"。`
          : `收益可观，可考虑兑现部分利润、锁定收益，剩余持仓当作"免费筹码"。`,
        action: bw.pnlPct > 50 ? "强烈建议分批止盈" : "考虑分批止盈",
      });
    }

    // 7. No core holdings
    const coreCount = holdings.filter(h => h.tag === "core").length;
    if (coreCount === 0 && holdings.length >= 3) {
      result.push({
        type: "info",
        icon: <Tag className="w-4 h-4 text-slate-400" />,
        title: "未标记核心持仓",
        detail: "给持仓打标签（核心/观察/待清），有助于分层管理和执行调仓纪律。",
      });
    }

    // V66.6 Rule 8: Overlap/duplicate exposure detection
    const catCounts: Record<string, string[]> = {};
    holdingMetrics.forEach(h => {
      const cat = h.fund?.category || "其他";
      if (!catCounts[cat]) catCounts[cat] = [];
      catCounts[cat].push(h.fund?.name || h.code);
    });
    const overlaps = Object.entries(catCounts).filter(([, names]) => names.length >= 3);
    if (overlaps.length > 0) {
      const [cat, names] = overlaps.sort((a, b) => b[1].length - a[1].length)[0];
      result.push({
        type: "warning",
        icon: <GitCompare className="w-4 h-4 text-violet-500" />,
        title: `"${cat}"板块持有${names.length}只，敞口重叠`,
        detail: `${names.join("、")}。同板块多只基金收益高度相关，建议精选1-2只，其余可转配其他板块。`,
        action: "合并同板块持仓",
      });
    }

    // V66.6 Rule 9: High-volatility concentration warning
    const highVolHoldings = holdingMetrics.filter(h => (h.fund?.volatility || 0) > 3);
    const highVolPct = totalValue > 0 ? highVolHoldings.reduce((s, h) => s + h.val, 0) / totalValue * 100 : 0;
    if (highVolPct > 70 && highVolHoldings.length >= 2) {
      result.push({
        type: "warning",
        icon: <Activity className="w-4 h-4 text-rose-500" />,
        title: `高波动资产占比${highVolPct.toFixed(0)}%`,
        detail: `${highVolHoldings.length}只持仓波动率>3%，组合极端行情下回撤可能很大。建议配置10-30%低波/债基做"压舱石"。`,
        action: "考虑配置债基或红利低波",
      });
    }

    // V66.6 Rule 10: Drawdown alert for non-exit holdings
    const ddAlerts = holdingMetrics.filter(h => (h.fund?.maxDrawdown || 0) > 25 && h.tag !== "exit" && h.pnlPct < -5);
    if (ddAlerts.length > 0) {
      const worst = ddAlerts.sort((a, b) => (b.fund?.maxDrawdown || 0) - (a.fund?.maxDrawdown || 0))[0];
      result.push({
        type: "warning",
        icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
        title: `"${worst.fund?.name || worst.code}"半年最大回撤${(worst.fund?.maxDrawdown || 0).toFixed(0)}%`,
        detail: `当前浮亏${worst.pnlPct.toFixed(1)}%，该基金历史波动剧烈。若无强烈看好理由，建议设置止损线(如-15%)或转为观察仓。`,
        action: "设定止损线或降仓",
      });
    }

    // V66.6 Rule 11: "加仓"信号的持仓提醒 — 持有的基金出现加仓/黄金坑信号
    const buySignalHoldings = holdingMetrics.filter(h =>
      h.fund?.signal?.action === "加仓" || h.fund?.signal?.action === "黄金坑"
    );
    if (buySignalHoldings.length > 0) {
      const names = buySignalHoldings.map(h => `${h.fund?.name || h.code}(${h.fund?.signal?.action})`).join("、");
      result.push({
        type: "opportunity",
        icon: <ArrowUpFromLine className="w-4 h-4 text-blue-500" />,
        title: `${buySignalHoldings.length}只持仓出现加仓信号`,
        detail: `${names}。当前持仓中有良好的追加机会，可结合自身仓位和资金情况酌情操作。`,
        action: "检查可用资金，考虑加仓",
      });
    }

    return result;
  }, [holdings, fundMap, allFunds]);

  // V66.4: Must be before early return (React hooks rule)
  const [advisorCollapsed, setAdvisorCollapsed] = useState(false);

  if (suggestions.length === 0) return null;

  const typeStyles: Record<string, string> = {
    danger: "border-l-red-500 bg-red-50/30",
    warning: "border-l-amber-500 bg-amber-50/30",
    opportunity: "border-l-blue-500 bg-blue-50/30",
    info: "border-l-slate-300 bg-slate-50/30",
  };
  const dangerCount = suggestions.filter(s => s.type === "danger").length;
  const warnCount = suggestions.filter(s => s.type === "warning").length;

  return (
    <div className="space-y-3">
      <button className="flex items-center gap-1.5 text-xs font-bold text-slate-500 w-full group" onClick={() => setAdvisorCollapsed(!advisorCollapsed)}>
        <BrainCircuit className="w-3.5 h-3.5 text-indigo-500" /> 智能调仓建议
        <Badge variant="secondary" className="text-[9px] h-4 px-1">{suggestions.length}</Badge>
        {dangerCount > 0 && <Badge className="text-[8px] h-3.5 px-1 bg-red-500 text-white border-0">{dangerCount}紧急</Badge>}
        {warnCount > 0 && <Badge className="text-[8px] h-3.5 px-1 bg-amber-500 text-white border-0">{warnCount}警告</Badge>}
        <div className="flex-1" />
        <ChevronDown className={cn("w-3.5 h-3.5 text-slate-300 transition-transform group-hover:text-slate-500", advisorCollapsed && "-rotate-90")} />
      </button>
      <AnimatePresence>
        {!advisorCollapsed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <Card key={i} className={cn("border-l-4 overflow-hidden", typeStyles[s.type])}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">{s.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-700">{s.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{s.detail}</div>
                        {s.action && (
                          <div className="flex items-center gap-1 mt-1.5 text-[10px] font-bold text-indigo-600">
                            <ChevronRight className="w-3 h-3" /> {s.action}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ===================== PNL CALENDAR HEATMAP (V66.3) =====================

const PnLCalendarHeatmap: React.FC<{
  holdings: FundHolding[];
  fundMap: Map<string, ExtendedFund>;
}> = React.memo(({ holdings, fundMap }) => {
  const calendarData = useMemo(() => {
    if (holdings.length === 0) return { cells: [], maxAbs: 0, monthLabels: [] as { label: string; col: number }[] };

    const navByCode = new Map<string, FundNavPoint[]>();
    holdings.forEach(holding => {
      const fund = fundMap.get(holding.code);
      if (fund?.historyData.length) navByCode.set(holding.code, fund.historyData);
    });
    const actualCurve = buildActualPortfolioCurve(holdings, navByCode);
    if (actualCurve.length === 0) {
      return { cells: [], maxAbs: 0, monthLabels: [] as { label: string; col: number }[] };
    }
    const dailyReturns = Object.fromEntries(
      actualCurve.map(point => [point.date, point.dailyChangePercent]),
    ) as Record<string, number>;

    // Build last ~90 days of calendar cells
    const now = new Date();
    const cells: { date: string; value: number; weekday: number; col: number; isWeekend: boolean }[] = [];
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 89);

    // Align to Monday of that week
    const dayOfWeek = startDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startDate.setDate(startDate.getDate() + mondayOffset);

    let col = 0;
    const d = new Date(startDate);
    const monthLabels: { label: string; col: number }[] = [];
    let lastMonth = -1;

    while (d <= now) {
      const dateStr = d.toISOString().slice(0, 10);
      const weekday = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0, Sun=6
      const month = d.getMonth();

      if (month !== lastMonth) {
        monthLabels.push({ label: `${month + 1}月`, col });
        lastMonth = month;
      }

      const isWeekend = weekday >= 5; // Sat=5, Sun=6
      const val = isWeekend ? 0 : (dailyReturns[dateStr] || 0);
      cells.push({ date: dateStr, value: val, weekday, col, isWeekend });

      d.setDate(d.getDate() + 1);
      if (weekday === 6) col++;
    }

    const maxAbs = Math.max(0.5, ...cells.map(c => Math.abs(c.value)));
    return { cells, maxAbs, monthLabels };
  }, [holdings, fundMap]);

  // V66.3: All hooks MUST be before any conditional return (React hooks rule)
  const { cells, maxAbs, monthLabels } = calendarData;
  const totalCols = cells.length > 0 ? Math.max(1, ...cells.map(c => c.col)) + 1 : 0;

  const cellMap = useMemo(() => {
    const m = new Map<string, (typeof cells)[0]>();
    cells.forEach(c => m.set(`${c.col}_${c.weekday}`, c));
    return m;
  }, [cells]);

  // Hover state for tooltip — MUST be before early return (React hooks rule)
  // V67.5: added `flipBelow` to avoid tooltip being obscured by elements above
  const [hoveredCell, setHoveredCell] = useState<{ date: string; value: number; x: number; y: number; flipBelow?: boolean } | null>(null);

  if (cells.length === 0) return null;

  const getColor = (val: number) => {
    if (Math.abs(val) < 0.01) return "bg-slate-100";
    const intensity = Math.min(1, Math.abs(val) / maxAbs);
    if (val > 0) {
      if (intensity > 0.6) return "bg-red-500";
      if (intensity > 0.3) return "bg-red-300";
      return "bg-red-200";
    } else {
      if (intensity > 0.6) return "bg-green-500";
      if (intensity > 0.3) return "bg-green-300";
      return "bg-green-200";
    }
  };

  // Aggregate stats (exclude weekends)
  const tradingCells = cells.filter(c => !c.isWeekend);
  const positiveDays = tradingCells.filter(c => c.value > 0.01).length;
  const negativeDays = tradingCells.filter(c => c.value < -0.01).length;
  const totalDays = positiveDays + negativeDays;
  const winRateDays = totalDays > 0 ? (positiveDays / totalDays * 100) : 0;
  const bestDay = tradingCells.length > 0 ? tradingCells.reduce((a, b) => a.value > b.value ? a : b, tradingCells[0]) : { date: "", value: 0 };
  const worstDay = tradingCells.length > 0 ? tradingCells.reduce((a, b) => a.value < b.value ? a : b, tradingCells[0]) : { date: "", value: 0 };

  // Current streak (trading days only)
  const sortedCells = [...tradingCells].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  let streakType: "win" | "loss" | "none" = "none";
  for (const c of sortedCells) {
    if (Math.abs(c.value) < 0.01) continue;
    if (streakType === "none") { streakType = c.value > 0 ? "win" : "loss"; streak = 1; }
    else if ((streakType === "win" && c.value > 0.01) || (streakType === "loss" && c.value < -0.01)) { streak++; }
    else break;
  }

  // Cumulative sum of last 30 trading days
  const last30 = tradingCells.slice(-30);
  const cumSum30 = last30.reduce((s, c) => s + c.value, 0);

  return (
    <Card className="bg-white overflow-visible">
      <CardContent className="p-4 overflow-visible">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-xs font-bold text-slate-600">盈亏日历</span>
            <span className="text-[10px] text-slate-400">近3个月</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] flex-wrap justify-end">
            <span className="text-slate-400">日胜率 <span className="font-bold text-slate-600">{winRateDays.toFixed(0)}%</span></span>
            {streak > 1 && (
              <span className={cn("font-bold px-1.5 py-0.5 rounded", streakType === "win" ? "text-red-600 bg-red-50" : "text-green-600 bg-green-50")}>
                {streakType === "win" ? "连赢" : "连亏"}{streak}天
              </span>
            )}
            <span className={cn("font-bold", cumSum30 >= 0 ? "text-red-500" : "text-green-600")}>
              30日{cumSum30 >= 0 ? "+" : ""}{cumSum30.toFixed(2)}%
            </span>
          </div>
        </div>
        {/* Best/Worst mini stats */}
        <div className="flex items-center gap-4 text-[10px] mb-2">
          <span className="flex items-center gap-1 text-red-500"><ArrowUpFromLine className="w-2.5 h-2.5" />最佳 {bestDay.date.slice(5)} <span className="font-bold">+{bestDay.value.toFixed(2)}%</span></span>
          <span className="flex items-center gap-1 text-green-600"><ArrowDownFromLine className="w-2.5 h-2.5" />最差 {worstDay.date.slice(5)} <span className="font-bold">{worstDay.value.toFixed(2)}%</span></span>
          <span className="text-slate-400">盈{positiveDays}天 / 亏{negativeDays}天</span>
        </div>

        {/* Heatmap Grid — V67.5: overflow-y-visible so tooltip isn't clipped */}
        <div className="overflow-x-auto overflow-y-visible">
          <div className="min-w-[500px]">
            {/* Month labels */}
            <div className="relative mb-1 h-4" style={{ paddingLeft: 24 }}>
              {monthLabels.map((ml, i) => (
                <div key={i} className="text-[9px] text-slate-400 font-bold absolute"
                  style={{ left: 24 + ml.col * 14 }}>
                  {ml.label}
                </div>
              ))}
            </div>

            <div className="flex gap-0">
              {/* Weekday labels */}
              <div className="flex flex-col gap-[2px] mr-1 shrink-0">
                {["一", "", "三", "", "五", "", ""].map((l, i) => (
                  <div key={i} className="w-4 h-3 text-[8px] text-slate-400 flex items-center justify-end pr-0.5">{l}</div>
                ))}
              </div>

              {/* Grid cells */}
              <div className="flex gap-[2px] relative" onMouseLeave={() => setHoveredCell(null)}>
                {Array.from({ length: totalCols }).map((_, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-[2px]">
                    {Array.from({ length: 7 }).map((_, rowIdx) => {
                      const cell = cellMap.get(`${colIdx}_${rowIdx}`);
                      if (!cell) return <div key={rowIdx} className="w-3 h-3 rounded-sm" />;
                      // Weekend cells: dimmed, no tooltip
                      if (cell.isWeekend) return <div key={rowIdx} className="w-3 h-3 rounded-sm bg-slate-50" />;
                      return (
                        <div key={rowIdx}
                          className={cn("w-3 h-3 rounded-sm transition-colors cursor-default",
                            getColor(cell.value),
                            hoveredCell?.date === cell.date && "ring-1 ring-slate-800 ring-offset-1"
                          )}
                          onMouseEnter={e => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const parent = e.currentTarget.closest(".relative")?.getBoundingClientRect();
                            const relY = rect.top - (parent?.top || 0);
                            const flipBelow = relY < 36; // not enough space above → show below
                            setHoveredCell({
                              date: cell.date, value: cell.value,
                              x: rect.left - (parent?.left || 0) + 6,
                              y: flipBelow ? relY + 18 : relY - 32,
                              flipBelow,
                            });
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
                {/* Custom tooltip — V67.5: flip below when near top to avoid being obscured */}
                {hoveredCell && (
                  <div className="absolute pointer-events-none z-50 bg-slate-900 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-md shadow-lg whitespace-nowrap"
                    style={{ left: hoveredCell.x, top: hoveredCell.y, transform: "translateX(-50%)" }}>
                    <span className="text-slate-300">{hoveredCell.date.slice(5).replace("-", "月")}日</span>
                    {" "}
                    <span className={hoveredCell.value >= 0 ? "text-red-400" : "text-green-400"}>
                      {hoveredCell.value >= 0 ? "+" : ""}{hoveredCell.value.toFixed(3)}%
                    </span>
                    {/* Arrow: point up (below cell) or point down (above cell) */}
                    {hoveredCell.flipBelow ? (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[4px] border-r-[4px] border-b-[4px] border-l-transparent border-r-transparent border-b-slate-900" />
                    ) : (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-slate-900" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-1 mt-2 text-[9px] text-slate-400">
              <span>亏损</span>
              <div className="w-3 h-3 rounded-sm bg-green-500" />
              <div className="w-3 h-3 rounded-sm bg-green-300" />
              <div className="w-3 h-3 rounded-sm bg-green-200" />
              <div className="w-3 h-3 rounded-sm bg-slate-100" />
              <div className="w-3 h-3 rounded-sm bg-red-200" />
              <div className="w-3 h-3 rounded-sm bg-red-300" />
              <div className="w-3 h-3 rounded-sm bg-red-500" />
              <span>盈利</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ===================== COMPARE DIALOG =====================

const COMPARE_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6"];

const CompareDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  funds: ExtendedFund[];
}> = ({ open, onClose, funds }) => {
  // Build overlaid chart data from each fund's trendData (must be before early return)
  const chartData = useMemo(() => {
    if (funds.length === 0) return [];
    const aligned = alignFundComparisonSeries(
      funds.map(fund => ({ code: fund.code, history: fund.historyData })),
    ).slice(-250);
    return aligned.map(point => {
      const row: Record<string, string | number> = { date: point.date };
      funds.forEach((fund, index) => {
        if (typeof point[fund.code] === "number") row[`fund${index}`] = point[fund.code];
      });
      return row;
    });
  }, [funds]);

  if (funds.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-blue-600" /> 基金对比
          </DialogTitle>
          <DialogDescription>对比 {funds.length} 只基金的走势与核心指标</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {funds.map((f, i) => (
              <div key={f.code} className="flex items-center gap-1.5 text-xs">
                <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: COMPARE_COLORS[i] }} />
                <span className="font-bold text-slate-700 truncate max-w-[120px]">{f.name}</span>
                <span className="text-slate-400 font-mono text-[10px]">{f.code}</span>
              </div>
            ))}
          </div>

          {/* Overlay Chart */}
          {chartData.length > 0 && (
            <Card className="bg-slate-50 border-slate-100 p-3">
              <div className="text-[10px] font-bold text-slate-400 mb-1">累计收益率 (%)</div>
              <div className="h-[200px]">
                <React.Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <FundComparisonChart data={chartData} fundNames={funds.map(fund => fund.name)} colors={COMPARE_COLORS} />
                </React.Suspense>
              </div>
            </Card>
          )}

          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="text-left p-2">指标</th>
                  {funds.map((f, i) => (
                    <th key={f.code} className="text-right p-2">
                      <span style={{ color: COMPARE_COLORS[i] }}>{f.name.length > 6 ? f.name.slice(0, 6) + "…" : f.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "今日涨幅", key: "estimateChangePercent", fmt: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`, color: true },
                  { label: "净值", key: "estimateNetValue", fmt: (v: number) => v.toFixed(4), color: false },
                  { label: "近3月", key: "quarterChangePercent", fmt: (v: number) => `${v > 0 ? "+" : ""}${(v || 0).toFixed(1)}%`, color: true },
                  { label: "近6月", key: "halfYearChangePercent", fmt: (v: number) => `${v > 0 ? "+" : ""}${(v || 0).toFixed(1)}%`, color: true },
                  { label: "近1年", key: "yearChangePercent", fmt: (v: number) => `${v > 0 ? "+" : ""}${(v || 0).toFixed(1)}%`, color: true },
                  { label: "波动率", key: "volatility", fmt: (v: number) => `${v.toFixed(1)}%`, color: false },
                  { label: "RSI(12)", key: "rsi", fmt: (v: number) => v.toFixed(1), color: false },
                  { label: "Score", key: "score", fmt: (v: number) => v.toFixed(0), color: false },
                  { label: "信号", key: "_signal", fmt: () => "", color: false },
                  { label: "操作建议", key: "_guidance", fmt: () => "", color: false },
                ].map(row => (
                  <tr key={row.label} className="border-b border-slate-50">
                    <td className="p-2 font-bold text-slate-500">{row.label}</td>
                    {funds.map(f => {
                      if (row.key === "_signal") return <td key={f.code} className="text-right p-2"><Badge className={cn("text-[9px] h-4 px-1 border-0", f.guidance.action === "Buy" ? "bg-red-100 text-red-700" : f.guidance.action === "Sell" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600")}>{f.signal.action}</Badge></td>;
                      if (row.key === "_guidance") return <td key={f.code} className="text-right p-2 font-bold text-slate-600">{f.guidance.title}</td>;
                      const val = (f as any)[row.key] || 0;
                      return (
                        <td key={f.code} className={cn("text-right p-2 font-mono font-bold tabular-nums", row.color ? (val > 0 ? "text-red-600" : val < 0 ? "text-green-600" : "text-slate-400") : "text-slate-700")}>
                          {row.fmt(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Button variant="outline" className="w-full mt-2" onClick={onClose}>关闭</Button>
      </DialogContent>
    </Dialog>
  );
};

// ===================== FUND CARD =====================

const FundCard: React.FC<{
  fund: ExtendedFund;
  isCustom: boolean;
  isHeld: boolean;
  onAddCustom: (code: string) => void;
  onRemoveCustom: (code: string) => void;
  onAddHolding: (code: string, name: string) => void;
  onClick: (fund: ExtendedFund) => void;
  compareMode?: boolean;
  isCompared?: boolean;
  onToggleCompare?: (code: string) => void;
  onSignalClick?: (action: string) => void;
}> = React.memo(({ fund, isCustom, isHeld, onAddCustom, onRemoveCustom, onAddHolding, onClick, compareMode, isCompared, onToggleCompare, onSignalClick }) => {
  const tagStyle = fund.signal.tag === "Alpha"
    ? "border-l-red-500 bg-gradient-to-r from-red-50/30 to-transparent"
    : fund.signal.tag === "Danger"
      ? "border-l-orange-500 bg-gradient-to-r from-orange-50/30 to-transparent"
      : fund.signal.tag === "Beta" ? "border-l-blue-400" : "border-l-slate-200";

  const actionStyle = fund.guidance.action === "Buy"
    ? "bg-red-600 text-white" : fund.guidance.action === "Sell"
      ? "bg-green-600 text-white" : fund.guidance.action === "Hold"
        ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600";

  return (
    <Card className={cn("border-l-4 transition-all duration-200 hover:shadow-md group overflow-hidden cursor-pointer", tagStyle, isCompared && "ring-2 ring-blue-400 ring-offset-1")}
      onClick={() => compareMode && onToggleCompare ? onToggleCompare(fund.code) : onClick(fund)}>
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            {compareMode && (
              <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                isCompared ? "bg-blue-500 border-blue-500" : "border-slate-300 bg-white"
              )}>
                {isCompared && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
            )}
            <Badge variant="outline" className="text-[9px] text-slate-400 font-mono px-1 h-4 border-slate-200">{fund.code}</Badge>
            <Badge variant="outline" className={cn("text-[9px] h-4 px-1 border-0", fund.isEtf ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600")}>
              {fund.isEtf ? "ETF" : "OTC"}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] h-4 px-1 border-0",
                fund.dataStatus === "FRESH"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700",
              )}
              title={`源数据：${formatDataAge(fund.dataAgeMs)}`}
            >
              {fund.dataStatus === "FRESH" ? "数据新鲜" : fund.dataStatus === "STALE" ? "数据过期" : "时间未知"}
            </Badge>
            {isHeld && <Badge className="text-[9px] h-4 px-1 bg-amber-50 text-amber-600 border-amber-200">持仓</Badge>}
          </div>
          <div className="flex flex-col items-end gap-0.5" onClick={e => { e.stopPropagation(); onSignalClick?.(fund.signal.action); }}>
            <Badge className={cn("text-[9px] font-black h-5 px-1.5 border-0 shadow-sm cursor-pointer hover:ring-1 hover:ring-offset-1 hover:ring-slate-300 transition-shadow", actionStyle)} title={`点击筛选"${fund.signal.action}"`}>{fund.signal.action}</Badge>
            <span className="text-[8px] text-slate-400 max-w-[80px] truncate" title={fund.signal.desc}>{fund.signal.desc}</span>
          </div>
        </div>
        <div className="font-bold text-sm text-slate-800 truncate" title={fund.name}>{fund.name}</div>
        <div className="flex items-baseline gap-2 mt-2">
          <span className={cn("text-2xl font-black tabular-nums",
            fund.estimateChangePercent > 0 ? "text-red-600" : fund.estimateChangePercent < 0 ? "text-green-600" : "text-slate-600"
          )}>
            {fund.estimateChangePercent > 0 ? "+" : ""}{fund.estimateChangePercent.toFixed(2)}%
          </span>
          <span className="text-xs text-slate-400 font-mono">{fund.estimateNetValue.toFixed(4)}</span>
        </div>
      </div>

      <div className="px-3"><MiniTrendChart data={fund.trendData} isPositive={(fund.yearChangePercent || 0) > 0} /></div>

      <div className="px-4 pb-2">
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[{ label: "近3月", val: fund.quarterChangePercent }, { label: "近6月", val: fund.halfYearChangePercent }, { label: "近1年", val: fund.yearChangePercent }].map(m => (
            <div key={m.label} className="bg-slate-50 rounded-md py-1.5 px-1">
              <div className="text-[9px] text-slate-400">{m.label}</div>
              <div className={cn("text-xs font-bold tabular-nums", (m.val || 0) > 0 ? "text-red-600" : (m.val || 0) < 0 ? "text-green-600" : "text-slate-400")}>
                {(m.val || 0) > 0 ? "+" : ""}{(m.val || 0).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compact Strategy */}
      <div className="px-4 pb-2">
        <div className={cn("rounded-lg p-2.5 text-xs border",
          fund.guidance.riskLevel === "High" ? "bg-orange-50 border-orange-100 text-orange-900"
            : fund.guidance.action === "Buy" ? "bg-red-50 border-red-100 text-red-900"
              : "bg-slate-50 border-slate-100 text-slate-700"
        )}>
          <div className="flex items-center gap-1.5 font-bold">
            <Zap className="w-3 h-3" />
            {fund.guidance.title}
            <span className="ml-auto text-[9px] font-mono opacity-60">Score {fund.score.toFixed(0)}</span>
          </div>
          <div className="text-[11px] opacity-85 leading-relaxed line-clamp-2 mt-0.5">{fund.guidance.reason}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-3 flex items-center justify-between border-t border-slate-50 pt-2">
        <Badge
          variant="outline"
          className="text-[9px] h-4 px-1 text-slate-400 border-slate-200"
          title={fund.benchmarkName ? `比较基准：${fund.benchmarkName}` : "该类别没有可比的境内基准，未计算日内 Alpha"}
        >
          {fund.category}
        </Badge>
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {!isHeld && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-slate-400 hover:text-red-500 px-2" onClick={() => onAddHolding(fund.code, fund.name)}>
              <ShoppingCart className="w-3 h-3 mr-0.5" /> 建仓
            </Button>
          )}
          {isCustom ? (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-amber-500 hover:text-amber-600 px-2" onClick={() => onRemoveCustom(fund.code)}>
              <Star className="w-3 h-3 mr-0.5 fill-current" /> 已自选
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-slate-400 hover:text-amber-500 px-2" onClick={() => onAddCustom(fund.code)}>
              <Star className="w-3 h-3 mr-0.5" /> 自选
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
});

// ===================== LIST ROW =====================

const FundListRow: React.FC<{
  fund: ExtendedFund; isHeld: boolean; isCustom?: boolean;
  onAddCustom?: (code: string) => void; onRemoveCustom?: (code: string) => void;
  onAddHolding: (code: string, name: string) => void;
  onClick: (fund: ExtendedFund) => void;
  compareMode?: boolean; isCompared?: boolean; onToggleCompare?: (code: string) => void;
  onSignalClick?: (action: string) => void;
}> = React.memo(({ fund, isHeld, isCustom, onAddCustom, onRemoveCustom, onAddHolding, onClick, compareMode, isCompared, onToggleCompare, onSignalClick }) => {
  const actionStyle = fund.guidance.action === "Buy" ? "bg-red-600 text-white" : fund.guidance.action === "Sell" ? "bg-green-600 text-white" : fund.guidance.action === "Hold" ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600";
  return (
    <tr className={cn("border-b border-slate-50 hover:bg-slate-50/50 transition-colors group cursor-pointer", isCompared && "bg-blue-50/50")}
      onClick={() => compareMode && onToggleCompare ? onToggleCompare(fund.code) : onClick(fund)}>
      <td className="p-3 pl-4">
        <div className="flex items-center gap-2">
          {compareMode && (
            <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
              isCompared ? "bg-blue-500 border-blue-500" : "border-slate-300 bg-white"
            )}>
              {isCompared && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
          )}
          <div className="font-bold text-sm text-slate-800 truncate max-w-[180px]">{fund.name}</div>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] font-mono text-slate-400">{fund.code}</span>
          <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1 border-0", fund.isEtf ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600")}>{fund.isEtf ? "ETF" : "OTC"}</Badge>
          {isHeld && <Badge className="text-[8px] h-3.5 px-1 bg-amber-50 text-amber-600 border-amber-200">持仓</Badge>}
        </div>
      </td>
      <td className="p-3 text-right">
        <span className={cn("text-sm font-black tabular-nums", fund.estimateChangePercent > 0 ? "text-red-600" : fund.estimateChangePercent < 0 ? "text-green-600" : "text-slate-500")}>
          {fund.estimateChangePercent > 0 ? "+" : ""}{fund.estimateChangePercent.toFixed(2)}%
        </span>
      </td>
      <td className="p-3 text-right font-mono text-xs text-slate-600">{fund.estimateNetValue.toFixed(4)}</td>
      <td className="p-3 text-right"><span className={cn("text-xs font-bold tabular-nums", (fund.quarterChangePercent || 0) > 0 ? "text-red-500" : "text-green-500")}>{(fund.quarterChangePercent || 0) > 0 ? "+" : ""}{(fund.quarterChangePercent || 0).toFixed(1)}%</span></td>
      <td className="p-3 text-right"><span className={cn("text-xs font-bold tabular-nums", (fund.yearChangePercent || 0) > 0 ? "text-red-500" : "text-green-500")}>{(fund.yearChangePercent || 0) > 0 ? "+" : ""}{(fund.yearChangePercent || 0).toFixed(1)}%</span></td>
      <td className="p-3 text-right"><span className="text-sm font-black tabular-nums text-slate-700">{fund.score.toFixed(0)}</span></td>
      <td className="p-3 text-center" onClick={e => { e.stopPropagation(); onSignalClick?.(fund.signal.action); }}>
        <Badge className={cn("text-[9px] font-bold h-5 px-1.5 border-0 cursor-pointer hover:ring-1 hover:ring-offset-1 hover:ring-slate-300 transition-shadow", actionStyle)} title={`点击筛选"${fund.signal.action}"信号`}>{fund.signal.action}</Badge>
        <div className="text-[8px] text-slate-400 mt-0.5 truncate max-w-[60px]" title={fund.signal.desc}>{fund.signal.desc}</div>
      </td>
      <td className="p-3 pr-4 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5">
          <button
            className={cn("h-6 w-6 flex items-center justify-center rounded transition-all",
              isCustom ? "text-amber-500 hover:text-amber-600" : "text-slate-400 hover:text-amber-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            )}
            onClick={() => isCustom ? onRemoveCustom?.(fund.code) : onAddCustom?.(fund.code)}
            title={isCustom ? "移除自选" : "加入自选"}
            aria-label={isCustom ? `将 ${fund.name} 移出自选` : `将 ${fund.name} 加入自选`}>
            {isCustom ? <Star className="w-3.5 h-3.5 fill-current" /> : <Star className="w-3.5 h-3.5" />}
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-slate-400 hover:text-red-500 px-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
            onClick={() => onAddHolding(fund.code, fund.name)}
            aria-label={`将 ${fund.name} 加入持仓`}
            title="加入持仓"
          >
            <ShoppingCart className="w-3 h-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
});

// ===================== FUND DETAIL DIALOG =====================

const FundDetailDialog: React.FC<{
  fund: ExtendedFund | null;
  open: boolean;
  onClose: () => void;
  isHeld: boolean;
  onAddHolding: (code: string, name: string) => void;
}> = ({ fund, open, onClose, isHeld, onAddHolding }) => {
  if (!fund) return null;
  const upsideToHigh = fund.estimateNetValue > 0 ? ((fund.prediction.targetHigh - fund.estimateNetValue) / fund.estimateNetValue) * 100 : 0;
  const downsideToLow = fund.estimateNetValue > 0 ? ((fund.prediction.targetLow - fund.estimateNetValue) / fund.estimateNetValue) * 100 : 0;
  const actionBg = fund.guidance.action === "Buy" ? "bg-red-600" : fund.guidance.action === "Sell" ? "bg-green-600" : fund.guidance.action === "Hold" ? "bg-blue-600" : "bg-slate-500";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-black text-lg">{fund.name}</span>
            <Badge variant="outline" className="text-[9px] font-mono">{fund.code}</Badge>
            <Badge variant="outline" className={cn("text-[9px] border-0", fund.isEtf ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600")}>
              {fund.isEtf ? "ETF" : "OTC"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {fund.category} · Score {fund.score.toFixed(0)} · {fund.benchmarkName ? `基准 ${fund.benchmarkName}` : "未套用境内基准"} · 源数据 {formatDataAge(fund.dataAgeMs)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span className={cn("text-3xl font-black tabular-nums", fund.estimateChangePercent > 0 ? "text-red-600" : fund.estimateChangePercent < 0 ? "text-green-600" : "text-slate-600")}>
              {fund.estimateChangePercent > 0 ? "+" : ""}{fund.estimateChangePercent.toFixed(2)}%
            </span>
            <span className="text-sm text-slate-400 font-mono">净值 {fund.estimateNetValue.toFixed(4)}</span>
          </div>

          {/* Large Trend Chart */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 mb-1">近1年走势 (累计收益%)</div>
            <MiniTrendChart data={fund.trendData} isPositive={(fund.yearChangePercent || 0) > 0} height={120} />
          </div>

          {/* Performance Grid */}
          <div className="grid grid-cols-5 gap-2 text-center">
            {[
              { label: "近3月", val: fund.quarterChangePercent },
              { label: "近6月", val: fund.halfYearChangePercent },
              { label: "近1年", val: fund.yearChangePercent },
              { label: "波动率", val: fund.volatility, suffix: "", neutral: true },
              { label: "最大回撤", val: fund.maxDrawdown ? -fund.maxDrawdown : 0, suffix: "", isDrawdown: true },
            ].map(m => (
              <div key={m.label} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                <div className="text-[9px] text-slate-400 mb-0.5">{m.label}</div>
                <div className={cn("text-sm font-bold tabular-nums",
                  (m as any).isDrawdown ? ((m.val || 0) < -20 ? "text-red-600" : "text-green-600")
                    : m.neutral ? "text-slate-600" : (m.val || 0) > 0 ? "text-red-600" : (m.val || 0) < 0 ? "text-green-600" : "text-slate-400"
                )}>
                  {!m.neutral && !(m as any).isDrawdown && (m.val || 0) > 0 ? "+" : ""}{(m.val || 0).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>

          {/* Technical */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              <div className="text-[9px] text-slate-400">RSI(12)</div>
              <div className={cn("font-bold tabular-nums", fund.rsi > 70 ? "text-red-600" : fund.rsi < 30 ? "text-green-600" : "text-slate-600")}>{fund.rsi.toFixed(1)}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              <div className="text-[9px] text-slate-400">MFI(14)</div>
              <div className={cn("font-bold tabular-nums", fund.mfi > 70 ? "text-red-600" : fund.mfi < 30 ? "text-green-600" : "text-slate-600")}>{fund.mfi.toFixed(1)}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              <div className="text-[9px] text-slate-400">趋势强度</div>
              <div className="font-bold text-slate-600">{fund.prediction.trendStrength.toFixed(0)}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              <div className="text-[9px] text-slate-400">量比</div>
              <div className={cn("font-bold tabular-nums", fund.volumeRatio > 1.5 ? "text-red-600" : "text-slate-600")}>{fund.isEtf ? fund.volumeRatio.toFixed(2) : "-"}</div>
            </div>
          </div>

          {/* AI Prediction */}
          <div className="bg-indigo-50/50 rounded-lg p-3 border border-indigo-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5"><BrainCircuit className="w-4 h-4 text-indigo-500" /><span className="text-xs font-bold text-slate-700">滚动趋势推演（3日）</span></div>
              <span className="text-[10px] font-mono text-slate-400">
                规则信心 {fund.prediction.confidence.toFixed(0)}% · 滚动命中 {fund.prediction.winRate.toFixed(0)}%/{fund.prediction.sampleSize}样本 · 数据{fund.prediction.dataReliability === "HIGH" ? "高" : fund.prediction.dataReliability === "MEDIUM" ? "中" : "低"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 text-center p-2 bg-red-50 rounded-lg border border-red-100">
                <div className="text-[10px] text-slate-400">阻力位</div>
                <div className="font-mono font-bold text-red-600">{fund.prediction.targetHigh.toFixed(4)}</div>
                <div className="text-[10px] text-red-400">+{upsideToHigh.toFixed(2)}%</div>
              </div>
              <ArrowUpDown className="w-4 h-4 text-slate-300 shrink-0" />
              <div className="flex-1 text-center p-2 bg-green-50 rounded-lg border border-green-100">
                <div className="text-[10px] text-slate-400">支撑位</div>
                <div className="font-mono font-bold text-green-600">{fund.prediction.targetLow.toFixed(4)}</div>
                <div className="text-[10px] text-green-500">{downsideToLow.toFixed(2)}%</div>
              </div>
            </div>
          </div>

          {/* Strategy */}
          <div className={cn("rounded-lg p-4 border",
            fund.guidance.riskLevel === "High" ? "bg-orange-50 border-orange-200 text-orange-900"
              : fund.guidance.action === "Buy" ? "bg-red-50 border-red-200 text-red-900"
                : "bg-slate-50 border-slate-200 text-slate-700"
          )}>
            <div className="flex items-center gap-2 font-bold text-sm mb-1.5">
              <Zap className="w-4 h-4" />
              {fund.guidance.title}
              <Badge className={cn("text-[10px] h-5 border-0 ml-auto text-white", actionBg)}>{fund.guidance.action}</Badge>
            </div>
            <div className="text-sm opacity-90 leading-relaxed">{fund.guidance.reason}</div>
            <div className="mt-2 flex items-center justify-between text-xs font-medium opacity-70">
              <span>建议仓位: {fund.guidance.position}</span>
              <span>风险等级: {fund.guidance.riskLevel}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {!isHeld && (
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1.5" onClick={() => { onAddHolding(fund.code, fund.name); onClose(); }}>
                <ShoppingCart className="w-4 h-4" /> 建仓
              </Button>
            )}
            <Button variant="outline" className="flex-1" onClick={onClose}>关闭</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===================== HOLDING DETAIL DIALOG (V67.6) =====================

const HoldingDetailDialog: React.FC<{
  holding: FundHolding | null;
  fund: ExtendedFund | null;
  open: boolean;
  onClose: () => void;
  onAddTx: (h: FundHolding, type: "buy" | "sell") => void;
  onViewTx: (h: FundHolding) => void;
}> = ({ holding, fund, open, onClose, onAddTx, onViewTx }) => {
  if (!holding) return null;

  const hasFundData = !!fund;
  const currentNav = fund?.estimateNetValue || holding.costPerUnit;
  const holdingCost = holding.costPerUnit * holding.shares;
  const holdingValue = currentNav * holding.shares;
  const pnl = holdingValue - holdingCost;
  const pnlPct = holdingCost > 0 ? (pnl / holdingCost) * 100 : 0;
  const dailyChange = fund?.estimateChangePercent || 0;
  const todayPnl = holdingValue * (dailyChange / 100);
  const holdDays = Math.max(1, Math.floor((Date.now() - new Date(holding.buyDate).getTime()) / 86400000));
  const annualizedReturn = holdDays > 0 ? (pnlPct / holdDays) * 365 : 0;
  const txCount = holding.transactions?.length || 0;
  const upsideToHigh = hasFundData && currentNav > 0 ? ((fund!.prediction.targetHigh - currentNav) / currentNav) * 100 : 0;
  const downsideToLow = hasFundData && currentNav > 0 ? ((fund!.prediction.targetLow - currentNav) / currentNav) * 100 : 0;
  const actionBg = !hasFundData ? "bg-slate-500" : fund!.guidance.action === "Buy" ? "bg-red-600" : fund!.guidance.action === "Sell" ? "bg-green-600" : fund!.guidance.action === "Hold" ? "bg-blue-600" : "bg-slate-500";

  const costToSupport = hasFundData && holding.costPerUnit > 0 ? ((fund!.supportLevel - holding.costPerUnit) / holding.costPerUnit) * 100 : 0;
  const costToPressure = hasFundData && holding.costPerUnit > 0 ? ((fund!.pressureLevel - holding.costPerUnit) / holding.costPerUnit) * 100 : 0;

  const displayName = fund?.name || holding.name || holding.code;
  const displayCode = fund?.code || holding.code;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {/* Header with gradient */}
        <div className={cn("px-5 pt-5 pb-4 rounded-t-lg",
          pnl >= 0 ? "bg-gradient-to-br from-red-50 to-orange-50" : "bg-gradient-to-br from-green-50 to-emerald-50"
        )}>
          <DialogHeader className="mb-0">
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-lg">{displayName}</span>
              <Badge variant="outline" className="text-[9px] font-mono">{displayCode}</Badge>
              {hasFundData && (
                <Badge variant="outline" className={cn("text-[9px] border-0", fund!.isEtf ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600")}>
                  {fund!.isEtf ? "ETF" : "OTC"}
                </Badge>
              )}
              {holding.tag && TAG_MAP[holding.tag] && (() => {
                const t = TAG_MAP[holding.tag!]; const Icon = t.icon;
                return <span className={cn("inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border", t.color)}><Icon className="w-2.5 h-2.5" />{t.label}</span>;
              })()}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {hasFundData ? `${fund!.category} · ${fund!.signal.action} · 评分 ${fund!.score.toFixed(0)}` : `持仓详情 · 首次买入 ${holding.buyDate}`}
            </DialogDescription>
          </DialogHeader>

          {/* P&L Hero */}
          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">持仓盈亏</div>
              <div className={cn("text-3xl font-black tabular-nums leading-tight", pnl >= 0 ? "text-red-600" : "text-green-600")}>
                {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
              </div>
              <div className={cn("text-sm font-bold", pnlPct >= 0 ? "text-red-500" : "text-green-500")}>
                {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
              </div>
            </div>
            <div className="text-right space-y-0.5">
              {hasFundData && (
                <>
                  <div className={cn("text-sm font-bold tabular-nums", dailyChange >= 0 ? "text-red-500" : "text-green-500")}>
                    今日 {dailyChange >= 0 ? "+" : ""}{dailyChange.toFixed(2)}%
                  </div>
                  <div className={cn("text-xs tabular-nums", todayPnl >= 0 ? "text-red-400" : "text-green-400")}>
                    {todayPnl >= 0 ? "+" : ""}{todayPnl.toFixed(2)}元
                  </div>
                </>
              )}
              <div className="text-[10px] text-slate-400">持有 {holdDays} 天</div>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Holding Metrics Grid */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "成本价", value: holding.costPerUnit.toFixed(4), color: "text-slate-700" },
              { label: "现价", value: currentNav.toFixed(4), color: dailyChange > 0 ? "text-red-600" : dailyChange < 0 ? "text-green-600" : "text-slate-600" },
              { label: "持有份额", value: holding.shares >= 1000 ? `${(holding.shares / 1000).toFixed(1)}k` : holding.shares.toFixed(2), color: "text-slate-700" },
              { label: "持仓市值", value: `¥${holdingValue >= 10000 ? (holdingValue / 10000).toFixed(2) + "万" : holdingValue.toFixed(0)}`, color: "text-slate-800" },
            ].map(m => (
              <div key={m.label} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                <div className="text-[9px] text-slate-400">{m.label}</div>
                <div className={cn("text-xs font-bold tabular-nums", m.color)}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Annualized + Realized */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              <div className="text-[9px] text-slate-400">年化收益</div>
              <div className={cn("text-xs font-bold tabular-nums", annualizedReturn >= 0 ? "text-red-600" : "text-green-600")}>
                {annualizedReturn >= 0 ? "+" : ""}{annualizedReturn.toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              <div className="text-[9px] text-slate-400">已实现盈亏</div>
              <div className={cn("text-xs font-bold tabular-nums", (holding.realizedPnL || 0) >= 0 ? "text-red-600" : "text-green-600")}>
                {(holding.realizedPnL || 0) >= 0 ? "+" : ""}{(holding.realizedPnL || 0).toFixed(2)}
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
              <div className="text-[9px] text-slate-400">交易次数</div>
              <div className="text-xs font-bold tabular-nums text-slate-700">{txCount} 笔</div>
            </div>
          </div>

          {/* Fund analysis sections — only when fund data is available */}
          {hasFundData && (
            <>
              {/* Trend Chart */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 mb-1">近1年走势 (累计收益%)</div>
                <MiniTrendChart data={fund!.trendData} isPositive={(fund!.yearChangePercent || 0) > 0} height={100} />
              </div>

              {/* Performance Periods */}
              <div className="grid grid-cols-5 gap-1.5 text-center">
                {[
                  { label: "今日", val: fund!.estimateChangePercent },
                  { label: "近3月", val: fund!.quarterChangePercent },
                  { label: "近6月", val: fund!.halfYearChangePercent },
                  { label: "近1年", val: fund!.yearChangePercent },
                  { label: "最大回撤", val: fund!.maxDrawdown ? -fund!.maxDrawdown : 0, isDrawdown: true },
                ].map(m => (
              <div key={m.label} className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                <div className="text-[8px] text-slate-400">{m.label}</div>
                <div className={cn("text-[11px] font-bold tabular-nums",
                  (m as any).isDrawdown ? ((m.val || 0) < -20 ? "text-red-600" : "text-green-600")
                    : (m.val || 0) > 0 ? "text-red-600" : (m.val || 0) < 0 ? "text-green-600" : "text-slate-400"
                )}>
                  {!(m as any).isDrawdown && (m.val || 0) > 0 ? "+" : ""}{(m.val || 0).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>

              {/* Technical Indicators */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="text-[9px] text-slate-400">RSI(12)</div>
                  <div className={cn("font-bold tabular-nums", fund!.rsi > 70 ? "text-red-600" : fund!.rsi < 30 ? "text-green-600" : "text-slate-600")}>{fund!.rsi.toFixed(1)}</div>
                  <div className="text-[8px] text-slate-300">{fund!.rsi > 70 ? "超买" : fund!.rsi < 30 ? "超卖" : "中性"}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="text-[9px] text-slate-400">MFI(14)</div>
                  <div className={cn("font-bold tabular-nums", fund!.mfi > 70 ? "text-red-600" : fund!.mfi < 30 ? "text-green-600" : "text-slate-600")}>{fund!.mfi.toFixed(1)}</div>
                  <div className="text-[8px] text-slate-300">{fund!.mfi > 70 ? "资金涌入" : fund!.mfi < 30 ? "资金流出" : "均衡"}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="text-[9px] text-slate-400">波动率</div>
                  <div className={cn("font-bold tabular-nums", fund!.volatility > 25 ? "text-orange-600" : "text-slate-600")}>{fund!.volatility.toFixed(1)}%</div>
                  <div className="text-[8px] text-slate-300">{fund!.volatility > 30 ? "高波动" : fund!.volatility > 15 ? "中等" : "低波"}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="text-[9px] text-slate-400">量比</div>
                  <div className={cn("font-bold tabular-nums", fund!.volumeRatio > 1.5 ? "text-red-600" : "text-slate-600")}>{fund!.isEtf ? fund!.volumeRatio.toFixed(2) : "-"}</div>
                  <div className="text-[8px] text-slate-300">{fund!.isEtf ? (fund!.volumeRatio > 1.5 ? "放量" : "缩量") : "场外"}</div>
                </div>
              </div>

              {/* AI Prediction & Levels */}
              <div className="bg-indigo-50/50 rounded-lg p-3 border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5"><BrainCircuit className="w-4 h-4 text-indigo-500" /><span className="text-xs font-bold text-slate-700">滚动趋势推演（3日）</span></div>
                  <span className="text-[10px] font-mono text-slate-400">
                    规则信心 {fund!.prediction.confidence.toFixed(0)}% · 滚动命中 {fund!.prediction.winRate.toFixed(0)}%/{fund!.prediction.sampleSize}样本 · 数据{fund!.prediction.dataReliability === "HIGH" ? "高" : fund!.prediction.dataReliability === "MEDIUM" ? "中" : "低"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-center p-2 bg-red-50 rounded-lg border border-red-100">
                    <div className="text-[9px] text-slate-400">阻力位</div>
                    <div className="font-mono font-bold text-red-600 text-sm">{fund!.prediction.targetHigh.toFixed(4)}</div>
                    <div className="text-[9px] text-red-400">+{upsideToHigh.toFixed(2)}%</div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <ArrowUpFromLine className="w-3 h-3 text-red-300" />
                    <div className="text-[8px] font-mono text-slate-400">{currentNav.toFixed(4)}</div>
                    <ArrowDownFromLine className="w-3 h-3 text-green-300" />
                  </div>
                  <div className="flex-1 text-center p-2 bg-green-50 rounded-lg border border-green-100">
                    <div className="text-[9px] text-slate-400">支撑位</div>
                    <div className="font-mono font-bold text-green-600 text-sm">{fund!.prediction.targetLow.toFixed(4)}</div>
                    <div className="text-[9px] text-green-500">{downsideToLow.toFixed(2)}%</div>
                  </div>
                </div>
                {/* Cost basis vs levels */}
                <div className="flex items-center gap-3 pt-1 border-t border-indigo-100/50">
                  <div className="text-[9px] text-indigo-400 font-bold">成本距离</div>
                  <div className="flex-1 flex items-center gap-2 text-[9px]">
                    <span className="text-slate-400">阻力:</span>
                    <span className={cn("font-bold tabular-nums", costToPressure >= 0 ? "text-red-500" : "text-green-500")}>
                      {costToPressure >= 0 ? "+" : ""}{costToPressure.toFixed(2)}%
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-400">支撑:</span>
                    <span className={cn("font-bold tabular-nums", costToSupport >= 0 ? "text-red-500" : "text-green-500")}>
                      {costToSupport >= 0 ? "+" : ""}{costToSupport.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Strategy Guidance */}
              <div className={cn("rounded-lg p-3 border",
                fund!.guidance.riskLevel === "High" ? "bg-orange-50 border-orange-200 text-orange-900"
                  : fund!.guidance.action === "Buy" ? "bg-red-50 border-red-200 text-red-900"
                    : fund!.guidance.action === "Sell" ? "bg-green-50 border-green-200 text-green-900"
                      : "bg-slate-50 border-slate-200 text-slate-700"
              )}>
                <div className="flex items-center gap-2 font-bold text-sm mb-1.5">
                  <Zap className="w-4 h-4" />
                  {fund!.guidance.title}
                  <Badge className={cn("text-[10px] h-5 border-0 ml-auto text-white", actionBg)}>{fund!.guidance.action}</Badge>
                </div>
                <div className="text-xs opacity-90 leading-relaxed">{fund!.guidance.reason}</div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-medium opacity-70">
                  <span>建议仓位: {fund!.guidance.position}</span>
                  <span>风险等级: {fund!.guidance.riskLevel}</span>
                </div>
              </div>
            </>
          )}

          {/* No fund data hint */}
          {!hasFundData && (
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-amber-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>该基金尚未加载行情数据，无法显示走势、技术指标和策略建议。请先在「基金雷达」板块加载该基金数据。</span>
            </div>
          )}

          {/* Recent Transactions */}
          {holding.transactions && holding.transactions.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-slate-500 flex items-center gap-1"><History className="w-3 h-3" /> 最近交易</div>
                {txCount > 3 && <button onClick={() => { onViewTx(holding); onClose(); }} className="text-[10px] text-blue-500 font-bold hover:underline">查看全部 →</button>}
              </div>
              <div className="space-y-1">
                {holding.transactions.slice(-3).reverse().map(tx => (
                  <div key={tx.id} className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("font-bold px-1 py-0 rounded text-white text-[8px]", tx.type === "buy" ? "bg-red-500" : "bg-green-500")}>
                        {tx.type === "buy" ? "买" : "卖"}
                      </span>
                      <span className="text-slate-400 font-mono">{tx.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-500">{tx.pricePerUnit.toFixed(4)}</span>
                      <span className="font-mono text-slate-600 font-bold">{tx.shares.toFixed(0)}份</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1 text-xs" onClick={() => { onAddTx(holding, "buy"); onClose(); }}>
              <Plus className="w-3.5 h-3.5" /> 加仓
            </Button>
            {holding.shares > 0 && (
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1 text-xs" onClick={() => { onAddTx(holding, "sell"); onClose(); }}>
                <Minus className="w-3.5 h-3.5" /> 减仓
              </Button>
            )}
            <Button variant="outline" className="flex-1 gap-1 text-xs" onClick={() => { onViewTx(holding); onClose(); }}>
              <History className="w-3.5 h-3.5" /> 交易记录
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===================== TRANSACTION DIALOG =====================

const TransactionDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  holding: FundHolding | null;
  txType: "buy" | "sell";
  onSave: (holdingId: string, tx: Omit<FundTransaction, "id">) => void;
}> = ({ open, onClose, holding, txType, onSave }) => {
  const [price, setPrice] = useState("");
  const [shares, setShares] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) { setPrice(""); setShares(""); setDate(new Date().toISOString().slice(0, 10)); setNote(""); }
  }, [open]);

  if (!holding) return null;

  const handleSave = () => {
    const p = parseFloat(price);
    const s = parseFloat(shares);
    if (isNaN(p) || isNaN(s) || p <= 0 || s <= 0) { toast.error("请填写有效的价格和份额"); return; }
    if (txType === "sell" && s > holding.shares) { toast.error(`最多可卖出 ${holding.shares.toFixed(2)} 份`); return; }
    onSave(holding.id, { type: txType, pricePerUnit: p, shares: s, date, note: note || undefined });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {txType === "buy" ? <Plus className="w-4 h-4 text-red-600" /> : <Minus className="w-4 h-4 text-green-600" />}
            {txType === "buy" ? "加仓" : "减仓"} · {holding.name || holding.code}
          </DialogTitle>
          <DialogDescription>
            {txType === "buy" ? "追加买入，自动计算加权平均成本。" : `当前持有 ${holding.shares.toFixed(2)} 份，卖出后自动计算已实现盈亏。`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">{txType === "buy" ? "买入净值" : "卖出净值"}</label>
              <Input value={price} onChange={e => setPrice(e.target.value)} placeholder="1.2345" type="number" step="0.0001" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">{txType === "buy" ? "买入份额" : "卖出份额"}</label>
              <Input value={shares} onChange={e => setShares(e.target.value)} placeholder="1000" type="number" step="0.01" />
              {txType === "sell" && <div className="text-[10px] text-slate-400 mt-0.5">可用 {holding.shares.toFixed(2)}</div>}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">日期</label>
            <Input value={date} onChange={e => setDate(e.target.value)} type="date" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">备注 (选填)</label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="如: 回调加仓" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} className={cn("text-white gap-1.5", txType === "buy" ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700")}>
            <Check className="w-3.5 h-3.5" /> 确认{txType === "buy" ? "加仓" : "减仓"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===================== TRANSACTION HISTORY DIALOG =====================

const TxHistoryDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  holding: FundHolding | null;
  fundMap: Map<string, ExtendedFund>;
}> = ({ open, onClose, holding, fundMap }) => {
  if (!holding) return null;
  const fund = fundMap.get(holding.code);
  const txs = [...(holding.transactions || [])].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            交易记录 · {fund?.name || holding.name || holding.code}
          </DialogTitle>
          <DialogDescription>
            加权成本: {holding.costPerUnit.toFixed(4)} · 当前份额: {holding.shares.toFixed(2)}
            {(holding.realizedPnL || 0) !== 0 && ` · 已实现: ${(holding.realizedPnL || 0) >= 0 ? "+" : ""}${(holding.realizedPnL || 0).toFixed(2)}`}
          </DialogDescription>
        </DialogHeader>
        {txs.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">暂无交易记录</div>
        ) : (
          <div className="space-y-2 py-2">
            {txs.map(tx => (
              <div key={tx.id} className={cn("flex items-center gap-3 p-3 rounded-lg border",
                tx.type === "buy" ? "bg-red-50/50 border-red-100" : "bg-green-50/50 border-green-100"
              )}>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  tx.type === "buy" ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                )}>
                  {tx.type === "buy" ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-slate-700">{tx.type === "buy" ? "买入" : "卖出"}</span>
                    <span className="text-[10px] text-slate-400">{tx.date}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {tx.pricePerUnit.toFixed(4)} × {tx.shares.toFixed(2)}份 = ¥{(tx.pricePerUnit * tx.shares).toFixed(2)}
                  </div>
                  {tx.note && <div className="text-[10px] text-slate-400 mt-0.5">{tx.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" className="w-full" onClick={onClose}>关闭</Button>
      </DialogContent>
    </Dialog>
  );
};

// ===================== HOLDING (NEW) DIALOG =====================

const HoldingDialog: React.FC<{
  open: boolean; onClose: () => void;
  onSave: (h: Omit<FundHolding, "id">) => void;
  prefillCode?: string; prefillName?: string;
}> = ({ open, onClose, onSave, prefillCode, prefillName }) => {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [shares, setShares] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) { setCode(prefillCode || ""); setName(prefillName || ""); setCost(""); setShares(""); setDate(new Date().toISOString().slice(0, 10)); }
  }, [open, prefillCode, prefillName]);

  const handleSave = () => {
    const c = parseFloat(cost); const s = parseFloat(shares);
    if (!code || code.length !== 6 || isNaN(c) || isNaN(s) || c <= 0 || s <= 0) { toast.error("请填写完整且有效的信息"); return; }
    onSave({
      code, name, costPerUnit: c, shares: s, buyDate: date,
      transactions: [{ id: `tx_new_${Date.now()}`, type: "buy", pricePerUnit: c, shares: s, date }],
      realizedPnL: 0,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-red-600" /> 添加持仓</DialogTitle>
          <DialogDescription>记录你的基金买入信息，自动计算盈亏。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">基金代码</label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="510300" maxLength={6} className="font-mono" /></div>
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">基金名称 (选填)</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="自动获取" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">买入成本 (净值)</label><Input value={cost} onChange={e => setCost(e.target.value)} placeholder="1.2345" type="number" step="0.0001" /></div>
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">持有份额</label><Input value={shares} onChange={e => setShares(e.target.value)} placeholder="1000" type="number" step="0.01" /></div>
          </div>
          <div><label className="text-xs font-bold text-slate-500 mb-1 block">买入日期</label><Input value={date} onChange={e => setDate(e.target.value)} type="date" /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} className="bg-red-600 hover:bg-red-700 text-white gap-1.5"><Check className="w-3.5 h-3.5" /> 确认添加</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===================== SKELETON =====================

const FundCardSkeleton = () => (
  <div className="border border-slate-200 rounded-xl p-0 overflow-hidden bg-white shadow-sm border-l-4 border-l-slate-200">
    <div className="p-4 pb-2 space-y-2">
      <div className="flex justify-between"><Skeleton className="h-4 w-16" /><Skeleton className="h-5 w-14" /></div>
      <Skeleton className="h-4 w-3/4" /><Skeleton className="h-8 w-28" />
    </div>
    <div className="px-3"><Skeleton className="h-12 w-full" /></div>
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-3 gap-1.5"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      <Skeleton className="h-16" />
    </div>
  </div>
);

// V66.7: List view loading skeleton
const FundListSkeleton = () => (
  <Card className="bg-white overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <th className="text-left p-3 pl-4">基金</th>
            <th className="text-right p-3">日涨幅</th>
            <th className="text-right p-3">净值</th>
            <th className="text-right p-3">近3月</th>
            <th className="text-right p-3">近1年</th>
            <th className="text-right p-3">评分</th>
            <th className="text-center p-3">信号</th>
            <th className="text-right p-3 pr-4">操作</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }).map((_, i) => (
            <tr key={i} className="border-b border-slate-50">
              <td className="p-3 pl-4">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </td>
              <td className="p-3 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
              <td className="p-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
              <td className="p-3 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
              <td className="p-3 text-right"><Skeleton className="h-4 w-14 ml-auto" /></td>
              <td className="p-3 text-right"><Skeleton className="h-5 w-10 ml-auto rounded-full" /></td>
              <td className="p-3 text-center"><Skeleton className="h-5 w-16 mx-auto rounded-full" /></td>
              <td className="p-3 pr-4 text-right"><Skeleton className="h-6 w-6 ml-auto rounded" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
);

// ===================== IMAGE OCR IMPORT DIALOG =====================

interface OcrResult {
  code: string;
  name: string;
  alreadyExists: boolean;
  selected: boolean;
}

const ImageImportDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  existingCodes: string[];
  existingFunds: { code: string; name: string }[];
  onImport: (codes: string[]) => void;
}> = ({ open, onClose, existingCodes, existingFunds, onImport }) => {
  const [mode, setMode] = useState<"image" | "text">("image");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [results, setResults] = useState<OcrResult[]>([]);
  const [ocrDone, setOcrDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseLoading, setParsing] = useState(false); // V67.1: loading state for async name search

  useEffect(() => {
    if (open) { setImagePreview(null); setOcrProcessing(false); setOcrProgress(0); setTextInput(""); setResults([]); setOcrDone(false); setMode("image"); setParsing(false); }
  }, [open]);

  const extractCodes = useCallback((text: string): OcrResult[] => {
    const codePattern = /\b(\d{6})\b/g;
    const foundCodes = new Set<string>();
    let match;
    while ((match = codePattern.exec(text)) !== null) foundCodes.add(match[1]);
    // Also match known fund names in text
    for (const f of existingFunds) {
      if (f.name && text.includes(f.name) && !foundCodes.has(f.code)) foundCodes.add(f.code);
    }
    return [...foundCodes].map(code => {
      const known = existingFunds.find(f => f.code === code);
      return { code, name: known?.name || "未知基金", alreadyExists: existingCodes.includes(code), selected: !existingCodes.includes(code) };
    });
  }, [existingCodes, existingFunds]);

  // V67.1: Extract unmatched text lines for API name search
  const extractUnmatchedNames = useCallback((text: string, matchedResults: OcrResult[]): string[] => {
    const matchedNames = new Set(matchedResults.map(r => r.name));
    const matchedCodes = new Set(matchedResults.map(r => r.code));
    // Split by newlines, commas, semicolons, Chinese punctuation
    const lines = text.split(/[\n\r,，;；、]+/).map(s => s.trim()).filter(Boolean);
    const unmatchedNames: string[] = [];
    for (const line of lines) {
      if (/^\d{6}$/.test(line)) continue;
      if ([...matchedCodes].some(c => line.includes(c))) continue;
      if ([...matchedNames].some(n => n && line.includes(n))) continue;
      // Strip leading numbering like "1. " or "2、"
      const cleaned = line.replace(/^\d+[\.\s\-、）)]*/, '').replace(/[\s\d.%+-]+$/, '').trim();
      if (cleaned.length >= 2) unmatchedNames.push(cleaned);
    }
    return unmatchedNames;
  }, []);

  // V67.1: Async parse — extracts codes first, then searches API for unmatched fund names
  const handleParseTextAsync = useCallback(async () => {
    const codeResults = extractCodes(textInput);
    const unmatchedNames = extractUnmatchedNames(textInput, codeResults);
    
    console.log(`[ImportDialog] extractCodes: ${codeResults.length} code matches, ${unmatchedNames.length} unmatched names:`, unmatchedNames);

    if (unmatchedNames.length === 0) {
      setResults(codeResults);
      setOcrDone(true);
      if (codeResults.length === 0) toast.error("未识别到任何基金代码或名称");
      return;
    }

    setResults(codeResults);
    setParsing(true);
    setOcrDone(true);

    try {
      const failedNames: string[] = [];
      const searchPromises = unmatchedNames.map(async (name) => {
        try {
          console.log(`[ImportDialog] Searching API for: "${name}"`);
          const apiResults = await searchFundByKeyword(name);
          console.log(`[ImportDialog] API result for "${name}": ${apiResults.length} results`, apiResults.slice(0, 3));
          if (apiResults.length > 0) {
            const best = apiResults[0];
            return { code: best.code, name: best.name, alreadyExists: existingCodes.includes(best.code), selected: !existingCodes.includes(best.code) } as OcrResult;
          }
          failedNames.push(name);
          return null;
        } catch (e) {
          console.warn(`[ImportDialog] API search failed for "${name}":`, e);
          failedNames.push(name);
          return null;
        }
      });

      const apiMatches = (await Promise.all(searchPromises)).filter((r): r is OcrResult => r !== null);
      console.log(`[ImportDialog] API matched ${apiMatches.length}/${unmatchedNames.length}, failed: [${failedNames.join(', ')}]`);

      setResults(prev => {
        const existing = new Set(prev.map(r => r.code));
        const newOnes = apiMatches.filter(r => !existing.has(r.code));
        return [...prev, ...newOnes];
      });

      if (failedNames.length > 0) {
        toast(`${apiMatches.length} 只通过名称匹配成功，${failedNames.length} 只未找到：${failedNames.join('、')}`, { duration: 5000 });
      }
    } catch (err) {
      console.error("Fund name search failed:", err);
      toast.error("基金名称搜索失败，请检查网络连接");
    } finally {
      setParsing(false);
    }
  }, [textInput, extractCodes, extractUnmatchedNames, existingCodes]);

  const handleImageUpload = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setOcrProcessing(true);
      setOcrProgress(0);
      setOcrDone(false);
      try {
        const Tesseract = await import("tesseract.js");
        const worker = await Tesseract.createWorker("chi_sim+eng", undefined, {
          logger: (m: any) => { if (m.status === "recognizing text") setOcrProgress(Math.round(m.progress * 100)); },
        });
        const { data: { text } } = await worker.recognize(dataUrl);
        await worker.terminate();
        setTextInput(text);
        setResults(extractCodes(text));
        setOcrDone(true);
      } catch (err) {
        console.error("OCR failed:", err);
        toast.error("图片识别失败，请尝试切换到「文本导入」模式手动输入基金代码");
        setOcrDone(true);
      } finally { setOcrProcessing(false); }
    };
    reader.readAsDataURL(file);
  }, [extractCodes]);

  const handleParseText = useCallback(() => { handleParseTextAsync(); }, [handleParseTextAsync]);

  const toggleResult = (code: string) => setResults(prev => prev.map(r => r.code === code ? { ...r, selected: !r.selected } : r));

  const handleConfirmImport = () => {
    const codes = results.filter(r => r.selected && !r.alreadyExists).map(r => r.code);
    if (codes.length > 0) { onImport(codes); toast.success(`已添加 ${codes.length} 只基金到自选`); }
    onClose();
  };

  const selectedCount = results.filter(r => r.selected && !r.alreadyExists).length;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ImageUp className="w-5 h-5 text-red-500" /> 图片识别导入基金
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            上传基金截图自动识别代码，或直接粘贴文本批量导入
          </DialogDescription>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button onClick={() => setMode("image")} className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all", mode === "image" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600")}>
            <ImageUp className="w-3.5 h-3.5" /> 截图识别
          </button>
          <button onClick={() => setMode("text")} className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all", mode === "text" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600")}>
            <FileText className="w-3.5 h-3.5" /> 文本导入
          </button>
        </div>

        {/* Image mode */}
        {mode === "image" && (
          <div className="space-y-3">
            {!imagePreview ? (
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full h-40 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-red-300 hover:bg-red-50/30 transition-all group cursor-pointer">
                <ImageUp className="w-8 h-8 text-slate-300 group-hover:text-red-400 transition-colors" />
                <span className="text-sm text-slate-400 group-hover:text-slate-600">点击上传基金截图</span>
                <span className="text-[10px] text-slate-300">支持 JPG / PNG / 截屏</span>
              </button>
            ) : (
              <div className="relative">
                <img src={imagePreview} alt="上传预览" className="w-full rounded-lg border border-slate-200 max-h-52 object-contain bg-slate-50" />
                {ocrProcessing && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                    <div className="text-sm font-bold text-slate-700">正在识别中…</div>
                    <div className="w-40 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: `${ocrProgress}%` }} />
                    </div>
                    <div className="text-[10px] text-slate-400">{ocrProgress}%</div>
                  </div>
                )}
                {!ocrProcessing && (
                  <button onClick={() => { setImagePreview(null); setResults([]); setOcrDone(false); }}
                    className="absolute top-2 right-2 bg-white/90 rounded-full p-1 shadow hover:bg-red-50 transition-colors">
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }} />
            {ocrDone && textInput && (
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">识别文本</span>
                  <button onClick={() => setMode("text")} className="text-[10px] text-blue-500 hover:text-blue-700">编辑</button>
                </div>
                <div className="text-xs text-slate-600 max-h-20 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">{textInput}</div>
              </div>
            )}
          </div>
        )}

        {/* Text mode */}
        {mode === "text" && (
          <div className="space-y-3">
            <textarea className="w-full h-32 rounded-lg border border-slate-200 p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-all"
              placeholder={"支持基金代码或基金名称，每行一个：\n\n例如：\n159869\n广发创新升级灵活配置\n中欧医疗健康C\n天弘中证食品饮料ETF联接C\n\n也支持逗号分隔：159869,516160,510300"}
              value={textInput} onChange={e => setTextInput(e.target.value)} />
            <Button size="sm" onClick={handleParseText} disabled={!textInput.trim() || parseLoading} className="w-full gap-1.5 bg-red-600 hover:bg-red-700 text-white h-9">
              {parseLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在搜索基金名称...</> : <><Search className="w-3.5 h-3.5" /> 解析基金代码 / 名称</>}
            </Button>
          </div>
        )}

        {/* Results */}
        {ocrDone && results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">识别到 {results.length} 只基金</span>
              {selectedCount > 0 && <span className="text-[10px] text-slate-400">已选 {selectedCount} 只新基金</span>}
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
              {results.map(r => (
                <div key={r.code}
                  className={cn("flex items-center gap-3 px-3 py-2.5 transition-colors cursor-pointer",
                    r.alreadyExists ? "bg-slate-50/50 opacity-60" : r.selected ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50"
                  )}
                  onClick={() => !r.alreadyExists && toggleResult(r.code)}>
                  <div className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                    r.alreadyExists ? "border-slate-200 bg-slate-100" : r.selected ? "bg-red-600 border-red-600" : "border-slate-300 bg-white"
                  )}>
                    {(r.selected || r.alreadyExists) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-mono font-bold text-slate-700">{r.code}</span>
                    <span className="text-xs text-slate-500 ml-2 truncate">{r.name}</span>
                  </div>
                  {r.alreadyExists && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0 bg-slate-100 text-slate-400">已在列表</Badge>}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* V67.1: Show loading indicator during API name search */}
        {parseLoading && results.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
            <span className="text-[11px] font-bold text-blue-600">正在通过名称搜索更多基金...</span>
          </div>
        )}
        {ocrDone && results.length === 0 && !parseLoading && (
          <div className="text-center py-6">
            <XCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <div className="text-sm text-slate-500 font-bold">未识别到基金代码或名称</div>
            <div className="text-[10px] text-slate-400 mt-1">请确认输入的基金名称正确，或直接输入6位基金代码</div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1 h-9">取消</Button>
          <Button size="sm" onClick={handleConfirmImport} disabled={selectedCount === 0}
            className={cn("flex-1 h-9 gap-1.5 transition-all", selectedCount > 0 ? "bg-red-600 hover:bg-red-700 text-white" : "")}>
            <Plus className="w-3.5 h-3.5" /> {selectedCount > 0 ? `添加 ${selectedCount} 只基金` : "添加到自选"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===================== MAIN COMPONENT =====================

type SortKey = "score" | "daily" | "quarter" | "year" | "name" | "signal";
type ViewMode = "grid" | "list";

/** Signal tag priority for sorting (higher = more aggressive) */
const SIGNAL_TAG_WEIGHT: Record<string, number> = { Alpha: 4, Beta: 3, Danger: 2, Sleep: 1 };
const SIGNAL_ACTION_WEIGHT: Record<string, number> = {
  "趋势增强": 90, "深度回调": 80, "加仓": 70, "持仓": 50,
  "减仓": 30, "止盈": 20, "警戒": 15, "止损": 10, "观望": 0,
};

const withFundLoadDeadline = async <T,>(
  promise: Promise<T>,
  timeoutMs = 25_000,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('基金数据请求超时，请稍后重试')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const FundRadar: React.FC = () => {
  const { marketThemes = [] } = useTrading();
  const [funds, setFunds] = useState<ExtendedFund[]>(
    () => fundPageSessionCache?.funds || [],
  );
  const [loading, setLoading] = useState(() => !fundPageSessionCache?.funds.length);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(
    () => fundPageSessionCache?.lastRefresh || "",
  );
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [customFunds, setCustomFunds] = useState<string[]>([]);
  const [inputCode, setInputCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);

  // V67 FIX: Refs to latest state to solve stale closure in setTimeout(loadFundData)
  const customFundsRef = useRef<string[]>([]);
  customFundsRef.current = customFunds;
  const fundLoadRequestRef = useRef(0);

  // V67: Fund search suggestions (search by name via API)
  const [searchSuggestions, setSearchSuggestions] = useState<FundSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingApi, setSearchingApi] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // V67: Debounced API search for fund name
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    // Only trigger API search if query is non-empty, not a pure 6-digit code, and has 2+ chars
    if (q.length >= 2 && !/^\d{6}$/.test(q)) {
      // First, check if there are local matches
      const localMatches = funds.filter(f =>
        f.name.toLowerCase().includes(q.toLowerCase()) || f.code.includes(q)
      );
      if (localMatches.length > 0) {
        // Local results exist, show them as suggestions too (for quick add)
        setSearchSuggestions(localMatches.slice(0, 8).map(f => ({ code: f.code, name: f.name, type: f.isEtf ? "ETF" : "基金" })));
        setShowSuggestions(true);
        return;
      }
      // No local match → search API with debounce
      setSearchingApi(true);
      searchTimerRef.current = setTimeout(async () => {
        try {
          const results = await searchFundByKeyword(q);
          setSearchSuggestions(results);
          setShowSuggestions(results.length > 0);
        } catch { setSearchSuggestions([]); }
        finally { setSearchingApi(false); }
      }, 400);
    } else if (q.length === 0) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, funds]);

  // V67: Click outside to close suggestions
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // V66.1: Market Indices
  const [indices, setIndices] = useState<IndexData[]>(
    () => fundPageSessionCache?.indices || [],
  );

  // V66.0: Holdings
  const [holdings, setHoldings] = useState<FundHolding[]>([]);
  const [holdingDialogOpen, setHoldingDialogOpen] = useState(false);
  const [prefillCode, setPrefillCode] = useState("");
  const [prefillName, setPrefillName] = useState("");

  // V66.1: Transaction dialogs
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [txDialogType, setTxDialogType] = useState<"buy" | "sell">("buy");
  const [txDialogHolding, setTxDialogHolding] = useState<FundHolding | null>(null);
  const [txHistoryOpen, setTxHistoryOpen] = useState(false);
  const [txHistoryHolding, setTxHistoryHolding] = useState<FundHolding | null>(null);

  // V66.1: Fund Detail
  const [detailFund, setDetailFund] = useState<ExtendedFund | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // V67.6: Holding Detail
  const [holdingDetailHolding, setHoldingDetailHolding] = useState<FundHolding | null>(null);
  const [holdingDetailFund, setHoldingDetailFund] = useState<ExtendedFund | null>(null);
  const [holdingDetailOpen, setHoldingDetailOpen] = useState(false);

  // V66.2: Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);

  // V66.2: DCA Simulator
  const [dcaDialogOpen, setDcaDialogOpen] = useState(false);

  // V66.8: Image Import
  const [imageImportOpen, setImageImportOpen] = useState(false);

  // V66.3: Tag filter
  const [tagFilter, setTagFilter] = useState("all");

  // View & Sort (persisted)
  const [viewMode, setViewModeRaw] = useState<ViewMode>(() => (localStorage.getItem("MAKE_FUND_VIEW") as ViewMode) || "grid");
  const setViewMode = useCallback((v: ViewMode) => { setViewModeRaw(v); localStorage.setItem("MAKE_FUND_VIEW", v); }, []);
  const [sortKey, setSortKeyRaw] = useState<SortKey>(() => (localStorage.getItem("MAKE_FUND_SORT") as SortKey) || "score");
  const setSortKey = useCallback((v: SortKey) => { setSortKeyRaw(v); localStorage.setItem("MAKE_FUND_SORT", v); }, []);
  const [sortAsc, setSortAscRaw] = useState(() => localStorage.getItem("MAKE_FUND_ASC") === "1");
  const setSortAsc = useCallback((v: boolean) => { setSortAscRaw(v); localStorage.setItem("MAKE_FUND_ASC", v ? "1" : "0"); }, []);
  const [activeSection, setActiveSection] = useState<"radar" | "portfolio">("radar");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // V66.6: Multi-select signal filter (Set<string>, persisted)
  const [signalFilter, setSignalFilterRaw] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("MAKE_FUND_SIG_V2"); if (s) { const a = JSON.parse(s); if (Array.isArray(a)) return new Set(a); } } catch {} return new Set<string>();
  });
  const persistSigFilter = useCallback((s: Set<string>) => localStorage.setItem("MAKE_FUND_SIG_V2", JSON.stringify([...s])), []);
  const toggleSignalFilter = useCallback((key: string) => {
    setSignalFilterRaw(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); persistSigFilter(n); return n; });
  }, [persistSigFilter]);
  const clearSignalFilter = useCallback(() => { setSignalFilterRaw(new Set()); persistSigFilter(new Set()); }, [persistSigFilter]);
  const isSignalFiltered = signalFilter.size > 0;

  const fundMap = useMemo(() => { const m = new Map<string, ExtendedFund>(); funds.forEach(f => m.set(f.code, f)); return m; }, [funds]);
  const holdingCodes = useMemo(() => new Set(holdings.map(h => h.code)), [holdings]);

  // V66.6: Escape key resets signal filter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && signalFilter.size > 0 && activeSection === "radar" && !detailOpen && !compareDialogOpen && !holdingDialogOpen) {
        e.preventDefault(); clearSignalFilter(); toast("已重置信号筛选");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signalFilter.size, activeSection, detailOpen, compareDialogOpen, holdingDialogOpen, clearSignalFilter]);

  const persistHoldings = useCallback((newHoldings: FundHolding[]) => {
    setHoldings(newHoldings);
    localStorage.setItem("MAKE_FUND_HOLDINGS", JSON.stringify(newHoldings));
  }, []);

  // ---- Init ----
  useEffect(() => {
    const init = async () => {
      const savedFunds = localStorage.getItem("MAKE_CUSTOM_FUNDS");
      let localFunds: string[] = savedFunds ? JSON.parse(savedFunds) : [];
      setCustomFunds(localFunds);

      const savedHoldings = localStorage.getItem("MAKE_FUND_HOLDINGS");
      let localHoldings: FundHolding[] = savedHoldings ? JSON.parse(savedHoldings) : [];
      // Migrate old format
      localHoldings = localHoldings.map(migrateHolding).map(recalcHolding);
      setHoldings(localHoldings);

      setIsInitialized(true);
    };
    init();
  }, []);

  useEffect(() => { if (isInitialized) loadFundData(); }, [isInitialized]);

  // ---- Load Data ----
  const loadFundData = async (forceRefresh = false) => {
    const requestId = ++fundLoadRequestRef.current;
    try {
      setLoading(true);
      setLoadError(null);
      const [indicesRes] = await Promise.all([fetchMarketIndices()]);

      // V66.1: Extract index data
      let resolvedIndices: IndexData[] = [];
      if (indicesRes?.data) {
        resolvedIndices = WATCHED_INDICES.map(code => {
          const d = indicesRes.data.find((i: any) => i.code === code);
          return d ? { code, name: INDEX_NAMES[code] || d.name || code, current: d.current || d.price || 0, changePercent: d.changePercent || 0 } : null;
        }).filter(Boolean) as IndexData[];
        setIndices(resolvedIndices);
      }

      // V67 FIX: Read from ref to get latest state, avoiding stale closure from setTimeout
      const latestCustom = customFundsRef.current;
      const fixedCodes = FUND_CATEGORIES.flatMap(c => c.codes);
      const holdingCodesArr = holdings.map(h => h.code);
      const allCodes = Array.from(new Set([...fixedCodes, ...latestCustom, ...holdingCodesArr]));
      const etfCodes = allCodes.filter(isTradeableETF);
      const otcCodes = allCodes.filter(c => !isTradeableETF(c));

      console.log(`[FundRadar] Loading ${allCodes.length} codes (ETF: ${etfCodes.length}, OTC: ${otcCodes.length})`);

      // Critical path: indices and latest quotes only. Historical NAV/K-line
      // data is deliberately loaded after the first usable fund cards paint;
      // on a cold cache it is the dominant source of the previous 25-second
      // blank state.
      const [etfRealtime, otcRealtime] = await withFundLoadDeadline(Promise.all([
        fetchStockData(etfCodes, forceRefresh),
        fetchFunds(otcCodes, forceRefresh),
      ]), 20_000);
      if (requestId !== fundLoadRequestRef.current) return;

      const safeNumber = (val: any) => { if (typeof val === "number") return val; if (typeof val === "string") { const p = parseFloat(val); return isNaN(p) ? undefined : p; } return undefined; };

      const buildFund = (
        code: string,
        rt: any,
        isEtf: boolean,
        historyMap: Record<string, any[]> = {},
      ): ExtendedFund | null => {
        if (!rt) return null;
        const hist = historyMap[code] || [];
        const currentPrice = rt.estimateNetValue || rt.current || rt.currentPrice || 0;
        const indicators = calculateIndicators(hist, currentPrice);
        const atr = indicators.atr || currentPrice * 0.02 || 0;
        const prediction = predictFundPriceAction(hist, currentPrice, atr, isEtf ? 10 : 30);
        const sourceAsOf = rt.sourceAsOf || rt.lastUpdate;
        const freshness = evaluateFundDataFreshness(sourceAsOf, Date.now(), isEtf);
        const getHistPerf = (days: number) => {
          if (hist.length <= days) return undefined;
          const past = hist[hist.length - days]; const latestHist = hist[hist.length - 1];
          const pastAcc = (past as any).accumulated; const latestAcc = (latestHist as any).accumulated;
          if (pastAcc && latestAcc) { const prevReturn = (latestAcc - pastAcc) / pastAcc; const todayChange = rt.estimateChangePercent ? rt.estimateChangePercent / 100 : 0; return ((1 + prevReturn) * (1 + todayChange) - 1) * 100; }
          if (!past || past.close === 0) return undefined; return ((currentPrice - past.close) / past.close) * 100;
        };
        const trendData = (() => {
          if (hist.length < 10) return [];
          const segment = hist.slice(-250); if (segment.length === 0) return [];
          const startVal = (segment[0] as any).accumulated || segment[0].close; if (!startVal) return [];
          return segment.filter((_, i) => i % 5 === 0 || i === segment.length - 1).map(h => ({ date: h.day, value: (((h as any).accumulated || h.close) - startVal) / startVal * 100 }));
        })();
        const historyData: FundNavPoint[] = hist
          .map(h => ({
            date: h.day,
            nav: Number(h.close),
          }))
          .filter(point => point.date && Number.isFinite(point.nav) && point.nav > 0);
        return {
          code, name: rt.name,
          category: FUND_CATEGORIES.find(c => c.codes.includes(code))?.name || inferCategory(rt.name || "", rt.fundType, rt.indexName),
          estimateNetValue: currentPrice, estimateChangePercent: rt.estimateChangePercent || rt.changePercent || 0,
          yearChangePercent: safeNumber(rt.yearChangePercent) ?? getHistPerf(240),
          quarterChangePercent: safeNumber(rt.quarterChangePercent) ?? getHistPerf(60),
          halfYearChangePercent: safeNumber(rt.halfYearChangePercent) ?? getHistPerf(120),
          dayChangePercent: rt.changePercent || rt.estimateChangePercent,
          trendData, historyData,
          sourceAsOf,
          dataStatus: freshness.status,
          dataAgeMs: freshness.ageMs,
          volatility: currentPrice > 0 ? (atr / currentPrice) * 100 : 0,
          maxDrawdown: calcMaxDrawdown(hist),
          volumeRatio: isEtf && indicators.avgVol5 ? rt.volume / indicators.avgVol5 : 1,
          rsi: indicators.rsi?.rsi12 || 50, mfi: indicators.mfi || 50, atr, isEtf,
          pressureLevel: prediction.targetHigh, supportLevel: prediction.targetLow,
          score: 0, prediction,
          smartTrace: { inflowScore: isEtf && rt.volume > (indicators.avgVol5 || 0) * 1.5 ? 80 : 40, divergence: false, elasticity: 50 },
          signal: {} as any, guidance: {} as any,
        } as ExtendedFund;
      };

      const activeThemes = marketThemes.filter(t => t.strength > 60).map(t => t.name);
      const scoreFunds = (historyMap: Record<string, any[]> = {}) => {
        const mergedFunds: ExtendedFund[] = [];
        etfCodes.forEach(code => {
          const f = buildFund(code, etfRealtime.data?.[code], true, historyMap);
          if (f) mergedFunds.push(f);
        });
        otcRealtime.forEach((rt: any) => {
          const f = buildFund(rt.code, rt, false, historyMap);
          if (f) mergedFunds.push(f);
        });

        return mergedFunds.map(f => {
          const benchmark = resolveFundBenchmark(f.category, resolvedIndices);
          const context: MarketContext = {
            marketChange: benchmark?.changePercent || 0,
            benchmarkAvailable: Boolean(benchmark),
            csi300Change: resolvedIndices.find(index => index.code === "sh000300")?.changePercent || 0,
            marketYtd: 0,
            marketVolatility: 0,
            trend: (benchmark?.changePercent || 0) > 0.5 ? "Bull" : (benchmark?.changePercent || 0) < -0.5 ? "Bear" : "Choppy",
            sectorPerformance: {},
          };
          const withBenchmark = { ...f, benchmarkName: benchmark?.name };
          const score = calculatePredatorScore(withBenchmark, context, activeThemes);
          const { signal, guidance } = generatePredatorStrategy(withBenchmark, score);
          return { ...withBenchmark, score, signal, guidance };
        }).sort((a, b) => b.score - a.score);
      };

      const applyFunds = (nextFunds: ExtendedFund[]) => {
        if (requestId !== fundLoadRequestRef.current || nextFunds.length === 0) return;
        const refreshLabel = new Date().toLocaleTimeString();
        const cachedIndices = resolvedIndices.length > 0
          ? resolvedIndices
          : fundPageSessionCache?.indices || indices;
        setFunds(nextFunds);
        setLastRefresh(refreshLabel);
        setLoadError(null);
        fundPageSessionCache = {
          funds: nextFunds,
          indices: cachedIndices,
          lastRefresh: refreshLabel,
        };
      };

      const initialFunds = scoreFunds();
      if (initialFunds.length === 0) {
        throw new Error("未取得可用基金数据");
      }
      // Paint a quote-backed view as soon as the critical path is ready.
      applyFunds(initialFunds);
      setLoading(false);

      // Non-blocking enrichment: history powers indicators, trend charts and
      // rolling evidence. It can update the same cards in place when ready.
      void Promise.all([
        fetchStockHistoryBatch(etfCodes, { forceRefresh }),
        fetchFundHistoryBatch(otcCodes, { forceRefresh }),
      ]).then(([etfHist, fundHist]) => {
        if (requestId !== fundLoadRequestRef.current) return;
        const enrichedFunds = scoreFunds({ ...etfHist, ...fundHist });
        applyFunds(enrichedFunds);
      }).catch(error => {
        if (requestId === fundLoadRequestRef.current) {
          console.warn("[FundRadar] Historical enrichment failed", error);
        }
      });
    } catch (e) {
      console.error("Fund loading failed", e);
      const message = e instanceof Error ? e.message : "基金服务暂时不可用";
      setLoadError(message);
      toast.error(funds.length > 0 ? "基金刷新失败，继续显示上次数据" : "基金数据加载失败");
    } finally {
      if (requestId === fundLoadRequestRef.current) setLoading(false);
    }
  };

  // V67.1: Load a single fund incrementally without full page refresh
  const loadSingleFund = async (code: string) => {
    try {
      const isEtf = isTradeableETF(code);
      const latestCustom = customFundsRef.current;
      const [rtData, histData] = await Promise.all(
        isEtf
          ? [fetchStockData([code]), fetchStockHistoryBatch([code])]
          : [fetchFunds([code]).then(arr => ({ data: Object.fromEntries(arr.map((r: any) => [r.code, r])), isMock: false })), fetchFundHistoryBatch([code])]
      );
      const rt = rtData.data?.[code];
      if (!rt) { console.warn(`[FundRadar] loadSingleFund: no RT data for ${code}`); return; }
      const hist = histData[code] || [];
      const currentPrice = (rt as any).estimateNetValue || (rt as any).current || (rt as any).currentPrice || 0;
      const indicators = calculateIndicators(hist, currentPrice);
      const atr = indicators.atr || currentPrice * 0.02 || 0;
      const prediction = predictFundPriceAction(hist, currentPrice, atr, isEtf ? 10 : 30);
      const sourceAsOf = (rt as any).sourceAsOf || (rt as any).lastUpdate;
      const freshness = evaluateFundDataFreshness(sourceAsOf, Date.now(), isEtf);
      const safeNum = (v: any) => { if (typeof v === "number") return v; if (typeof v === "string") { const p = parseFloat(v); return isNaN(p) ? undefined : p; } return undefined; };
      const getHistPerf = (days: number) => {
        if (hist.length <= days) return undefined;
        const past = hist[hist.length - days]; const latest = hist[hist.length - 1];
        const pa = (past as any).accumulated; const la = (latest as any).accumulated;
        if (pa && la) { const pr = (la - pa) / pa; const tc = (rt as any).estimateChangePercent ? (rt as any).estimateChangePercent / 100 : 0; return ((1 + pr) * (1 + tc) - 1) * 100; }
        if (!past || past.close === 0) return undefined; return ((currentPrice - past.close) / past.close) * 100;
      };
      const trendData = (() => {
        if (hist.length < 10) return [];
        const seg = hist.slice(-250); if (!seg.length) return [];
        const sv = (seg[0] as any).accumulated || seg[0].close; if (!sv) return [];
        return seg.filter((_, i) => i % 5 === 0 || i === seg.length - 1).map(h => ({ date: h.day, value: (((h as any).accumulated || h.close) - sv) / sv * 100 }));
      })();
      const historyData: FundNavPoint[] = hist
        .map(h => ({ date: h.day, nav: Number(h.close) }))
        .filter(point => point.date && Number.isFinite(point.nav) && point.nav > 0);
      const fund: ExtendedFund = {
        code, name: (rt as any).name || code,
        category: FUND_CATEGORIES.find(c => c.codes.includes(code))?.name || inferCategory((rt as any).name || "", (rt as any).fundType, (rt as any).indexName),
        estimateNetValue: currentPrice, estimateChangePercent: (rt as any).estimateChangePercent || (rt as any).changePercent || 0,
        yearChangePercent: safeNum((rt as any).yearChangePercent) ?? getHistPerf(240),
        quarterChangePercent: safeNum((rt as any).quarterChangePercent) ?? getHistPerf(60),
        halfYearChangePercent: safeNum((rt as any).halfYearChangePercent) ?? getHistPerf(120),
        dayChangePercent: (rt as any).changePercent || (rt as any).estimateChangePercent,
        trendData, historyData,
        sourceAsOf,
        dataStatus: freshness.status,
        dataAgeMs: freshness.ageMs,
        volatility: currentPrice ? (atr / currentPrice) * 100 : 0,
        maxDrawdown: calcMaxDrawdown(hist),
        volumeRatio: isEtf && indicators.avgVol5 ? (rt as any).volume / indicators.avgVol5 : 1,
        rsi: indicators.rsi?.rsi12 || 50, mfi: indicators.mfi || 50, atr, isEtf,
        pressureLevel: prediction.targetHigh, supportLevel: prediction.targetLow,
        score: 0, prediction,
        smartTrace: { inflowScore: isEtf && (rt as any).volume > (indicators.avgVol5 || 0) * 1.5 ? 80 : 40, divergence: false, elasticity: 50 },
        signal: {} as any, guidance: {} as any,
      } as ExtendedFund;
      const at = marketThemes.filter(t => t.strength > 60).map(t => t.name);
      const benchmark = resolveFundBenchmark(fund.category, indices);
      const benchmarkChange = benchmark?.changePercent || 0;
      const ctx: MarketContext = {
        marketChange: benchmarkChange,
        benchmarkAvailable: Boolean(benchmark),
        csi300Change: indices.find(index => index.code === "sh000300")?.changePercent || 0,
        marketYtd: 0,
        marketVolatility: 0,
        trend: benchmarkChange > 0.5 ? "Bull" : benchmarkChange < -0.5 ? "Bear" : "Choppy",
        sectorPerformance: {},
      };
      const withBenchmark = { ...fund, benchmarkName: benchmark?.name };
      const score = calculatePredatorScore(withBenchmark, ctx, at);
      const { signal, guidance } = generatePredatorStrategy(withBenchmark, score);
      const final = { ...withBenchmark, score, signal, guidance };
      setFunds(prev => {
        const idx = prev.findIndex(f => f.code === code);
        const next = idx >= 0
          ? prev.map((item, itemIndex) => itemIndex === idx ? final : item)
          : [...prev, final].sort((a, b) => b.score - a.score);
        if (fundPageSessionCache) {
          fundPageSessionCache = { ...fundPageSessionCache, funds: next };
        }
        return next;
      });
      console.log(`[FundRadar] Incremental load: ${code} (${(rt as any).name}) score=${score.toFixed(1)}`);
    } catch (e) { console.error(`[FundRadar] loadSingleFund(${code}) failed:`, e); }
  };

  // V67.1: Batch incremental load (for import); falls back to full refresh for large batches
  const loadFundsBatch = async (codes: string[]) => {
    if (!codes.length) return;
    if (codes.length > 10) { loadFundData(); return; }
    await Promise.all(codes.map(c => loadSingleFund(c)));
  };

  // ---- Handlers ---- V67 FIX: use functional updates + ref to avoid stale closure
  const handleAddCustom = useCallback((code: string) => {
    setCustomFunds(prev => {
      if (prev.includes(code)) return prev;
      const nf = [...prev, code];
      localStorage.setItem("MAKE_CUSTOM_FUNDS", JSON.stringify(nf));
      customFundsRef.current = nf;
      toast.success("已加入自选");
      return nf;
    });
  }, []);

  const handleRemoveCustom = useCallback((code: string) => {
    setCustomFunds(prev => {
      const nf = prev.filter(c => c !== code);
      localStorage.setItem("MAKE_CUSTOM_FUNDS", JSON.stringify(nf));
      customFundsRef.current = nf;
      toast("已移除自选");
      return nf;
    });
  }, []);

  // V67: Select a fund from search suggestions → add to custom
  const handleSelectSuggestion = useCallback((item: FundSearchResult) => {
    if (!customFundsRef.current.includes(item.code)) {
      handleAddCustom(item.code);
      loadSingleFund(item.code);
    } else {
      toast("该基金已在自选中");
    }
    setSearchQuery("");
    setShowSuggestions(false);
  }, []);

  // V67 FIX: Extract 6-digit code from mixed text like "159869 游戏ETF" or "159869"
  const handleAddFundInput = useCallback(() => {
    const codeMatch = inputCode.match(/(\d{6})/);
    if (codeMatch) {
      const code = codeMatch[1];
      if (!customFundsRef.current.includes(code)) {
        handleAddCustom(code);
        setInputCode("");
        loadSingleFund(code);
      } else {
        toast("该基金已在自选中"); setInputCode("");
      }
    } else if (inputCode.trim()) {
      toast.error("未识别到6位基金代码，请输入正确的基金代码");
    }
  }, [inputCode]);

  // V66.8: Batch import from image OCR — V67 FIX: use ref for latest state
  const handleBatchImport = useCallback((codes: string[]) => {
    const current = customFundsRef.current;
    const newCodes = codes.filter(c => !current.includes(c));
    if (newCodes.length === 0) return;
    const nf = [...current, ...newCodes];
    setCustomFunds(nf);
    localStorage.setItem("MAKE_CUSTOM_FUNDS", JSON.stringify(nf));
    customFundsRef.current = nf;
    loadFundsBatch(newCodes);
  }, []);

  const handleSaveNewHolding = useCallback((h: Omit<FundHolding, "id">) => {
    const newItem: FundHolding = { ...h, id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    persistHoldings([...holdings, newItem]);
    toast.success("持仓已添加");

    // V67.4 FIX: Ensure the fund code is in customFunds so it persists across full refreshes,
    // and call loadSingleFund to immediately fetch realtime data into fundMap.
    // Without this, fundMap.get(code) returns undefined → portfolio shows no name/nav/change.
    if (!customFundsRef.current.includes(h.code)) {
      const nf = [...customFundsRef.current, h.code];
      setCustomFunds(nf);
      localStorage.setItem("MAKE_CUSTOM_FUNDS", JSON.stringify(nf));
      customFundsRef.current = nf;
    }
    loadSingleFund(h.code);
  }, [holdings, persistHoldings]);

  const handleRemoveHolding = useCallback((id: string) => {
    persistHoldings(holdings.filter(h => h.id !== id));
    toast("持仓已删除");
  }, [holdings, persistHoldings]);

  const handleAddTransaction = useCallback((holdingId: string, tx: Omit<FundTransaction, "id">) => {
    const newTx: FundTransaction = { ...tx, id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
    const updated = holdings.map(h => {
      if (h.id !== holdingId) return h;
      const withTx = { ...h, transactions: [...(h.transactions || []), newTx] };
      return recalcHolding(withTx);
    });
    persistHoldings(updated);
    toast.success(tx.type === "buy" ? "加仓成功" : "减仓成功");
  }, [holdings, persistHoldings]);

  const handleOpenAddHolding = useCallback((code?: string, name?: string) => {
    setPrefillCode(code || ""); setPrefillName(name || ""); setHoldingDialogOpen(true);
  }, []);

  const handleOpenTxDialog = useCallback((h: FundHolding, type: "buy" | "sell") => {
    setTxDialogHolding(h); setTxDialogType(type); setTxDialogOpen(true);
  }, []);

  const handleViewTxHistory = useCallback((h: FundHolding) => {
    setTxHistoryHolding(h); setTxHistoryOpen(true);
  }, []);

  // V66.3: Tag change
  const handleTagChange = useCallback((holdingId: string, tag: "core" | "watch" | "exit" | undefined) => {
    const updated = holdings.map(h => h.id === holdingId ? { ...h, tag } : h);
    persistHoldings(updated);
  }, [holdings, persistHoldings]);

  const handleOpenDetail = useCallback((f: ExtendedFund) => {
    setDetailFund(f); setDetailOpen(true);
  }, []);

  // V67.6: Open holding detail dialog
  const handleSelectHolding = useCallback((h: FundHolding) => {
    const f = fundMap.get(h.code) || null;
    setHoldingDetailHolding(h);
    setHoldingDetailFund(f);
    setHoldingDetailOpen(true);
  }, [fundMap]);

  // V66.2: Compare
  const handleToggleCompare = useCallback((code: string) => {
    setCompareSet(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else if (next.size < 5) next.add(code);
      else toast.error("最多对比 5 只基金");
      return next;
    });
  }, []);

  const compareFunds = useMemo(() => funds.filter(f => compareSet.has(f.code)), [funds, compareSet]);

  // ---- Derived Data ----

  // V66.4: pre-compute category counts (always from full fund list)
  const catCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of funds) { m.set(f.category, (m.get(f.category) || 0) + 1); }
    return m;
  }, [funds]);

  // V66.6: Step 1 — category-filtered base (before signal filter)
  const categoryFilteredFunds = useMemo(() => {
    if (selectedCategory === "All") return funds;
    if (selectedCategory === "自选") return funds.filter(f => customFunds.includes(f.code));
    if (selectedCategory === "持仓") return funds.filter(f => holdingCodes.has(f.code));
    return funds.filter(f => f.category === selectedCategory);
  }, [funds, selectedCategory, customFunds, holdingCodes]);

  // V66.6: Step 2 — signal counts from category-filtered base (so counts match current category)
  const signalCounts = useMemo(() => {
    const tagCounts: Record<string, number> = { Alpha: 0, Beta: 0, Danger: 0, Sleep: 0 };
    const actionCounts: Record<string, number> = {};
    for (const f of categoryFilteredFunds) {
      if (f.signal?.tag) tagCounts[f.signal.tag] = (tagCounts[f.signal.tag] || 0) + 1;
      if (f.signal?.action) actionCounts[f.signal.action] = (actionCounts[f.signal.action] || 0) + 1;
    }
    return { tagCounts, actionCounts, total: categoryFilteredFunds.length };
  }, [categoryFilteredFunds]);

  // V66.7: Step 3 — apply search + multi-select signal filter + sort
  const sortedFunds = useMemo(() => {
    let filtered = categoryFilteredFunds;

    // Search filter: match by name or code
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(f => f.name.toLowerCase().includes(q) || f.code.includes(q));
    }

    // Multi-select: show fund if its tag OR action matches ANY selected key
    if (signalFilter.size > 0) {
      filtered = filtered.filter(f => signalFilter.has(f.signal?.tag) || signalFilter.has(f.signal?.action));
    }

    return [...filtered].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "score": diff = a.score - b.score; break;
        case "daily": diff = a.estimateChangePercent - b.estimateChangePercent; break;
        case "quarter": diff = (a.quarterChangePercent || 0) - (b.quarterChangePercent || 0); break;
        case "year": diff = (a.yearChangePercent || 0) - (b.yearChangePercent || 0); break;
        case "name": diff = a.name.localeCompare(b.name); break;
        case "signal": {
          const wa = (SIGNAL_TAG_WEIGHT[a.signal?.tag] || 0) * 100 + (SIGNAL_ACTION_WEIGHT[a.signal?.action] || 0);
          const wb = (SIGNAL_TAG_WEIGHT[b.signal?.tag] || 0) * 100 + (SIGNAL_ACTION_WEIGHT[b.signal?.action] || 0);
          diff = wa - wb;
          if (diff === 0) diff = a.score - b.score; // tiebreaker: same signal → sort by score
          break;
        }
      }
      return sortAsc ? diff : -diff;
    });
  }, [categoryFilteredFunds, sortKey, sortAsc, signalFilter, searchQuery]);

  const handleSort = (key: SortKey) => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(false); } };
  const SortIcon = ({ k }: { k: SortKey }) => sortKey !== k ? <ArrowUpDown className="w-3 h-3 text-slate-300" /> : sortAsc ? <ChevronUp className="w-3 h-3 text-red-500" /> : <ChevronDown className="w-3 h-3 text-red-500" />;
  const initialLoading = loading && funds.length === 0;

  // ===================== RENDER =====================

  return (
    <div className="space-y-5 p-3 sm:p-4 md:p-6 lg:p-8 pb-24 lg:pb-20 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Target className="w-6 h-6 text-red-600" /> 基金雷达
            <Badge variant="outline" className="ml-2 border-red-200 text-red-600 bg-red-50 text-[10px]">V66.8</Badge>
          </h2>
          <p className="text-slate-500 text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>规则监控 · 持仓管理 · 标签分组 · 调仓建议 · 盈亏日历</span>
            {lastRefresh && <span className="text-slate-400">请求于 {lastRefresh}</span>}
            <span className="text-slate-400">持仓仅保存在本机</span>
          </p>
        </div>
        <div className="flex w-full md:w-auto items-center gap-2 flex-wrap">
          <div className="relative w-full sm:w-auto" ref={searchBoxRef}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none z-10" />
            {searchingApi && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 animate-spin z-10" />}
            <Input placeholder="搜索名称 / 代码添加自选" className="h-9 w-full sm:w-64 pl-8 pr-8 text-xs bg-white border shadow-sm rounded-lg focus-visible:ring-red-200"
              value={searchQuery} onChange={e => { setSearchQuery(e.target.value); if (!e.target.value.trim()) setShowSuggestions(false); }}
              onFocus={() => { if (searchSuggestions.length > 0) setShowSuggestions(true); }}
              onKeyDown={e => {
                if (e.key === 'Escape') { setSearchQuery(""); setShowSuggestions(false); }
                // V67: Enter key → add by code (extracted from mixed text) or pick first suggestion
                if (e.key === 'Enter') {
                  const codeMatch = searchQuery.trim().match(/(\d{6})/);
                  if (codeMatch && !customFundsRef.current.includes(codeMatch[1])) {
                    handleAddCustom(codeMatch[1]);
                    setSearchQuery(""); setShowSuggestions(false);
                    loadSingleFund(codeMatch[1]);
                  } else if (codeMatch && customFundsRef.current.includes(codeMatch[1])) {
                    toast("该基金已在自选中");
                  } else if (searchSuggestions.length > 0) {
                    // Pick first suggestion
                    handleSelectSuggestion(searchSuggestions[0]);
                  }
                }
              }} />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setShowSuggestions(false); }}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors z-10 rounded-md"
                aria-label="清除搜索"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {/* V67: Search suggestion dropdown */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-full sm:w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] text-slate-400 font-bold border-b border-slate-100 flex items-center justify-between">
                  <span>搜索结果 · 点击加入自选</span>
                  <span>{searchSuggestions.length} 只</span>
                </div>
                {searchSuggestions.map(item => {
                  const isAlready = customFundsRef.current.includes(item.code);
                  const isLoaded = funds.some(f => f.code === item.code);
                  return (
                    <button key={item.code} onClick={() => handleSelectSuggestion(item)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-red-50 transition-colors border-b border-slate-50 last:border-0",
                        isAlready && "opacity-50"
                      )}>
                      <span className="font-mono text-xs text-slate-500 w-14 shrink-0">{item.code}</span>
                      <span className="text-xs font-bold text-slate-700 truncate flex-1">{item.name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{item.type}</span>
                      {isAlready ? (
                        <span className="text-[10px] text-green-500 font-bold shrink-0">已自选</span>
                      ) : isLoaded ? (
                        <span className="text-[10px] text-blue-500 font-bold shrink-0">已加载</span>
                      ) : (
                        <Plus className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setImageImportOpen(true)} className="gap-1 h-8 text-xs" title="截图识别导入基金">
            <ImageUp className="w-3.5 h-3.5" /> 导入
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadFundData(true)} disabled={loading} className="gap-1.5 h-8">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> {loading ? "扫描中" : "刷新"}
          </Button>
        </div>
      </div>

      {/* V66.1: Market Overview Strip */}
      <MarketStrip indices={indices} loading={initialLoading && indices.length === 0} />

      {loadError && (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl border px-3 py-3 text-xs sm:flex-row sm:items-center sm:justify-between",
            funds.length > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900",
          )}
          role="alert"
          aria-live="assertive"
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-bold">{funds.length > 0 ? "本次刷新失败，当前显示上次数据" : "基金数据暂时无法加载"}</div>
              <div className="mt-0.5 break-words text-[10px] opacity-75">{loadError}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 bg-white" onClick={() => loadFundData(true)} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            重试
          </Button>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2" role="tablist" aria-label="基金页面">
        <button onClick={() => setActiveSection("radar")}
          role="tab"
          aria-selected={activeSection === "radar"}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-sm font-bold transition-colors",
            activeSection === "radar" ? "text-red-600 border-b-2 border-red-600 bg-red-50/50" : "text-slate-400 hover:text-slate-600"
          )}>
          <BarChart3 className="w-3.5 h-3.5" /> 基金雷达
          <Badge variant="secondary" className="text-[9px] h-4 px-1">{funds.length}</Badge>
        </button>
        <button onClick={() => setActiveSection("portfolio")}
          role="tab"
          aria-selected={activeSection === "portfolio"}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-sm font-bold transition-colors",
            activeSection === "portfolio" ? "text-red-600 border-b-2 border-red-600 bg-red-50/50" : "text-slate-400 hover:text-slate-600"
          )}>
          <Wallet className="w-3.5 h-3.5" /> 我的持仓
          <Badge variant="secondary" className="text-[9px] h-4 px-1">{holdings.length}</Badge>
          {holdings.some(h => h.tag === "exit") && (
            <Badge variant="outline" className="text-[8px] h-3.5 px-1 text-green-700 border-green-200 bg-green-50">
              待清{holdings.filter(h => h.tag === "exit").length}
            </Badge>
          )}
        </button>
        <div className="hidden sm:block flex-1" />
        <Button variant="outline" size="sm" className="h-7 w-7 gap-1 px-0 text-xs sm:w-auto sm:px-3" onClick={() => setDcaDialogOpen(true)} aria-label="定投模拟">
          <Calculator className="w-3 h-3" /> <span className="hidden sm:inline">定投模拟</span>
        </Button>
        <Button variant="outline" size="sm" className="h-7 w-7 gap-1 px-0 text-xs sm:w-auto sm:px-3" onClick={() => handleOpenAddHolding()} aria-label="添加持仓">
          <Plus className="w-3 h-3" /> <span className="hidden sm:inline">添加持仓</span>
        </Button>
      </div>

      {/* Portfolio Section */}
      {activeSection === "portfolio" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          <PortfolioSummary holdings={holdings} fundMap={fundMap} onAdd={() => handleOpenAddHolding()} onRemove={handleRemoveHolding} onAddTx={handleOpenTxDialog} onViewTx={handleViewTxHistory} onTagChange={handleTagChange} tagFilter={tagFilter} onTagFilterChange={setTagFilter} onSelectHolding={handleSelectHolding} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <PortfolioHealthScore holdings={holdings} fundMap={fundMap} />
            <PortfolioEquityCurve holdings={holdings} fundMap={fundMap} />
          </div>
          <PnLCalendarHeatmap holdings={holdings} fundMap={fundMap} />
          <PortfolioInsights holdings={holdings} fundMap={fundMap} />
          <RebalanceAdvisor holdings={holdings} fundMap={fundMap} allFunds={funds} />
          {/* Portfolio action bar */}
          {holdings.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setDcaDialogOpen(true)}>
                <Calculator className="w-3 h-3" /> 定投模拟
              </Button>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => exportHoldingsCSV(holdings, fundMap)}>
                <Download className="w-3 h-3" /> 导出 CSV
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {/* Radar Section */}
      {activeSection === "radar" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Controls */}
          <div className="flex flex-col gap-3">
            {/* Quick filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { key: "All", label: "全部" },
                { key: "自选", label: `自选(${customFunds.length})` },
                { key: "持仓", label: `持仓(${holdings.length})` },
              ].map(c => (
                <Button key={c.key} variant={selectedCategory === c.key ? "default" : "outline"} size="sm"
                  onClick={() => setSelectedCategory(c.key)}
                  aria-pressed={selectedCategory === c.key}
                  className={cn("rounded-full h-7 text-xs px-3", selectedCategory === c.key && "bg-red-600 hover:bg-red-700")}>
                  {c.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMobileFiltersOpen(open => !open)}
                className="h-8 flex-1 justify-between gap-2 px-3 text-xs"
                aria-expanded={mobileFiltersOpen}
                aria-controls="fund-advanced-filters"
              >
                <span className="flex items-center gap-1.5">
                  <Filter className="size-3.5" />
                  筛选与排序
                  {(selectedCategory !== "All" || isSignalFiltered) && (
                    <Badge className="h-4 min-w-4 border-0 bg-red-600 px-1 text-[9px] text-white">
                      {(selectedCategory !== "All" ? 1 : 0) + signalFilter.size}
                    </Badge>
                  )}
                </span>
                <ChevronDown className={cn("size-3.5 transition-transform", mobileFiltersOpen && "rotate-180")} />
              </Button>
              <div className="flex rounded-md border bg-white p-0.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn("rounded p-1.5", viewMode === "grid" ? "bg-slate-100 text-slate-800" : "text-slate-400")}
                  aria-label="卡片视图"
                  aria-pressed={viewMode === "grid"}
                ><LayoutGrid className="size-3.5" /></button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn("rounded p-1.5", viewMode === "list" ? "bg-slate-100 text-slate-800" : "text-slate-400")}
                  aria-label="列表视图"
                  aria-pressed={viewMode === "list"}
                ><List className="size-3.5" /></button>
              </div>
            </div>
            {/* Sector category tabs — scrollable horizontal */}
            <div
              id="fund-advanced-filters"
              className={cn("overflow-x-auto scrollbar-none pb-0.5", mobileFiltersOpen ? "block" : "hidden sm:block")}
            >
              <div className="flex gap-1 whitespace-nowrap">
                {FUND_CATEGORIES.map(c => {
                  const catCount = catCountMap.get(c.name) || 0;
                  return (
                    <button key={c.name}
                      onClick={() => setSelectedCategory(selectedCategory === c.name ? "All" : c.name)}
                      aria-pressed={selectedCategory === c.name}
                      className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors shrink-0",
                        selectedCategory === c.name
                          ? "bg-red-600 text-white border-red-600"
                          : catCount > 0
                            ? "text-slate-600 border-slate-200 bg-white hover:text-slate-700 hover:border-slate-300"
                            : "text-slate-400 border-slate-100 bg-slate-50"
                      )}>
                      {c.name}
                      {catCount > 0 && selectedCategory !== c.name && (
                        <span className="ml-1 text-[9px] opacity-50">{catCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Sort & View controls */}
            <div className={cn("items-center gap-2 shrink-0 flex-wrap", mobileFiltersOpen ? "flex" : "hidden sm:flex")}>
              <div className="flex items-center gap-1 bg-white border rounded-md p-0.5">
                {([["score", "评分"], ["daily", "日涨幅"], ["quarter", "季度"], ["year", "年度"], ["signal", "信号"]] as [SortKey, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => handleSort(k)}
                    aria-pressed={sortKey === k}
                    className={cn("flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-bold transition-colors",
                      sortKey === k ? "bg-slate-100 text-slate-800" : "text-slate-400 hover:text-slate-600"
                    )}>
                    {l} <SortIcon k={k} />
                  </button>
                ))}
              </div>
              <div className="hidden bg-white border rounded-md p-0.5 sm:flex">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn("p-1.5 rounded transition-colors", viewMode === "grid" ? "bg-slate-100 text-slate-800" : "text-slate-400")}
                  aria-label="卡片视图"
                  aria-pressed={viewMode === "grid"}
                  title="卡片视图"
                ><LayoutGrid className="w-3.5 h-3.5" /></button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn("p-1.5 rounded transition-colors", viewMode === "list" ? "bg-slate-100 text-slate-800" : "text-slate-400")}
                  aria-label="列表视图"
                  aria-pressed={viewMode === "list"}
                  title="列表视图"
                ><List className="w-3.5 h-3.5" /></button>
              </div>
              <button onClick={() => { setCompareMode(!compareMode); if (compareMode) setCompareSet(new Set()); }}
                aria-pressed={compareMode}
                className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold border transition-colors",
                  compareMode ? "bg-blue-50 border-blue-300 text-blue-600" : "bg-white border-slate-200 text-slate-400 hover:text-slate-600"
                )}>
                <GitCompare className="w-3.5 h-3.5" /> 对比
              </button>
            </div>
          </div>

          {/* V66.6: Signal Filter Bar (multi-select) */}
          <div className={cn("items-center gap-1.5 flex-wrap", mobileFiltersOpen ? "flex" : "hidden sm:flex")}>
            <Filter className={cn("w-3 h-3 transition-colors", isSignalFiltered ? "text-red-500" : "text-slate-400")} />
            {/* Tag-level quick filters */}
            {[
              { key: "Alpha", label: "强趋势", count: signalCounts.tagCounts.Alpha, activeStyle: "bg-red-600 text-white border-red-600", dot: "bg-red-500" },
              { key: "Beta", label: "配置", count: signalCounts.tagCounts.Beta, activeStyle: "bg-blue-600 text-white border-blue-600", dot: "bg-blue-500" },
              { key: "Danger", label: "风险", count: signalCounts.tagCounts.Danger, activeStyle: "bg-orange-500 text-white border-orange-500", dot: "bg-orange-400" },
              { key: "Sleep", label: "观察", count: signalCounts.tagCounts.Sleep, activeStyle: "bg-slate-500 text-white border-slate-500", dot: "bg-slate-300" },
            ].map(f => (
              <button key={f.key}
                onClick={() => toggleSignalFilter(f.key)}
                aria-pressed={signalFilter.has(f.key)}
                className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all",
                  signalFilter.has(f.key) ? f.activeStyle : "text-slate-400 border-slate-200 hover:text-slate-600"
                )}>
                {f.label} {f.count > 0 && <span className="ml-0.5 opacity-60">{f.count}</span>}
              </button>
            ))}
            {/* Divider */}
            <div className="w-px h-4 bg-slate-200 mx-0.5" />
            {/* Individual action filters (multi-select) */}
            {[
              { action: "趋势增强", color: "text-red-600 border-red-300 bg-red-50" },
              { action: "深度回调", color: "text-purple-600 border-purple-300 bg-purple-50" },
              { action: "加仓", color: "text-blue-600 border-blue-300 bg-blue-50" },
              { action: "持仓", color: "text-blue-500 border-blue-200 bg-blue-50" },
              { action: "减仓", color: "text-amber-600 border-amber-300 bg-amber-50" },
              { action: "止盈", color: "text-orange-600 border-orange-300 bg-orange-50" },
              { action: "警戒", color: "text-orange-500 border-orange-300 bg-orange-50" },
              { action: "止损", color: "text-green-700 border-green-300 bg-green-50" },
              { action: "观望", color: "text-slate-500 border-slate-200 bg-slate-50" },
            ].filter(a => (signalCounts.actionCounts[a.action] || 0) > 0).map(a => (
              <button key={a.action}
                onClick={() => toggleSignalFilter(a.action)}
                aria-pressed={signalFilter.has(a.action)}
                className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all",
                  signalFilter.has(a.action) ? a.color : "text-slate-400 border-slate-100 hover:text-slate-600"
                )}>
                {a.action} <span className="opacity-60">{signalCounts.actionCounts[a.action]}</span>
              </button>
            ))}
            {isSignalFiltered && (
              <button onClick={clearSignalFilter}
                className="text-[10px] text-slate-400 hover:text-red-500 ml-1 flex items-center gap-0.5 transition-colors">
                <RotateCcw className="w-2.5 h-2.5" /> 重置{signalFilter.size > 1 ? ` (${signalFilter.size})` : ""}
              </button>
            )}
            {isSignalFiltered && (
              <span className="text-[9px] text-slate-300 ml-auto hidden sm:inline">Esc 清除</span>
            )}
          </div>

          {/* V66.6: Signal distribution mini-bar (uses category-filtered counts) */}
          {signalCounts.total > 0 && (() => {
            const total = signalCounts.total;
            const { tagCounts } = signalCounts;
            const segments = [
              { tag: "Alpha", count: tagCounts.Alpha, color: "bg-red-500", label: "强趋势" },
              { tag: "Beta", count: tagCounts.Beta, color: "bg-blue-500", label: "配置" },
              { tag: "Danger", count: tagCounts.Danger, color: "bg-orange-400", label: "风险" },
              { tag: "Sleep", count: tagCounts.Sleep, color: "bg-slate-300", label: "观察" },
            ].filter(s => s.count > 0);
            return (
              <div className={cn("items-center gap-2", mobileFiltersOpen ? "flex" : "hidden sm:flex")}>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                  {segments.map(s => (
                    <button key={s.tag}
                      className={cn("h-full transition-all cursor-pointer hover:opacity-80", s.color,
                        signalFilter.has(s.tag) && "ring-1 ring-offset-1 ring-slate-400"
                      )}
                      style={{ width: `${(s.count / total) * 100}%` }}
                      onClick={() => toggleSignalFilter(s.tag)}
                      aria-label={`筛选 ${s.label}，${s.count}只`}
                      aria-pressed={signalFilter.has(s.tag)}
                      title={`${s.label}: ${s.count}只 (${((s.count / total) * 100).toFixed(0)}%)`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {segments.map(s => (
                    <button key={s.tag} className={cn("text-[9px] flex items-center gap-0.5 cursor-pointer transition-colors",
                      signalFilter.has(s.tag) ? "text-slate-700 font-bold" : "text-slate-400"
                    )} onClick={() => toggleSignalFilter(s.tag)} aria-pressed={signalFilter.has(s.tag)}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", s.color)} />
                      {s.count}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Compare floating bar */}
          <AnimatePresence>
            {compareMode && compareSet.size > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-20 left-1/2 z-50 flex w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 items-center gap-3 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-md lg:bottom-6 lg:w-auto lg:px-4">
                <div className="flex shrink-0 items-center gap-2">
                  {compareFunds.map(f => (
                    <Badge key={f.code} variant="secondary" className="text-[10px] gap-1 pr-1">
                      {f.name.length > 4 ? f.name.slice(0, 4) + "…" : f.name}
                      <button
                        onClick={() => handleToggleCompare(f.code)}
                        className="hover:text-red-500 ml-0.5"
                        aria-label={`从对比中移除 ${f.name}`}
                      ><X className="w-2.5 h-2.5" /></button>
                    </Badge>
                  ))}
                </div>
                <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
                  disabled={compareSet.size < 2}
                  onClick={() => setCompareDialogOpen(true)}>
                  <GitCompare className="w-3 h-3" /> 对比 ({compareSet.size})
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400"
                  onClick={() => { setCompareMode(false); setCompareSet(new Set()); }}>
                  取消
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter / Search result count */}
          {(isSignalFiltered || searchQuery.trim()) && !initialLoading && (
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              {searchQuery.trim() && (
                <>
                  <Search className="w-3 h-3" />
                  搜索 <span className="text-slate-600 font-bold">"{searchQuery.trim()}"</span>
                </>
              )}
              {isSignalFiltered && (
                <>
                  <Filter className="w-3 h-3" />
                  筛选 <span className="text-slate-600 font-bold">{[...signalFilter].join(" + ")}</span>
                </>
              )}
              → <span className="text-slate-700 font-bold">{sortedFunds.length}</span> / {signalCounts.total} 只
              {sortedFunds.length === 0 && !searchQuery.trim().match(/(\d{6})/) && (
                <span className="ml-1 text-slate-300">— 无匹配{searchQuery.trim() && !searchQuery.trim().match(/\d/) ? "，请从搜索建议中选择添加" : "，试试切换板块或重置筛选"}</span>
              )}
              {/* V67: Support extracting code from mixed text like "159869 游戏ETF" */}
              {sortedFunds.length === 0 && searchQuery.trim() && (() => {
                const m = searchQuery.trim().match(/(\d{6})/);
                return m && !customFunds.includes(m[1]);
              })() && (
                <button onClick={() => { const m = searchQuery.trim().match(/(\d{6})/)!; handleAddCustom(m[1]); setSearchQuery(""); setShowSuggestions(false); loadSingleFund(m[1]); }}
                  className="ml-2 text-blue-500 hover:text-blue-700 underline underline-offset-2 transition-colors">
                  将 {searchQuery.trim().match(/(\d{6})/)![1]} 加入自选
                </button>
              )}
            </div>
          )}

          {/* Grid */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {initialLoading ? Array.from({ length: 8 }).map((_, i) => <FundCardSkeleton key={i} />) : (
                <AnimatePresence mode="popLayout">
                  {sortedFunds.map(fund => (
                    <motion.div key={fund.code} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} layout>
                      <FundCard fund={fund} isCustom={customFunds.includes(fund.code)} isHeld={holdingCodes.has(fund.code)}
                        onAddCustom={handleAddCustom} onRemoveCustom={handleRemoveCustom} onAddHolding={handleOpenAddHolding} onClick={handleOpenDetail}
                        compareMode={compareMode} isCompared={compareSet.has(fund.code)} onToggleCompare={handleToggleCompare}
                        onSignalClick={toggleSignalFilter} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          )}

          {/* List */}
          {viewMode === "list" && (
            initialLoading ? <FundListSkeleton /> : (
            <Card className="bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="text-left p-3 pl-4">基金</th>
                      <th className="text-right p-3"><button className="inline-flex items-center gap-0.5" onClick={() => handleSort("daily")} aria-label="按日涨幅排序">日涨幅 <SortIcon k="daily" /></button></th>
                      <th className="text-right p-3">净值</th>
                      <th className="text-right p-3"><button className="inline-flex items-center gap-0.5" onClick={() => handleSort("quarter")} aria-label="按近3月收益排序">近3月 <SortIcon k="quarter" /></button></th>
                      <th className="text-right p-3"><button className="inline-flex items-center gap-0.5" onClick={() => handleSort("year")} aria-label="按近1年收益排序">近1年 <SortIcon k="year" /></button></th>
                      <th className="text-right p-3"><button className="inline-flex items-center gap-0.5" onClick={() => handleSort("score")} aria-label="按评分排序">评分 <SortIcon k="score" /></button></th>
                      <th className="text-center p-3"><button className="inline-flex items-center gap-0.5" onClick={() => handleSort("signal")} aria-label="按信号排序">信号 <SortIcon k="signal" /></button></th>
                      <th className="text-right p-3 pr-4">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFunds.map(fund => (
                      <FundListRow key={fund.code} fund={fund} isHeld={holdingCodes.has(fund.code)} isCustom={customFunds.includes(fund.code)}
                        onAddCustom={handleAddCustom} onRemoveCustom={handleRemoveCustom}
                        onAddHolding={handleOpenAddHolding} onClick={handleOpenDetail}
                        compareMode={compareMode} isCompared={compareSet.has(fund.code)} onToggleCompare={handleToggleCompare}
                        onSignalClick={toggleSignalFilter} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            )
          )}

          {sortedFunds.length === 0 && !initialLoading && !loadError && (
            <div className="text-center py-20 text-slate-400">
              <Microscope className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm">暂无相关基金，请尝试切换分类或添加自选</p>
              {isSignalFiltered && (
                <button onClick={clearSignalFilter}
                  className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-xs font-bold text-slate-600 transition-colors">
                  <RotateCcw className="w-3 h-3" /> 清除信号筛选「{[...signalFilter].join("+")}」
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Dialogs */}
      <HoldingDialog open={holdingDialogOpen} onClose={() => setHoldingDialogOpen(false)} onSave={handleSaveNewHolding} prefillCode={prefillCode} prefillName={prefillName} />
      <TransactionDialog open={txDialogOpen} onClose={() => setTxDialogOpen(false)} holding={txDialogHolding} txType={txDialogType} onSave={handleAddTransaction} />
      <TxHistoryDialog open={txHistoryOpen} onClose={() => setTxHistoryOpen(false)} holding={txHistoryHolding} fundMap={fundMap} />
      <FundDetailDialog fund={detailFund} open={detailOpen} onClose={() => setDetailOpen(false)} isHeld={detailFund ? holdingCodes.has(detailFund.code) : false} onAddHolding={handleOpenAddHolding} />
      <HoldingDetailDialog holding={holdingDetailHolding} fund={holdingDetailFund} open={holdingDetailOpen} onClose={() => setHoldingDetailOpen(false)} onAddTx={handleOpenTxDialog} onViewTx={handleViewTxHistory} />
      <CompareDialog open={compareDialogOpen} onClose={() => setCompareDialogOpen(false)} funds={compareFunds} />
      <DCASimulatorDialog open={dcaDialogOpen} onClose={() => setDcaDialogOpen(false)} funds={funds} />
      <ImageImportDialog open={imageImportOpen} onClose={() => setImageImportOpen(false)}
        existingCodes={customFunds} existingFunds={funds.map(f => ({ code: f.code, name: f.name }))}
        onImport={handleBatchImport} />
    </div>
  );
};
