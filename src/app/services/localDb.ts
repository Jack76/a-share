import { getMany, setMany } from 'idb-keyval';

interface CachedHistory {
    data: any[];
    timestamp: number;
    requestedBars?: number;
    upgradeAttemptedAt?: number;
}

export interface LocalHistoryEntry {
    data: any[];
    cachedAt: number;
    requestedBars?: number;
    upgradeAttemptedAt?: number;
}

interface HistoryWriteOptions {
    requestedBars?: number;
    upgradeAttemptedAt?: number;
}

const PREFIX = 'hist_';
const FUND_HISTORY_PREFIX = 'fund_hist_';
const FUND_PREFIX = 'fund_';
const MARKET_KEY = 'market_snapshot';

// V66.5: History only changes once per trading day (close ~15:00 CN)
// Use smart TTL: 20 hours covers overnight + next morning session
const TTL = 20 * 60 * 60 * 1000; 
// Intraday fund estimates are decision inputs; keep the browser cache short.
export const FUND_SNAPSHOT_TTL_MS = 2 * 60 * 1000;
// Intraday snapshots remain short-lived, while the verified closing snapshot
// can be reused after the bell. This avoids repeatedly cold-scanning 5,800+
// symbols and losing direct large-order fields on every closed-market reload.
const MARKET_TTL_LIVE = 10 * 1000;
const MARKET_TTL_CLOSED = 12 * 60 * 60 * 1000;

const isChinaMarketSession = (date = new Date()) => {
    const china = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const weekday = china.getUTCDay();
    const minutes = china.getUTCHours() * 60 + china.getUTCMinutes();
    return weekday >= 1 && weekday <= 5 &&
        ((minutes >= 9 * 60 + 15 && minutes <= 11 * 60 + 35) ||
         (minutes >= 12 * 60 + 55 && minutes <= 15 * 60 + 5));
};

export const getLocalHistoryBatch = async (codes: string[]) => {
    try {
        const keys = codes.map(c => PREFIX + c);
        const values = await getMany(keys);
        
        const results: Record<string, any[]> = {};
        const missing: string[] = [];
        const now = Date.now();

        codes.forEach((code, index) => {
            const val = values[index] as CachedHistory | undefined;
            if (val && val.data && Array.isArray(val.data) && (now - val.timestamp < TTL)) {
                results[code] = val.data;
            } else {
                missing.push(code);
            }
        });

        return { results, missing };
    } catch (e) {
        console.warn('IndexedDB Get Error', e);
        return { results: {}, missing: codes };
    }
};

// Returns every usable cached series, including expired entries. Callers can
// paint these immediately and then decide whether a background refresh is due.
export const inspectLocalHistoryBatch = async (codes: string[]) => {
    try {
        const keys = codes.map(c => PREFIX + c);
        const values = await getMany(keys);
        const entries: Record<string, LocalHistoryEntry> = {};
        const missing: string[] = [];

        codes.forEach((code, index) => {
            const value = values[index] as CachedHistory | undefined;
            if (value?.data && Array.isArray(value.data) && value.data.length > 0) {
                entries[code] = {
                    data: value.data,
                    cachedAt: value.timestamp,
                    requestedBars: value.requestedBars,
                    upgradeAttemptedAt: value.upgradeAttemptedAt,
                };
            } else {
                missing.push(code);
            }
        });

        return { entries, missing };
    } catch (e) {
        console.warn('IndexedDB Inspect Error', e);
        return { entries: {}, missing: codes } as {
            entries: Record<string, LocalHistoryEntry>;
            missing: string[];
        };
    }
};

export const setLocalHistoryBatch = async (
    map: Record<string, any[]>,
    options: HistoryWriteOptions = {},
) => {
    try {
        const entries: [IDBValidKey, any][] = Object.entries(map).map(([code, data]) => [
            PREFIX + code,
            {
                data,
                timestamp: Date.now(),
                requestedBars: options.requestedBars,
                upgradeAttemptedAt: options.upgradeAttemptedAt,
            }
        ]);
        await setMany(entries);
    } catch (e) {
        console.warn('IndexedDB Set Error', e);
    }
};

export const markLocalHistoryUpgradeAttempt = async (
    codes: string[],
    attemptedAt = Date.now(),
) => {
    if (codes.length === 0) return;
    try {
        const keys = codes.map(code => PREFIX + code);
        const values = await getMany(keys);
        const updates: [IDBValidKey, CachedHistory][] = [];

        codes.forEach((code, index) => {
            const value = values[index] as CachedHistory | undefined;
            if (!value?.data || !Array.isArray(value.data)) return;
            updates.push([
                PREFIX + code,
                { ...value, upgradeAttemptedAt: attemptedAt },
            ]);
        });

        if (updates.length > 0) await setMany(updates);
    } catch (e) {
        console.warn('IndexedDB Upgrade Marker Error', e);
    }
};

