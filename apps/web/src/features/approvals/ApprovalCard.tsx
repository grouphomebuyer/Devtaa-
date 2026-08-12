import { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  CornerUpLeft,
  FileText,
  Info,
  Paperclip,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  MeterBar,
  Money,
  StatusChip,
  cn,
  formatDateTime,
  formatPercent,
  formatRelative,
  parseAmount,
  type Tone,
} from '@/design';
import type { ApprovalItem } from '@/mocks/types';

const TYPE_LABEL: Record<ApprovalItem['document_type'], string> = {
  payment_request: 'Payment',
  purchase_requisition: 'Requisition',
  purchase_order: 'Purchase order',
  ra_bill: 'RA bill',
  budget_deviation: 'Budget deviation',
  obligation_run: 'Payment run',
  vendor_bank_account: 'Vendor bank change',
};

const URGENCY: Record<ApprovalItem['urgency'], { label: string; tone: Tone }> = {
  critical: { label: 'Critical', tone: 'danger' },
  high: { label: 'High', tone: 'warning' },
  normal: { label: 'Normal', tone: 'neutral' },
};

const SUMMARY_TONE: Record<string, string> = {
  positive: 'text-success',
  caution: 'text-warning',
  negative: 'text-danger',
  neutral: 'text-content-secondary',
};

