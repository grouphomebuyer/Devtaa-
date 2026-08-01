import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Info,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataGrid,
  DetailItem,
  DetailList,
  EmptyState,
  KpiTile,
  Money,
  PageBody,
  PageHeader,
  StatusChip,
  TabPanel,
  Tabs,
  TileRow,
  cn,
  daysUntil,
  formatDate,
  formatMoneyCompact,
  formatPercent,
  formatRelative,
  groupIndian,
  parseAmount,
  type Column,
  type Tone,
} from '@/design';
import { useProject } from '@/lib/queries';
import type { CostHeadRollup, Milestone, ProjectDetail } from '@/mocks/types';
import { SCurve } from './SCurve';

const RAG: Record<ProjectDetail['rag'], { label: string; tone: Tone }> = {
  green: { label: 'On track', tone: 'success' },
  amber: { label: 'At risk', tone: 'warning' },
  red: { label: 'Critical', tone: 'danger' },
};

const MILESTONE_STATUS: Record<Milestone['status'], { label: string; tone: Tone }> = {
  completed: { label: 'Completed', tone: 'success' },
  in_progress: { label: 'In progress', tone: 'info' },
  delayed: { label: 'Delayed', tone: 'danger' },
  not_started: { label: 'Not started', tone: 'neutral' },
};

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'financials', label: 'Financials' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'alerts', label: 'Alerts' },
];

