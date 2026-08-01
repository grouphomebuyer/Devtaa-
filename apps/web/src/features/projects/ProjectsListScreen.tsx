import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Card,
  DataGrid,
  Money,
  PageBody,
  PageHeader,
  SearchInput,
  StatusChip,
  Toolbar,
  cn,
  formatDate,
  formatPercent,
  parseAmount,
  type Column,
  type Tone,
} from '@/design';
import { useProjects } from '@/lib/queries';
import type { ProjectDetail } from '@/mocks/types';

const RAG: Record<ProjectDetail['rag'], { label: string; tone: Tone }> = {
  green: { label: 'On track', tone: 'success' },
  amber: { label: 'At risk', tone: 'warning' },
  red: { label: 'Critical', tone: 'danger' },
};

export function ProjectsListScreen() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  const [q, setQ] = useState('');

  const rows = useMemo(
    () =>
      projects.filter((p) =>
        `${p.code} ${p.name} ${p.city}`.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [projects, q],
  );

  const columns = useMemo<Column<ProjectDetail>[]>(
    () => [
      {
        id: 'code',
        header: 'Code',
        width: '70px',
        cell: (r) => <span className="font-mono text-micro text-content-tertiary">{r.code}</span>,
        sortValue: (r) => r.code,
      },
      {
        id: 'name',
        header: 'Project',
        width: 'minmax(260px, 2.2fr)',
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-content">{r.name}</p>
            <p className="truncate text-micro text-content-tertiary">
              {r.city} · {r.engagement_model.replace(/_/g, ' ')} · {r.society_name}
            </p>
          </div>
        ),
        sortValue: (r) => r.name,
        footer: () => 'Portfolio total',
      },
      {
        id: 'rag',
        header: 'Health',
        width: '110px',
        cell: (r) => <StatusChip label={RAG[r.rag].label} tone={RAG[r.rag].tone} size="sm" />,
        sortValue: (r) => r.rag,
      },
      {
        id: 'progress',
        header: 'Progress',
        width: 'minmax(150px, 1fr)',
        cell: (r) => {
          const variance = r.physical_progress_pct - r.planned_progress_pct;
          return (
            <div className="flex w-full items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-inset">
                <div
                  className={cn('h-full', variance < -3 ? 'bg-danger' : 'bg-data-1')}
                  style={{ width: `${r.physical_progress_pct}%` }}
                />
              </div>
              <span className="w-11 shrink-0 text-right tnum text-micro">
                {formatPercent(r.physical_progress_pct, 0)}
              </span>
            </div>
          );
        },
        sortValue: (r) => r.physical_progress_pct,
      },
      {
        id: 'budget',
        header: 'Budget',
        numeric: true,
        width: 'minmax(120px, 1fr)',
        cell: (r) => <Money value={r.financials.budget} compact />,
        sortValue: (r) => parseAmount(r.financials.budget),
        footer: (rs) => <Money value={rs.reduce((s, r) => s + parseAmount(r.financials.budget), 0)} compact />,
      },
      {
        id: 'committed',
        header: 'Committed',
        numeric: true,
        width: 'minmax(120px, 1fr)',
        cell: (r) => <Money value={r.financials.committed} compact />,
        sortValue: (r) => parseAmount(r.financials.committed),
        footer: (rs) => (
          <Money value={rs.reduce((s, r) => s + parseAmount(r.financials.committed), 0)} compact />
        ),
      },
      {
        id: 'incurred',
        header: 'Incurred',
        numeric: true,
        width: 'minmax(120px, 1fr)',
        cell: (r) => <Money value={r.financials.incurred} compact />,
        sortValue: (r) => parseAmount(r.financials.incurred),
        footer: (rs) => (
          <Money value={rs.reduce((s, r) => s + parseAmount(r.financials.incurred), 0)} compact />
        ),
      },
      {
        id: 'consumed',
        header: 'Consumed',
        numeric: true,
        width: '100px',
        cell: (r) => (
          <span
            className={cn(
              'tnum',
              r.financials.consumed_pct > 90
                ? 'text-danger'
                : r.financials.consumed_pct > 75
                  ? 'text-warning'
                  : 'text-content',
            )}
          >
            {formatPercent(r.financials.consumed_pct, 1)}
          </span>
        ),
        sortValue: (r) => r.financials.consumed_pct,
      },
      {
        id: 'completion',
        header: 'Forecast completion',
        width: '150px',
        cell: (r) => (
          <span
            className={cn(
              'tnum',
              r.forecast_completion > r.target_completion && 'text-danger',
            )}
          >
            {formatDate(r.forecast_completion)}
          </span>
        ),
        sortValue: (r) => r.forecast_completion,
      },
      {
        id: 'alerts',
        header: 'Alerts',
        numeric: true,
        width: '70px',
        cell: (r) => (
          <span className={cn('tnum', r.alerts.length > 0 && 'font-medium text-warning')}>
            {r.alerts.length}
          </span>
        ),
        sortValue: (r) => r.alerts.length,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/approvals' }, { label: 'Projects' }]}
        title="Projects"
        subtitle="Portfolio position across every legal entity. Open a project for the full 360 view."
      />
      <PageBody padded={false}>
        <Toolbar label="Project filters">
          <SearchInput
            label="Search projects"
            value={q}
            onValueChange={setQ}
            placeholder="Project name, code or city"
            className="w-80"
          />
          <span className="ml-auto text-micro text-content-tertiary">
            {rows.length} project{rows.length === 1 ? '' : 's'} · double-click or press Enter to open
          </span>
        </Toolbar>
        <div className="p-4">
          <Card className="overflow-hidden">
            <DataGrid
              label="Projects"
              columns={columns}
              rows={rows}
              loading={isLoading}
              getRowId={(r) => r.id}
              showFooter
              onRowActivate={(r) =>
                void navigate({ to: '/projects/$projectId', params: { projectId: r.id } })
              }
              initialSort={{ columnId: 'code', direction: 'asc' }}
            />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
