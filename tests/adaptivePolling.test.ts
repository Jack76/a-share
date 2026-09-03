import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('live scanners stop outside market hours and skip hidden tabs', async () => {
  const [poolSource, storeSource, detailSource] = await Promise.all([
    readSource('../src/app/components/pages/DragonPool.tsx'),
    readSource('../src/app/context/Store.tsx'),
    readSource('../src/app/components/pages/StockDiagnosisDialog.tsx'),
  ]);

  assert.match(poolSource, /if \(!isMarketOpen\) return;/);
  assert.match(poolSource, /if \(document\.hidden\) return;/);
  assert.match(poolSource, /changeSinceAnalysis < 0\.03 && !heartbeatDue/);
  assert.match(storeSource, /refreshWhenVisible/);
  assert.match(storeSource, /if \(!document\.hidden\) void refreshData\(\)/);
  assert.match(detailSource, /if \(isMounted && isMarketOpen\)/);
});

test('history hydration drains pending batches without a permanent polling loop', async () => {
  const storeSource = await readSource('../src/app/context/Store.tsx');

  assert.match(storeSource, /inspectLocalHistoryBatch\(codes\)/);
  assert.match(storeSource, /scheduleNextBatch\(\)/);
  assert.match(storeSource, /historyUniverseKey/);
  assert.match(storeSource, /!hasHistory && retryAt <= now/);
  assert.match(storeSource, /STOCK_HISTORY_BACKGROUND_BARS/);
  assert.doesNotMatch(storeSource, /setInterval\(fetchMissingHistory/);
});

test('fund page reuses its last session view while refreshing in the background', async () => {
  const fundSource = await readSource('../src/app/components/pages/FundRadar.tsx');

  assert.match(fundSource, /fundPageSessionCache/);
  assert.match(fundSource, /fetchFundHistoryBatch\(otcCodes, \{ forceRefresh \}\)/);
  assert.match(fundSource, /fetchStockHistoryBatch\(etfCodes, \{ forceRefresh \}\)/);
});
