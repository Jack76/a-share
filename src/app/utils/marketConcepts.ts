import type { Stock, Theme } from '../types';

const PLACEHOLDER_CONCEPTS = new Set([
  '自动发现',
  '未知',
  '其他',
  '暂无',
  'unknown',
  'auto-discovered',
]);

export const normalizeMarketConcept = (concept?: string): string | undefined => {
  const normalized = concept?.trim();
  if (!normalized || PLACEHOLDER_CONCEPTS.has(normalized.toLowerCase())) return undefined;
  return normalized;
};

export interface ConceptConsensus {
  consensus: number;
  knownCount: number;
  sampleSize: number;
  leadingConcept?: string;
}

/**
 * Unknown concepts remain in the denominator so missing metadata cannot
 * masquerade as sector consensus.
 */
export const calculateTopConceptConsensus = (
  stocks: Stock[],
  sampleLimit = 10,
): ConceptConsensus => {
  const sample = [...stocks]
    .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
    .slice(0, sampleLimit);
  const conceptCounts = new Map<string, number>();

  for (const stock of sample) {
    const concept = normalizeMarketConcept(stock.concept);
    if (!concept) continue;
    conceptCounts.set(concept, (conceptCounts.get(concept) || 0) + 1);
  }

  const leading = [...conceptCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const sampleSize = sample.length;
  return {
    consensus: sampleSize > 0 ? (leading?.[1] || 0) / sampleSize : 0,
    knownCount: [...conceptCounts.values()].reduce((sum, count) => sum + count, 0),
    sampleSize,
    leadingConcept: leading?.[0],
  };
};

export const calculateThemeBreadthConsensus = (themes: Theme[]): number => {
  const weights = themes
    .filter(theme => theme.type !== 'Decline')
    .map(theme => ({
      name: normalizeMarketConcept(theme.name),
      weight: Math.max(0, theme.stockCount || 0),
    }))
    .filter((theme): theme is { name: string; weight: number } => Boolean(theme.name) && theme.weight > 0);
  const totalWeight = weights.reduce((sum, theme) => sum + theme.weight, 0);
  if (totalWeight <= 0) return 0;
  return Math.max(...weights.map(theme => theme.weight)) / totalWeight;
};
