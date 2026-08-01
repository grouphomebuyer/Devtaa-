/**
 * Wire types for AI-COS.
 *
 * These mirror the conventions in Phase 7 §2 exactly, so the mock layer and
 * the real API are interchangeable:
 *   • `snake_case` field names (one vocabulary from DB to UI)
 *   • money as **string** decimals, never JSON numbers
 *   • `date` as `YYYY-MM-DD`, timestamps as RFC 3339 UTC
 *   • ids are opaque strings (UUID v7 in production)
 */

export type Uuid = string;
export type IsoDate = string; // YYYY-MM-DD
export type IsoTimestamp = string; // RFC 3339 UTC
export type Money = string; // "425000.0000"

/** Phase 7 §4 collection envelope. */
export interface Collection<T> {
  data: T[];
  meta: { count: number; has_more: boolean; next_cursor: string | null };
}

/** Phase 7 §4 error envelope. */
export interface ApiError {
  code: string;
  message: string;
  rule_code?: string;
  details?: Record<string, unknown>;
  field_errors?: { field: string; code: string; message: string }[];
  trace_id: string;
}

export class AicosApiError extends Error {
  readonly error: ApiError;
  readonly status: number;
  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'AicosApiError';
    this.status = status;
    this.error = error;
  }
}

// ---------------------------------------------------------------------------
// Session context
// ---------------------------------------------------------------------------

export interface Company {
  id: Uuid;
  name: string;
  short_name: string;
  gstin: string;
  state: string;
}

export interface ProjectRef {
  id: Uuid;
  code: string;
  name: string;
  city: string;
  status: ProjectStatus;
  engagement_model: 'redevelopment' | 'own_development' | 'contracting' | 'joint_venture';
}

export type ProjectStatus = 'planning' | 'execution' | 'handover' | 'closed' | 'on_hold';

export interface CurrentUser {
  id: Uuid;
  name: string;
  role_label: string;
  email: string;
  permissions: string[];
  default_company_id: Uuid;
}

export interface SessionContext {
  user: CurrentUser;
  companies: Company[];
  projects: ProjectRef[];
  financial_year: string; // "25-26"
}

// ---------------------------------------------------------------------------
// Approvals (Phase 7 §6.8, Phase 6 §5.1)
// ---------------------------------------------------------------------------

export type ApprovalDocumentType =
  | 'payment_request'
  | 'purchase_requisition'
  | 'purchase_order'
  | 'ra_bill'
  | 'budget_deviation'
  | 'obligation_run'
  | 'vendor_bank_account';

export type Urgency = 'critical' | 'high' | 'normal';

export interface AiSummaryLine {
  /** Short label shown in the left gutter of the summary block. */
  label: string;
  text: string;
  tone: 'neutral' | 'positive' | 'caution' | 'negative';
}

export interface ApprovalException {
  code: string;
  severity: 'blocker' | 'warning' | 'info';
  message: string;
  /** UX-7: the fix travels with the error. */
  remedy?: string;
}

export interface MoneyImpact {
  gross: Money;
  deductions: { label: string; amount: Money; note?: string }[];
  net: Money;
  /** Cash balance after this payment releases. */
  cash_after?: Money;
}

export interface BudgetImpact {
  boq_line_code: string;
  boq_line_name: string;
  budget: Money;
  committed: Money;
  incurred: Money;
  available: Money;
  consumed_pct: number;
  breach: boolean;
}

export interface ApprovalItem {
  id: Uuid;
  document_type: ApprovalDocumentType;
  document_id: Uuid;
  document_no: string;
  title: string;
  counterparty: string;
  project_id: Uuid;
  project_name: string;
  amount: Money;
  currency_code: 'INR';
  submitted_at: IsoTimestamp;
  submitted_by: string;
  urgency: Urgency;
  sla_due_at: IsoTimestamp;
  step_up_required: boolean;
  subtitle_lines: string[];
  ai_summary: AiSummaryLine[];
  ai_confidence: number;
  exceptions: ApprovalException[];
  money_impact?: MoneyImpact;
  budget_impact?: BudgetImpact;
  linked_documents: { label: string; document_no: string; kind: string }[];
  approval_chain: { step: number; role: string; user: string; status: 'done' | 'current' | 'pending'; acted_at?: IsoTimestamp }[];
}

export interface ApprovalDecision {
  approval_id: Uuid;
  action: 'approve' | 'reject' | 'return';
  remarks: string;
}

export interface ApprovalInboxSummary {
  awaiting_count: number;
  awaiting_value: Money;
  overdue_count: number;
  exception_count: number;
  cash_position: Money;
  cash_delta_pct: number;
}

// ---------------------------------------------------------------------------
// Procurement — purchase requisition (Phase 7 §6.3, Phase 6 §5.5)
// ---------------------------------------------------------------------------

export interface ItemMaster {
  id: Uuid;
  code: string;
  name: string;
  category: string;
  uom: string;
  last_rate: Money | null;
  last_purchased_at: IsoDate | null;
  hsn_code: string;
  default_boq_line_id: Uuid | null;
}

export interface BoqLine {
  id: Uuid;
  project_id: Uuid;
  code: string;
  name: string;
  uom: string;
  budget: Money;
  committed: Money;
  incurred: Money;
  available: Money;
}

export interface BudgetAvailability {
  boq_line_id: Uuid;
  boq_line_code: string;
  boq_line_name: string;
  budget: Money;
  committed: Money;
  incurred: Money;
  available: Money;
  requested: Money;
  after_request: Money;
  breach: boolean;
  consumed_pct: number;
  /** Rolling 6-month spend on this line, oldest first — sparkline data. */
  trend: number[];
}

