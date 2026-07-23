export type MarketTimestamp = Date | string | number;

export interface ChinaTradingClock {
  timestampMs: number;
  tradeDate: string;
  hour: number;
  minute: number;
  timeValue: number;
  isTradingDay: boolean;
  isMarketOpen: boolean;
}

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

export const getChinaTradingClock = (
  input: MarketTimestamp = Date.now(),
): ChinaTradingClock => {
  const timestampMs = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(timestampMs)) throw new Error('Invalid market timestamp');

  const china = new Date(timestampMs + CHINA_OFFSET_MS);
  const hour = china.getUTCHours();
  const minute = china.getUTCMinutes();
  const weekday = china.getUTCDay();
  const timeValue = hour * 100 + minute;
  const isTradingDay = weekday >= 1 && weekday <= 5;
  const isMarketOpen = isTradingDay && (
    (timeValue >= 930 && timeValue <= 1130) ||
    (timeValue >= 1300 && timeValue <= 1500)
  );

  return {
    timestampMs,
    tradeDate: `${china.getUTCFullYear()}-${String(china.getUTCMonth() + 1).padStart(2, '0')}-${String(china.getUTCDate()).padStart(2, '0')}`,
    hour,
    minute,
    timeValue,
    isTradingDay,
    isMarketOpen,
  };
};

export const isChinaAuctionPhase = (timestamp: MarketTimestamp = Date.now()) => {
  const clock = getChinaTradingClock(timestamp);
  return clock.isTradingDay && clock.hour === 9 && clock.minute >= 15 && clock.minute <= 30;
};

export const isChinaAuctionRelevant = (timestamp: MarketTimestamp = Date.now()) => {
  const clock = getChinaTradingClock(timestamp);
  return clock.isTradingDay && (
    (clock.hour === 9 && clock.minute >= 15) ||
    (clock.hour === 10 && clock.minute === 0)
  );
};
