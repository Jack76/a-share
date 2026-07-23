/**
 * Technical Indicator Calculations
 */

export interface TechnicalIndicators {
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;  // Added Quarterly Line
  ma120: number | null; // Half-Year Line
  ma250: number | null; // Year Line
  atr: number | null; // Added ATR
  macd: {
    dif: number;
    dea: number;
    macd: number;
  } | null;
  boll: {
    upper: number;
    mid: number;
    lower: number;
  } | null;
  kdj: {
    k: number;
    d: number;
    j: number;
  } | null;
  recentHigh: number | null; // Added
  recentLow: number | null;  // Added
  volRatio?: number;
  avgVol5?: number;
  rsi: {
    rsi6: number;
    rsi12: number;
    rsi24: number;
  } | null;
  mfi: number | null; // Money Flow Index (Institutional Activity Proxy)
  chipPressure?: number; // v41.0 优化筹码压力计算
  chipSupport?: number;  // v41.0 新增筹码支撑
  profitRatio?: number;  // v41.0 新增获利盘比例
  atrBands?: {           // v41.0 新增ATR动态攻防线
    upperResistance: number;
    upperSupport: number;
    lowerSupport: number;
    lowerResistance: number;
  } | null;
  macdDivergence?: 'bull' | 'bear' | null; // v41.0 MACD背离检测
  rsiDivergence?: 'bull' | 'bear' | null;  // v41.0 RSI背离检测
  dmi?: {       // v44.0 DMI趋向指标
    pdi: number;
    mdi: number;
    adx: number;
  } | null;
  alpha?: number; // v59.0 Alpha (Excess Return)
}

/**
 * v43.0 分时量化指标 (Intraday Quantum Indicators)
 * 计算分时级别的 MACD、动量、量比结构
 */
export interface IntradayIndicators {
    macdfs: {
        dif: number;
        dea: number;
        macd: number;
        signal: 'GoldenCross' | 'DeadCross' | 'None';
    } | null;
    volumeStructure: {
        lastVol: number;
        avgVol5: number;
        isHeavy: boolean; // 是否放量
        isShrink: boolean; // 是否缩量
    };
    trend: 'Bullish' | 'Bearish' | 'Neutral';
}

export const analyzeIntradayStructure = (
    history: { close: number; volume: number }[]
): IntradayIndicators => {
    if (!history || history.length < 30) {
        return {
            macdfs: null,
            volumeStructure: { lastVol: 0, avgVol5: 0, isHeavy: false, isShrink: false },
            trend: 'Neutral'
        };
    }

    const closes = history.map(h => h.close);
    const volumes = history.map(h => h.volume);

    // 1. MACDFS (分时MACD)
    const macd = calculateMACD(closes);

    // 2. Volume Structure (分时量)
    const lastVol = volumes[volumes.length - 1];
    const prevVols = volumes.slice(-6, -1);
    const avgVol5 = prevVols.reduce((a, b) => a + b, 0) / 5 || 1;
    
    // 量比判定 (相对于最近5分钟)
    const volRatio = lastVol / avgVol5;
    const isHeavy = volRatio > 2.0;
    const isShrink = volRatio < 0.6;

    // 3. Simple Trend (MA20 of Intraday)
    const ma20 = calculateSMA(closes, 20);
    const currentMA20 = ma20[ma20.length - 1] || 0;
    const currentPrice = closes[closes.length - 1];
    
    let trend: 'Bullish' | 'Bearish' | 'Neutral' = 'Neutral';
    if (currentPrice > currentMA20 * 1.005) trend = 'Bullish';
    else if (currentPrice < currentMA20 * 0.995) trend = 'Bearish';

    return {
        macdfs: macd,
        volumeStructure: { lastVol, avgVol5, isHeavy, isShrink },
        trend
    };
};

