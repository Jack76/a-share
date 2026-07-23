export interface SentimentPoint {
    time: string;
    score: number;
    temp: number;
}

export type MarketPhase = 'Startup' | 'Climax' | 'Ebb' | 'Chaos' | 'Ice' | 'Repair'; 

export interface DailyMetrics {
  limitUpCount: number; 
  height: number; 
  leaderStrong: boolean;
  clearTheme: boolean;
  volumeHigh: boolean;
  
  // Advanced Sentiment
  spaceHeight: number;       // 市场最高连板高度
  limitDownCount: number;    // 跌停家数 (负反馈指标)
  yesterdayLimitUpEffect: number; // 昨日涨停今日表现 (溢价率)
  relaySuccessRate?: number;   // 连板接力成功率 (v27.0)
  themeConcentration?: number; // 板块集中度 (v27.0)
  alphaDivergence?: number;    // Alpha 背离指数 (v27.0)
  marketEntropy?: number;      // 市场熵值 (v24.0)
  leaderSurvivalProb?: number; // 龙头生存概率 (v24.0)
  
  // Anti-Trap Indicators
  volatilityIndex?: number;    // 波动率指数
  distributionScore?: number;  // 筹码派发分值 (高位放量则分值高)
  fakeStrength?: boolean;      // 指数虚假繁荣 (指数涨但情绪跌)
  divergenceIndex?: number;    // 指数与情绪背离指数
  hedgeFactor?: number;        // 风险对冲因子 (0-100)
  inflectionSignal?: 'None' | 'Bottom' | 'Peak'; // 拐点信号
  
  // Negative
  leaderBreak: boolean;
  heightDrop: boolean;
  limitUpDrop: boolean; 
  bigLosses: boolean; 
  marketTemp?: number; 
  phaseConfidence?: number;
  marketDataStatus?: 'FRESH' | 'PARTIAL' | 'STALE' | 'UNAVAILABLE';
  marketDataCoverage?: number;
  marketDataAgeMs?: number;
  
  // Sentiment indicators
  sentimentDivergence?: 'Positive' | 'Negative' | 'Neutral'; // Index vs Sentiment
  moneyEffect?: 'Strong' | 'Weak'; 
}

export interface MarketEvent {
    id: string;
    time: string;
    type: 'Success' | 'Warning' | 'Info' | 'Danger';
    message: string;
    stockName?: string;
}

export interface TradingContextType {
  stocks: Stock[];
  marketIndices: MarketIndex[];
  themes: Theme[];
  metrics: DailyMetrics;
  phase: MarketPhase;
  phaseHistory: { phase: MarketPhase; timestamp: number }[];
  sentimentHistory: { time: string; score: number; temp: number }[];
  marketEvents: MarketEvent[];
}

export interface Theme {
  id: string;
  name: string;
  type: 'Main' | 'Vice' | 'Sub' | 'Hidden' | 'PreLaunch' | 'Decline';
  logic: string;
  strength?: number;           // 板块热度/强度
  stockCount?: number;         // 涨停家数
  leaderName?: string;         // 板块领涨
}

export interface DragonTigerSeat {
  name: string;      // 席位名称 (e.g. "中信证券西安朱雀大街")
  buyAmount: number; // 买入金额 (万)
  sellAmount: number;// 卖出金额 (万)
  netAmount: number; // 净买入 (万)
  tags?: string[];   // 标签 (e.g. ["机构", "顶级游资", "量化", "佛山"])
}

export interface DragonTigerData {
  date: string;
  reason: string;    // 上榜原因 (e.g. "日涨幅偏离值达到7%")
  buySeats: DragonTigerSeat[];  // 买一到买五
  sellSeats: DragonTigerSeat[]; // 卖一到卖五
  totalBuy: number;
  totalSell: number;
  netAmount: number;
}

export interface Stock {
  id: string;
  code: string;
  name: string;
  concept?: string;
  role: 'Leader' | 'Vice' | 'Substitute' | 'Independent' | 'Main' | 'Follower' | 'Normal' | 'Potential' | 'Dragon' | 'Observer';
  status: 'Watch' | 'Hold' | 'Sold';
  notes?: string;
  
  // Dragon Tiger Board Data (History & Recent)
  dragonTigerBoard?: DragonTigerData[]; // 历史龙虎榜数据
  
  // Real-time Data
  currentPrice?: number;
  avgPrice?: number;
  marketValue?: number; // Added for Fund Analysis
  turnoverAmount?: number; // Added for Fund Analysis
  turnover?: number; // Alias for turnoverAmount
  amount?: number; // Upstream quote alias for turnover amount
  high?: number; // Added
  low?: number; // Added
  open?: number; // Added
  prevClose?: number; // Added
  limitUpPrice?: number; // Added
  limitDownPrice?: number; // Added
  changePercent?: number;
  sourceAsOf?: string;
  isLimitUp?: boolean;
  isLimitDown?: boolean;
  consecutiveLimitUps?: number; // 连板数 (New)
  volume?: number;
  volumeRatio?: number; // Added for Fund Analysis
  volRatio?: number; // Legacy alias
  turnoverRate?: number;
  lastUpdate?: string;
  theme?: string;
  
