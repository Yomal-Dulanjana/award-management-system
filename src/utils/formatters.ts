// Pure data formatting utilities for currency, dates, and numbers

// Format number as Sri Lankan Rupees (e.g. Rs. 1,500,000.00)
export function fmtCurrency(amount: number | string | null | undefined): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  if (isNaN(num)) return 'Rs. 0.00';
  return 'Rs. ' + num.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Format date for display (e.g. Oct 29, 2026)
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Format date and time using Sri Lanka timezone (Asia/Colombo)
export function formatSLDateTime(dateInput: Date | string | number | null | undefined): { dateStr: string; timeStr: string } {
  if (!dateInput) return { dateStr: '—', timeStr: '—' };
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return { dateStr: '—', timeStr: '—' };

  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  }).format(d);

  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d);

  return { dateStr, timeStr };
}

// Format bytes into human-readable size (e.g. 2.45 MB)
export function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Format percentage with fixed decimal (e.g. 15.5%)
export function fmtPercent(value: number | string | null | undefined, decimals = 1): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return '0%';
  return `${num.toFixed(decimals)}%`;
}