export const calculateIndicators = (
  history: { close: number; high?: number; low?: number; volume?: number }[],
  livePrice?: number,
): TechnicalIndicators => {
  if (!history || history.length === 0) {
    return {
      ma5: null,
      ma10: null,
      ma20: null,
      ma60: null,
      ma120: null,
      ma250: null,
      atr: null,
      macd: null,
      boll: null,
      kdj: null,
      rsi: null,
      mfi: null,
      recentHigh: null,
      recentLow: null
    };
  }

  const closes = history.map(h => h.close);

  // --- Recent Range ---
  const last30 = history.slice(-30);
  const recentHigh = Math.max(...last30.map(h => h.high || h.close));
  const recentLow = Math.min(...last30.map(h => h.low || h.close));

  // --- MA ---
  const ma5 = calculateSMA(closes, 5);
  const ma10 = calculateSMA(closes, 10);
  const ma20 = calculateSMA(closes, 20);
  const ma60 = calculateSMA(closes, 60);
  const ma120 = calculateSMA(closes, 120);
  const ma250 = calculateSMA(closes, 250);

  // --- ATR ---
  const atr = calculateATR(history, 14);

  // --- MACD ---
  const macd = calculateMACD(closes);

  // --- BOLL ---
  const boll = calculateBOLL(closes, 20, 2);

  // --- KDJ ---
  const kdj = calculateKDJ(history, 9, 3, 3);

  // --- RSI ---
  const rsi6 = calculateRSI(closes, 6);
  const rsi12 = calculateRSI(closes, 12);
  const rsi24 = calculateRSI(closes, 24);

  // --- MFI (Institutional Activity) ---
  const mfi = calculateMFI(history, 14);

  // --- Volume ---
  let avgVol5 = 0;
  if (history.length >= 5) {
     const vols = history.slice(-5).map(h => h.volume || 0);
     avgVol5 = vols.reduce((a, b) => a + b, 0) / 5;
  }

  // --- v41.0 Advanced Indicators ---
  const currentPrice = Number.isFinite(livePrice) && (livePrice || 0) > 0
    ? livePrice as number
    : closes[closes.length - 1];
  
  // 筹码分布
  const chipDist = calculateChipDistribution(history, currentPrice);
  
  // ATR动态攻防线
  const atrBands = calculateATRBands(history);
  
  // MACD背离
  const macdDivergence = detectMACDDivergence(history);
  
  // RSI背离
  const rsiDivergence = detectRSIDivergence(history);
  
  // DMI
  const dmi = calculateDMI(history);

  // V59.0: Alpha Calculation (Excess Return / Trend Strength)
  // We infer isLimitUp from recent price action (Rough estimation > 9.5%)
  const lastBar = history[history.length - 1];
  const prevBar = history.length > 1 ? history[history.length - 2] : null;
  const isLimitUpEst = prevBar ? (lastBar.close - prevBar.close) / prevBar.close > 0.095 : false;
  
  const alphaData = calculateAlphaDivergence(history, isLimitUpEst);

  return {
    ma5: ma5[ma5.length - 1] || null,
    ma10: ma10[ma10.length - 1] || null,
    ma20: ma20[ma20.length - 1] || null,
    ma60: ma60[ma60.length - 1] || null,
    ma120: ma120[ma120.length - 1] || null,
    ma250: ma250[ma250.length - 1] || null,
    atr: atr || null,
    macd: macd ? {
        dif: macd.dif,
        dea: macd.dea,
        macd: macd.bar
    } : null,
    boll: boll ? {
        upper: boll.upper,
        mid: boll.mid,
        lower: boll.lower
    } : null,
    kdj: kdj ? {
        k: kdj.k,
        d: kdj.d,
        j: kdj.j
    } : null,
    rsi: (rsi6 !== null && rsi12 !== null && rsi24 !== null) ? {
        rsi6,
        rsi12,
        rsi24
    } : null,
    mfi: mfi,
    recentHigh,
    recentLow,
    avgVol5,
    // v41.0 新增指标
    chipPressure: chipDist.chipPressure,
    chipSupport: chipDist.chipSupport,
    profitRatio: chipDist.profitRatio,
    atrBands,
    macdDivergence,
    rsiDivergence,
    dmi,
    alpha: alphaData.alpha
  };
};

/**
 * 统一 Alpha 背离算法 (Alpha Divergence Engine v45.4)
 * 升级：引入"DNA股性修正"与"趋势加权"
 * - DNA修正：高波动(妖股)降低敏感度，低波动(权重)提升敏感度
 * - 趋势加权：多头排列时给予情绪补偿，避免强势股洗盘被误判
 */
