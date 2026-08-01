import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  MeterBar,
  Money,
  StatusChip,
  cn,
  formatMoney,
  formatPercent,
  parseAmount,
} from '@/design';
import type { BudgetAvailability } from '@/mocks/types';

/**
 * Live budget availability — Phase 6 §5.5: the engineer sees whether the line
 * can absorb the request *before* submitting, so a rejection two days later is
 * never a surprise. UX-7: the error carries its own fix.
 */
export function BudgetPanel({
  data,
  loading,
  onRequestDeviation,
}: {
  data: BudgetAvailability | undefined;
  loading: boolean;
  onRequestDeviation: () => void;
}) {
  if (loading && !data) {
    return (
      <Card className="animate-pulse">
        <CardHeader title="Budget availability" size="sm" />
        <CardBody>
          <div className="h-40 rounded bg-surface-inset" />
        </CardBody>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader title="Budget availability" size="sm" />
        <CardBody>
          <p className="text-dense text-content-tertiary">
            Choose an item and a BOQ line to see the live budget position for that line.
          </p>
        </CardBody>
      </Card>
    );
  }

  const budget = parseAmount(data.budget);
  const shortfall = -parseAmount(data.after_request);

  return (
    <Card
      className={cn(data.breach && 'border-danger-border')}
      aria-label="Live budget availability"
    >
      <CardHeader
        size="sm"
        title="Budget availability"
        actions={
          <StatusChip
            label={data.breach ? 'Budget breach' : 'Within budget'}
            tone={data.breach ? 'danger' : data.consumed_pct > 85 ? 'warning' : 'success'}
            icon={
              data.breach ? (
                <AlertTriangle aria-hidden className="h-3 w-3" />
              ) : (
                <CheckCircle2 aria-hidden className="h-3 w-3" />
              )
            }
          />
        }
      />
      <CardBody className="grid gap-3">
        <div>
          <p className="text-dense font-medium text-content">
            {data.boq_line_code} · {data.boq_line_name}
          </p>
          <p className="text-micro text-content-tertiary">
            {formatPercent(data.consumed_pct, 1)} of the line budget is committed or incurred
          </p>
        </div>

        <MeterBar
          label={`Budget consumption for BOQ line ${data.boq_line_code}`}
          max={budget}
          segments={[
            { label: 'Incurred', value: parseAmount(data.incurred), tone: 'data-1' },
            { label: 'Committed', value: parseAmount(data.committed), tone: 'data-3' },
          ]}
        />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-dense">
          <Row label="Line budget" value={data.budget} />
          <Row label="Incurred" value={data.incurred} />
          <Row label="Committed" value={data.committed} />
          <Row label="Available now" value={data.available} strong />
        </dl>

        <div
          className={cn(
            'rounded border px-2.5 py-2',
            data.breach ? 'border-danger-border bg-danger-bg' : 'border-line bg-surface-subtle',
          )}
        >
          <dl className="grid gap-1 text-dense">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-content-secondary">This request</dt>
              <dd>
                <Money value={data.requested} decimals={2} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line-subtle pt-1">
              <dt className={cn('font-medium', data.breach ? 'text-danger' : 'text-content')}>
                {data.breach ? 'Shortfall' : 'Remaining after approval'}
              </dt>
              <dd className={cn('font-semibold', data.breach && 'text-danger')}>
                <Money value={data.breach ? shortfall : parseAmount(data.after_request)} decimals={2} />
              </dd>
            </div>
          </dl>
        </div>

        {data.breach && (
          <div className="rounded border border-danger-border bg-danger-bg p-2.5">
            <p className="flex items-start gap-1.5 text-dense font-medium text-danger">
              <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Budget exhausted on BOQ line {data.boq_line_code} — {formatMoney(data.available)}{' '}
                available, {formatMoney(data.requested)} requested.
              </span>
            </p>
            <p className="ml-5 mt-1 text-xs text-danger/90">
              Reduce the quantity, or raise a budget deviation for {formatMoney(shortfall)} and
              submit both together.
            </p>
            <Button
              size="sm"
              variant="danger"
              className="ml-5 mt-2"
              onClick={onRequestDeviation}
            >
              Request a budget deviation
            </Button>
          </div>
        )}

        {data.trend.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-micro font-medium uppercase tracking-wide text-content-tertiary">
              <TrendingUp aria-hidden className="h-3 w-3" />
              Spend on this line — last 6 months (₹ lakh)
            </p>
            <Sparkline values={data.trend} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-micro text-content-tertiary">{label}</dt>
      <dd className={cn('text-dense', strong && 'font-semibold')}>
        <Money value={value} />
      </dd>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div
      className="flex h-10 items-end gap-1"
      role="img"
      aria-label={`Monthly spend, oldest first: ${values.map((v) => `${v} lakh`).join(', ')}`}
    >
      {values.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-sm bg-data-1/70"
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
