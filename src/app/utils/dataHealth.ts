export type MarketRefreshStatus = 'idle' | 'refreshing' | 'success' | 'error';
export type MarketDataStatus = 'FRESH' | 'PARTIAL' | 'STALE' | 'UNAVAILABLE';

export interface MarketHealth {
  label: string;
  detail: string;
  tone: 'green' | 'amber' | 'red' | 'blue';
  state: 'ready' | 'partial' | 'unavailable' | 'refreshing';
}

export const deriveMarketHealth = ({
  refreshStatus,
  indexCount,
  breadthStatus,
  coverage = 0,
}: {
  refreshStatus: MarketRefreshStatus;
  indexCount: number;
  breadthStatus?: MarketDataStatus;
  coverage?: number;
}): MarketHealth => {
  if (refreshStatus === 'refreshing') {
    return {
      label: '行情更新中',
      detail: '正在更新指数、市场宽度与题材数据',
      tone: 'blue',
      state: 'refreshing',
    };
  }

  if (indexCount === 0) {
    return {
      label: '行情不可用',
      detail: refreshStatus === 'error' ? '本次更新失败，可手动重试' : '尚未取得指数和全市场数据',
      tone: 'red',
      state: 'unavailable',
    };
  }

  if (
    refreshStatus === 'error' ||
    breadthStatus === 'UNAVAILABLE' ||
    breadthStatus === 'PARTIAL' ||
    breadthStatus === 'STALE' ||
    coverage < 0.85
  ) {
    return {
      label: '行情部分可用',
      detail: breadthStatus === 'UNAVAILABLE'
        ? '指数可用，全市场宽度暂不可用'
        : breadthStatus === 'STALE'
          ? '指数可用，全市场宽度数据已过期'
          : '指数可用，全市场宽度覆盖不足',
      tone: 'amber',
      state: 'partial',
    };
  }

  return {
    label: '行情已更新',
    detail: '指数与全市场宽度数据均可用',
    tone: 'green',
    state: 'ready',
  };
};