export const calculateAlphaDivergence = (
  history: { close: number; high?: number; low?: number; volume?: number }[], 
  isLimitUp: boolean = false
): { alpha: number, sentiments: number[], priceChg: number } => {
  if (!history || history.length < 20) return { alpha: 0, sentiments: [], priceChg: 0 };
  
  // 1. DNA Profiling (股性计算)
  // 计算最近20日的平均振幅 (Volatility)
  // V59.4 FIX: Use previous bar's close as denominator (standard True Range definition).
  // Previously used current bar's close, causing systematic bias in elasticity calculation.
  const last20 = history.slice(-20);
  let totalAmp = 0;
  for (let i = 1; i < last20.length; i++) {
      const h = last20[i];
      const prevBarClose = last20[i - 1].close;
      const high = h.high || h.close;
      const low = h.low || h.close;
      if (prevBarClose > 0) totalAmp += (high - low) / prevBarClose;
  }
  const avgAmp = (last20.length > 1 ? totalAmp / (last20.length - 1) : 0) || 0.03; // Default 3%
  
  // 弹性系数 (Elasticity): 标准为 3%。
  // 妖股 (8%) -> Scale 0.375 (迟钝)
  // 银行 (1%) -> Scale 3.0 (敏锐)
  // 限制范围: 0.5 (最迟钝) ~ 2.0 (最敏锐)
  const dnaScale = Math.max(0.5, Math.min(2.0, 0.03 / avgAmp));

  // 2. Trend Calculation (趋势计算)
  const closes = history.map(h => h.close);
  const ma20 = calculateSMA(closes, 20);
  const currentMA20 = ma20[ma20.length - 1] || closes[closes.length - 1];
  const isTrendUp = closes[closes.length - 1] > currentMA20;
  
  const recent30 = history.slice(-30);
  // Use Average Volume of the window as base
  const totalVol = recent30.reduce((acc, h) => acc + (h.volume || 0), 0);
  const baseVol = totalVol / recent30.length || 1;
  
  const last10 = history.slice(-10);
  const sentiments = last10.map((h, i) => {
      const globalIndex = history.length - 10 + i;
      const prev = history[globalIndex - 1] || h;
      
      const velocity = (h.close - prev.close) / (prev.close || 1);
      
      // If Limit Up and Velocity is near 0 (Sealed), we treat Low Volume as "Locked"
      if (isLimitUp && Math.abs(velocity) < 0.001) {
          return 85; 
      }
      
      // 引入"有效资金买入系数"
      const dayRange = (h.high || h.close) - (h.low || h.close);
      const buyQuality = dayRange > 0 ? (h.close - (h.low || h.close)) / dayRange : 0.5;
      
      const volIntensity = h.volume ? (h.volume / baseVol) * (buyQuality + 0.5) : 1;
      
      // v45.4 核心公式升级:
      // 1. Velocity * 150 * dnaScale (股性修正)
      // 2. Trend Bonus (趋势加权)
      let score = 50 + (velocity * 150 * dnaScale) + ((volIntensity - 1) * 30);
      
      // 趋势补偿：如果是多头趋势且缩量回调，视为"惜售"而非"衰竭"
      if (isTrendUp && volIntensity < 0.8 && velocity < 0) {
          score += 5; // 补偿5分情绪
      }
      
      return Math.min(95, Math.max(5, score));
  });
  
  const first = last10[0];
  const last = last10[last10.length - 1];
  
  const priceChg = (last.close - first.close) / (first.close || 1);
  const sentChg = (sentiments[sentiments.length - 1] - sentiments[0]) / 100;
  
  const alpha = Number(((sentChg - priceChg) * 100).toFixed(1));
  
  return { alpha, sentiments, priceChg: priceChg * 100 };
};

// Simple Moving Average
const calculateSMA = (data: number[], period: number): (number | null)[] => {
  // 边界检查：period必须有效
  if (!data || data.length === 0 || period <= 0) {
    return [];
  }
  
  // 边界检查：period不能大于数据长度
  if (period > data.length) {
    return new Array(data.length).fill(null);
  }
  
  const sma: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    sma.push(sum / period);
  }
  return sma;
};

// Exponential Moving Average
const calculateEMA = (data: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  // First EMA is SMA (or first data point if specialized)
  // Usually initialize with first data point for simplicity in iterative
  ema[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
};

// MACD Series (12, 26, 9)
const calculateMACDSeries = (data: number[]) => {
  if (data.length < 26) return null;

  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);

  const dif: number[] = [];
  for (let i = 0; i < data.length; i++) {
    dif[i] = ema12[i] - ema26[i];
  }

  const dea = calculateEMA(dif, 9);
  
  const bar: number[] = [];
  for (let i = 0; i < data.length; i++) {
    bar[i] = (dif[i] - dea[i]) * 2;
  }

  return { dif, dea, bar };
};

// MACD (Return last value)
const calculateMACD = (data: number[]) => {
  const series = calculateMACDSeries(data);
  if (!series) return null;

  return {
    dif: series.dif[series.dif.length - 1],
    dea: series.dea[series.dea.length - 1],
    bar: series.bar[series.bar.length - 1]
  };
};

// Bollinger Bands (20, 2)
const calculateBOLL = (data: number[], period: number, multiplier: number) => {
  if (data.length < period) return null;

  const sma = calculateSMA(data, period);
  const lastSMA = sma[sma.length - 1];
  
  if (lastSMA === null) return null;

  // Calculate Std Dev for the last window
  const slice = data.slice(data.length - period);
  const mean = lastSMA;
  
  const squaredDiffs = slice.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
      mid: mean,
      upper: mean + multiplier * stdDev,
      lower: mean - multiplier * stdDev
  };
};

