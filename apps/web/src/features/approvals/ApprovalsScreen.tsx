import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCheck,
  CircleDollarSign,
  Inbox,
  ShieldCheck,
  Timer,
  Wallet,
} from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  KpiTile,
  Modal,
  PageBody,
  PageHeader,
  SearchInput,
  Select,
  StatusChip,
  TileRow,
  Toolbar,
  formatMoneyCompact,
  formatRelative,
  useToast,
} from '@/design';
import { useApp } from '@/app/context';
import { useApprovalInbox, useApprovalSummary, useBulkApprove, useDecideApproval } from '@/lib/queries';
import { AicosApiError, type ApprovalItem } from '@/mocks/types';
import { ApprovalCard } from './ApprovalCard';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All document types' },
  { value: 'payment_request', label: 'Payments' },
  { value: 'purchase_requisition', label: 'Requisitions' },
  { value: 'purchase_order', label: 'Purchase orders' },
  { value: 'ra_bill', label: 'RA bills' },
  { value: 'budget_deviation', label: 'Budget deviations' },
  { value: 'obligation_run', label: 'Payment runs' },
  { value: 'vendor_bank_account', label: 'Vendor bank changes' },
];

type Pending =
  | { kind: 'decision'; item: ApprovalItem; action: 'approve' | 'reject' | 'return' }
  | { kind: 'bulk'; ids: string[] }
  | null;