export const inspectLocalFundHistoryBatch = async (codes: string[]) => {
    try {
        const keys = codes.map(code => FUND_HISTORY_PREFIX + code);
        const values = await getMany(keys);
        const entries: Record<string, LocalHistoryEntry> = {};
        const missing: string[] = [];

        codes.forEach((code, index) => {
            const value = values[index] as CachedHistory | undefined;
            if (value?.data && Array.isArray(value.data) && value.data.length > 0) {
                entries[code] = {
                    data: value.data,
                    cachedAt: value.timestamp,
                    requestedBars: value.requestedBars,
                    upgradeAttemptedAt: value.upgradeAttemptedAt,
                };
            } else {
                missing.push(code);
            }
        });

        return { entries, missing };
    } catch (e) {
        console.warn('IndexedDB Fund History Inspect Error', e);
        return { entries: {}, missing: codes } as {
            entries: Record<string, LocalHistoryEntry>;
            missing: string[];
        };
    }
};

export const setLocalFundHistoryBatch = async (
    map: Record<string, any[]>,
    options: HistoryWriteOptions = {},
) => {
    try {
        const entries: [IDBValidKey, CachedHistory][] = Object.entries(map).map(([code, data]) => [
            FUND_HISTORY_PREFIX + code,
            {
                data,
                timestamp: Date.now(),
                requestedBars: options.requestedBars,
                upgradeAttemptedAt: options.upgradeAttemptedAt,
            },
        ]);
        await setMany(entries);
    } catch (e) {
        console.warn('IndexedDB Fund History Set Error', e);
    }
};

export const markLocalFundHistoryUpgradeAttempt = async (
    codes: string[],
    attemptedAt = Date.now(),
) => {
    if (codes.length === 0) return;
    try {
        const keys = codes.map(code => FUND_HISTORY_PREFIX + code);
        const values = await getMany(keys);
        const updates: [IDBValidKey, CachedHistory][] = [];

        codes.forEach((code, index) => {
            const value = values[index] as CachedHistory | undefined;
            if (!value?.data || !Array.isArray(value.data)) return;
            updates.push([
                FUND_HISTORY_PREFIX + code,
                { ...value, upgradeAttemptedAt: attemptedAt },
            ]);
        });

        if (updates.length > 0) await setMany(updates);
    } catch (e) {
        console.warn('IndexedDB Fund History Upgrade Marker Error', e);
    }
};

export const getLocalFundsBatch = async (codes: string[]) => {
    try {
        const keys = codes.map(c => FUND_PREFIX + c);
        const values = await getMany(keys);
        
        const results: Record<string, any> = {};
        const missing: string[] = [];
        const now = Date.now();

        codes.forEach((code, index) => {
            const val = values[index] as CachedHistory | undefined;
            if (val && val.data && (now - val.timestamp < FUND_SNAPSHOT_TTL_MS)) {
                results[code] = val.data;
            } else {
                missing.push(code);
            }
        });

        return { results, missing };
    } catch (e) {
        console.warn('IndexedDB Fund Get Error', e);
        return { results: {}, missing: codes };
    }
};

export const inspectLocalFundsBatch = async (codes: string[]) => {
    try {
        const keys = codes.map(code => FUND_PREFIX + code);
        const values = await getMany(keys);
        const entries: Record<string, { data: any; cachedAt: number }> = {};
        const missing: string[] = [];

        codes.forEach((code, index) => {
            const value = values[index] as CachedHistory | undefined;
            if (value?.data) {
                entries[code] = { data: value.data, cachedAt: value.timestamp };
            } else {
                missing.push(code);
            }
        });

        return { entries, missing };
    } catch (e) {
        console.warn('IndexedDB Fund Inspect Error', e);
        return { entries: {}, missing: codes } as {
            entries: Record<string, { data: any; cachedAt: number }>;
            missing: string[];
        };
    }
};

export const setLocalFundsBatch = async (map: Record<string, any>) => {
    try {
        const entries: [IDBValidKey, any][] = Object.entries(map).map(([code, data]) => [
            FUND_PREFIX + code,
            { data, timestamp: Date.now() }
        ]);
        await setMany(entries);
    } catch (e) {
        console.warn('IndexedDB Fund Set Error', e);
    }
};

export const getLocalMarketSnapshot = async () => {
    try {
        const val = await getMany([MARKET_KEY]);
        const snapshot = val[0] as { data: any, timestamp: number } | undefined;
        const now = Date.now();
        const maxAgeMs = isChinaMarketSession() ? MARKET_TTL_LIVE : MARKET_TTL_CLOSED;
        if (snapshot && snapshot.data && (now - snapshot.timestamp < maxAgeMs)) {
            return snapshot.data;
        }
        return null;
    } catch (e) {
        return null;
    }
};

export const setLocalMarketSnapshot = async (data: any) => {
    try {
        await setMany([[MARKET_KEY, { data, timestamp: Date.now() }]]);
    } catch (e) {}
};
