export type MarginTradingSnapshot = {
    financingBalance: number;
    financingBuy: number;
    financingRepay: number;
    financingNetBuy: number;
    shortBalance: number;
    shortSellVolume: number;
    shortRepayVolume: number;
    shortNetSell: number;
    source: "eastmoney-margin";
    reportingLag: "T-1";
    asOf: string;
    floatMarketCapYuan?: number;
    financingBalanceRatio?: number;
};

const numeric = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseTencentTurnoverYuan = (data: string[]): number => {
    const exactTurnoverYuan = numeric(data[35]?.split('/')?.[2]);
    if (exactTurnoverYuan !== undefined && exactTurnoverYuan > 0) return exactTurnoverYuan;

    // Tencent field 37 is expressed in 10k yuan.
    const turnoverWan = numeric(data[37]);
    return turnoverWan !== undefined && turnoverWan > 0 ? turnoverWan * 10_000 : 0;
};

export const parseMarginTradingRow = (row: Record<string, unknown>): MarginTradingSnapshot | null => {
    const financingBalance = numeric(row.RZYE);
    const financingBuy = numeric(row.RZMRE);
    const financingRepay = numeric(row.RZCHE);
    const financingNetBuy = numeric(row.RZJME);
    const shortBalance = numeric(row.RQYE);
    const shortSellShares = numeric(row.RQMCL);
    const shortRepayShares = numeric(row.RQCHL);
    const shortNetSellShares = numeric(row.RQJMG);
    const close = numeric(row.SPJ);
    const asOf = String(row.DATE || '').slice(0, 10);
    if (
        financingBalance === undefined || financingBuy === undefined ||
        financingRepay === undefined || financingNetBuy === undefined ||
        shortBalance === undefined || shortSellShares === undefined ||
        shortRepayShares === undefined || shortNetSellShares === undefined ||
        close === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)
    ) return null;

    const floatMarketCapYuan = numeric(row.SZ);
    const reportedBalancePercent = numeric(row.RZYEZB);
    return {
        financingBalance: financingBalance / 10_000,
        financingBuy: financingBuy / 10_000,
        financingRepay: financingRepay / 10_000,
        financingNetBuy: financingNetBuy / 10_000,
        shortBalance: shortBalance / 10_000,
        shortSellVolume: shortSellShares / 100,
        shortRepayVolume: shortRepayShares / 100,
        shortNetSell: (shortNetSellShares * close) / 10_000,
        source: "eastmoney-margin",
        reportingLag: "T-1",
        asOf,
        floatMarketCapYuan,
        financingBalanceRatio: reportedBalancePercent !== undefined
            ? reportedBalancePercent / 100
            : floatMarketCapYuan && floatMarketCapYuan > 0
                ? financingBalance / floatMarketCapYuan
                : undefined,
    };
};
