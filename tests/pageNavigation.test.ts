import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPageFromSearch,
  getPageUrl,
  isPageId,
} from '../src/app/utils/pageNavigation.ts';

test('从 URL 查询参数恢复当前页面', () => {
  assert.equal(getPageFromSearch('?page=pool'), 'pool');
  assert.equal(getPageFromSearch('?source=shared&page=funds'), 'funds');
});

test('缺少或无效页面参数时回到默认首页', () => {
  assert.equal(getPageFromSearch(''), 'dashboard');
  assert.equal(getPageFromSearch('?page=unknown'), 'dashboard');
  assert.equal(isPageId('unknown'), false);
});

test('页面切换保留其他查询参数并生成可刷新的 URL', () => {
  assert.equal(
    getPageUrl('https://example.com/?source=shared#main-content', 'review'),
    '/?source=shared&page=review',
  );
});

test('返回首页时移除冗余页面参数', () => {
  assert.equal(
    getPageUrl('https://example.com/?source=shared&page=pool', 'dashboard'),
    '/?source=shared',
  );
});
