import { cn } from '../cn';
import { formatMoney, formatMoneyCompact, parseAmount, type MoneyString } from '../format';

/**
 * Money — the only sanctioned way to render an amount.
 *
 * Compact values (`₹38.4L`) always carry the exact figure in the accessible
 * name and the tooltip, so a summary is never a dead end.
 */
export function Money({
  value,
  compact = false,
  decimals = 0,
  signed = false,
  /** Colours negatives red and positives green — used for variances only. */
  variance = false,
  className,
  muted = false,
  strong = false,
}: {
  value: MoneyString | number | null | undefined;
  compact?: boolean;
  decimals?: number;
  signed?: boolean;
  variance?: boolean;
  className?: string;
  muted?: boolean;
  strong?: boolean;
}) {
  const n = parseAmount(value);
  const exact = formatMoney(value, { decimals: decimals || 2, signed });
  const display = compact ? formatMoneyCompact(value) : formatMoney(value, { decimals, signed });

  return (
    <span
      className={cn(
        'tnum whitespace-nowrap',
        strong && 'font-semibold',
        muted && 'text-content-tertiary',
        variance && (n < 0 ? 'text-danger' : n > 0 ? 'text-success' : 'text-content-secondary'),
        className,
      )}
      title={compact || decimals === 0 ? exact : undefined}
    >
      {display}
      {(compact || decimals === 0) && <span className="sr-only"> (exactly {exact})</span>}
    </span>
  );
}

/**
 * MoneyBreakdown — Phase 6 §4: gross → deductions → net, every line
 * explained and traceable. Used on RA bills, payment runs and vouchers.
 */
export function MoneyBreakdown({
  gross,
  lines,
  net,
  netLabel = 'Net payable',
  className,
}: {
  gross: { label: string; value: MoneyString | number };
  lines: { label: string; value: MoneyString | number; note?: string; onDrill?: () => void }[];
  net: MoneyString | number;
  netLabel?: string;
  className?: string;
}) {
  return (
    <dl className={cn('text-dense', className)}>
      <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle py-1.5">
        <dt className="text-content-secondary">{gross.label}</dt>
        <dd>
          <Money value={gross.value} decimals={2} />
        </dd>
      </div>
      {lines.map((line) => (
        <div
          key={line.label}
          className="flex items-baseline justify-between gap-4 border-b border-line-subtle py-1.5"
        >
          <dt className="min-w-0">
            {line.onDrill ? (
              <button
                type="button"
                onClick={line.onDrill}
                className="rounded text-left text-content-secondary hover:text-primary-text hover:underline"
              >
                {line.label}
              </button>
            ) : (
              <span className="text-content-secondary">{line.label}</span>
            )}
            {line.note && (
              <span className="block text-micro text-content-tertiary">{line.note}</span>
            )}
          </dt>
          <dd className="text-danger">
            −<Money value={line.value} decimals={2} />
          </dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 pt-2">
        <dt className="font-semibold text-content">{netLabel}</dt>
        <dd className="text-sm font-semibold">
          <Money value={net} decimals={2} strong />
        </dd>
      </div>
    </dl>
  );
}
