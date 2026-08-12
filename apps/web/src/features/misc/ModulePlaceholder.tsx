import { Link } from '@tanstack/react-router';
import { Construction } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, EmptyState, PageBody, PageHeader } from '@/design';

const MODULES: Record<string, { title: string; scope: string; screens: string[] }> = {
  procurement: {
    title: 'Procurement',
    scope: 'Phase 2 §4 · Phase 7 §6.3',
    screens: [
      'Requisition list and consolidation of open lines',
      'RFQ issue, quotation capture and comparative statement',
      'Purchase and work orders, amendments, short-close',
      'Vendor master, performance and bank-account maker–checker',
    ],
  },
  materials: {
    title: 'Materials & stock',
    scope: 'Phase 2 §5 · Phase 7 §6.4',
    screens: [
      'Goods receipt with inspection (offline-capable)',
      'Material issue, transfer and physical verification',
      'Stock balances and item ledger',
      'Project material reconciliation',
    ],
  },
  finance: {
    title: 'Invoices & payments',
    scope: 'Phase 2b · Phase 7 §6.6',
    screens: [
      'Invoice inbox with split viewer and three-way match',
      'Payment requests, runs and bank file generation',
      'General ledger, trial balance and project P&L',
      'Period close and reopen',
    ],
  },
  compliance: {
    title: 'Compliance',
    scope: 'Phase 12',
    screens: [
      'Statutory calendar (GST, TDS, PF/ESIC, RERA)',
      'GSTR-1 / GSTR-3B preparation and reconciliation with 2B',
      'TDS challans, returns and Form 16A',
      'RERA quarterly progress submissions',
    ],
  },
  site: {
    title: 'Site & contracts',
    scope: 'Phase 2c · Phase 7 §6.5',
    screens: [
      'Daily progress report (mobile-first, offline)',
      'Measurement books and RA bill computation',
      'Quality NCRs and labour records',
      'Contractor retention and advance recovery',
    ],
  },
  reports: {
    title: 'Reports',
    scope: 'Phase 6 §11',
    screens: [
      'Report catalogue with saved views',
      'Scheduled deliveries',
      'Exception dashboard',
    ],
  },
  admin: {
    title: 'Administration',
    scope: 'Phase 2 §9',
    screens: [
      'Users, roles and permissions',
      'Delegation of authority rules and simulation',
      'Workflow configuration',
      'Integrations health (Tally, GSP, WhatsApp, banks)',
    ],
  },
};

/**
 * Honest placeholder. These modules are fully specified in the design
 * documents but are outside this frontend slice — a dead link would be worse
 * than saying so.
 */
export function ModulePlaceholder({ moduleKey }: { moduleKey: string }) {
  const module = MODULES[moduleKey];

  if (!module) {
    return (
      <PageBody>
        <EmptyState
          icon={<Construction aria-hidden />}
          title="Unknown module"
          description={`No module is registered under “${moduleKey}”.`}
          action={
            <Link to="/approvals">
              <Button variant="primary">Back to approvals</Button>
            </Link>
          }
        />
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/approvals' }, { label: module.title }]}
        title={module.title}
        subtitle={`Specified in ${module.scope} — not implemented in this build.`}
      />
      <PageBody>
        <Card className="max-w-2xl">
          <CardHeader
            title="Not in this build"
            size="sm"
            icon={<Construction aria-hidden />}
          />
          <CardBody>
            <p className="text-dense text-content-secondary">
              This frontend slice implements the design system, the application shell and five
              screens: the approval inbox, the purchase requisition, the reconciliation workbench,
              project 360 and the member payment run. The module below is specified but has no UI
              here yet.
            </p>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-content-tertiary">
              Screens this module will contain
            </p>
            <ul className="mt-1.5 grid gap-1">
              {module.screens.map((s) => (
                <li key={s} className="flex gap-2 text-dense text-content">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-line-strong" />
                  {s}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
