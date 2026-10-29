// Financial calculations & reference number generator

export interface RevenueRow {
  activity: string;
  revenue: number;
  percent: number;
}

export interface CalculatedMetrics {
  revenueRows: RevenueRow[];
  diversificationTotal: number;
  combinedPercent: number;
  roi: number;
  payback: number | null;
}

// Calculate diversification revenue %, ROI %, and payback period
export function recalculate(params: {
  totalCompanyRevenue: number;
  revenueRows: Array<{ activity: string; revenue: number }>;
  totalInvestment: number;
  operatingProfit: number;
}): CalculatedMetrics {
  const { totalCompanyRevenue, revenueRows, totalInvestment, operatingProfit } = params;

  let diversificationTotal = 0;
  const rows: RevenueRow[] = revenueRows.map(r => {
    diversificationTotal += r.revenue;
    const percent = totalCompanyRevenue > 0
      ? Math.round((r.revenue / totalCompanyRevenue) * 10000) / 100
      : 0;
    return { activity: r.activity, revenue: r.revenue, percent };
  });

  const combinedPercent = totalCompanyRevenue > 0
    ? Math.round((diversificationTotal / totalCompanyRevenue) * 10000) / 100
    : 0;

  // ROI: (Operating Profit / Total Investment) * 100
  const roi = totalInvestment > 0
    ? Math.round((operatingProfit / totalInvestment) * 10000) / 100
    : 0;

  // Payback period in years
  const payback = operatingProfit > 0
    ? Math.round((totalInvestment / operatingProfit) * 100) / 100
    : null;

  return { revenueRows: rows, diversificationTotal, combinedPercent, roi, payback };
}

// Generate unique reference: BDC-YYYY-[8-HEX]
export function generateReference(): string {
  const year = new Date().getFullYear();
  const buf = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `BDC-${year}-${hex}`;
}

export function formatCurrency(amount: number): string {
  return 'Rs. ' + amount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
