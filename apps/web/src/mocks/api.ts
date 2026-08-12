/**
 * The AI-COS client API.
 *
 * `AicosApi` is the contract every screen codes against. Below it there is
 * exactly one implementation — an in-memory mock that mirrors the shapes and
 * the error envelope of Phase 7. **Swapping to the real backend is a change to
 * this file only**: replace `mockApi` with an HTTP implementation that adds
 * `Authorization`, `X-Tenant-Id`, `X-Company-Id` and `Idempotency-Key` headers,
 * and every screen keeps working unchanged.
 *
 * Nothing outside this folder may know that the data is mocked.
 */
import {
  APPROVALS,
  BOQ_LINES,
  BOQ_TREND,
  COMPANIES,
  ITEMS,
  MATCH_CANDIDATES,
  MEMBER_OBLIGATIONS,
  NOTIFICATIONS,
  PROJECTS,
  PROJECT_DETAILS,
  RECON_SESSION,
  STATEMENT_LINES,
  STORES,
  USER,
} from './fixtures';
import {
  AicosApiError,
  type ApprovalDecision,
  type ApprovalInboxSummary,
  type ApprovalItem,
  type BankStatementLine,
  type BoqLine,
  type BudgetAvailability,
  type Collection,
  type ItemMaster,
  type MatchCandidate,
  type MemberObligation,
  type Notification,
  type PaymentRunSummary,
  type ProjectDetail,
  type ReconciliationSession,
  type ReconLineStatus,
  type RequisitionCreated,
  type RequisitionInput,
  type SessionContext,
  type Store,
  type Uuid,
} from './types';

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

export interface AicosApi {
  /** `GET /v1/me` */
  getSession(): Promise<SessionContext>;
  getNotifications(): Promise<Notification[]>;
  markNotificationRead(id: Uuid): Promise<void>;

  /** `GET /approvals/inbox` */
  getApprovalInbox(filters?: {
    document_type?: string;
    project_id?: string;
    q?: string;
  }): Promise<Collection<ApprovalItem>>;
  getApprovalSummary(): Promise<ApprovalInboxSummary>;
  /** `POST /approvals/{id}/approve|reject|return` */
  decideApproval(decision: ApprovalDecision): Promise<{ id: Uuid; status: string }>;
  /** `POST /approvals/bulk-approve` */
  bulkApprove(ids: Uuid[], remarks: string): Promise<{ approved: number }>;

  /** `GET /items` */
  searchItems(q: string): Promise<ItemMaster[]>;
  getBoqLines(projectId: Uuid): Promise<BoqLine[]>;
  getStores(projectId: Uuid): Promise<Store[]>;
  /** `GET /boq-lines/{id}/budget-availability` */
  getBudgetAvailability(boqLineId: Uuid, requested: number): Promise<BudgetAvailability>;
  /** `POST /purchase-requisitions` */
  createRequisition(input: RequisitionInput): Promise<RequisitionCreated>;

  /** `GET /bank-statements/{id}/lines` */
  getReconciliationSession(): Promise<ReconciliationSession>;
  getStatementLines(): Promise<BankStatementLine[]>;
  /** `GET /reconciliation/suggestions?line_id=` */
  getMatchCandidates(lineId: Uuid): Promise<MatchCandidate[]>;
  /** `POST /reconciliation/matches` */
  matchLine(lineId: Uuid, candidateId: Uuid): Promise<BankStatementLine>;
  /** `DELETE /reconciliation/matches/{id}` */
  unmatchLine(lineId: Uuid): Promise<BankStatementLine>;
  ignoreLine(lineId: Uuid, reason: string): Promise<BankStatementLine>;
  autoMatch(threshold: number): Promise<{ matched: number; lines: BankStatementLine[] }>;

  /** `GET /projects` */
  listProjects(): Promise<ProjectDetail[]>;
  /** `GET /projects/{id}` */
  getProject(projectId: Uuid): Promise<ProjectDetail>;

