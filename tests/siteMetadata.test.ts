import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

test('site declares favicon and Apple touch icon assets', async () => {
  const root = new URL('../', import.meta.url);
  const html = await readFile(new URL('index.html', root), 'utf8');

  assert.match(html, /href="\/favicon\.svg" type="image\/svg\+xml"/);
  assert.match(html, /href="\/favicon-32x32\.png"[^>]+sizes="32x32"/);
  assert.match(html, /href="\/apple-touch-icon\.png"[^>]+sizes="180x180"/);

  await Promise.all([
    stat(new URL('public/favicon.svg', root)),
    stat(new URL('public/favicon-32x32.png', root)),
    stat(new URL('public/apple-touch-icon.png', root)),
  ]);
});
