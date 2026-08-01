import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  Check,
  CircleSlash,
  FilePlus2,
  Link2,
  Link2Off,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  KeyHint,
  Modal,
  Money,
  PageBody,
  PageHeader,
  SearchInput,
  Select,
  StatusChip,
  cn,
  formatDate,
  formatPercent,
  parseAmount,
  useToast,
  type Tone,
} from '@/design';
import {
  useAutoMatch,
  useIgnoreLine,
  useMatchCandidates,
  useMatchLine,
  useReconSession,
  useStatementLines,
  useUnmatchLine,
} from '@/lib/queries';
import { AicosApiError, type BankStatementLine, type ReconLineStatus } from '@/mocks/types';

const STATUS_META: Record<ReconLineStatus, { label: string; tone: Tone }> = {
  matched: { label: 'Matched', tone: 'success' },
  suggested: { label: 'Suggested', tone: 'info' },
  unmatched: { label: 'Unmatched', tone: 'warning' },
  ignored: { label: 'Ignored', tone: 'neutral' },
};

const FILTERS = [
  { value: 'all', label: 'All lines' },
  { value: 'open', label: 'Needs action (unmatched + suggested)' },
  { value: 'suggested', label: 'Suggested only' },
  { value: 'unmatched', label: 'Unmatched only' },
  { value: 'matched', label: 'Matched' },
  { value: 'ignored', label: 'Ignored' },
];

function confidenceTone(c: number | null): Tone {
  if (c === null) return 'neutral';
  if (c >= 0.95) return 'success';
  if (c >= 0.8) return 'warning';
  return 'danger';
}