export interface RequisitionLineInput {
  item_id: Uuid;
  boq_line_id: Uuid;
  quantity: number;
  estimated_rate: number;
  required_by: IsoDate;
  remarks?: string;
}

export interface RequisitionInput {
  project_id: Uuid;
  store_id: Uuid;
  priority: 'normal' | 'urgent';
  justification: string;
  lines: RequisitionLineInput[];
}

export interface RequisitionCreated {
  id: Uuid;
  document_no: string;
  status: 'draft' | 'pending_approval';
  routed_to: string;
  expected_decision_by: IsoTimestamp;
}

export interface Store {
  id: Uuid;
  name: string;
  project_id: Uuid;
}

// ---------------------------------------------------------------------------
// Bank reconciliation (Phase 7 §6.6, Phase 6 §5.2)
// ---------------------------------------------------------------------------

export type ReconLineStatus = 'unmatched' | 'suggested' | 'matched' | 'ignored';

export interface BankStatementLine {
  id: Uuid;
  txn_date: IsoDate;
  value_date: IsoDate;
  narration: string;
  reference: string;
  debit: Money | null;
  credit: Money | null;
  balance: Money;
  status: ReconLineStatus;
  /** 0–1; the confidence of the best candidate. */
  best_confidence: number | null;
  matched_voucher_no: string | null;
}

export interface MatchCandidate {
  id: Uuid;
  line_id: Uuid;
  voucher_no: string;
  voucher_type: 'payment_voucher' | 'receipt' | 'journal' | 'contra';
  party: string;
  project_name: string | null;
  amount: Money;
  voucher_date: IsoDate;
  confidence: number;
  /** Why the engine believes this matches — never a black box (UX-5). */
  reasons: { label: string; matched: boolean }[];
}

export interface ReconciliationSession {
  statement_id: Uuid;
  bank_account_label: string;
  period_from: IsoDate;
  period_to: IsoDate;
  opening_balance: Money;
  closing_balance: Money;
  total_lines: number;
  matched_lines: number;
  ignored_lines: number;
  book_balance: Money;
  unreconciled_difference: Money;
}

// ---------------------------------------------------------------------------
// Project 360 (Phase 6 §5.8)
// ---------------------------------------------------------------------------

export interface ProjectFinancials {
  budget: Money;
  committed: Money;
  incurred: Money;
  certified: Money;
  paid: Money;
  available: Money;
  consumed_pct: number;
  forecast_at_completion: Money;
  variance_at_completion: Money;
}

export interface CostHeadRollup {
  id: Uuid;
  code: string;
  name: string;
  budget: Money;
  committed: Money;
  incurred: Money;
  available: Money;
  consumed_pct: number;
  variance_pct: number;
}

export interface Milestone {
  id: Uuid;
  name: string;
  planned_date: IsoDate;
  actual_date: IsoDate | null;
  status: 'completed' | 'in_progress' | 'delayed' | 'not_started';
  progress_pct: number;
}

export interface SCurvePoint {
  month: string; // "Apr 25"
  planned_pct: number;
  actual_pct: number | null;
}

export interface ProjectAlert {
  id: Uuid;
  severity: 'blocker' | 'warning' | 'info';
  category: string;
  message: string;
  remedy?: string;
  raised_at: IsoTimestamp;
}

export interface ProjectDetail {
  id: Uuid;
  code: string;
  name: string;
  city: string;
  address: string;
  status: ProjectStatus;
  engagement_model: ProjectRef['engagement_model'];
  rag: 'green' | 'amber' | 'red';
  start_date: IsoDate;
  target_completion: IsoDate;
  forecast_completion: IsoDate;
  physical_progress_pct: number;
  planned_progress_pct: number;
  society_name: string;
  member_count: number;
  saleable_area_sqft: number;
  rera_registration: string;
  project_manager: string;
  financials: ProjectFinancials;
  cost_heads: CostHeadRollup[];
  milestones: Milestone[];
  s_curve: SCurvePoint[];
  alerts: ProjectAlert[];
}

// ---------------------------------------------------------------------------
// Society & members (Phase 7 §6.7, Phase 6 §5.7)
// ---------------------------------------------------------------------------

export type ObligationStatus = 'due' | 'paid' | 'on_hold' | 'blocked' | 'partially_paid';

export interface MemberObligation {
  id: Uuid;
  member_id: Uuid;
  member_name: string;
  unit_no: string;
  wing: string;
  obligation_type: 'rent' | 'shifting' | 'brokerage' | 'corpus';
  month: string; // YYYY-MM
  gross_amount: Money;
  tds_rate_pct: number;
  tds_amount: Money;
  net_amount: Money;
  status: ObligationStatus;
  paid_on: IsoDate | null;
  utr: string | null;
  bank_masked: string | null;
  pan_masked: string | null;
  /** Blocking issues surfaced first (Phase 6 §5.7). */
  exceptions: ApprovalException[];
}

export interface PaymentRunSummary {
  month: string;
  member_count: number;
  ready_count: number;
  blocked_count: number;
  gross_total: Money;
  tds_total: Money;
  net_total: Money;
  status: 'draft' | 'pending_approval' | 'approved' | 'released';
  bank_account_label: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: Uuid;
  kind: 'approval' | 'compliance' | 'delivery' | 'payment' | 'system';
  title: string;
  body: string;
  created_at: IsoTimestamp;
  read: boolean;
  /** Route to deep-link to. */
  href?: string;
}
