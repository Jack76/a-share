export type MarketTimestamp = Date | string | number;

export interface ChinaTradingClock {
  timestampMs: number;
  tradeDate: string;
  hour: number;
  minute: number;
  timeValue: number;
  isTradingDay: boolean;
  isHoliday: boolean;
  isMarketOpen: boolean;
}

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

// 上海证券交易所 2026 年休市安排：
// https://www.sse.com.cn/disclosure/dealinstruc/closed/c/c_20251222_10802510.shtml
// 周末由 weekday 判断，这里只列工作日休市日期。
const CHINA_MARKET_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-02',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23',
  '2026-04-06',
  '2026-05-01', '2026-05-04', '2026-05-05',
  '2026-06-19',
  '2026-09-25',
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
]);

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
  const tradeDate = `${china.getUTCFullYear()}-${String(china.getUTCMonth() + 1).padStart(2, '0')}-${String(china.getUTCDate()).padStart(2, '0')}`;
  const isHoliday = CHINA_MARKET_HOLIDAYS.has(tradeDate);
  const isTradingDay = weekday >= 1 && weekday <= 5 && !isHoliday;
  const isMarketOpen = isTradingDay && (
    (timeValue >= 930 && timeValue <= 1130) ||
    (timeValue >= 1300 && timeValue <= 1500)
  );

  return {
    timestampMs,
    tradeDate,
    hour,
    minute,
    timeValue,
    isTradingDay,
    isHoliday,
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