export function ProjectScreen({
  projectId,
  tab,
  onTabChange,
}: {
  projectId: string;
  tab: string;
  onTabChange: (tab: string) => void;
}) {
  const { data: project, isLoading, isError } = useProject(projectId);

  const costHeadColumns = useMemo<Column<CostHeadRollup>[]>(
    () => [
      {
        id: 'code',
        header: 'Code',
        width: '64px',
        cell: (r) => <span className="tnum text-content-tertiary">{r.code}</span>,
        sortValue: (r) => r.code,
      },
      {
        id: 'name',
        header: 'Cost head',
        width: 'minmax(220px, 2fr)',
        cell: (r) => <span className="font-medium">{r.name}</span>,
        sortValue: (r) => r.name,
        footer: () => 'Total',
      },
      {
        id: 'budget',
        header: 'Budget',
        numeric: true,
        width: 'minmax(110px, 1fr)',
        cell: (r) => <Money value={r.budget} />,
        sortValue: (r) => parseAmount(r.budget),
        footer: (rows) => <Money value={sum(rows, 'budget')} />,
      },
      {
        id: 'committed',
        header: 'Committed',
        numeric: true,
        width: 'minmax(110px, 1fr)',
        cell: (r) => <Money value={r.committed} />,
        sortValue: (r) => parseAmount(r.committed),
        footer: (rows) => <Money value={sum(rows, 'committed')} />,
      },
      {
        id: 'incurred',
        header: 'Incurred',
        numeric: true,
        width: 'minmax(110px, 1fr)',
        cell: (r) => <Money value={r.incurred} />,
        sortValue: (r) => parseAmount(r.incurred),
        footer: (rows) => <Money value={sum(rows, 'incurred')} />,
      },
      {
        id: 'available',
        header: 'Available',
        numeric: true,
        width: 'minmax(110px, 1fr)',
        cell: (r) => <Money value={r.available} />,
        sortValue: (r) => parseAmount(r.available),
        footer: (rows) => <Money value={sum(rows, 'available')} strong />,
      },
      {
        id: 'consumed',
        header: 'Consumed',
        width: 'minmax(140px, 1fr)',
        cell: (r) => (
          <div className="flex w-full items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-inset">
              <div
                className={cn(
                  'h-full',
                  r.consumed_pct > 95 ? 'bg-danger' : r.consumed_pct > 85 ? 'bg-warning' : 'bg-data-1',
                )}
                style={{ width: `${Math.min(100, r.consumed_pct)}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right tnum text-micro">
              {formatPercent(r.consumed_pct, 0)}
            </span>
          </div>
        ),
        sortValue: (r) => r.consumed_pct,
      },
      {
        id: 'variance',
        header: 'Variance',
        numeric: true,
        width: '90px',
        cell: (r) => (
          <span className={cn('tnum', r.variance_pct < 0 ? 'text-danger' : 'text-success')}>
            {r.variance_pct > 0 ? '+' : ''}
            {formatPercent(r.variance_pct, 1)}
          </span>
        ),
        sortValue: (r) => r.variance_pct,
      },
    ],
    [],
  );

  if (isError) {
    return (
      <PageBody>
        <EmptyState
          icon={<AlertTriangle aria-hidden />}
          title="Project not found"
          description="It may not exist, or it may not be visible under your access. Row-level security makes those two cases deliberately indistinguishable."
        />
      </PageBody>
    );
  }

  if (isLoading || !project) {
    return (
      <PageBody>
        <div className="grid gap-3">
          <div className="h-24 animate-pulse rounded border border-line bg-surface" />
          <div className="h-64 animate-pulse rounded border border-line bg-surface" />
        </div>
      </PageBody>
    );
  }

  const f = project.financials;
  const rag = RAG[project.rag];
  const scheduleVariance = project.physical_progress_pct - project.planned_progress_pct;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/approvals' },
          { label: 'Projects', to: '/projects' },
          { label: project.code },
        ]}
        title={project.name}
        subtitle={`${project.address} · RERA ${project.rera_registration} · Project manager ${project.project_manager}`}
        meta={
          <>
            <Badge tone="neutral">{project.code}</Badge>
            <StatusChip label={rag.label} tone={rag.tone} />
            <Badge tone="info">{project.engagement_model.replace(/_/g, ' ')}</Badge>
            <Badge tone="neutral">{project.status}</Badge>
          </>
        }
        actions={
          <>
            <Button variant="secondary" iconLeft={<Users aria-hidden />}>
              Members
            </Button>
            <Button variant="primary" iconRight={<ArrowUpRight aria-hidden />}>
              Open project ledger
            </Button>
          </>
        }
        tabs={
          <Tabs
            idPrefix="project"
            items={TABS}
            value={tab}
            onChange={onTabChange}
            label="Project sections"
          />
        }
      />

      <PageBody>
        <TabPanel id="overview" tabsId="project" active={tab === 'overview'}>
          <div className="grid gap-4">
            <TileRow className="md:grid-cols-5">
              <KpiTile
                label="Budget"
                value={formatMoneyCompact(f.budget)}
                caption="approved baseline"
                tone="neutral"
              />
              <KpiTile
                label="Committed"
                value={formatMoneyCompact(f.committed)}
                caption="open POs and work orders"
                tone="info"
              />
              <KpiTile
                label="Incurred"
                value={formatMoneyCompact(f.incurred)}
                caption={`${formatPercent(f.consumed_pct, 1)} of budget consumed`}
                tone={f.consumed_pct > 90 ? 'danger' : f.consumed_pct > 75 ? 'warning' : 'success'}
              />
              <KpiTile
                label="Available"
                value={formatMoneyCompact(f.available)}
                caption="uncommitted balance"
                tone="success"
              />
              <KpiTile
                label="Physical progress"
                value={formatPercent(project.physical_progress_pct, 1)}
                caption={`plan ${formatPercent(project.planned_progress_pct, 0)}`}
                tone={scheduleVariance < -3 ? 'danger' : scheduleVariance < 0 ? 'warning' : 'success'}
                delta={{ value: scheduleVariance, label: 'against plan' }}
              />
            </TileRow>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card>
                <CardHeader
                  title="Progress S-curve"
                  description="Planned versus actual, cumulative percent complete"
                  size="sm"
                />
                <CardBody>
                  <SCurve points={project.s_curve} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Budget position" size="sm" />
                <CardBody className="grid gap-3">
                  <BudgetStack project={project} />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line-subtle pt-3 text-dense">
                    <DetailItem label="Certified" numeric>
                      <Money value={f.certified} />
                    </DetailItem>
                    <DetailItem label="Paid" numeric>
                      <Money value={f.paid} />
                    </DetailItem>
                    <DetailItem label="Forecast at completion" numeric>
                      <Money value={f.forecast_at_completion} />
                    </DetailItem>
                    <DetailItem label="Variance at completion" numeric>
                      <Money value={f.variance_at_completion} variance signed />
                    </DetailItem>
                  </dl>
                </CardBody>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              <Card>
                <CardHeader title="Project facts" size="sm" icon={<Building2 aria-hidden />} />
                <CardBody>
                  <DetailList columns={2}>
                    <DetailItem label="Society">{project.society_name}</DetailItem>
                    <DetailItem label="Members" numeric>
                      {project.member_count || '—'}
                    </DetailItem>
                    <DetailItem label="Saleable area" numeric>
                      {groupIndian(project.saleable_area_sqft)} sq ft
                    </DetailItem>
                    <DetailItem label="Start">{formatDate(project.start_date)}</DetailItem>
                    <DetailItem label="Target completion">
                      {formatDate(project.target_completion)}
                    </DetailItem>
                    <DetailItem label="Forecast completion">
                      <span
                        className={cn(
                          project.forecast_completion > project.target_completion && 'text-danger',
                        )}
                      >
                        {formatDate(project.forecast_completion)}
                      </span>
                    </DetailItem>
                  </DetailList>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Open alerts"
                  size="sm"
                  actions={<Badge tone="warning">{project.alerts.length}</Badge>}
                />
                <CardBody padded={false}>
                  <AlertList project={project} limit={3} />
                </CardBody>
              </Card>
            </div>
          </div>
        </TabPanel>

        <TabPanel id="financials" tabsId="project" active={tab === 'financials'}>
          <Card>
            <CardHeader
              title="Budget by cost head"
              description="Budget vs committed vs incurred. Every number drills through to its transactions."
              size="sm"
              actions={<Button size="sm" variant="secondary">Export</Button>}
            />
            <DataGrid
              label="Budget by cost head"
              columns={costHeadColumns}
              rows={project.cost_heads}
              getRowId={(r) => r.id}
              density="default"
              showFooter
              initialSort={{ columnId: 'code', direction: 'asc' }}
            />
          </Card>
        </TabPanel>

        <TabPanel id="milestones" tabsId="project" active={tab === 'milestones'}>
          <Card>
            <CardHeader title="Milestones" size="sm" icon={<CalendarDays aria-hidden />} />
            <CardBody padded={false}>
              <ol className="divide-y divide-line-subtle">
                {project.milestones.map((m) => {
                  const meta = MILESTONE_STATUS[m.status];
                  const slip =
                    m.actual_date && m.actual_date > m.planned_date
                      ? daysUntil(m.actual_date, new Date(m.planned_date))
                      : null;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span
                        aria-hidden
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          m.status === 'completed'
                            ? 'bg-success'
                            : m.status === 'delayed'
                              ? 'bg-danger'
                              : m.status === 'in_progress'
                                ? 'bg-info'
                                : 'bg-line-strong',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-dense font-medium text-content">{m.name}</p>
                        <p className="text-micro text-content-tertiary">
                          Planned {formatDate(m.planned_date)}
                          {m.actual_date ? ` · actual ${formatDate(m.actual_date)}` : ''}
                          {slip ? ` · ${slip} days late` : ''}
                        </p>
                      </div>
                      <div className="hidden w-40 items-center gap-2 sm:flex">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-inset">
                          <div
                            className={cn(
                              'h-full',
                              m.status === 'delayed' ? 'bg-danger' : 'bg-data-1',
                            )}
                            style={{ width: `${m.progress_pct}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-micro tnum text-content-tertiary">
                          {m.progress_pct}%
                        </span>
                      </div>
                      <StatusChip label={meta.label} tone={meta.tone} size="sm" />
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel id="alerts" tabsId="project" active={tab === 'alerts'}>
          <Card>
            <CardHeader title="Exceptions and alerts" size="sm" />
            <CardBody padded={false}>
              <AlertList project={project} />
            </CardBody>
          </Card>
        </TabPanel>
      </PageBody>
    </>
  );
}

function sum(rows: CostHeadRollup[], key: keyof CostHeadRollup): number {
  return rows.reduce((s, r) => s + parseAmount(r[key] as string), 0);
}

function BudgetStack({ project }: { project: ProjectDetail }) {
  const f = project.financials;
  const budget = parseAmount(f.budget);
  const rows = [
    { label: 'Incurred', value: parseAmount(f.incurred), colour: 'bg-data-1' },
    { label: 'Committed (open orders)', value: parseAmount(f.committed), colour: 'bg-data-3' },
    { label: 'Available', value: parseAmount(f.available), colour: 'bg-data-2' },
  ];
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-sm bg-surface-inset"
        role="img"
        aria-label={`Budget ${formatMoneyCompact(f.budget)}: incurred ${formatMoneyCompact(f.incurred)}, committed ${formatMoneyCompact(f.committed)}, available ${formatMoneyCompact(f.available)}`}
      >
        {rows.map((r) => (
          <span
            key={r.label}
            className={r.colour}
            style={{ width: `${(r.value / budget) * 100}%` }}
          />
        ))}
      </div>
      <dl className="mt-2 grid gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-dense">
            <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-sm', r.colour)} />
            <dt className="min-w-0 flex-1 truncate text-content-secondary">{r.label}</dt>
            <dd className="tnum font-medium">
              <Money value={r.value} />
            </dd>
            <dd className="w-12 shrink-0 text-right tnum text-micro text-content-tertiary">
              {formatPercent((r.value / budget) * 100, 1)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AlertList({ project, limit }: { project: ProjectDetail; limit?: number }) {
  const alerts = limit ? project.alerts.slice(0, limit) : project.alerts;
  if (alerts.length === 0) {
    return (
      <EmptyState
        size="sm"
        tone="success"
        title="No open alerts"
        description="Budget, schedule and compliance checks are all clear for this project."
      />
    );
  }
  return (
    <ul className="divide-y divide-line-subtle">
      {alerts.map((a) => (
        <li key={a.id} className="flex gap-2.5 px-3.5 py-2.5">
          {a.severity === 'blocker' ? (
            <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          ) : a.severity === 'warning' ? (
            <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          ) : (
            <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  a.severity === 'blocker' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info'
                }
              >
                {a.category}
              </Badge>
              <span className="text-micro text-content-tertiary">{formatRelative(a.raised_at)}</span>
            </div>
            <p className="mt-0.5 text-dense text-content">{a.message}</p>
            {a.remedy && <p className="mt-0.5 text-xs text-content-secondary">{a.remedy}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
