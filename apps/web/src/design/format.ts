/**
 * Indian formatting utilities (Phase 6 §8, UX-10).
 *
 * These are centralised deliberately: "rupee formatting utilities centralised
 * so no component invents its own". Nothing in the app may call
 * `toLocaleString` directly.
 *
 * The API transports money as *string* decimals (Phase 7 §2) — never JSON
 * numbers — so every entry point here accepts `string | number`.
 */

/** Money as it arrives on the wire: a decimal string, e.g. `"425000.0000"`. */
export type MoneyString = string;

const RUPEE = '₹';
const NBSP = ' ';
const MINUS = '−'; // real minus sign, not a hyphen

export function parseAmount(value: MoneyString | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(value.replace(/[,\s₹]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Indian digit grouping: last three digits, then pairs.
 * 1234567.5 → "12,34,567.5"
 *
 * Implemented by hand rather than via `Intl` so the output is identical on
 * every runtime regardless of the ICU data shipped with it.
 */
export function groupIndian(value: number, minFrac = 0, maxFrac = 2): string {
  const negative = value < 0 || Object.is(value, -0);
  const abs = Math.abs(value);

  const fixed = abs.toFixed(Math.max(minFrac, maxFrac));
  const [rawInt, rawFrac = ''] = fixed.split('.');

  let frac = rawFrac.slice(0, Math.max(minFrac, maxFrac));
  // trim optional trailing precision, but never below minFrac
  while (frac.length > minFrac && frac.endsWith('0')) frac = frac.slice(0, -1);

  const int = rawInt;
  let grouped: string;
  if (int.length <= 3) {
    grouped = int;
  } else {
    const head = int.slice(0, int.length - 3);
    const tail = int.slice(-3);
    grouped = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail;
  }

  const out = frac ? `${grouped}.${frac}` : grouped;
  return negative && Number(fixed) !== 0 ? MINUS + out : out;
}

export interface MoneyOptions {
  /** Fixed decimal places. Default: 0 (paise are noise in an ERP summary). */
  decimals?: number;
  /** Render the `₹` symbol. Default true. */
  symbol?: boolean;
  /** Always show a leading `+` for positive values (variances). */
  signed?: boolean;
}

/** `₹12,45,678` — the default money renderer for grids, forms and cards. */
export function formatMoney(
  value: MoneyString | number | null | undefined,
  options: MoneyOptions = {},
): string {
  const { decimals = 0, symbol = true, signed = false } = options;
  const n = parseAmount(value);
  const body = groupIndian(n, decimals, decimals);
  const prefix = symbol ? RUPEE : '';
  if (signed && n > 0) return `+${prefix}${body}`;
  if (body.startsWith(MINUS)) return `${MINUS}${prefix}${body.slice(1)}`;
  return `${prefix}${body}`;
}

/**
 * `₹38.4L`, `₹1.24Cr`, `₹9,500` — for KPI tiles and chart axes only.
 * Never use in a grid cell: an ERP user must be able to read the exact figure.
 */
export function formatMoneyCompact(value: MoneyString | number | null | undefined): string {
  const n = parseAmount(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? MINUS : '';
  const p = RUPEE;

  if (abs >= 1e7) return `${sign}${p}${trimZero(abs / 1e7, abs >= 1e8 ? 1 : 2)}Cr`;
  if (abs >= 1e5) return `${sign}${p}${trimZero(abs / 1e5, abs >= 1e6 ? 1 : 2)}L`;
  if (abs >= 1e3) return `${sign}${p}${groupIndian(abs, 0, 0)}`;
  return `${sign}${p}${groupIndian(abs, 0, 2)}`;
}

function trimZero(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.?0+$/, '');
}

/** Quantity with unit, e.g. `12.000 MT`, `400 bags`. */
export function formatQuantity(
  value: MoneyString | number | null | undefined,
  uom?: string,
  decimals = 3,
): string {
  const body = groupIndian(parseAmount(value), 0, decimals);
  return uom ? `${body}${NBSP}${uom}` : body;
}

/** `68.4%`. Pass a percentage (0–100), not a fraction. */
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${groupIndian(value, decimals, decimals)}%`;
}

// ---------------------------------------------------------------------------
// Dates — DD-MM-YYYY, IST
// ---------------------------------------------------------------------------

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `31-07-2026` */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** `31-07-2026 14:23` */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `31 Jul 2026` — for prose and headers where the numeric form reads poorly. */
export function formatDateMedium(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `Jul 2026` */
export function formatMonth(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `YYYY-MM-DD` — the wire format (Phase 7 §2). */
export function toISODate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** `2 days ago`, `5 hours ago`, `just now`, `in 3 days`. */
export function formatRelative(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const d = toDate(value);
  if (!d) return '—';
  const diffMs = now.getTime() - d.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);

  const mins = Math.floor(abs / 60_000);
  const hours = Math.floor(abs / 3_600_000);
  const days = Math.floor(abs / 86_400_000);

  let body: string;
  if (mins < 1) return 'just now';
  else if (mins < 60) body = `${mins} minute${mins === 1 ? '' : 's'}`;
  else if (hours < 24) body = `${hours} hour${hours === 1 ? '' : 's'}`;
  else if (days < 31) body = `${days} day${days === 1 ? '' : 's'}`;
  else return formatDate(d);

  return future ? `in ${body}` : `${body} ago`;
}

/** Days between two dates; negative when `date` is in the past. */
export function daysUntil(value: string | Date, now: Date = new Date()): number {
  const d = toDate(value);
  if (!d) return 0;
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Indian financial year — 1 April to 31 March
// ---------------------------------------------------------------------------

/** `25-26` for any date between 01-04-2025 and 31-03-2026. */
export function financialYear(value: string | Date = new Date()): string {
  const d = toDate(value) ?? new Date();
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1;
  return `${String(startYear % 100).padStart(2, '0')}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** `FY 25-26` */
export function financialYearLabel(value: string | Date = new Date()): string {
  return `FY ${financialYear(value)}`;
}

/** `{ from: '2025-04-01', to: '2026-03-31' }` for a `25-26` style label. */
export function financialYearRange(fy: string): { from: string; to: string } {
  const start = Number(fy.split('-')[0]);
  const century = start >= 70 ? 1900 : 2000;
  const startYear = century + start;
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

// ---------------------------------------------------------------------------
// Miscellaneous domain formatting
// ---------------------------------------------------------------------------

/** Masks PII until an explicit, audited unmask (Phase 6 §11). */
export function maskAccountNumber(value: string | null | undefined): string {
  if (!value) return '—';
  const tail = value.slice(-4);
  return `${'•'.repeat(Math.max(0, value.length - 4))}${tail}`;
}

export function maskPan(value: string | null | undefined): string {
  if (!value || value.length < 10) return '—';
  return `${value.slice(0, 3)}${'•'.repeat(5)}${value.slice(-2)}`;
}

/** Initials for avatars — never more than two characters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
