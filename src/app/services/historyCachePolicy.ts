export const STOCK_HISTORY_REQUESTED_BARS = 640;
export const STOCK_HISTORY_PREFERRED_BARS = 600;
export const STOCK_HISTORY_CACHE_TTL_MS = 20 * 60 * 60 * 1000;
export const STOCK_HISTORY_UPGRADE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

export interface StockHistoryCacheMetadata {
  cachedAt: number;
  requestedBars?: number;
  upgradeAttemptedAt?: number;
}

export interface StockHistoryCacheAssessment {
  canRender: boolean;
  isFresh: boolean;
  shouldRefresh: boolean;
  shouldUpgrade: boolean;
}

const getHistoryDay = (point: any): string => point?.day || point?.date || '';

export const assessStockHistoryCache = (
  history: any[] | undefined,
  metadata: StockHistoryCacheMetadata | undefined,
  now = Date.now(),
): StockHistoryCacheAssessment => {
  const canRender = Array.isArray(history) && history.length > 0;
  const cachedAt = metadata?.cachedAt || 0;
  const latestDay = canRender ? getHistoryDay(history![history!.length - 1]) : '';
  const freshnessThreshold = new Date(now - 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const isFresh = canRender &&
    now - cachedAt < STOCK_HISTORY_CACHE_TTL_MS &&
    latestDay >= freshnessThreshold;

  // A short history can be legitimate for a newly listed stock. Once the
  // backend has already been asked for its full 640-bar window, its shorter
  // response is considered complete instead of being upgraded on every load.
  const fullWindowAlreadyRequested =
    (metadata?.requestedBars || 0) >= STOCK_HISTORY_REQUESTED_BARS;
  const upgradeRetryDue =
    now - (metadata?.upgradeAttemptedAt || 0) >= STOCK_HISTORY_UPGRADE_RETRY_MS;
  const shouldUpgrade = canRender &&
    history!.length < STOCK_HISTORY_PREFERRED_BARS &&
    !fullWindowAlreadyRequested &&
    upgradeRetryDue;

  return {
    canRender,
    isFresh,
    shouldRefresh: !isFresh || shouldUpgrade,
    shouldUpgrade,
  };
};
