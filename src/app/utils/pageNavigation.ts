export const PAGE_IDS = [
  'dashboard',
  'themes',
  'pool',
  'funds',
  'trading',
  'review',
] as const;

export type PageId = (typeof PAGE_IDS)[number];

const DEFAULT_PAGE: PageId = 'dashboard';
const PAGE_PARAM = 'page';

export const isPageId = (value: string | null): value is PageId =>
  value !== null && PAGE_IDS.some(pageId => pageId === value);

export const getPageFromSearch = (search: string): PageId => {
  const page = new URLSearchParams(search).get(PAGE_PARAM);
  return isPageId(page) ? page : DEFAULT_PAGE;
};

export const getPageUrl = (href: string, page: PageId): string => {
  const url = new URL(href);

  if (page === DEFAULT_PAGE) {
    url.searchParams.delete(PAGE_PARAM);
  } else {
    url.searchParams.set(PAGE_PARAM, page);
  }

  // Page navigation should not retain the skip-link target from the old page.
  url.hash = '';

  return `${url.pathname}${url.search}`;
};