  // Margin Trading Data (融资融券)
  marginData?: {
    financingBalance: number;     // 融资余额 (万)
    financingBuy: number;         // 融资买入额 (万)
    financingNetBuy: number;      // 融资净买入 (万)
    shortBalance: number;         // 融券余额 (万)
    shortSellVolume: number;      // 融券卖出量 (手)
    shortNetSell: number;         // 融券净卖出 (万)
  };

  // v7.2 实时盘口数据 (Real-time Market Data)
  avgVolume?: number;           // 平均成交量（用于对比）
  sealAmount?: number;          // 封单金额（涨停时）
  limitUpTime?: string;         // 涨停时间 (HH:mm)
  breakCount?: number;          // 炸板次数
  bigBuyAmount?: number;        // 大单买入金额
  largeOrderNetYuan?: number;   // 大单+超大单净额（元），不是机构身份识别
  largeOrderNetSource?: 'eastmoney-f62';
  largeOrderNetAsOf?: string;
  /** @deprecated 旧行情接口兼容字段，单位为元。 */
  mainMoneyIn?: number;
  buyVolume?: number;           // 外盘（主动买入）
  sellVolume?: number;          // 内盘（主动卖出）
  bidAmount?: number;           // 买盘挂单量（买一至买五）
  askAmount?: number;           // 卖盘挂单量（卖一至卖五）
  committeeRatio?: number;      // 委比（买卖盘差异）
  bid1Amount?: number;          // 买一量
  bid2Amount?: number;          // 买二量
  bid3Amount?: number;          // 买三量
  ask1Amount?: number;          // 卖一量
  ask2Amount?: number;          // 卖二量
  ask3Amount?: number;          // 卖三量
  ticks?: any[];                // 分时数据
  
  // V65.0 分时微观指标 (Intraday Micro-Structure Indicators)
  intradayIndicators?: {
    macdfs: {
      dif: number;
      dea: number;
      macd: number;
      signal: 'GoldenCross' | 'DeadCross' | 'None';
    } | null;
    volumeStructure: {
      lastVol: number;
      avgVol5: number;
      isHeavy: boolean;
      isShrink: boolean;
    };
    trend: 'Bullish' | 'Bearish' | 'Neutral';
    fetchedAt?: number; // timestamp for cache invalidation
  };

  // v7.2 实时计算指标 (Realtime Metrics)
  realtimeMetrics?: {
    limitUpProbability: number;      // 涨停概率 (0-100)
    mainForceChips: number;           // 主力筹码集中度 (0-100)
    darkPoolMoney: number;            // 暗盘资金强度 (0-100)
    sealStrength: number;             // 封单强度 (0-100)
    buyPressure: number;              // 买盘压力 (0-100)
    priceStability: number;           // 价格稳定性 (0-100)
    mainForceIntent?: 'Accumulate' | 'Distribute' | 'Neutral'; // V18.0
    decoyScore?: number;              // V18.0
  };
  
  // Auction Data (v4.0)
  auctionData?: {
    openGap: number;       // 开盘涨幅
    auctionVolume: number; // 竞价成交量
    volumeRatio: number;   // 竞价量比 (竞价量 / 昨日均量)
    strength: number;      // 竞价强度 (0-100)
    matchPrice?: number;   // 撮合价格
  };
  
  // Advanced Analysis (v8+)
  history?: { day: string; open?: number; high?: number; low?: number; close: number; volume?: number }[];
  technicals?: any;
  
  // Portfolio Management
  costPrice?: number;
  buyDate?: string;
  trailingStopPrice?: number; // 利润保卫触发价
  trailingStopMode?: 'Manual' | 'Auto'; // 止损模式
  profitTarget?: number;      // 目标价
  
  // Anti-Trap Logic
  trapSignals?: {
      type: string;
      severity: 'Low' | 'Medium' | 'High' | 'Critical';
      description: string;
  }[];
  
  // Advanced Scoring
  strengthScore?: number;      // 封板强度评分 (0-100)
  resonanceScore?: number;     // 板块共振评分 (0-100)
  independenceScore?: number;  // 独立性得分 (0-100)
  trapRiskScore?: number;      // 诱多风险得分 (0-100)
  premiumExpectation?: number; // 次日溢价预期 (%)
  moneyQualityScore?: number;  // 资金买入质量 (v27.0)
  sealIntensity?: number;      // 封单强度 (0-100) (v27.0)
  sealQualityScore?: number;
  boardResilience?: number;    // 炸板回封韧性 (0-100) (v27.0)
  resonanceFactor?: number;    // 板块共振因子 (0-100) (v27.0)
  exhaustionSignal?: { isExhausted: boolean; reason: string }; // 动能衰减信号 (v27.0)
  isThemeDropout?: boolean;    // 是否处于题材掉队状态 (v27.0)
  