// Average True Range (ATR)
const calculateATR = (history: { close: number; high?: number; low?: number }[], period: number): number | null => {
  if (history.length < period + 1) return null;

  const trs: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const high = history[i].high || history[i].close;
    const low = history[i].low || history[i].close;
    const prevClose = history[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }

  // Use SMA of TR for simplicity (standard ATR usually uses EMA or Wilder's)
  const lastTRs = trs.slice(-period);
  return lastTRs.reduce((a, b) => a + b, 0) / period;
};

// KDJ (9, 3, 3)
const calculateKDJ = (history: { close: number; high?: number; low?: number }[], n = 9, m1 = 3, m2 = 3) => {
  if (history.length < n) return null;

  const ks: number[] = [];
  const ds: number[] = [];
  const js: number[] = [];

  let lastK = 50;
  let lastD = 50;

  for (let i = 0; i < history.length; i++) {
    const start = Math.max(0, i - n + 1);
    const window = history.slice(start, i + 1);
    
    const high = Math.max(...window.map(h => h.high || h.close));
    const low = Math.min(...window.map(h => h.low || h.close));
    const close = history[i].close;

    let rsv = 0;
    if (high !== low) {
        rsv = ((close - low) / (high - low)) * 100;
    }

    const k = (2 / m1) * lastK + (1 / m1) * rsv;
    const d = (2 / m2) * lastD + (1 / m2) * k;
    const j = 3 * k - 2 * d;

    ks.push(k);
    ds.push(d);
    js.push(j);

    lastK = k;
    lastD = d;
  }

  return {
    k: ks[ks.length - 1],
    d: ds[ds.length - 1],
    j: js[js.length - 1]
  };
};

// RSI Series Calculation (Smoothed/Wilder's RSI)
const calculateRSISeries = (data: number[], period: number): number[] => {
  if (data.length < period + 1) return [];

  const rsiValues: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // Need at least 'period' changes to calculate first RSI
  // indices in gains/losses: 0 to length-1
  // RSI[0] corresponds to data[period] (which is based on changes 0..period-1)

  if (gains.length < period) return [];

  // First RSI (Simple Average)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Initial RSI value
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
  
  rsiValues.push(rsi);

  // Smoothed RSI for the rest
  for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      
      if (avgLoss === 0) {
        rsiValues.push(100);
      } else {
        rs = avgGain / avgLoss;
        rsiValues.push(100 - (100 / (1 + rs)));
      }
  }

  return rsiValues;
};

// RSI (Return last value)
const calculateRSI = (data: number[], period: number): number | null => {
  const series = calculateRSISeries(data, period);
  if (series.length === 0) return null;
  return series[series.length - 1];
};

// MFI (Money Flow Index) - Institutional Activity Proxy
const calculateMFI = (history: { close: number; high?: number; low?: number; volume?: number }[], period: number): number | null => {
  if (history.length < period + 1) return null;

  const typicalPrices = history.map(h => ((h.high || h.close) + (h.low || h.close) + h.close) / 3);
  const moneyFlows = typicalPrices.map((tp, i) => tp * (history[i].volume || 0));

  const positiveFlows: number[] = [];
  const negativeFlows: number[] = [];

  // Need at least period + 1 points to determine direction of 'period' points
  // Wait, MFI direction is based on Typical Price vs Previous Typical Price
  
  for (let i = 1; i < history.length; i++) {
      const tp = typicalPrices[i];
      const prevTp = typicalPrices[i - 1];
      const mf = moneyFlows[i];

      if (tp > prevTp) {
          positiveFlows.push(mf);
          negativeFlows.push(0);
      } else if (tp < prevTp) {
          positiveFlows.push(0);
          negativeFlows.push(mf);
      } else {
          positiveFlows.push(0);
          negativeFlows.push(0);
      }
  }

  if (positiveFlows.length < period) return null;

  // Calculate MFI for the last window
  const posSlice = positiveFlows.slice(-period);
  const negSlice = negativeFlows.slice(-period);

  const posSum = posSlice.reduce((a, b) => a + b, 0);
  const negSum = negSlice.reduce((a, b) => a + b, 0);

  if (negSum === 0) return 100;

  const mfr = posSum / negSum;
  return 100 - (100 / (1 + mfr));
};

/**
 * v41.0 计算优化的筹码分布 (Enhanced Chip Distribution)
 * 基于60日历史成交量分布，识别密集成交区
 * 返回：上方筹码压力、下方筹码支撑、获利盘比例
 * V59.6 FIX: 引入指数时间衰减权重 — 近期成交量权重3~5倍于远期，
 *           消除60天前已消化的"伪套牢盘"对压力/支撑位的滞后干扰。
 * V60.3 升级: OHLC区间展开 + 趋势方向加权，与筹码峰引擎算法对齐
 */