export function ReconciliationWorkbench() {
  const toast = useToast();
  const { data: session } = useReconSession();
  const { data: lines = [], isLoading } = useStatementLines();
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const match = useMatchLine();
  const unmatch = useUnmatchLine();
  const ignore = useIgnoreLine();
  const auto = useAutoMatch();

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lines.filter((l) => {
      if (filter === 'open' && !(l.status === 'unmatched' || l.status === 'suggested')) return false;
      if (['suggested', 'unmatched', 'matched', 'ignored'].includes(filter) && l.status !== filter)
        return false;
      if (needle && !`${l.narration} ${l.reference}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [lines, filter, q]);

  // keep a valid active line as the filter changes
  useEffect(() => {
    if (visible.length === 0) {
      setActiveId(null);
    } else if (!activeId || !visible.some((l) => l.id === activeId)) {
      setActiveId(visible[0].id);
    }
  }, [visible, activeId]);

  useEffect(() => {
    setCandidateIndex(0);
  }, [activeId]);

  const activeLine = visible.find((l) => l.id === activeId) ?? null;
  const { data: candidates = [], isFetching: candidatesLoading } = useMatchCandidates(activeId);
  const bestCandidate = candidates[candidateIndex] ?? candidates[0] ?? null;

  const moveActive = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const index = visible.findIndex((l) => l.id === activeId);
      const next = Math.max(0, Math.min(visible.length - 1, (index < 0 ? 0 : index) + delta));
      setActiveId(visible[next].id);
      listRef.current
        ?.querySelector<HTMLElement>(`[data-line="${visible[next].id}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    },
    [visible, activeId],
  );

  const report = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof AicosApiError) toast.error(err.error.message, err.error.code);
      else toast.error(fallback);
    },
    [toast],
  );

  const acceptMatch = useCallback(async () => {
    if (!activeLine || !bestCandidate) return;
    try {
      await match.mutateAsync({ lineId: activeLine.id, candidateId: bestCandidate.id });
      toast.success(
        `Matched to ${bestCandidate.voucher_no}`,
        `${formatDate(activeLine.txn_date)} · ${bestCandidate.party}`,
      );
      moveActive(1);
    } catch (err) {
      report(err, 'The match could not be saved.');
    }
  }, [activeLine, bestCandidate, match, toast, moveActive, report]);

  const runAutoMatch = useCallback(async () => {
    try {
      const result = await auto.mutateAsync({ threshold: 0.95 });
      toast.success(
        `${result.matched} line${result.matched === 1 ? '' : 's'} matched automatically`,
        'Only exceptions remain — that is the real work.',
      );
    } catch (err) {
      report(err, 'Auto-match failed.');
    }
  }, [auto, toast, report]);

  // ---- keyboard workflow (Phase 6 §5.2, UX-8) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          moveActive(1);
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          moveActive(-1);
          break;
        case 'Enter':
          e.preventDefault();
          void acceptMatch();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setCandidateIndex((i) => (candidates.length ? (i + 1) % candidates.length : 0));
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          setCreateOpen(true);
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          setIgnoreOpen(true);
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          void runAutoMatch();
          break;
        default:
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moveActive, acceptMatch, runAutoMatch, candidates.length]);

  const matched = session?.matched_lines ?? 0;
  const totalLines = session?.total_lines ?? 0;
  const remaining = totalLines - matched - (session?.ignored_lines ?? 0);
  const pct = totalLines > 0 ? (matched / totalLines) * 100 : 0;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/approvals' },
          { label: 'Finance' },
          { label: 'Bank reconciliation' },
        ]}
        title="Bank reconciliation"
        subtitle={
          session
            ? `${session.bank_account_label} · ${formatDate(session.period_from)} to ${formatDate(session.period_to)}`
            : 'Loading statement…'
        }
        meta={
          session && (
            <StatusChip
              label={`${matched} of ${totalLines} matched (${formatPercent(pct, 0)}) · ${remaining} remaining`}
              tone={remaining === 0 ? 'success' : 'info'}
            />
          )
        }
        actions={
          <>
            <Button
              variant="secondary"
              iconLeft={<Sparkles aria-hidden />}
              loading={auto.isPending}
              onClick={() => void runAutoMatch()}
            >
              Match all ≥ 95%
            </Button>
            <Button variant="primary" iconLeft={<Check aria-hidden />} disabled>
              Close reconciliation
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {/* summary strip */}
        {session && (
          <div className="grid grid-cols-2 gap-px border-b border-line bg-line md:grid-cols-5">
            {[
              { label: 'Opening balance', value: session.opening_balance },
              { label: 'Closing balance (bank)', value: session.closing_balance },
              { label: 'Book balance', value: session.book_balance },
              { label: 'Unreconciled difference', value: session.unreconciled_difference, danger: true },
            ].map((c) => (
              <div key={c.label} className="bg-surface px-3 py-2">
                <p className="text-micro uppercase tracking-wide text-content-tertiary">{c.label}</p>
                <p
                  className={cn(
                    'text-dense font-semibold',
                    c.danger && parseAmount(c.value) !== 0 && 'text-danger',
                  )}
                >
                  <Money value={c.value} />
                </p>
              </div>
            ))}
            <div className="bg-surface px-3 py-2">
              <p className="text-micro uppercase tracking-wide text-content-tertiary">Progress</p>
              <p className="text-dense font-semibold tnum">
                {formatPercent(pct, 0)}
                <span className="ml-1.5 text-micro font-normal text-content-tertiary">
                  {remaining} line{remaining === 1 ? '' : 's'} left
                </span>
              </p>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-surface-inset">
                <div
                  className="h-full bg-success"
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Reconciliation progress"
                />
              </div>
            </div>
          </div>
        )}

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <Select
            aria-label="Filter statement lines"
            options={FILTERS}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            selectSize="sm"
            className="w-72"
          />
          <SearchInput
            label="Search statement lines"
            value={q}
            onValueChange={setQ}
            placeholder="Narration or reference"
            className="w-72"
          />
          <span className="text-micro text-content-tertiary">
            {visible.length} line{visible.length === 1 ? '' : 's'} shown
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <KeyHint keys={['↑', '↓']} label="navigate" />
            <KeyHint keys={['Enter']} label="accept" />
            <KeyHint keys={['M']} label="next candidate" />
            <KeyHint keys={['C']} label="create" />
            <KeyHint keys={['I']} label="ignore" />
            <KeyHint keys={['A']} label="auto-match" />
          </div>
        </div>

        {/* three panes */}
        <PageBody padded={false} className="flex overflow-hidden">
          <div className="grid min-h-0 w-full grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_300px]">
            {/* pane 1 — statement lines */}
            <section
              aria-label="Bank statement lines"
              className="flex min-h-0 flex-col border-r border-line bg-surface"
            >
              <h2 className="flex h-8 shrink-0 items-center border-b border-line bg-surface-subtle px-3 text-micro font-semibold uppercase tracking-wide text-content-secondary">
                Statement lines
              </h2>
              <ul
                ref={listRef}
                role="listbox"
                aria-label="Bank statement lines"
                aria-activedescendant={activeId ? `line-${activeId}` : undefined}
                tabIndex={0}
                className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-none"
              >
                {isLoading &&
                  Array.from({ length: 10 }).map((_, i) => (
                    <li key={i} className="h-14 animate-pulse border-b border-line-subtle" />
                  ))}
                {!isLoading && visible.length === 0 && (
                  <li>
                    <EmptyState
                      size="sm"
                      tone="success"
                      icon={<Check aria-hidden />}
                      title="No lines match this filter"
                      description="Switch the filter to review matched or ignored lines."
                    />
                  </li>
                )}
                {visible.map((l) => (
                  <StatementRow
                    key={l.id}
                    line={l}
                    active={l.id === activeId}
                    onSelect={() => setActiveId(l.id)}
                  />
                ))}
              </ul>
            </section>

            {/* pane 2 — match candidates */}
            <section
              aria-label="Match candidates"
              className="flex min-h-0 flex-col border-r border-line bg-surface"
            >
              <h2 className="flex h-8 shrink-0 items-center justify-between border-b border-line bg-surface-subtle px-3 text-micro font-semibold uppercase tracking-wide text-content-secondary">
                <span>Match candidates</span>
                {candidates.length > 1 && (
                  <span className="font-normal normal-case tracking-normal text-content-tertiary">
                    {candidateIndex + 1} of {candidates.length} · press M to cycle
                  </span>
                )}
              </h2>
              {/*
                tabIndex={0} so keyboard-only users can scroll this pane. Without
                it the region is reachable by mouse wheel alone, which axe flags
                as a serious WCAG failure (scrollable-region-focusable).
              */}
              <div
                className="min-h-0 flex-1 overflow-y-auto p-3"
                tabIndex={0}
                role="region"
                aria-label="Match candidate details"
              >
                {!activeLine && (
                  <EmptyState
                    size="sm"
                    title="Select a statement line"
                    description="Use ↑ and ↓ to move through the statement."
                  />
                )}
                {activeLine && activeLine.status === 'matched' && (
                  <div className="rounded border border-success-border bg-success-bg p-3">
                    <p className="flex items-center gap-1.5 text-dense font-medium text-success">
                      <Check aria-hidden className="h-3.5 w-3.5" />
                      Matched to {activeLine.matched_voucher_no}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      iconLeft={<Link2Off aria-hidden />}
                      loading={unmatch.isPending}
                      onClick={() => void unmatch.mutateAsync({ lineId: activeLine.id })}
                    >
                      Unmatch
                    </Button>
                  </div>
                )}
                {activeLine && activeLine.status !== 'matched' && candidates.length === 0 && (
                  <EmptyState
                    size="sm"
                    icon={<CircleSlash aria-hidden />}
                    title="No candidate found"
                    description="Nothing in the books matches this line. Create a transaction from it, or ignore it with a reason."
                    action={
                      <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                        Create transaction
                      </Button>
                    }
                  />
                )}
                {activeLine &&
                  activeLine.status !== 'matched' &&
                  candidates.map((c, i) => (
                    <article
                      key={c.id}
                      aria-current={i === candidateIndex ? 'true' : undefined}
                      onClick={() => setCandidateIndex(i)}
                      className={cn(
                        'mb-2 cursor-pointer rounded border p-2.5 transition-colors',
                        i === candidateIndex
                          ? 'border-primary bg-primary-subtle/40'
                          : 'border-line hover:border-line-strong',
                      )}
                    >
                      <header className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-dense font-medium text-content">
                            {c.voucher_no}
                          </p>
                          <p className="truncate text-xs text-content-secondary">{c.party}</p>
                          <p className="text-micro leading-4 text-content-tertiary">
                            {c.voucher_type.replace(/_/g, ' ')} · {formatDate(c.voucher_date)}
                            {c.project_name ? ` · ${c.project_name}` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-dense font-semibold">
                            <Money value={c.amount} decimals={2} />
                          </p>
                          <StatusChip
                            size="sm"
                            tone={confidenceTone(c.confidence)}
                            label={`${formatPercent(c.confidence * 100, 0)} confidence`}
                          />
                        </div>
                      </header>
                      <ul className="mt-2 grid gap-0.5 border-t border-line-subtle pt-1.5">
                        {c.reasons.map((r) => (
                          <li
                            key={r.label}
                            className={cn(
                              'flex items-center gap-1.5 text-micro',
                              r.matched ? 'text-content-secondary' : 'text-danger',
                            )}
                          >
                            {r.matched ? (
                              <Check aria-hidden className="h-3 w-3 shrink-0 text-success" />
                            ) : (
                              <Ban aria-hidden className="h-3 w-3 shrink-0" />
                            )}
                            {r.label}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                {candidatesLoading && (
                  <p role="status" className="sr-only">
                    Loading candidates
                  </p>
                )}
              </div>
            </section>

            {/* pane 3 — actions */}
            <section aria-label="Actions" className="flex min-h-0 flex-col bg-surface">
              <h2 className="flex h-8 shrink-0 items-center border-b border-line bg-surface-subtle px-3 text-micro font-semibold uppercase tracking-wide text-content-secondary">
                Action
              </h2>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {!activeLine ? (
                  <p className="text-dense text-content-tertiary">No line selected.</p>
                ) : (
                  <>
                    <dl className="mb-3 grid gap-1.5 rounded border border-line bg-surface-subtle p-2.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-content-tertiary">Date</dt>
                        <dd>{formatDate(activeLine.txn_date)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-content-tertiary">Amount</dt>
                        <dd className="font-semibold">
                          <Money
                            value={activeLine.debit ?? activeLine.credit ?? 0}
                            decimals={2}
                          />
                          <span className="ml-1 text-micro font-normal text-content-tertiary">
                            {activeLine.debit ? 'Dr' : 'Cr'}
                          </span>
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-content-tertiary">Reference</dt>
                        <dd className="truncate font-mono">{activeLine.reference}</dd>
                      </div>
                      <div className="mt-1 border-t border-line-subtle pt-1.5">
                        <dt className="mb-0.5 text-content-tertiary">Narration</dt>
                        <dd className="break-words font-mono text-micro leading-4">
                          {activeLine.narration}
                        </dd>
                      </div>
                    </dl>

                    <div className="grid gap-1.5">
                      <Button
                        variant="primary"
                        fullWidth
                        iconLeft={<Link2 aria-hidden />}
                        disabled={!bestCandidate || activeLine.status === 'matched'}
                        loading={match.isPending}
                        onClick={() => void acceptMatch()}
                      >
                        Accept match (Enter)
                      </Button>
                      <Button
                        variant="secondary"
                        fullWidth
                        iconLeft={<Zap aria-hidden />}
                        disabled={candidates.length < 2}
                        onClick={() =>
                          setCandidateIndex((i) => (i + 1) % Math.max(1, candidates.length))
                        }
                      >
                        Next candidate (M)
                      </Button>
                      <Button
                        variant="secondary"
                        fullWidth
                        iconLeft={<FilePlus2 aria-hidden />}
                        onClick={() => setCreateOpen(true)}
                      >
                        Create transaction (C)
                      </Button>
                      <Button
                        variant="ghost"
                        fullWidth
                        iconLeft={<Ban aria-hidden />}
                        disabled={activeLine.status === 'ignored'}
                        onClick={() => setIgnoreOpen(true)}
                      >
                        Ignore line (I)
                      </Button>
                    </div>

                    <p className="mt-3 text-micro leading-4 text-content-tertiary">
                      Matching writes an audited reconciliation entry. Ignoring requires a reason and
                      can be reversed until the period is closed.
                    </p>
                  </>
                )}
              </div>
            </section>
          </div>
        </PageBody>
      </div>

      <ConfirmDialog
        open={ignoreOpen}
        onClose={() => setIgnoreOpen(false)}
        title="Ignore this statement line"
        description={activeLine ? `${formatDate(activeLine.txn_date)} · ${activeLine.reference}` : ''}
        confirmLabel="Ignore line"
        requireReason
        reasonLabel="Why is this line being ignored?"
        reasonHint="Bank charges, interest and inter-account transfers are the usual cases."
        busy={ignore.isPending}
        onConfirm={async (reason) => {
          if (!activeLine) return;
          try {
            await ignore.mutateAsync({ lineId: activeLine.id, reason });
            toast.success('Line ignored', reason);
            setIgnoreOpen(false);
            moveActive(1);
          } catch (err) {
            report(err, 'The line could not be ignored.');
          }
        }}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a transaction from this line"
        description="Not implemented in this build."
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setCreateOpen(false)}>
            Close
          </Button>
        }
      >
        <p className="text-dense text-content-secondary">
          This action posts a voucher directly from the statement line (
          <code className="font-mono">POST /bank-statement-lines/{'{id}'}/create-transaction</code>),
          pre-filling party, amount and date, then matches it automatically. The voucher entry screen
          is outside this frontend slice.
        </p>
      </Modal>
    </>
  );
}

function StatementRow({
  line,
  active,
  onSelect,
}: {
  line: BankStatementLine;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = STATUS_META[line.status];
  return (
    <li
      id={`line-${line.id}`}
      data-line={line.id}
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'cursor-pointer border-b border-line-subtle px-3 py-2 transition-colors',
        active ? 'bg-surface-selected' : 'hover:bg-surface-hover',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-micro tnum text-content-tertiary">
              {formatDate(line.txn_date)}
            </span>
            <StatusChip label={meta.label} tone={meta.tone} size="sm" />
            {line.best_confidence !== null && line.status !== 'matched' && (
              <Badge tone={confidenceTone(line.best_confidence)}>
                {formatPercent(line.best_confidence * 100, 0)}
              </Badge>
            )}
            {line.matched_voucher_no && (
              <span className="truncate font-mono text-micro text-content-tertiary">
                {line.matched_voucher_no}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-micro text-content-secondary">
            {line.narration}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              'text-dense font-medium tnum',
              line.debit ? 'text-content' : 'text-success',
            )}
          >
            {line.debit ? '' : '+'}
            <Money value={line.debit ?? line.credit ?? 0} decimals={2} />
          </p>
          <p className="text-micro tnum text-content-tertiary">
            bal <Money value={line.balance} />
          </p>
        </div>
      </div>
    </li>
  );
}
