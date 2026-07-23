export interface LimitRuleInput {
  code: string;
  name: string;
  currentPrice: number;
  previousClose: number;
  changePercent: number;
  sourceLimitUpPrice?: number;
  sourceLimitDownPrice?: number;
}

export interface LimitRuleResult {
  isLimitUp: boolean;
  isLimitDown: boolean;
  limitUpPrice: number;
  limitDownPrice: number;
  limitPercent: number;
  source: 'UPSTREAM' | 'DERIVED';
}

const roundToTick = (price: number) => Math.round(price * 100) / 100;

const normalizeCode = (code: string) => code.replace(/^(sh|sz|bj)/i, '');

const isGrowthBoard = (code: string) =>
  code.startsWith('300') || code.startsWith('301') ||
  code.startsWith('688') || code.startsWith('689');

const isBeijingBoard = (code: string) =>
  code.startsWith('4') || code.startsWith('8') || code.startsWith('92');

export const resolveLimitPercent = (rawCode: string, name: string) => {
  const code = normalizeCode(rawCode);
  if (isBeijingBoard(code)) return 0.3;
  if (isGrowthBoard(code)) return 0.2;
  if (name.toUpperCase().includes('ST')) return 0.05;
  return 0.1;
};

const isAtPrice = (currentPrice: number, targetPrice: number) => {
  if (!(currentPrice > 0) || !(targetPrice > 0)) return false;
  const tolerance = Math.max(0.011, targetPrice * 0.0005);
  return Math.abs(currentPrice - targetPrice) <= tolerance;
};

export const calculateLimitState = ({
  code,
  name,
  currentPrice,
  previousClose,
  changePercent,
  sourceLimitUpPrice,
  sourceLimitDownPrice,
}: LimitRuleInput): LimitRuleResult => {
  const limitPercent = resolveLimitPercent(code, name);
  const hasUpstreamLimits = Number.isFinite(sourceLimitUpPrice) && (sourceLimitUpPrice || 0) > 0 &&
    Number.isFinite(sourceLimitDownPrice) && (sourceLimitDownPrice || 0) > 0;
  const limitUpPrice = hasUpstreamLimits
    ? sourceLimitUpPrice as number
    : previousClose > 0 ? roundToTick(previousClose * (1 + limitPercent)) : 0;
  const limitDownPrice = hasUpstreamLimits
    ? sourceLimitDownPrice as number
    : previousClose > 0 ? roundToTick(previousClose * (1 - limitPercent)) : 0;

  // Without official limits, moves outside the normal band are usually a
  // no-limit listing/resumption session. Do not manufacture a limit signal.
  const likelyNoLimitSession = !hasUpstreamLimits &&
    Math.abs(changePercent) > limitPercent * 100 + 1;
  const hasNoLimitListingPrefix = !hasUpstreamLimits && /^[NC]/i.test(name.trim());

  return {
    isLimitUp: !likelyNoLimitSession && !hasNoLimitListingPrefix && isAtPrice(currentPrice, limitUpPrice),
    isLimitDown: !likelyNoLimitSession && !hasNoLimitListingPrefix && isAtPrice(currentPrice, limitDownPrice),
    limitUpPrice,
    limitDownPrice,
    limitPercent: limitPercent * 100,
    source: hasUpstreamLimits ? 'UPSTREAM' : 'DERIVED',
  };
};