  // AI Predictions
  aiPrediction?: {
    trend: 'Accelerate' | 'Divergence' | 'Top' | 'Rebound' | 'Neutral';
    summary: string;
    strategy: string;
    positionAdvice?: string; 
    buyPoint?: string; 
    sellPoint?: string; 
    holdingAnalysis?: string; // New: Analysis for held stocks
    
    // v41.0 Extended Fields
    longTermTrend?: 'Bull' | 'Bear' | 'Sideways';
    mediumTermTrend?: 'Bull' | 'Bear' | 'Sideways';
    shortTermTrend?: 'Bull' | 'Bear' | 'Sideways';
    cycleResonance?: boolean;
    riskLevel?: 'Low' | 'Medium' | 'High' | 'Critical';
    confidence?: number;
    keyFactors?: string[];

    // V6.0 Oracle Upgrade: Predictive Engine
    prediction?: {
        targetHigh: number;
        targetLow: number;
        probability: number; // 0-100 Confidence
        rawProbability?: number;
        dataQuality?: number;
        reliability?: 'LOW' | 'MEDIUM' | 'HIGH';
        dataReliability?: 'LOW' | 'MEDIUM' | 'HIGH'; // 个股K线与技术数据
        marketDataReliability?: 'LOW' | 'MEDIUM' | 'HIGH';
        marketDataStatus?: 'FRESH' | 'PARTIAL' | 'STALE' | 'UNAVAILABLE';
        evidenceReliability?: 'LOW' | 'MEDIUM' | 'HIGH';
        calibrationStatus?: 'UNVALIDATED' | 'LIMITED' | 'OUT_OF_SAMPLE';
        sampleSize?: number;
        marketRegime?: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'DIVERGENT' | 'UNKNOWN';
        marketDataQuality?: number;
        warnings?: string[];
        description: string;
        direction: 'UP' | 'DOWN' | 'SIDEWAYS';
    };
    // V60.0 Smart Entry System
    smartEntry?: {
        primary: number;
        primaryLabel: string;
        scaleIn: number;
        scaleInLabel: string;
        stopLoss: number;
        stopLossLabel: string;
        target: number;
        targetLabel: string;
        method: string;
        rrRatio: number;
        urgency: 'NOW' | 'WAIT_DIP' | 'WAIT_BREAK' | 'NEXT_DAY' | 'NO_ENTRY';
        // V60.2: 历史回测统计
        backtest?: {
            sampleSize: number;
            winRate: number;
            avgWinPct: number;
            avgLossPct: number;
            optimalStopMult: number;
            profitFactor: number;
            expectancy: number;
        };
        // V60.2: 筹码峰价位
        chipPeaks?: {
            supportPeaks: { price: number; strength: number; label: string }[];
            resistancePeaks: { price: number; strength: number; label: string }[];
            chipConcentration: number;
        };
    };
    // V60.0 signal metadata
    signalType?: 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
    winRate?: number;
  };
  
  // V8.6 Stargate & Resonance
  stargate?: {
    gateLevel: number;
    score: number;
    signals: string[];
  };
  tags?: string[]; // e.g. ["Auto-Discovered"]
  alerts?: string[]; // e.g. ["rocket", "dive", "broken"]
}

export interface PhaseRecord {
    date: string;
    phase: MarketPhase;
    temperature: number;
}

export interface MarketIndex {
  code: string;
  name: string;
  current: number;
  currentPrice?: number;
  price?: number;
  change: number;
  changePercent: number;
}

export interface JournalEntry {
  date: string;
  phase: MarketPhase;
  whatWentRight: string;
  whatWentWrong: string;
  strategy: string;
}

export interface Fund {
  code: string;
  name: string;
  category: string;
  estimateNetValue: number;       // 估算净值
  estimateChangePercent: number; // 今日估算涨跌幅
  dayChangePercent?: number;      // 今日实际涨跌幅
  yearChangePercent?: number;     // 今年以来涨跌幅 (YTD)
  oneYearChangePercent?: number; // 近1年
  twoYearChangePercent?: number; // 近2年
  threeYearChangePercent?: number; // 近3年
  quarterChangePercent?: number; // 近1季 (Rolling 60 Days)
  lastUpdate?: string;
}

export interface MarketMetrics {
  marketTemp: number;
  limitUpCount: number;
  limitDownCount: number;
  upCount: number;
  downCount: number;
  sentimentEntropy?: number; // 情绪熵值 (0-100)
  inflectionSignal?: 'None' | 'Bottom' | 'Peak'; // 拐点信号
}
