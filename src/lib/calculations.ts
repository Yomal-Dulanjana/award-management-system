// Server-side financial calculation helpers — zero trust on client-sent totals.

export interface RevenueRow {
  activity: string;
  revenue: number;
  percent: number; // recalculated
}

export interface CalculatedMetrics {
  revenueRows: RevenueRow[];
  diversificationTotal: number;
  combinedPercent: number;
  roi: number;
  payback: number | null;
}

// Recalculate all financial metrics strictly from raw inputs
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

  // ROI = Operating Profit / Total Investment * 100
  const roi = totalInvestment > 0
    ? Math.round((operatingProfit / totalInvestment) * 10000) / 100
    : 0;

  // Payback Period = Total Investment / Operating Profit (years)
  const payback = operatingProfit > 0
    ? Math.round((totalInvestment / operatingProfit) * 100) / 100
    : null;

  return { revenueRows: rows, diversificationTotal, combinedPercent, roi, payback };
}

// Generate CSPRNG BDC reference: BDC-YYYY-[8-HEX]
export function generateReference(): string {
  const year = new Date().getFullYear();
  const buf = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `BDC-${year}-${hex}`;
}

// Format amount as Sri Lankan currency string
export function formatCurrency(amount: number): string {
  return 'Rs. ' + amount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
