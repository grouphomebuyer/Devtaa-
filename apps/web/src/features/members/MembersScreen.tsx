import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, FileSpreadsheet, Send, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DataGrid,
  EmptyState,
  KpiTile,
  Money,
  PageBody,
  PageHeader,
  Select,
  StatusChip,
  TileRow,
  Toolbar,
  cn,
  formatDate,
  formatMoneyCompact,
  formatPercent,
  parseAmount,
  useToast,
  type Column,
  type Tone,
} from '@/design';
import { useMemberObligations, usePaymentRunSummary, useSubmitPaymentRun } from '@/lib/queries';
import { AicosApiError, type MemberObligation } from '@/mocks/types';

const STATUS: Record<MemberObligation['status'], { label: string; tone: Tone }> = {
  due: { label: 'Due', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  partially_paid: { label: 'Part paid', tone: 'warning' },
  on_hold: { label: 'On hold', tone: 'warning' },
  blocked: { label: 'Blocked', tone: 'danger' },
};

const MONTHS = [
  { value: '2026-08', label: 'August 2026' },
  { value: '2026-07', label: 'July 2026 (released)' },
];

export function MembersScreen() {
  const toast = useToast();
  const [month, setMonth] = useState('2026-08');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);

  const { data: obligations = [], isLoading } = useMemberObligations(month);
  const { data: summary } = usePaymentRunSummary(month);
  const submit = useSubmitPaymentRun();

  const blocked = useMemo(
    () => obligations.filter((o) => o.exceptions.some((e) => e.severity === 'blocker')),
    [obligations],
  );
  const payable = useMemo(
    () => obligations.filter((o) => o.status === 'due' || o.status === 'partially_paid'),
    [obligations],
  );

  // Default the selection to everything payable — the accountant deselects,
  // rather than selecting 61 rows by hand.
  useEffect(() => {
    setSelected(new Set(payable.map((o) => o.id)));
  }, [payable]);

  const rows = showBlockedOnly ? blocked : obligations;
  const selectedRows = obligations.filter((o) => selected.has(o.id));
  const selectedGross = selectedRows.reduce((s, o) => s + parseAmount(o.gross_amount), 0);
  const selectedTds = selectedRows.reduce((s, o) => s + parseAmount(o.tds_amount), 0);
  const selectedNet = selectedRows.reduce((s, o) => s + parseAmount(o.net_amount), 0);

  const columns = useMemo<Column<MemberObligation>[]>(
    () => [
      {
        id: 'unit',
        header: 'Unit',
        width: '84px',
        cell: (r) => <span className="font-mono text-micro text-content-secondary">{r.unit_no}</span>,
        sortValue: (r) => r.unit_no,
        footer: () => 'Selected',
      },
      {
        id: 'member',
        header: 'Member',
        width: 'minmax(200px, 1.8fr)',
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content">{r.member_name}</p>
            {r.exceptions.length > 0 && (
              <p className="truncate text-micro text-danger">{r.exceptions[0].message}</p>
            )}
          </div>
        ),
        sortValue: (r) => r.member_name,
      },
      {
        id: 'status',
        header: 'Status',
        width: '104px',
        cell: (r) => <StatusChip label={STATUS[r.status].label} tone={STATUS[r.status].tone} size="sm" />,
        sortValue: (r) => r.status,
      },
      {
        id: 'gross',
        header: 'Gross',
        numeric: true,
        width: 'minmax(110px, 1fr)',
        cell: (r) => <Money value={r.gross_amount} />,
        sortValue: (r) => parseAmount(r.gross_amount),
        footer: () => <Money value={selectedGross} />,
      },
      {
        id: 'tds_rate',
        header: 'TDS %',
        numeric: true,
        width: '80px',
        cell: (r) => (
          <span className={cn('tnum', r.tds_rate_pct === 20 && 'font-medium text-danger')}>
            {formatPercent(r.tds_rate_pct, 0)}
          </span>
        ),
        sortValue: (r) => r.tds_rate_pct,
      },
      {
        id: 'tds',
        header: 'TDS',
        numeric: true,
        width: 'minmax(100px, 1fr)',
        cell: (r) => <Money value={r.tds_amount} />,
        sortValue: (r) => parseAmount(r.tds_amount),
        footer: () => <Money value={selectedTds} />,
      },
      {
        id: 'net',
        header: 'Net payable',
        numeric: true,
        width: 'minmax(120px, 1fr)',
        cell: (r) => <Money value={r.net_amount} strong />,
        sortValue: (r) => parseAmount(r.net_amount),
        footer: () => <Money value={selectedNet} strong />,
      },
      {
        id: 'bank',
        header: 'Bank a/c',
        width: '110px',
        cell: (r) =>
          r.bank_masked ? (
            <span className="font-mono text-micro text-content-secondary">{r.bank_masked}</span>
          ) : (
            <StatusChip label="Missing" tone="danger" size="sm" />
          ),
      },
      {
        id: 'pan',
        header: 'PAN',
        width: '110px',
        cell: (r) =>
          r.pan_masked ? (
            <span className="font-mono text-micro text-content-secondary">{r.pan_masked}</span>
          ) : (
            <StatusChip label="Missing" tone="danger" size="sm" />
          ),
      },
      {
        id: 'paid',
        header: 'Paid on',
        width: '110px',
        cell: (r) =>
          r.paid_on ? (
            <span className="tnum text-micro">{formatDate(r.paid_on)}</span>
          ) : (
            <span className="text-content-tertiary">—</span>
          ),
        sortValue: (r) => r.paid_on ?? '',
      },
    ],
    [selectedGross, selectedTds, selectedNet],
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/approvals' },
          { label: 'Society & members' },
          { label: 'Payment run' },
        ]}
        title="Member rent obligations"
        subtitle="Sai Sadan CHS Ltd · monthly alternate-accommodation rent under the development agreement"
        meta={
          summary && (
            <Badge tone={summary.status === 'draft' ? 'neutral' : 'info'}>
              Run status: {summary.status.replace(/_/g, ' ')}
            </Badge>
          )
        }
        actions={
          <>
            <Button variant="secondary" iconLeft={<FileSpreadsheet aria-hidden />}>
              Export
            </Button>
            <Button
              variant="primary"
              iconLeft={<Send aria-hidden />}
              disabled={selected.size === 0 || summary?.status !== 'draft'}
              onClick={() => setConfirmOpen(true)}
            >
              Submit run for approval
            </Button>
          </>
        }
      />

      <PageBody padded={false}>
        <div className="p-4 pb-0">
          <TileRow className="md:grid-cols-5">
            <KpiTile
              label="Members"
              value={summary?.member_count ?? '—'}
              caption={`${summary?.ready_count ?? 0} ready to pay`}
              tone="neutral"
              icon={<Users aria-hidden />}
            />
            <KpiTile
              label="Gross obligation"
              value={summary ? formatMoneyCompact(summary.gross_total) : '—'}
              caption="before deductions"
              tone="neutral"
            />
            <KpiTile
              label="TDS u/s 194-IB"
              value={summary ? formatMoneyCompact(summary.tds_total) : '—'}
              caption="deposited by the 30th"
              tone="info"
            />
            <KpiTile
              label="Net payable"
              value={summary ? formatMoneyCompact(summary.net_total) : '—'}
              caption={summary?.bank_account_label}
              tone="success"
              icon={<Banknote aria-hidden />}
            />
            <KpiTile
              label="Blocked"
              value={summary?.blocked_count ?? '—'}
              caption="fix before release"
              tone={summary && summary.blocked_count > 0 ? 'danger' : 'success'}
              icon={<AlertTriangle aria-hidden />}
              onDrill={() => setShowBlockedOnly(true)}
              drillLabel="Show only blocked members"
            />
          </TileRow>
        </div>

        {/* exceptions surfaced first (Phase 6 §5.7) */}
        {blocked.length > 0 && (
          <div className="px-4 pt-4">
            <Card className="border-danger-border">
              <CardHeader
                size="sm"
                title={`${blocked.length} member${blocked.length === 1 ? '' : 's'} cannot be paid this month`}
                description="These are excluded from the run. Each one names the fix."
                icon={<AlertTriangle aria-hidden className="text-danger" />}
                actions={
                  <Button
                    size="sm"
                    variant={showBlockedOnly ? 'primary' : 'secondary'}
                    onClick={() => setShowBlockedOnly((v) => !v)}
                  >
                    {showBlockedOnly ? 'Show all members' : 'Show only these'}
                  </Button>
                }
              />
              <CardBody padded={false}>
                <ul className="divide-y divide-line-subtle">
                  {blocked.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3.5 py-2">
                      <span className="font-mono text-micro text-content-tertiary">{m.unit_no}</span>
                      <span className="text-dense font-medium text-content">{m.member_name}</span>
                      <span className="text-dense text-danger">{m.exceptions[0]?.message}</span>
                      {m.exceptions[0]?.remedy && (
                        <span className="text-xs text-content-secondary">
                          {m.exceptions[0].remedy}
                        </span>
                      )}
                      <span className="ml-auto text-dense tnum text-content-secondary">
                        <Money value={m.gross_amount} />
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        )}

        <div className="mt-4">
          <Toolbar label="Payment run controls">
            <Select
              aria-label="Obligation month"
              options={MONTHS}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              selectSize="sm"
              className="w-48"
            />
            <Button
              size="sm"
              variant={showBlockedOnly ? 'primary' : 'secondary'}
              onClick={() => setShowBlockedOnly((v) => !v)}
            >
              {showBlockedOnly ? 'Showing blocked only' : 'All members'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set(payable.map((o) => o.id)))}
            >
              Select all payable
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            <div className="ml-auto flex items-center gap-3">
              <StatusChip
                label={`${selected.size} selected · net ${formatMoneyCompact(selectedNet)}`}
                tone="info"
              />
            </div>
          </Toolbar>
        </div>

        <div className="p-4">
          <Card className="overflow-hidden">
            {rows.length === 0 && !isLoading ? (
              <EmptyState
                title="No obligations for this month"
                description="Generate the obligation schedule from the member agreements to populate this run."
              />
            ) : (
              <DataGrid
                label="Member rent obligations"
                columns={columns}
                rows={rows}
                loading={isLoading}
                getRowId={(r) => r.id}
                density="compact"
                showFooter
                maxBodyHeight="calc(100vh - 460px)"
                selection={{ selected, onChange: setSelected }}
                rowClassName={(r) =>
                  r.exceptions.some((e) => e.severity === 'blocker') ? 'bg-danger-bg/40' : undefined
                }
              />
            )}
          </Card>
        </div>
      </PageBody>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        busy={submit.isPending}
        title={`Submit ${selected.size} obligations for approval`}
        description={`Gross ${formatMoneyCompact(selectedGross)} · TDS ${formatMoneyCompact(selectedTds)} · net ${formatMoneyCompact(selectedNet)} from ${summary?.bank_account_label ?? 'the operating account'}.`}
        confirmLabel="Submit run"
        requireReason={false}
        onConfirm={async () => {
          try {
            const result = await submit.mutateAsync({ month, ids: [...selected] });
            toast.success(
              `${result.document_no} submitted`,
              `${result.count} member payments queued for Director approval.`,
            );
            setConfirmOpen(false);
          } catch (err) {
            if (err instanceof AicosApiError) {
              const details = err.error.details as { members?: string[] } | undefined;
              toast.error(err.error.message, details?.members?.join(', '));
            } else {
              toast.error('The run could not be submitted.');
            }
            setConfirmOpen(false);
          }
        }}
      />
    </>
  );
}
