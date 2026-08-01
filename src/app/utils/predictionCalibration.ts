import type { MarketPhase, Stock } from '../types';

export type PredictionReliability = 'LOW' | 'MEDIUM' | 'HIGH';
export type MarketRegime = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'DIVERGENT' | 'UNKNOWN';
export type CalibrationStatus = 'UNVALIDATED' | 'LIMITED' | 'WALK_FORWARD_PROXY';

export interface MarketCalibrationContext {
  totalCount?: number;
  upCount?: number;
  downCount?: number;
  limitUpCount?: number;
  limitDownCount?: number;
  indexChange?: number;
  isIndexBull?: boolean;
  isIndexStrong?: boolean;
  phaseConfidence?: number;
  dataStatus?: 'FRESH' | 'PARTIAL' | 'STALE' | 'UNAVAILABLE';
  coverage?: number;
  sourceAgeMs?: number;
  isMarketOpen?: boolean;
}

export interface BacktestEvidence {
  sampleSize: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  direction?: 'LONG' | 'EXIT';
  exactRegimeSampleSize?: number;
  totalSampleSize?: number;
  effectiveSampleSize?: number;
  recentSampleShare?: number;
}

export interface PredictionCalibrationInput {
  stock: Stock;
  phase: MarketPhase;
  rawProbability: number;
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  signalType: 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
  trapDetected: boolean;
  backtest?: BacktestEvidence;
  marketContext?: MarketCalibrationContext;
}

export interface PredictionCalibrationResult {
  probability: number;
  rawProbability: number;
  dataQuality: number;
  reliability: PredictionReliability;
  dataReliability: PredictionReliability;
  marketDataReliability: PredictionReliability;
  marketDataStatus?: 'FRESH' | 'PARTIAL' | 'STALE' | 'UNAVAILABLE';
  evidenceReliability: PredictionReliability;
  calibrationStatus: CalibrationStatus;
  sampleSize: number;
  marketRegime: MarketRegime;
  marketDataQuality: number;
  confidenceLow: number;
  confidenceHigh: number;
  warnings: string[];
}

export interface ActionablePrediction {
  probability?: number;
  direction?: 'UP' | 'DOWN' | 'SIDEWAYS';
  reliability?: PredictionReliability;
}

export interface PredictionWaitContext extends ActionablePrediction {
  evidenceReliability?: PredictionReliability;
  sampleSize?: number;
}

export type PredictionSignalType = 'BUY' | 'SELL' | 'WAIT' | 'HOLD';

export type PredictionWaitReason =
  | 'INSUFFICIENT_EVIDENCE'
  | 'DIRECTION_NOT_BULLISH'
  | 'PROBABILITY_TOO_LOW'
  | 'RELIABILITY_TOO_LOW'
  | 'OTHER';

