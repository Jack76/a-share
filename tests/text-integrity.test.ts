import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const sourceRoots = ['src', 'public', 'index.html'];
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.jsx', '.md', '.ts', '.tsx']);
const brokenTextPattern = /\uFFFD|锟斤拷|烫烫烫/;

const collectTextFiles = (path: string): string[] => {
  const stat = statSync(path);
  if (stat.isFile()) {
    const extension = path.slice(path.lastIndexOf('.'));
    return textExtensions.has(extension) ? [path] : [];
  }

  return readdirSync(path).flatMap(entry => collectTextFiles(join(path, entry)));
};

test('website source contains no replacement characters or common mojibake markers', () => {
  const offenders = sourceRoots
    .flatMap(collectTextFiles)
    .filter(file => brokenTextPattern.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});