export function ApprovalCard({
  item,
  expanded,
  onToggle,
  selected,
  onSelectChange,
  onDecide,
  busy,
}: {
  item: ApprovalItem;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelectChange: (next: boolean) => void;
  onDecide: (action: 'approve' | 'reject' | 'return') => void;
  busy: boolean;
}) {
  const [showChain, setShowChain] = useState(false);
  const blocker = item.exceptions.find((e) => e.severity === 'blocker');
  const warnings = item.exceptions.filter((e) => e.severity !== 'blocker');
  const overdue = new Date(item.sla_due_at).getTime() < Date.now();
  const urgency = URGENCY[item.urgency];

  return (
    <article
      aria-label={`${TYPE_LABEL[item.document_type]} ${item.document_no}`}
      className={cn(
        'rounded border bg-surface transition-colors',
        blocker ? 'border-danger-border' : 'border-line',
        selected && 'ring-1 ring-primary/40',
      )}
    >
      {/* ---- summary row ---- */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectChange(e.target.checked)}
          aria-label={`Select ${item.document_no} for bulk approval`}
          className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[rgb(var(--primary))]"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone="info" className="uppercase">
              {TYPE_LABEL[item.document_type]}
            </Badge>
            <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight text-content">
              {item.counterparty}
            </h3>
            <StatusChip label={urgency.label} tone={urgency.tone} size="sm" />
            {overdue && <StatusChip label="Overdue" tone="danger" size="sm" />}
            {item.step_up_required && (
              <StatusChip
                label="Step-up auth"
                tone="neutral"
                size="sm"
                icon={<ShieldCheck aria-hidden className="h-3 w-3" />}
              />
            )}
          </div>

          <p className="mt-0.5 truncate text-dense text-content-secondary">{item.title}</p>

          <ul className="mt-1 grid gap-0.5">
            {item.subtitle_lines.map((line) => (
              <li key={line} className="truncate text-xs text-content-tertiary">
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-content-tertiary">
            <span className="inline-flex items-center gap-1">
              <FileText aria-hidden className="h-3 w-3" />
              {item.document_no}
            </span>
            <span className="inline-flex items-center gap-1">
              <Building2 aria-hidden className="h-3 w-3" />
              {item.project_name}
            </span>
            <span>
              Raised {formatRelative(item.submitted_at)} by {item.submitted_by}
            </span>
            <span className={cn(overdue && 'font-medium text-danger')}>
              SLA {overdue ? 'breached' : 'due'} {formatRelative(item.sla_due_at)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {parseAmount(item.amount) > 0 && (
            <span className="text-base font-semibold tracking-tight">
              <Money value={item.amount} />
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggle}
            aria-expanded={expanded}
            iconRight={
              <ChevronDown
                aria-hidden
                className={cn('transition-transform', expanded && 'rotate-180')}
              />
            }
          >
            {expanded ? 'Less' : 'Details'}
          </Button>
        </div>
      </div>

      {/* ---- exceptions: always visible, never hidden behind an expander ---- */}
      {blocker && (
        <div className="mx-3 mb-2.5 rounded border border-danger-border bg-danger-bg px-2.5 py-2">
          <p className="flex items-start gap-1.5 text-dense font-medium text-danger">
            <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{blocker.message}</span>
          </p>
          {blocker.remedy && (
            <p className="ml-5 mt-0.5 text-xs text-danger/90">{blocker.remedy}</p>
          )}
        </div>
      )}
      {warnings.map((w) => (
        <div
          key={w.code}
          className={cn(
            'mx-3 mb-2.5 rounded border px-2.5 py-1.5',
            w.severity === 'warning'
              ? 'border-warning-border bg-warning-bg'
              : 'border-line bg-surface-subtle',
          )}
        >
          <p
            className={cn(
              'flex items-start gap-1.5 text-xs',
              w.severity === 'warning' ? 'text-warning' : 'text-content-secondary',
            )}
          >
            {w.severity === 'warning' ? (
              <AlertTriangle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
            ) : (
              <Info aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
            )}
            <span>
              {w.message}
              {w.remedy && <span className="block opacity-90">{w.remedy}</span>}
            </span>
          </p>
        </div>
      ))}

      {/* ---- expanded detail: everything needed to decide, no navigation ---- */}
      {expanded && (
        <div className="border-t border-line-subtle px-3 py-3">
          <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
            {/* AI summary — violet is reserved for AI content (UX-5) */}
            <section
              aria-label="AI summary"
              className="rounded border border-ai-border bg-ai-bg/50 p-2.5"
            >
              <header className="mb-1.5 flex items-center gap-1.5">
                <Sparkles aria-hidden className="h-3.5 w-3.5 text-ai" />
                <h4 className="text-xs font-semibold text-ai">AI summary</h4>
                <span className="ml-auto text-micro text-content-tertiary">
                  confidence {formatPercent(item.ai_confidence * 100, 0)} · verify before approving
                </span>
              </header>
              <dl className="grid gap-1.5">
                {item.ai_summary.map((line) => (
                  <div key={line.label} className="grid grid-cols-[76px_1fr] gap-2">
                    <dt className="text-micro font-semibold uppercase tracking-wide text-content-tertiary">
                      {line.label}
                    </dt>
                    <dd className={cn('text-xs leading-5', SUMMARY_TONE[line.tone])}>{line.text}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="grid content-start gap-3">
              {/* money impact (UX-6) */}
              {item.money_impact && (
                <section aria-label="Money impact" className="rounded border border-line p-2.5">
                  <h4 className="mb-1.5 text-xs font-semibold text-content">Money impact</h4>
                  <dl className="text-xs">
                    <div className="flex justify-between border-b border-line-subtle py-1">
                      <dt className="text-content-secondary">Gross</dt>
                      <dd>
                        <Money value={item.money_impact.gross} decimals={2} />
                      </dd>
                    </div>
                    {item.money_impact.deductions.map((d) => (
                      <div
                        key={d.label}
                        className="flex justify-between border-b border-line-subtle py-1"
                      >
                        <dt className="min-w-0 pr-2 text-content-secondary">
                          {d.label}
                          {d.note && (
                            <span className="block text-micro text-content-tertiary">{d.note}</span>
                          )}
                        </dt>
                        <dd className="shrink-0 text-danger">
                          −<Money value={d.amount} decimals={2} />
                        </dd>
                      </div>
                    ))}
                    <div className="flex justify-between pt-1.5">
                      <dt className="font-semibold text-content">Net payable</dt>
                      <dd>
                        <Money value={item.money_impact.net} decimals={2} strong />
                      </dd>
                    </div>
                    {item.money_impact.cash_after && (
                      <div className="mt-1 flex justify-between border-t border-line-subtle pt-1.5">
                        <dt className="text-content-secondary">Bank balance after release</dt>
                        <dd>
                          <Money value={item.money_impact.cash_after} />
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}

              {/* budget impact */}
              {item.budget_impact && (
                <section aria-label="Budget impact" className="rounded border border-line p-2.5">
                  <h4 className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-content">
                    <span>
                      Budget · line {item.budget_impact.boq_line_code}{' '}
                      <span className="font-normal text-content-secondary">
                        {item.budget_impact.boq_line_name}
                      </span>
                    </span>
                    <StatusChip
                      label={
                        item.budget_impact.breach
                          ? 'Breach'
                          : `${formatPercent(item.budget_impact.consumed_pct, 0)} consumed`
                      }
                      tone={
                        item.budget_impact.breach
                          ? 'danger'
                          : item.budget_impact.consumed_pct > 85
                            ? 'warning'
                            : 'success'
                      }
                      size="sm"
                    />
                  </h4>
                  <MeterBar
                    label={`Budget consumption for line ${item.budget_impact.boq_line_code}`}
                    max={parseAmount(item.budget_impact.budget)}
                    segments={[
                      {
                        label: 'Incurred',
                        value: parseAmount(item.budget_impact.incurred),
                        tone: 'data-1',
                      },
                      {
                        label: 'Committed',
                        value: parseAmount(item.budget_impact.committed),
                        tone: 'data-3',
                      },
                    ]}
                  />
                  <dl className="mt-1.5 grid grid-cols-4 gap-2 text-micro">
                    {(
                      [
                        ['Budget', item.budget_impact.budget],
                        ['Incurred', item.budget_impact.incurred],
                        ['Committed', item.budget_impact.committed],
                        ['Available', item.budget_impact.available],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-content-tertiary">{label}</dt>
                        <dd className="text-xs font-medium">
                          <Money value={value} compact />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </div>
          </div>

          {/* linked documents & chain */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Paperclip aria-hidden className="h-3 w-3 text-content-tertiary" />
              {item.linked_documents.map((d) => (
                <button
                  key={d.document_no}
                  type="button"
                  className="rounded border border-line bg-surface-subtle px-1.5 py-0.5 text-micro text-content-secondary transition-colors hover:border-line-strong hover:text-content"
                >
                  {d.label} · {d.document_no}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowChain((v) => !v)}
              aria-expanded={showChain}
              className="ml-auto rounded text-micro text-content-tertiary hover:text-content hover:underline"
            >
              {showChain ? 'Hide' : 'Show'} approval trail ({item.approval_chain.length} steps)
            </button>
          </div>

          {showChain && (
            <ol className="mt-2 grid gap-1 border-t border-line-subtle pt-2">
              {item.approval_chain.map((step) => (
                <li key={step.step} className="flex items-center gap-2 text-micro">
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold',
                      step.status === 'done'
                        ? 'border-success-border bg-success-bg text-success'
                        : step.status === 'current'
                          ? 'border-primary bg-primary text-primary-fg'
                          : 'border-line bg-surface-subtle text-content-tertiary',
                    )}
                  >
                    {step.status === 'done' ? '✓' : step.step}
                  </span>
                  <span className="font-medium text-content">{step.role}</span>
                  <span className="text-content-secondary">{step.user}</span>
                  <span className="text-content-tertiary">
                    {step.status === 'done'
                      ? `approved ${formatDateTime(step.acted_at)}`
                      : step.status === 'current'
                        ? 'awaiting decision'
                        : 'pending'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* ---- actions ---- */}
      <footer className="flex flex-wrap items-center gap-2 border-t border-line-subtle bg-surface-subtle/50 px-3 py-2">
        <Button
          variant="primary"
          size="md"
          loading={busy}
          onClick={() => onDecide('approve')}
          iconLeft={<Check aria-hidden />}
        >
          {blocker?.code === 'BUDGET_EXCEEDED' ? 'Approve with deviation' : 'Approve'}
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => onDecide('return')}
          iconLeft={<CornerUpLeft aria-hidden />}
        >
          Return
        </Button>
        <Button
          variant="ghost"
          size="md"
          onClick={() => onDecide('reject')}
          iconLeft={<X aria-hidden />}
          className="text-danger hover:bg-danger-bg hover:text-danger"
        >
          Reject
        </Button>
        <span className="ml-auto text-micro text-content-tertiary">
          Returning or rejecting requires a reason
        </span>
      </footer>
    </article>
  );
}