export interface BuySignalGateInput {
  signalType: PredictionSignalType;
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  probability: number;
  trapDetected: boolean;
  backtest?: BacktestEvidence;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const isValidCount = (value: number | undefined) =>
  Number.isFinite(value) && (value || 0) >= 0;

const calculateMarketDataQuality = (context?: MarketCalibrationContext): number => {
  if (!context) return 0;
  if (context.dataStatus === 'UNAVAILABLE') return 0;

  let quality = 0;
  const directionalCount = (context.upCount || 0) + (context.downCount || 0);
  const hasBreadth = isValidCount(context.upCount) &&
    isValidCount(context.downCount) && directionalCount >= 100;
  const hasTotal = isValidCount(context.totalCount) && (context.totalCount || 0) >= directionalCount;

  if (hasBreadth && hasTotal) quality += 0.45;
  else if (hasBreadth) quality += 0.3;

  if (isValidCount(context.limitUpCount) && isValidCount(context.limitDownCount)) quality += 0.2;
  if (Number.isFinite(context.indexChange)) quality += 0.15;
  if (typeof context.isIndexBull === 'boolean' || typeof context.isIndexStrong === 'boolean') quality += 0.1;
  if (Number.isFinite(context.phaseConfidence)) quality += 0.1;

  if (Number.isFinite(context.coverage)) {
    quality *= clamp((context.coverage || 0) / 0.97, 0, 1);
  }
  if (context.dataStatus === 'PARTIAL') quality *= 0.85;
  if (context.dataStatus === 'STALE') quality *= 0.5;

  if (Number.isFinite(context.sourceAgeMs)) {
    const allowedAgeMs = context.isMarketOpen
      ? 180_000
      : 7 * 24 * 60 * 60 * 1000;
    if ((context.sourceAgeMs || 0) > allowedAgeMs) quality *= 0.25;
  }

  return clamp(quality, 0, 1);
};

const classifyMarketRegime = (
  context: MarketCalibrationContext | undefined,
  marketDataQuality: number,
): MarketRegime => {
  if (!context || marketDataQuality < 0.55) return 'UNKNOWN';

  const directionalCount = (context.upCount || 0) + (context.downCount || 0);
  const breadth = directionalCount > 0 ? (context.upCount || 0) / directionalCount : 0.5;
  const limitCount = (context.limitUpCount || 0) + (context.limitDownCount || 0);
  const limitBalance = limitCount > 0 ? (context.limitUpCount || 0) / limitCount : 0.5;
  const indexChange = context.indexChange || 0;
  const indexBreadthDivergent = (indexChange >= 0.3 && breadth < 0.48) ||
    (indexChange <= -0.3 && breadth > 0.52);

  if (indexBreadthDivergent) return 'DIVERGENT';
  if (breadth <= 0.38 || limitBalance <= 0.35 || (indexChange <= -1 && context.isIndexBull === false)) {
    return 'RISK_OFF';
  }
  if (
    breadth >= 0.62 && limitBalance >= 0.62 && indexChange >= 0 &&
    (context.isIndexBull === true || context.isIndexStrong === true)
  ) {
    return 'RISK_ON';
  }
  return 'NEUTRAL';
};

export const resolveMarketRegime = (
  context?: MarketCalibrationContext,
): MarketRegime => classifyMarketRegime(context, calculateMarketDataQuality(context));

export const isActionableBullishPrediction = (
  prediction?: ActionablePrediction,
  minimumProbability = 70,
) => Boolean(
  prediction &&
  prediction.direction === 'UP' &&
  (prediction.probability || 0) >= minimumProbability &&
  prediction.reliability !== 'LOW'
);

/**
 * Weak evidence may veto a new entry, but it must never hide an existing
 * SELL/HOLD position-management decision. Exit protection is intentionally
 * asymmetric: missing evidence blocks risk-taking, not risk reduction.
 */
export const shouldApplyEntryWaitGate = (
  signalType: PredictionSignalType | undefined,
  prediction?: ActionablePrediction,
  minimumProbability = 70,
) => (
  signalType !== 'SELL' &&
  signalType !== 'HOLD' &&
  !isActionableBullishPrediction(prediction, minimumProbability)
);

export const getPredictionWaitReason = (
  prediction?: PredictionWaitContext,
  minimumProbability = 70,
): PredictionWaitReason => {
  if (!prediction || (prediction.sampleSize || 0) < 10 || prediction.evidenceReliability === 'LOW') {
    return 'INSUFFICIENT_EVIDENCE';
  }
  if (prediction.direction !== 'UP') return 'DIRECTION_NOT_BULLISH';
  if ((prediction.probability || 0) < minimumProbability) return 'PROBABILITY_TOO_LOW';
  if (prediction.reliability === 'LOW') return 'RELIABILITY_TOO_LOW';
  return 'OTHER';
};

export const getBuySignalVetoReason = ({
  signalType,
  direction,
  probability,
  trapDetected,
  backtest,
}: BuySignalGateInput): string | undefined => {
  if (signalType !== 'BUY') return undefined;
  if (trapDetected) return '诱多风险检测未通过';
  if (direction !== 'UP') return '买入信号与方向预测冲突';
  if (!backtest || backtest.sampleSize < 10) return '有效样本不足10笔，禁止输出买入结论';
  if (backtest && (backtest.expectancy <= 0 || backtest.profitFactor < 1)) {
    return '滚动历史代理验证未形成正期望';
  }
  if (probability <= 50) return '校准后看涨概率未超过中性线';
  return undefined;
};

const calculateDataQuality = (stock: Stock): number => {
  const history = stock.history || [];
  const historyScore = history.length >= 120 ? 1
    : history.length >= 60 ? 0.85
      : history.length >= 30 ? 0.65
        : history.length >= 15 ? 0.4
          : 0.2;

  const completeBars = history.filter(bar =>
    Number.isFinite(bar.open) && Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) && Number.isFinite(bar.close) &&
    Number.isFinite(bar.volume) && (bar.volume || 0) > 0
  ).length;
  const barCompleteness = history.length > 0 ? completeBars / history.length : 0;

  const technicalFields = [
    stock.technicals?.ma5,
    stock.technicals?.ma20,
    stock.technicals?.atr,
    stock.technicals?.avgVol5,
  ];
  const technicalScore = technicalFields.filter(value => Number.isFinite(value) && (value || 0) > 0).length / technicalFields.length;
  const realtimeScore = stock.intradayIndicators || stock.realtimeMetrics ? 1 : 0.35;

