import { getMany, setMany } from 'idb-keyval';

interface CachedHistory {
    data: any[];
    timestamp: number;
}

const PREFIX = 'hist_';
const FUND_PREFIX = 'fund_';
const MARKET_KEY = 'market_snapshot';

// V66.5: History only changes once per trading day (close ~15:00 CN)
// Use smart TTL: 20 hours covers overnight + next morning session
const TTL = 20 * 60 * 60 * 1000; 
// 4 Hours TTL for Fund Info (Semi-static, realtime estimates change intraday)
const FUND_TTL = 4 * 60 * 60 * 1000;
// v7.9: Reduce Market Snapshot TTL to 10s for more responsive updates
const MARKET_TTL = 10 * 1000;

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

export const setLocalHistoryBatch = async (map: Record<string, any[]>) => {
    try {
        const entries: [IDBValidKey, any][] = Object.entries(map).map(([code, data]) => [
            PREFIX + code,
            { data, timestamp: Date.now() }
        ]);
        await setMany(entries);
    } catch (e) {
        console.warn('IndexedDB Set Error', e);
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
            if (val && val.data && (now - val.timestamp < FUND_TTL)) {
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
        if (snapshot && snapshot.data && (now - snapshot.timestamp < MARKET_TTL)) {
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