export const calculateChipDistribution = (
  history: { close: number; open?: number; high?: number; low?: number; volume?: number }[],
  currentPrice: number
): { chipPressure: number; chipSupport: number; profitRatio: number } => {
  if (!history || history.length < 20) {
    return { chipPressure: 50, chipSupport: 50, profitRatio: 50 };
  }

  // 使用最近60日数据（如果有的话）
  const recentBars = history.slice(-60);
  
  // 构建分价成交量分布（将价格分成25个区间）
  const priceRange = { 
    min: Math.min(...recentBars.map(h => h.low || h.close)), 
    max: Math.max(...recentBars.map(h => h.high || h.close)) 
  };
  
  // 边界检查：价格区间不能为0（所有价格都相同）
  if (priceRange.max === priceRange.min || priceRange.max - priceRange.min === 0) {
    return { chipPressure: 50, chipSupport: 50, profitRatio: 50 };
  }
  
  const binCount = 25;
  const binSize = (priceRange.max - priceRange.min) / binCount;
  
  // 初始化每个价格区间的成交量
  const volumeDistribution: number[] = new Array(binCount).fill(0);
  
  // 辅助：价格到bin索引
  const priceToBin = (p: number) => Math.min(binCount - 1, Math.max(0, Math.floor((p - priceRange.min) / binSize)));
  
  // V59.6: 指数时间衰减 — λ=0.05, 半衰期≈14天
  const decayLambda = 0.05;
  const windowLen = recentBars.length;
  
  recentBars.forEach((bar, idx) => {
    const daysAgo = windowLen - 1 - idx; // 最近一天 daysAgo=0
    const timeWeight = Math.exp(-decayLambda * daysAgo);
    const vol = (bar.volume || 0) * timeWeight;
    
    const barHigh = bar.high || bar.close;
    const barLow = bar.low || bar.close;
    const barOpen = bar.open || bar.close;
    const barClose = bar.close;
    
    // V60.3: OHLC 区间展开 — 成交量均匀分布到 [low, high] 区间
    const binLo = priceToBin(barLow);
    const binHi = priceToBin(barHigh);
    const spanBins = Math.max(1, binHi - binLo + 1);
    const volPerBin = vol / spanBins;
    
    // 趋势方向加权：上涨日上半区×1.3/下半区×0.7，下跌日反之
    const isUp = barClose >= barOpen;
    
    for (let b = binLo; b <= binHi; b++) {
      let trendMult = 1.0;
      if (spanBins > 1) {
        const posInRange = (b - binLo) / (binHi - binLo);
        trendMult = isUp ? (0.7 + 0.6 * posInRange) : (1.3 - 0.6 * posInRange);
      }
      volumeDistribution[b] += volPerBin * trendMult;
    }
  });
  
  // 当前价格所在的区间
  const currentBin = priceToBin(currentPrice);
  
  // 计算上方筹码总量（压力）
  const upperChips = volumeDistribution.slice(currentBin + 1).reduce((a, b) => a + b, 0);
  // 计算下方筹码总量（支撑）
  const lowerChips = volumeDistribution.slice(0, currentBin).reduce((a, b) => a + b, 0);
  // 总成交量
  const totalChips = volumeDistribution.reduce((a, b) => a + b, 0) || 1;
  
  // 筹码压力 = 上方筹码占比 * 100
  const chipPressure = (upperChips / totalChips) * 100;
  // 筹码支撑 = 下方筹码占比 * 100
  const chipSupport = (lowerChips / totalChips) * 100;
  
  // 获利盘比例 = 当前价格下方的筹码（这些持仓成本低于当前价，都是盈利的）
  const profitRatio = chipSupport;
  
  return {
    chipPressure: Number(chipPressure.toFixed(1)),
    chipSupport: Number(chipSupport.toFixed(1)),
    profitRatio: Number(profitRatio.toFixed(1))
  };
};

/**
 * v41.0 计算ATR动态攻防线 (ATR Dynamic Bands)
 * 基于ATR构建多层支撑/压力位系统
 * 逻辑：MA5 ± 1.5*ATR（近端）, MA20 ± 2*ATR（远端）
 */