  return clamp(historyScore * 0.45 + barCompleteness * 0.25 + technicalScore * 0.2 + realtimeScore * 0.1, 0.2, 1);
};

/**
 * Calibrates heuristic confidence toward 50% when evidence is weak. Historical
 * win rate is Bayesian-smoothed and only used for long signals with >=10 trades.
 */
export const calibratePrediction = ({
  stock,
  phase,
  rawProbability,
  direction,
  signalType,
  trapDetected,
  backtest,
  marketContext,
}: PredictionCalibrationInput): PredictionCalibrationResult => {
  const warnings: string[] = [];
  const dataQuality = calculateDataQuality(stock);
  const marketDataQuality = calculateMarketDataQuality(marketContext);
  const marketRegime = classifyMarketRegime(marketContext, marketDataQuality);
  const raw = clamp(rawProbability, 5, 95);
  let calibrated = 50 + (raw - 50) * dataQuality;
  const canUseLongBacktest = direction === 'UP' &&
    (signalType === 'BUY' || signalType === 'HOLD') &&
    backtest?.direction !== 'EXIT';
  const canUseExitBacktest = direction === 'DOWN' &&
    (signalType === 'SELL' || signalType === 'HOLD' || signalType === 'WAIT') &&
    backtest?.direction === 'EXIT';
  const canUseDirectionalBacktest = canUseLongBacktest || canUseExitBacktest;
  const sampleSize = canUseDirectionalBacktest ? backtest?.sampleSize || 0 : 0;
  if (backtest && canUseDirectionalBacktest && sampleSize >= 10) {
    const priorSamples = 20;
    const smoothedWinRate = (
      backtest.winRate * sampleSize + 50 * priorSamples
    ) / (sampleSize + priorSamples);
    const evidenceWeight = Math.min(0.45, sampleSize / 100);
    calibrated = calibrated * (1 - evidenceWeight) + smoothedWinRate * evidenceWeight;

    if (backtest.expectancy <= 0 || backtest.profitFactor < 1) {
      calibrated = Math.min(calibrated, 50);
      warnings.push('同类历史交易未形成正期望，置信度已封顶。');
    }
    if ((backtest.exactRegimeSampleSize || 0) < 10 && backtest.totalSampleSize) {
      warnings.push('当前行情状态代理的直接样本偏少，已用同题材与候选池样本分层收缩。');
    }
    if ((backtest.recentSampleShare || 0) < 35 && backtest.totalSampleSize) {
      warnings.push('近期样本占比较低，历史证据已按时间衰减降权。');
    }
  } else if (canUseLongBacktest || canUseExitBacktest) {
    warnings.push('有效历史样本少于10笔，不使用样本胜率抬高置信度。');
  } else if (signalType === 'SELL' || direction === 'DOWN') {
    warnings.push('卖出/看跌信号未形成足够的专用历史样本，当前仅作为风险管理规则，并由真实预测账本持续跟踪。');
  }

  const signalConflicts = (signalType === 'BUY' && direction !== 'UP') ||
    (signalType === 'SELL' && direction === 'UP');
  if (signalConflicts) {
    calibrated = Math.min(calibrated, 50);
    warnings.push('交易信号与方向预测冲突，已降级。');
  }

  if ((phase === 'Ebb' || phase === 'Ice') && direction === 'UP') {
    calibrated = Math.min(calibrated, 58);
    warnings.push('退潮或冰点阶段限制看涨置信度。');
  }

  if (marketContext) {
    if (marketDataQuality < 0.55) {
      const unavailable = marketContext.dataStatus === 'UNAVAILABLE';
      calibrated = 50 + (calibrated - 50) * (unavailable ? 0.4 : 0.8);
      warnings.push(unavailable
        ? '全市场环境数据不可用，概率已强制向中性收缩。'
        : '全市场环境数据不完整或已过期，概率已额外收缩。');
    } else {
      const directionalCount = (marketContext.upCount || 0) + (marketContext.downCount || 0);
      const breadth = directionalCount > 0 ? (marketContext.upCount || 0) / directionalCount : 0.5;
      const limitCount = (marketContext.limitUpCount || 0) + (marketContext.limitDownCount || 0);
      const limitBalance = limitCount > 0 ? (marketContext.limitUpCount || 0) / limitCount : 0.5;
      const directionSign = direction === 'UP' ? 1 : direction === 'DOWN' ? -1 : 0;
      const breadthAdjustment = clamp((breadth - 0.5) * 20 * directionSign, -6, 6);
      const limitAdjustment = clamp((limitBalance - 0.5) * 10 * directionSign, -2.5, 2.5);
      const indexAdjustment = clamp((marketContext.indexChange || 0) * 1.5 * directionSign, -3, 3);
      let regimeAdjustment = clamp(breadthAdjustment + limitAdjustment + indexAdjustment, -8, 6);
      const hasPositiveBacktest = Boolean(
        backtest && sampleSize >= 10 && backtest.expectancy > 0 && backtest.profitFactor >= 1,
      );

      // A friendly tape may confirm an edge, but cannot manufacture one without evidence.
      if (regimeAdjustment > 0 && !hasPositiveBacktest) regimeAdjustment *= 0.5;
      calibrated += regimeAdjustment;

      if (marketRegime === 'RISK_OFF' && direction === 'UP') {
        calibrated = Math.min(calibrated, 52);
        warnings.push('全市场宽度与涨跌停结构偏弱，看涨置信度已封顶。');
      } else if (marketRegime === 'RISK_ON' && direction === 'DOWN') {
        calibrated = Math.min(calibrated, 58);
        warnings.push('全市场风险偏好较强，看跌置信度已封顶。');
      } else if (marketRegime === 'DIVERGENT') {
        calibrated = 50 + (calibrated - 50) * 0.85;
        if (direction === 'UP' && (marketContext.indexChange || 0) > 0) {
          calibrated = Math.min(calibrated, 56);
        }
        warnings.push('指数与市场宽度背离，方向置信度已降级。');
      }
    }

    const phaseConfidence = Number.isFinite(marketContext.phaseConfidence)
      ? clamp(marketContext.phaseConfidence || 0, 0, 100)
      : undefined;
    if (phaseConfidence !== undefined && phaseConfidence < 60) {
      const phaseWeight = 0.5 + phaseConfidence / 200;
      calibrated = 50 + (calibrated - 50) * phaseWeight;
      warnings.push('市场阶段判定置信度偏低，概率已向中性收缩。');
    }
  }

  if (trapDetected) {
    calibrated = Math.min(calibrated, direction === 'DOWN' ? 75 : 40);
    if (direction !== 'DOWN') warnings.push('诱多检测与看涨预测冲突。');
  }

  if (dataQuality < 0.6) warnings.push('历史或实时数据不完整，概率已向50%收缩。');

  const dataReliability: PredictionReliability = dataQuality >= 0.8
    ? 'HIGH'
    : dataQuality >= 0.6
      ? 'MEDIUM'
      : 'LOW';
  const marketDataReliability: PredictionReliability = marketDataQuality >= 0.8
    ? 'HIGH'
    : marketDataQuality >= 0.6
      ? 'MEDIUM'
      : 'LOW';
  const evidenceReliability: PredictionReliability = sampleSize >= 30
    ? 'HIGH'
    : sampleSize >= 10
      ? 'MEDIUM'
      : 'LOW';
  const calibrationStatus: CalibrationStatus = sampleSize >= 30
    ? 'WALK_FORWARD_PROXY'
    : sampleSize >= 10
      ? 'LIMITED'
      : 'UNVALIDATED';
  const reliabilityRank: Record<PredictionReliability, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  let reliability: PredictionReliability = reliabilityRank[dataReliability] <= reliabilityRank[evidenceReliability]
    ? dataReliability
    : evidenceReliability;
  if (marketContext && reliabilityRank[marketDataReliability] < reliabilityRank[reliability]) {
    reliability = marketDataReliability;
  }

  if (evidenceReliability === 'LOW') {
    warnings.push('历史样本证据不足，不将数据完整度等同于模型有效性。');
  }

  if (marketContext && (marketDataQuality < 0.65 || (marketContext.phaseConfidence ?? 100) < 50)) {
    if (marketDataQuality < 0.4) reliability = 'LOW';
    else if (reliability === 'HIGH') reliability = 'MEDIUM';
  }

  const probability = Math.round(clamp(calibrated, 20, 85));
  const uncertainty = sampleSize > 0
    ? clamp(Math.round(196 * Math.sqrt(0.25 / (sampleSize + 20))), 6, 20)
    : 20;

  return {
    probability,
    rawProbability: Math.round(raw),
    dataQuality: Math.round(dataQuality * 100),
    reliability,
    dataReliability,
    marketDataReliability,
    marketDataStatus: marketContext?.dataStatus || (marketContext
      ? marketDataQuality >= 0.8
        ? 'FRESH'
        : marketDataQuality >= 0.55
          ? 'PARTIAL'
          : 'UNAVAILABLE'
      : undefined),
    evidenceReliability,
    calibrationStatus,
    sampleSize,
    marketRegime,
    marketDataQuality: Math.round(marketDataQuality * 100),
    confidenceLow: clamp(probability - uncertainty, 5, 95),
    confidenceHigh: clamp(probability + uncertainty, 5, 95),
    warnings,
  };
};
