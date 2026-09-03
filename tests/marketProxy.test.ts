import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('browser market requests use the same-origin worker proxy', async () => {
  const [marketData, worker, marketApi, viteConfig] = await Promise.all([
    readSource('../src/app/services/marketData.ts'),
    readSource('../worker/index.ts'),
    readSource('../worker/marketApi.ts'),
    readSource('../vite.config.ts'),
  ]);

  assert.match(marketData, /['"`]\/api\/market\//);
  assert.match(marketData, /bars=\$\{requestedBars\}/);
  assert.match(worker, /handleMarketApi/);
  assert.match(marketApi, /value == null \|\| value\.trim\(\) === ''/);
  assert.match(worker, /import \{ handleMarketApi \}/);
  assert.match(viteConfig, /run_worker_first:\s*true/);
});

test('the first quote wave is committed before slower enrichment finishes', async () => {
  const store = await readSource('../src/app/context/Store.tsx');

  assert.match(
    store,
    /stocksRef\.current = nextStocks;\s*setStocks\(nextStocks\);/,
  );
});