export const calculateATRBands = (
  history: { close: number; high?: number; low?: number; volume?: number }[]
): {
  upperResistance: number;
  upperSupport: number;
  lowerSupport: number;
  lowerResistance: number;
} | null => {
  if (!history || history.length < 20) return null;
  
  const closes = history.map(h => h.close);
  const ma5Array = calculateSMA(closes, 5);
  const ma20Array = calculateSMA(closes, 20);
  const atr = calculateATR(history, 14);
  
  const ma5 = ma5Array[ma5Array.length - 1];
  const ma20 = ma20Array[ma20Array.length - 1];
  
  if (!ma5 || !ma20 || !atr) return null;
  
  return {
    upperResistance: Number((ma20 + 2 * atr).toFixed(2)),  // 强压力位（MA20 + 2ATR）
    upperSupport: Number((ma5 + 1.5 * atr).toFixed(2)),     // 近端压力（MA5 + 1.5ATR）
    lowerSupport: Number((ma5 - 1.5 * atr).toFixed(2)),     // 近端支撑（MA5 - 1.5ATR）
    lowerResistance: Number((ma20 - 2 * atr).toFixed(2))    // 强支撑位（MA20 - 2ATR）
  };
};

/**
 * v41.1 MACD背离检测 (MACD Divergence Detection)
 * 逻辑：价格创新高但MACD柱状图未创新高 = 顶背离
 *       价格创新低但MACD柱状图未创新低 = 底背离
 * v41.1 优化：双高点确认机制，减少假信号
 * V59.6 FIX: 增强背离检测可靠性：
 *   1. 增加峰距最小间距检查（至少5根K线），排除噪声毛刺
 *   2. 增加背离幅度阈值（价格差 >1%，MACD差 >10%），排除微小波动
 *   3. 增加量能确认（缩量背离可信度更高，放量背离需额外打折）
 */
export const detectMACDDivergence = (
  history: { close: number; high?: number; low?: number; volume?: number }[]
): 'bull' | 'bear' | null => {
  if (!history || history.length < 30) return null;
  
  const closes = history.map(h => h.close);
  const macdSeries = calculateMACDSeries(closes);
  
  if (!macdSeries) return null;

  const recentPrices = closes.slice(-20);
  const recentMACD = macdSeries.bar.slice(-20);
  const recentVolumes = history.slice(-20).map(h => h.volume || 0);
  
  // 寻找局部峰值（高点）- 至少需要2个高点才能判断背离
  const pricePeaks = findLocalPeaks(recentPrices, 3);
  const macdPeaks = findLocalPeaks(recentMACD, 3);
  
  if (pricePeaks.length >= 2 && macdPeaks.length >= 2) {
    // 取最近的2个高点进行对比
    const [prevPricePeak, lastPricePeak] = pricePeaks.slice(-2);
    const [prevMACDPeak, lastMACDPeak] = macdPeaks.slice(-2);
    
    const currentPrice = recentPrices[recentPrices.length - 1];
    
    // V59.6: 峰距检查 — 两个峰之间至少间隔5根K线，排除噪声毛刺
    const peakDistance = Math.abs(lastPricePeak.index - prevPricePeak.index);
    
    // V59.6: 幅度阈值 — 价格差 >1%, MACD差 >10% (相对值)
    const priceDivMagnitude = prevPricePeak.value > 0 
      ? (lastPricePeak.value - prevPricePeak.value) / prevPricePeak.value : 0;
    const macdDivMagnitude = prevMACDPeak.value !== 0 
      ? (prevMACDPeak.value - lastMACDPeak.value) / Math.abs(prevMACDPeak.value) : 0;
    
    // V59.6: 量能确认 — 最近峰值附近的量能 vs 前一峰值附近的量能
    const lastPeakVol = recentVolumes[Math.min(recentVolumes.length - 1, lastPricePeak.index)] || 1;
    const prevPeakVol = recentVolumes[prevPricePeak.index] || 1;
    const isVolumeShrinking = lastPeakVol < prevPeakVol * 0.85; // 缩量背离更可信
    
    // 顶背离：最近价格高点 > 前一个价格高点，但最近MACD高点 < 前一个MACD高点
    // 且当前价格接近最近高点（在5%范围内）
    if (lastPricePeak.value > prevPricePeak.value && 
        lastMACDPeak.value < prevMACDPeak.value &&
        peakDistance >= 5 &&           // V59.6: 峰距检查
        priceDivMagnitude > 0.01 &&    // V59.6: 价格差至少1%
        macdDivMagnitude > 0.10 &&     // V59.6: MACD差至少10%
        lastPricePeak.index > 10 && 
        currentPrice > lastPricePeak.value * 0.95) {
      // V59.6: 缩量顶背离直接确认，放量顶背离需更严格的MACD差距
      if (isVolumeShrinking || macdDivMagnitude > 0.20) {
        return 'bear'; // 顶背离（看跌）
      }
    }
  }
  
  // 寻找局部谷值（低点）
  const priceTroughs = findLocalTroughs(recentPrices, 3);
  const macdTroughs = findLocalTroughs(recentMACD, 3);
  
  if (priceTroughs.length >= 2 && macdTroughs.length >= 2) {
    const [prevPriceTrough, lastPriceTrough] = priceTroughs.slice(-2);
    const [prevMACDTrough, lastMACDTrough] = macdTroughs.slice(-2);
    
    const currentPrice = recentPrices[recentPrices.length - 1];
    
    // V59.6: 峰距和幅度检查
    const troughDistance = Math.abs(lastPriceTrough.index - prevPriceTrough.index);
    const priceDivMagnitude = prevPriceTrough.value > 0 
      ? (prevPriceTrough.value - lastPriceTrough.value) / prevPriceTrough.value : 0;
    const macdDivMagnitude = prevMACDTrough.value !== 0 
      ? (lastMACDTrough.value - prevMACDTrough.value) / Math.abs(prevMACDTrough.value) : 0;
    
    // 底背离：最近价格低点 < 前一个价格低点，但最近MACD低点 > 前一个MACD低点
    if (lastPriceTrough.value < prevPriceTrough.value && 
        lastMACDTrough.value > prevMACDTrough.value &&
        troughDistance >= 5 &&          // V59.6: 峰距检查
        priceDivMagnitude > 0.01 &&     // V59.6: 价格差至少1%
        macdDivMagnitude > 0.10 &&      // V59.6: MACD差至少10%
        lastPriceTrough.index > 10 && 
        currentPrice < lastPriceTrough.value * 1.05) {
      return 'bull'; // 底背离（看涨）
    }
  }
  
  return null;
};

