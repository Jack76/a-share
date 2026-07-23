export interface FullMarketQuote {
  changePercent?: number;
  isLimitUp?: boolean;
  isLimitDown?: boolean;
}

export const calculateFullMarketEntropy = (quotes: FullMarketQuote[]): number => {
  const changes = quotes
    .map(quote => quote.changePercent)
    .filter((change): change is number => Number.isFinite(change));
  if (changes.length < 100) return 50;

  const boundaries = [-9.5, -5, -2, 0, 2, 5, 9.5];
  const bins = new Array(boundaries.length + 1).fill(0);
  for (const change of changes) {
    const index = boundaries.findIndex(boundary => change < boundary);
    bins[index === -1 ? bins.length - 1 : index]++;
  }
  const shannon = bins.reduce((sum, count) => {
    if (count === 0) return sum;
    const probability = count / changes.length;
    return sum - probability * Math.log(probability);
  }, 0);
  const normalizedShannon = shannon / Math.log(bins.length);
  const mean = changes.reduce((sum, change) => sum + change, 0) / changes.length;
  const variance = changes.reduce((sum, change) => sum + (change - mean) ** 2, 0) / changes.length;
  const dispersion = Math.min(25, Math.sqrt(variance) * 6);
  const limitUps = quotes.filter(quote => quote.isLimitUp).length;
  const limitDowns = quotes.filter(quote => quote.isLimitDown || (quote.changePercent || 0) <= -9.5).length;
  const polarization = Math.min(limitUps, limitDowns) / Math.max(1, Math.max(limitUps, limitDowns));

  return Math.round(Math.min(100, Math.max(0,
    normalizedShannon * 65 + dispersion + polarization * 10
  )));
};