  /** `GET /projects/{id}/obligations?month=` */
  getMemberObligations(month: string): Promise<MemberObligation[]>;
  getPaymentRunSummary(month: string): Promise<PaymentRunSummary>;
  /** `POST /obligation-runs/{id}/submit` */
  submitPaymentRun(month: string, ids: Uuid[]): Promise<{ document_no: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

const LATENCY_MS = 220;

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function fail(status: number, code: string, message: string, extra?: Partial<{ rule_code: string; details: Record<string, unknown> }>): never {
  throw new AicosApiError(status, {
    code,
    message,
    trace_id: `01J${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    ...extra,
  });
}

const num = (v: string | number) => (typeof v === 'number' ? v : Number(v));
const money = (v: number) => v.toFixed(4);

/** Mutable session state, so actions in the UI have real consequences. */
const state = {
  approvals: [...APPROVALS],
  lines: STATEMENT_LINES.map((l) => ({ ...l })),
  obligations: MEMBER_OBLIGATIONS.map((o) => ({ ...o })),
  notifications: NOTIFICATIONS.map((n) => ({ ...n })),
  reconMatched: RECON_SESSION.matched_lines,
  runStatus: 'draft' as PaymentRunSummary['status'],
  requisitionSeq: 196,
};

export const mockApi: AicosApi = {
  async getSession() {
    return delay<SessionContext>({
      user: USER,
      companies: COMPANIES,
      projects: PROJECTS,
      financial_year: '26-27',
    });
  },

  async getNotifications() {
    return delay(state.notifications);
  },

  async markNotificationRead(id) {
    state.notifications = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    return delay(undefined, 60);
  },

  async getApprovalInbox(filters = {}) {
    const q = filters.q?.trim().toLowerCase();
    const rows = state.approvals.filter((a) => {
      if (filters.document_type && filters.document_type !== 'all' && a.document_type !== filters.document_type)
        return false;
      if (filters.project_id && filters.project_id !== 'all' && a.project_id !== filters.project_id)
        return false;
      if (q) {
        const hay = `${a.document_no} ${a.title} ${a.counterparty} ${a.project_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Ordered by urgency, then value (Phase 6 §5.1).
    const rank = { critical: 0, high: 1, normal: 2 } as const;
    rows.sort((a, b) => rank[a.urgency] - rank[b.urgency] || num(b.amount) - num(a.amount));

    return delay<Collection<ApprovalItem>>({
      data: rows,
      meta: { count: rows.length, has_more: false, next_cursor: null },
    });
  },

  async getApprovalSummary() {
    const nowMs = Date.now();
    const awaiting = state.approvals;
    return delay<ApprovalInboxSummary>({
      awaiting_count: awaiting.length,
      awaiting_value: money(awaiting.reduce((s, a) => s + num(a.amount), 0)),
      overdue_count: awaiting.filter((a) => new Date(a.sla_due_at).getTime() < nowMs).length,
      exception_count: awaiting.reduce(
        (s, a) => s + a.exceptions.filter((e) => e.severity !== 'info').length,
        0,
      ),
      cash_position: '3822975.0000',
      cash_delta_pct: -4.2,
    });
  },

  async decideApproval({ approval_id, action, remarks }) {
    const item = state.approvals.find((a) => a.id === approval_id);
    if (!item) fail(404, 'NOT_FOUND', 'Approval not found or no longer visible.');
    if (action !== 'approve' && remarks.trim().length < 3) {
      fail(422, 'REMARKS_REQUIRED', 'A reason is required to return or reject.', {
        rule_code: 'BR-114',
      });
    }
    if (action === 'approve') {
      const blocker = item.exceptions.find((e) => e.severity === 'blocker');
      if (blocker) {
        fail(422, blocker.code, blocker.message, {
          rule_code: 'BR-001',
          details: { remedy: blocker.remedy },
        });
      }
    }
    state.approvals = state.approvals.filter((a) => a.id !== approval_id);
    return delay({ id: approval_id, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'returned' }, 420);
  },

  async bulkApprove(ids, _remarks) {
    void _remarks;
    const blocked = state.approvals.filter(
      (a) => ids.includes(a.id) && a.exceptions.some((e) => e.severity === 'blocker'),
    );
    if (blocked.length > 0) {
      fail(422, 'BULK_BLOCKED', `${blocked.length} of ${ids.length} items have blocking exceptions and cannot be bulk-approved.`, {
        rule_code: 'BR-002',
        details: { blocked_document_nos: blocked.map((b) => b.document_no) },
      });
    }
    state.approvals = state.approvals.filter((a) => !ids.includes(a.id));
    return delay({ approved: ids.length }, 500);
  },

  async searchItems(q) {
    const needle = q.trim().toLowerCase();
    const rows = needle
      ? ITEMS.filter(
          (i) =>
            i.name.toLowerCase().includes(needle) ||
            i.code.toLowerCase().includes(needle) ||
            i.category.toLowerCase().includes(needle),
        )
      : ITEMS;
    return delay(rows.slice(0, 12), 120);
  },

  async getBoqLines(projectId) {
    return delay(BOQ_LINES.filter((b) => b.project_id === projectId));
  },

  async getStores(projectId) {
    return delay(STORES.filter((s) => s.project_id === projectId), 80);
  },

  async getBudgetAvailability(boqLineId, requested) {
    const line = BOQ_LINES.find((b) => b.id === boqLineId);
    if (!line) fail(404, 'NOT_FOUND', 'BOQ line not found.');
    const available = num(line.available);
    const budget = num(line.budget);
    const after = available - requested;
    return delay<BudgetAvailability>(
      {
        boq_line_id: line.id,
        boq_line_code: line.code,
        boq_line_name: line.name,
        budget: line.budget,
        committed: line.committed,
        incurred: line.incurred,
        available: line.available,
        requested: money(requested),
        after_request: money(after),
        breach: after < 0,
        consumed_pct: budget > 0 ? ((num(line.committed) + num(line.incurred)) / budget) * 100 : 0,
        trend: BOQ_TREND[line.id] ?? [],
      },
      160,
    );
  },

  async createRequisition(input) {
    if (input.lines.length === 0) {
      fail(422, 'NO_LINES', 'Add at least one line before submitting.', { rule_code: 'BR-040' });
    }
    const breaches = input.lines
      .map((l) => {
        const boq = BOQ_LINES.find((b) => b.id === l.boq_line_id);
        if (!boq) return null;
        const value = l.quantity * l.estimated_rate;
        return value > num(boq.available)
          ? { line: boq.code, available: boq.available, requested: money(value) }
          : null;
      })
      .filter(Boolean);

    if (breaches.length > 0) {
      fail(422, 'BUDGET_EXCEEDED', 'One or more lines exceed the available budget.', {
        rule_code: 'BR-001',
        details: { breaches },
      });
    }

    state.requisitionSeq += 1;
    const seq = String(state.requisitionSeq).padStart(5, '0');
    const project = PROJECTS.find((p) => p.id === input.project_id);
    return delay<RequisitionCreated>(
      {
        id: `pr-${seq}`,
        document_no: `PR/DEVT/${project?.code ?? 'GEN'}/26-27/${seq}`,
        status: 'pending_approval',
        routed_to: input.priority === 'urgent' ? 'Director (Rajesh Devtaa)' : 'Project Manager (Sandeep Kulkarni)',
        expected_decision_by: new Date(Date.now() + 8 * 3_600_000).toISOString(),
      },
      520,
    );
  },

  async getReconciliationSession() {
    const matched = state.lines.filter((l) => l.status === 'matched').length;
    return delay<ReconciliationSession>({
      ...RECON_SESSION,
      matched_lines: RECON_SESSION.matched_lines - 3 + matched,
      ignored_lines: state.lines.filter((l) => l.status === 'ignored').length + 3,
    });
  },

  async getStatementLines() {
    return delay(state.lines);
  },

  async getMatchCandidates(lineId) {
    return delay(
      MATCH_CANDIDATES.filter((c) => c.line_id === lineId).sort((a, b) => b.confidence - a.confidence),
      120,
    );
  },

  async matchLine(lineId, candidateId) {
    const candidate = MATCH_CANDIDATES.find((c) => c.id === candidateId);
    if (!candidate) fail(404, 'NOT_FOUND', 'Match candidate no longer available.');
    return setLineStatus(lineId, 'matched', candidate.voucher_no);
  },

  async unmatchLine(lineId) {
    return setLineStatus(lineId, 'unmatched', null);
  },

  async ignoreLine(lineId, reason) {
    if (reason.trim().length < 3) {
      fail(422, 'REASON_REQUIRED', 'Ignoring a statement line requires a reason.', {
        rule_code: 'BR-221',
      });
    }
    return setLineStatus(lineId, 'ignored', null);
  },

  async autoMatch(threshold) {
    let matched = 0;
    state.lines = state.lines.map((l) => {
      if (l.status === 'suggested' && (l.best_confidence ?? 0) >= threshold) {
        matched += 1;
        const candidate = MATCH_CANDIDATES.filter((c) => c.line_id === l.id).sort(
          (a, b) => b.confidence - a.confidence,
        )[0];
        return { ...l, status: 'matched' as ReconLineStatus, matched_voucher_no: candidate?.voucher_no ?? null };
      }
      return l;
    });
    return delay({ matched, lines: state.lines }, 640);
  },

  async listProjects() {
    return delay(PROJECTS.map((p) => PROJECT_DETAILS[p.id]).filter(Boolean));
  },

  async getProject(projectId) {
    const project = PROJECT_DETAILS[projectId];
    if (!project) fail(404, 'NOT_FOUND', 'Project not found or not visible under your access.');
    return delay(project);
  },

  async getMemberObligations(month) {
    return delay(state.obligations.filter((o) => o.month === month || month === 'all'));
  },

  async getPaymentRunSummary(month) {
    const rows = state.obligations.filter((o) => o.month === month);
    const payable = rows.filter((o) => o.status === 'due' || o.status === 'partially_paid');
    const blocked = rows.filter((o) => o.status === 'blocked' || o.status === 'on_hold');
    return delay<PaymentRunSummary>({
      month,
      member_count: rows.length,
      ready_count: payable.length,
      blocked_count: blocked.length,
      gross_total: money(payable.reduce((s, o) => s + num(o.gross_amount), 0)),
      tds_total: money(payable.reduce((s, o) => s + num(o.tds_amount), 0)),
      net_total: money(payable.reduce((s, o) => s + num(o.net_amount), 0)),
      status: state.runStatus,
      bank_account_label: 'HDFC Bank — Current ••••4417',
    });
  },

  async submitPaymentRun(month, ids) {
    const blocked = state.obligations.filter(
      (o) => ids.includes(o.id) && o.exceptions.some((e) => e.severity === 'blocker'),
    );
    if (blocked.length > 0) {
      fail(422, 'OBLIGATION_BLOCKED', `${blocked.length} selected member(s) have blocking exceptions.`, {
        rule_code: 'BR-310',
        details: { members: blocked.map((b) => b.member_name) },
      });
    }
    state.runStatus = 'pending_approval';
    return delay(
      { document_no: `RUN/DEVT/GKS/26-27/${month.slice(5)}01`, count: ids.length },
      560,
    );
  },
};

function setLineStatus(
  lineId: Uuid,
  status: ReconLineStatus,
  voucher: string | null,
): Promise<BankStatementLine> {
  let updated: BankStatementLine | undefined;
  state.lines = state.lines.map((l) => {
    if (l.id !== lineId) return l;
    updated = { ...l, status, matched_voucher_no: voucher };
    return updated;
  });
  if (!updated) fail(404, 'NOT_FOUND', 'Statement line not found.');
  return delay(updated, 140);
}

/**
 * The application's API handle.
 *
 * ⚠️ SINGLE SWAP POINT — to go live, change this one line to
 * `export const api: AicosApi = createHttpApi(import.meta.env.VITE_API_BASE_URL);`
 */
export const api: AicosApi = mockApi;