/**
 * v41.1 RSI背离检测 (RSI Divergence Detection)
 * 逻辑同MACD背离，但使用RSI指标
 * v41.1 优化：双高点确认机制
 */
export const detectRSIDivergence = (
  history: { close: number; high?: number; low?: number; volume?: number }[]
): 'bull' | 'bear' | null => {
  if (!history || history.length < 30) return null;
  
  const closes = history.map(h => h.close);
  const rsiSeries = calculateRSISeries(closes, 14);
  
  if (rsiSeries.length < 20) return null;
  
  const recentPrices = closes.slice(-20);
  const recentRSI = rsiSeries.slice(-20);
  
  if (recentRSI.length < 20) return null;

  // 寻找局部峰值
  const pricePeaks = findLocalPeaks(recentPrices, 3);
  const rsiPeaks = findLocalPeaks(recentRSI, 3);
  
  if (pricePeaks.length < 2 || rsiPeaks.length < 2) return null;
  
  const [lastPricePeak, prevPricePeak] = pricePeaks.slice(-2);
  const [lastRSIPeak, prevRSIPeak] = rsiPeaks.slice(-2);
  
  const currentPrice = recentPrices[recentPrices.length - 1];
  
  // 顶背离（需要RSI在超买区 > 70）
  if (lastPricePeak.value > prevPricePeak.value && 
      lastRSIPeak.value < prevRSIPeak.value &&
      lastRSIPeak.value > 70 &&
      lastPricePeak.index > 10 && 
      currentPrice > lastPricePeak.value * 0.95) {
    return 'bear';
  }
  
  // 寻找局部谷值
  const priceTroughs = findLocalTroughs(recentPrices, 3);
  const rsiTroughs = findLocalTroughs(recentRSI, 3);
  
  if (priceTroughs.length < 2 || rsiTroughs.length < 2) return null;
  
  const [lastPriceTrough, prevPriceTrough] = priceTroughs.slice(-2);
  const [lastRSITrough, prevRSITrough] = rsiTroughs.slice(-2);
  
  // 底背离（需要RSI在超卖区 < 30）
  if (lastPriceTrough.value < prevPriceTrough.value && 
      lastRSITrough.value > prevRSITrough.value &&
      lastRSITrough.value < 30 &&
      lastPriceTrough.index > 10 && 
      currentPrice < lastPriceTrough.value * 1.05) {
    return 'bull';
  }
  
  return null;
};

/**
 * 辅助函数：寻找局部峰值（高点）
 * @param data 数据数组
 * @param window 窗口大小（峰值两侧至少window个点都比它低）
 */
function findLocalPeaks(data: number[], window: number): { index: number; value: number }[] {
  const peaks: { index: number; value: number }[] = [];
  
  for (let i = window; i < data.length - window; i++) {
    let isPeak = true;
    
    // 检查左侧window个点
    for (let j = i - window; j < i; j++) {
      if (data[j] >= data[i]) {
        isPeak = false;
        break;
      }
    }
    
    // 检查右侧window个点
    if (isPeak) {
      for (let j = i + 1; j <= i + window; j++) {
        if (data[j] >= data[i]) {
          isPeak = false;
          break;
        }
      }
    }
    
    if (isPeak) {
      peaks.push({ index: i, value: data[i] });
    }
  }
  
  return peaks;
}

