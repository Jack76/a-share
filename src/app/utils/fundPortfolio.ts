export interface FundPortfolioTransaction {
  type: 'buy' | 'sell';
  pricePerUnit: number;
  shares: number;
  date: string;
}

export interface FundPortfolioHolding {
  code: string;
  costPerUnit: number;
  shares: number;
  buyDate: string;
  transactions?: FundPortfolioTransaction[];
}

export interface FundNavPoint {
  date: string;
  nav: number;
}

export interface PortfolioCurvePoint {
  date: string;
  invested: number;
  withdrawn: number;
  marketValue: number;
  pnl: number;
  returnPercent: number;
  dailyChangePercent: number;
}

const validNavSeries = (series: FundNavPoint[]) =>
  series
    .filter(point => point.date && Number.isFinite(point.nav) && point.nav > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

const transactionsForHolding = (holding: FundPortfolioHolding): FundPortfolioTransaction[] =>
  holding.transactions?.length
    ? [...holding.transactions].sort((a, b) => a.date.localeCompare(b.date))
    : [{
      type: 'buy',
      pricePerUnit: holding.costPerUnit,
      shares: holding.shares,
      date: holding.buyDate,
    }];

export const buildActualPortfolioCurve = (
  holdings: FundPortfolioHolding[],
  navByCode: Map<string, FundNavPoint[]>,
): PortfolioCurvePoint[] => {
  const normalizedSeries = new Map<string, FundNavPoint[]>();
  const dates = new Set<string>();
  holdings.forEach(holding => {
    const series = validNavSeries(navByCode.get(holding.code) || []);
    if (series.length === 0) return;
    normalizedSeries.set(holding.code, series);
    series.forEach(point => dates.add(point.date));
  });
  const orderedDates = [...dates].sort();
  if (orderedDates.length === 0) return [];

  const pointers = new Map<string, number>();
  const latestNav = new Map<string, number>();
  const curve: PortfolioCurvePoint[] = [];
  let previousMarketValue: number | null = null;

  orderedDates.forEach(date => {
    normalizedSeries.forEach((series, code) => {
      let pointer = pointers.get(code) || 0;
      while (pointer < series.length && series[pointer].date <= date) {
        latestNav.set(code, series[pointer].nav);
        pointer++;
      }
      pointers.set(code, pointer);
    });

    let invested = 0;
    let withdrawn = 0;
    let marketValue = 0;
    let purchasesToday = 0;
    let salesToday = 0;

    holdings.forEach(holding => {
      let shares = 0;
      transactionsForHolding(holding).forEach(transaction => {
        if (transaction.date > date) return;
        const transactionShares = Number.isFinite(transaction.shares)
          ? Math.max(0, transaction.shares)
          : 0;
        const price = Number.isFinite(transaction.pricePerUnit)
          ? Math.max(0, transaction.pricePerUnit)
          : 0;
        if (transaction.type === 'buy') {
          shares += transactionShares;
          const purchase = price * transactionShares;
          invested += purchase;
          if (transaction.date === date) purchasesToday += purchase;
        } else {
          const sharesSold = Math.min(shares, transactionShares);
          shares -= sharesSold;
          const sale = price * sharesSold;
          withdrawn += sale;
          if (transaction.date === date) salesToday += sale;
        }
      });
      const nav = latestNav.get(holding.code);
      if (nav !== undefined) marketValue += shares * nav;
    });

    if (invested <= 0) return;
    const pnl = marketValue + withdrawn - invested;
    const returnPercent = (pnl / invested) * 100;
    const dailyCapital = previousMarketValue === null ? purchasesToday : previousMarketValue + purchasesToday;
    const dailyChangePercent = dailyCapital > 0
      ? ((marketValue + salesToday - dailyCapital) / dailyCapital) * 100
      : 0;
    curve.push({
      date,
      invested,
      withdrawn,
      marketValue,
      pnl,
      returnPercent,
      dailyChangePercent,
    });
    previousMarketValue = marketValue;
  });

  return curve;
};

export interface ComparableFundSeries {
  code: string;
  history: FundNavPoint[];
}

export const alignFundComparisonSeries = (
  funds: ComparableFundSeries[],
): Array<Record<string, string | number>> => {
  const validFunds = funds
    .map(fund => ({ ...fund, history: validNavSeries(fund.history) }))
    .filter(fund => fund.history.length > 0);
  if (validFunds.length === 0) return [];

  const commonStart = validFunds
    .map(fund => fund.history[0].date)
    .sort()
    .at(-1) as string;
  const dates = [...new Set(validFunds.flatMap(fund =>
    fund.history.filter(point => point.date >= commonStart).map(point => point.date)
  ))].sort();
  const pointers = new Map<string, number>();
  const latest = new Map<string, number>();
  const bases = new Map<string, number>();

  return dates.map(date => {
    const row: Record<string, string | number> = { date };
    validFunds.forEach(fund => {
      let pointer = pointers.get(fund.code) || 0;
      while (pointer < fund.history.length && fund.history[pointer].date <= date) {
        latest.set(fund.code, fund.history[pointer].nav);
        pointer++;
      }
      pointers.set(fund.code, pointer);
      const nav = latest.get(fund.code);
      if (nav === undefined) return;
      if (!bases.has(fund.code)) bases.set(fund.code, nav);
      const base = bases.get(fund.code) as number;
      row[fund.code] = ((nav - base) / base) * 100;
    });
    return row;
  }).filter(row => validFunds.every(fund => typeof row[fund.code] === 'number'));
};
