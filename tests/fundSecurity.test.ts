import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('personal fund state never crosses the public client boundary', async () => {
  const source = await readSource('src/app/components/pages/FundRadar.tsx');

  assert.doesNotMatch(source, /\/user\/funds/);
  assert.doesNotMatch(source, /\/user\/fund-holdings/);
  assert.doesNotMatch(source, /publicAnonKey/);
});

test('legacy shared fund-state routes fail closed without touching shared KV', async () => {
  const source = await readSource('supabase/functions/server/index.tsx');

  assert.doesNotMatch(source, /trading:customFunds/);
  assert.doesNotMatch(source, /trading:fundHoldings/);
  assert.match(source, /retiredPersonalFundState/);
  assert.match(source, /,\s*410\s*\)/);
});