/**
 * 辅助函数：寻找局部谷值（低点）
 * @param data 数据数组
 * @param window 窗口大小
 */
function findLocalTroughs(data: number[], window: number): { index: number; value: number }[] {
  const troughs: { index: number; value: number }[] = [];
  
  for (let i = window; i < data.length - window; i++) {
    let isTrough = true;
    
    // 检查左侧window个点
    for (let j = i - window; j < i; j++) {
      if (data[j] <= data[i]) {
        isTrough = false;
        break;
      }
    }
    
    // 检查右侧window个点
    if (isTrough) {
      for (let j = i + 1; j <= i + window; j++) {
        if (data[j] <= data[i]) {
          isTrough = false;
          break;
        }
      }
    }
    
    if (isTrough) {
      troughs.push({ index: i, value: data[i] });
    }
  }
  
  return troughs;
}

/**
 * v44.0 DMI趋向指标 (Directional Movement Index)
 * 判定趋势强度与方向
 * Standard: Period = 14, ADX Period = 6
 */
const calculateDMI = (history: { close: number; high?: number; low?: number }[], period = 14, adxPeriod = 6) => {
    // Need enough data: Period + ADX Period
    if (history.length < period + adxPeriod) return null;

    const highs = history.map(h => h.high || h.close);
    const lows = history.map(h => h.low || h.close);
    const closes = history.map(h => h.close);

    const trs: number[] = [];
    const pdms: number[] = []; // +DM
    const mdms: number[] = []; // -DM

    // 1. Calculate TR, +DM, -DM for each day
    for (let i = 1; i < history.length; i++) {
        const h = highs[i];
        const l = lows[i];
        const prevC = closes[i-1];
        const prevH = highs[i-1];
        const prevL = lows[i-1];

        // TR
        const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
        trs.push(tr);

        // Directional Movement
        const upMove = h - prevH;
        const downMove = prevL - l;

        if (upMove > downMove && upMove > 0) {
            pdms.push(upMove);
            mdms.push(0);
        } else if (downMove > upMove && downMove > 0) {
            pdms.push(0);
            mdms.push(downMove);
        } else {
            pdms.push(0);
            mdms.push(0);
        }
    }

    // 2. Smooth them using Wilder's Smoothing (First value is Sum, subsequent are smoothed)
    
    if (trs.length < period) return null;

    let trSmooth = 0;
    let pdmSmooth = 0;
    let mdmSmooth = 0;

    for(let i=0; i<period; i++) {
        trSmooth += trs[i];
        pdmSmooth += pdms[i];
        mdmSmooth += mdms[i];
    }

    const pdis: number[] = [];
    const mdis: number[] = [];
    const dxs: number[] = [];

    const pushMetrics = (tr: number, pdm: number, mdm: number) => {
        const pdi = tr === 0 ? 0 : (pdm / tr) * 100;
        const mdi = tr === 0 ? 0 : (mdm / tr) * 100;
        pdis.push(pdi);
        mdis.push(mdi);
        
        const sum = pdi + mdi;
        const dx = sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100;
        dxs.push(dx);
    }

    // First calculated point
    pushMetrics(trSmooth, pdmSmooth, mdmSmooth);

    // Subsequent points
    for (let i = period; i < trs.length; i++) {
        const currentTR = trs[i];
        const currentPDM = pdms[i];
        const currentMDM = mdms[i];

        // Wilder's Smoothing: Previous - (Previous/n) + Current
        trSmooth = trSmooth - (trSmooth / period) + currentTR;
        pdmSmooth = pdmSmooth - (pdmSmooth / period) + currentPDM;
        mdmSmooth = mdmSmooth - (mdmSmooth / period) + currentMDM;
        
        pushMetrics(trSmooth, pdmSmooth, mdmSmooth);
    }

    // 3. Calculate ADX (SMA of DX)
    if (dxs.length < adxPeriod) return null;

    // We only need the latest values
    const lastPdi = pdis[pdis.length - 1];
    const lastMdi = mdis[mdis.length - 1];

    // Simple MA for ADX over the last 'adxPeriod' points of DX
    const relevantDXs = dxs.slice(-adxPeriod);
    const adx = relevantDXs.reduce((a,b)=>a+b, 0) / relevantDXs.length;

    return {
        pdi: lastPdi,
        mdi: lastMdi,
        adx: adx
    };
};