export function ApprovalsScreen() {
  const { session, project } = useApp();
  const toast = useToast();

  const [documentType, setDocumentType] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [stepUp, setStepUp] = useState<Pending>(null);
  const [otp, setOtp] = useState('');
  const [otpTouched, setOtpTouched] = useState(false);

  const effectiveProject = projectFilter !== 'all' ? projectFilter : (project?.id ?? 'all');

  const { data: summary } = useApprovalSummary();
  const { data, isLoading } = useApprovalInbox({
    document_type: documentType,
    project_id: effectiveProject,
    q,
  });
  const decide = useDecideApproval();
  const bulk = useBulkApprove();

  const items = useMemo(() => data?.data ?? [], [data]);
  const selectedItems = items.filter((i) => selected.has(i.id));
  const bulkBlocked = selectedItems.filter((i) =>
    i.exceptions.some((e) => e.severity === 'blocker'),
  );

  const projectOptions = [
    { value: 'all', label: 'All projects' },
    ...(session?.projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
  ];

  function reportError(err: unknown, fallback: string) {
    if (err instanceof AicosApiError) {
      const remedy = (err.error.details as { remedy?: string } | undefined)?.remedy;
      toast.error(err.error.message, remedy ?? `${err.error.code}${err.error.rule_code ? ` · rule ${err.error.rule_code}` : ''}`);
    } else {
      toast.error(fallback);
    }
  }

  async function runDecision(p: Exclude<Pending, null>, remarks: string) {
    try {
      if (p.kind === 'decision') {
        await decide.mutateAsync({
          approval_id: p.item.id,
          action: p.action,
          remarks,
        });
        toast.success(
          p.action === 'approve'
            ? `Approved ${p.item.document_no}`
            : p.action === 'reject'
              ? `Rejected ${p.item.document_no}`
              : `Returned ${p.item.document_no} to ${p.item.submitted_by}`,
          p.action === 'approve' && p.item.money_impact
            ? `Net ${formatMoneyCompact(p.item.money_impact.net)} queued for release.`
            : 'The requester has been notified.',
        );
      } else {
        const result = await bulk.mutateAsync({ ids: p.ids, remarks });
        setSelected(new Set());
        toast.success(`${result.approved} approvals cleared`);
      }
      setPending(null);
      setStepUp(null);
    } catch (err) {
      reportError(err, 'The approval could not be recorded.');
      setPending(null);
      setStepUp(null);
    }
  }

  function beginDecision(item: ApprovalItem, action: 'approve' | 'reject' | 'return') {
    const p: Pending = { kind: 'decision', item, action };
    if (action === 'approve' && item.step_up_required) {
      setOtp('');
      setOtpTouched(false);
      setStepUp(p);
    } else if (action === 'approve') {
      void runDecision(p, '');
    } else {
      setPending(p);
    }
  }

  const busy = decide.isPending || bulk.isPending;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/approvals' }, { label: 'Approvals' }]}
        title="Approval inbox"
        subtitle={`${greeting}, ${session?.user.name ?? ''} — ${items.length} item${items.length === 1 ? '' : 's'} need your decision.`}
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              disabled={selected.size === 0}
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
            <Button
              variant="primary"
              size="md"
              iconLeft={<CheckCheck aria-hidden />}
              disabled={selected.size === 0 || bulkBlocked.length > 0}
              title={
                bulkBlocked.length > 0
                  ? `${bulkBlocked.length} selected item(s) have blocking exceptions`
                  : undefined
              }
              onClick={() => setPending({ kind: 'bulk', ids: [...selected] })}
            >
              Approve {selected.size > 0 ? `${selected.size} selected` : 'selected'}
            </Button>
          </>
        }
      />

      <PageBody padded={false}>
        <div className="p-4 pb-0">
          <TileRow className="md:grid-cols-5">
            <KpiTile
              label="Awaiting you"
              value={summary?.awaiting_count ?? '—'}
              caption="across all companies"
              tone="info"
              icon={<Inbox aria-hidden />}
            />
            <KpiTile
              label="Total value"
              value={summary ? formatMoneyCompact(summary.awaiting_value) : '—'}
              caption="pending release"
              tone="neutral"
              icon={<CircleDollarSign aria-hidden />}
            />
            <KpiTile
              label="Past SLA"
              value={summary?.overdue_count ?? '—'}
              caption="decide today"
              tone={summary && summary.overdue_count > 0 ? 'danger' : 'success'}
              icon={<Timer aria-hidden />}
            />
            <KpiTile
              label="Exceptions"
              value={summary?.exception_count ?? '—'}
              caption="blockers and warnings"
              tone={summary && summary.exception_count > 0 ? 'warning' : 'success'}
              icon={<AlertTriangle aria-hidden />}
            />
            <KpiTile
              label="Bank position"
              value={summary ? formatMoneyCompact(summary.cash_position) : '—'}
              caption="HDFC ••••4417 · all accounts"
              tone="neutral"
              icon={<Wallet aria-hidden />}
              delta={
                summary ? { value: summary.cash_delta_pct, label: 'vs last week' } : undefined
              }
            />
          </TileRow>
        </div>

        <div className="mt-4">
          <Toolbar label="Approval filters">
            <Select
              aria-label="Filter by document type"
              options={TYPE_OPTIONS}
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              selectSize="sm"
              className="w-52"
            />
            <Select
              aria-label="Filter by project"
              options={projectOptions}
              value={effectiveProject}
              onChange={(e) => setProjectFilter(e.target.value)}
              selectSize="sm"
              className="w-64"
            />
            <SearchInput
              label="Search approvals"
              value={q}
              onValueChange={setQ}
              placeholder="Document no, vendor, project"
              className="w-72"
            />
            <div className="ml-auto flex items-center gap-2">
              {selected.size > 0 && (
                <StatusChip
                  label={`${selected.size} selected${bulkBlocked.length ? ` · ${bulkBlocked.length} blocked` : ''}`}
                  tone={bulkBlocked.length ? 'warning' : 'info'}
                />
              )}
              <span className="text-micro text-content-tertiary">
                Ordered by urgency, then value
              </span>
            </div>
          </Toolbar>
        </div>

        <div className="grid gap-2 p-4">
          {isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded border border-line bg-surface" />
            ))}

          {!isLoading && items.length === 0 && (
            <div className="rounded border border-line bg-surface">
              <EmptyState
                tone="success"
                icon={<CheckCheck aria-hidden />}
                title="Nothing is waiting on you"
                description="Every requisition, bill and payment in your queue has been decided. New items appear here the moment they are routed to you."
              />
            </div>
          )}

          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              expanded={expanded === item.id}
              onToggle={() => setExpanded((prev) => (prev === item.id ? null : item.id))}
              selected={selected.has(item.id)}
              onSelectChange={(next) =>
                setSelected((prev) => {
                  const copy = new Set(prev);
                  if (next) copy.add(item.id);
                  else copy.delete(item.id);
                  return copy;
                })
              }
              onDecide={(action) => beginDecision(item, action)}
              busy={busy}
            />
          ))}
        </div>
      </PageBody>

      {/* return / reject — reason mandatory */}
      <ConfirmDialog
        open={pending?.kind === 'decision' && pending.action !== 'approve'}
        onClose={() => setPending(null)}
        busy={busy}
        tone={pending?.kind === 'decision' && pending.action === 'reject' ? 'danger' : 'primary'}
        title={
          pending?.kind === 'decision'
            ? `${pending.action === 'reject' ? 'Reject' : 'Return'} ${pending.item.document_no}`
            : ''
        }
        description={
          pending?.kind === 'decision'
            ? `${pending.item.counterparty} · ${pending.item.title}`
            : undefined
        }
        confirmLabel={pending?.kind === 'decision' && pending.action === 'reject' ? 'Reject' : 'Return for correction'}
        requireReason
        reasonLabel="Reason"
        onConfirm={(reason) => pending && void runDecision(pending, reason)}
      />

      {/* bulk approve */}
      <ConfirmDialog
        open={pending?.kind === 'bulk'}
        onClose={() => setPending(null)}
        busy={busy}
        title={`Approve ${pending?.kind === 'bulk' ? pending.ids.length : 0} items`}
        description="Bulk approval applies the same decision to every selected item. Items with blocking exceptions are refused by the server."
        confirmLabel="Approve all"
        onConfirm={() => pending && void runDecision(pending, 'Bulk approved from inbox')}
      />

      {/* step-up authentication (Phase 6 §11) */}
      <Modal
        open={stepUp !== null}
        onClose={() => setStepUp(null)}
        title="Confirm with step-up authentication"
        description="High-value approvals require a second factor. Enter the 6-digit code from your authenticator app."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStepUp(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => {
                setOtpTouched(true);
                if (!/^\d{6}$/.test(otp)) return;
                if (stepUp) void runDecision(stepUp, 'Approved with step-up authentication');
              }}
            >
              Verify and approve
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {stepUp?.kind === 'decision' && (
            <div className="rounded border border-line bg-surface-subtle px-2.5 py-2 text-xs">
              <p className="font-medium text-content">{stepUp.item.document_no}</p>
              <p className="text-content-secondary">
                {stepUp.item.counterparty} · {stepUp.item.title}
              </p>
              <p className="mt-1 text-content-tertiary">
                Raised {formatRelative(stepUp.item.submitted_at)} · this action is recorded in the
                audit trail with your device and IP.
              </p>
            </div>
          )}
          <FormField
            label="Authentication code"
            required
            hint="6 digits. Any code is accepted in this prototype."
            error={otpTouched && !/^\d{6}$/.test(otp) ? 'Enter the 6-digit code.' : undefined}
          >
            <Input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              className="font-mono tracking-[0.4em]"
              invalid={otpTouched && !/^\d{6}$/.test(otp)}
              prefix={<ShieldCheck aria-hidden />}
            />
          </FormField>
        </div>
      </Modal>
    </>
  );
}
