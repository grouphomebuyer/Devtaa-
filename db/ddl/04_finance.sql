-- =============================================================================
-- AI-COS  |  04_finance.sql
-- General ledger, payables, payments, banking & reconciliation, Tally sync,
-- FUM (funds-under-management) ledger, AI traces.
-- =============================================================================

-- =============================================================================
-- GENERAL LEDGER
-- =============================================================================

CREATE TABLE fin.journal (
  id              uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
  company_id      uuid NOT NULL REFERENCES master.company(id),
  document_no     text,
  journal_type    text NOT NULL CHECK (journal_type IN
                    ('PURCHASE','SALES','PAYMENT','RECEIPT','CONTRA','JOURNAL','STOCK','DEPRECIATION','OPENING','CLOSING')),
  posting_date    date NOT NULL,
  narration       text NOT NULL CHECK (length(narration) >= 10),
  source_type     text,                              -- 'payment_voucher', 'purchase_invoice', ...
  source_id       uuid,
  is_auto         boolean NOT NULL DEFAULT true,     -- auto journals are not editable
  is_reversal     boolean NOT NULL DEFAULT false,
  reversed_journal_id uuid REFERENCES fin.journal(id),
  status          text NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','PENDING_APPROVAL','POSTED','REVERSED','CANCELLED')),
  total_debit     numeric(18,4) NOT NULL DEFAULT 0,
  total_credit    numeric(18,4) NOT NULL DEFAULT 0,
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  posted_by       uuid,
  posted_at       timestamptz,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, company_id, document_no),
  CONSTRAINT journal_balanced CHECK (status <> 'POSTED' OR total_debit = total_credit)
);
CREATE INDEX ix_journal_date ON fin.journal (tenant_id, company_id, posting_date DESC);
CREATE INDEX ix_journal_src  ON fin.journal (source_type, source_id);

CREATE TABLE fin.journal_line (
  id            uuid NOT NULL DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  journal_id    uuid NOT NULL,
  company_id    uuid NOT NULL,
  line_no       int NOT NULL,
  gl_account_id uuid NOT NULL REFERENCES master.gl_account(id),
  debit         numeric(18,4) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit        numeric(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  currency_code char(3) NOT NULL DEFAULT 'INR',
  -- dimensions
  project_id    uuid,
  cost_head_id  uuid REFERENCES master.cost_head(id),
  wbs_node_id   uuid,
  boq_line_id   uuid,
  party_type    text CHECK (party_type IN ('VENDOR','CUSTOMER','MEMBER','EMPLOYEE','SOCIETY')),
  party_id      uuid,
  funding_source text,
  narration     text,
  posting_date  date NOT NULL,
  PRIMARY KEY (id, posting_date),
  CONSTRAINT one_sided CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
) PARTITION BY RANGE (posting_date);

CREATE TABLE fin.journal_line_2026_07 PARTITION OF fin.journal_line
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE INDEX ix_jl_account ON fin.journal_line (tenant_id, gl_account_id, posting_date);
CREATE INDEX ix_jl_project ON fin.journal_line (tenant_id, project_id, posting_date);
CREATE INDEX ix_jl_party   ON fin.journal_line (tenant_id, party_type, party_id, posting_date);

-- Balance is asserted at COMMIT, so lines may be inserted in any order.
CREATE OR REPLACE FUNCTION fin.assert_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_debit numeric(18,4); v_credit numeric(18,4); v_status text;
BEGIN
  SELECT status INTO v_status FROM fin.journal WHERE id = NEW.journal_id;
  IF v_status <> 'POSTED' THEN RETURN NEW; END IF;

  SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0)
    INTO v_debit, v_credit
    FROM fin.journal_line WHERE journal_id = NEW.journal_id;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'JOURNAL_UNBALANCED: journal % debit % <> credit %',
      NEW.journal_id, v_debit, v_credit USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER trg_journal_balanced
  AFTER INSERT OR UPDATE ON fin.journal_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fin.assert_journal_balanced();

-- Block postings into a locked period (BR-GL-04).
CREATE OR REPLACE FUNCTION fin.guard_period_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'POSTED' THEN
    PERFORM core.assert_period_open(NEW.company_id, NEW.posting_date);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_period_lock BEFORE INSERT OR UPDATE ON fin.journal
  FOR EACH ROW EXECUTE FUNCTION fin.guard_period_lock();

-- FUM: society/client money we operate but do not own (Exec C-4, BR-015).
CREATE TABLE fin.fum_ledger (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL,
  project_id   uuid NOT NULL REFERENCES master.project(id),
  society_id   uuid REFERENCES master.society(id),
  name         text NOT NULL,
  opening_balance numeric(18,4) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE fin.fum_entry (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  fum_ledger_id  uuid NOT NULL REFERENCES fin.fum_ledger(id),
  entry_date     date NOT NULL,
  entry_type     text NOT NULL CHECK (entry_type IN ('RECEIPT','PAYMENT','TRANSFER','ADJUSTMENT')),
  cost_head_id   uuid REFERENCES master.cost_head(id),
  party_type     text,
  party_id       uuid,
  amount_in      numeric(18,4) NOT NULL DEFAULT 0,
  amount_out     numeric(18,4) NOT NULL DEFAULT 0,
  narration      text NOT NULL,
  source_type    text,
  source_id      uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_fum_ledger ON fin.fum_entry (tenant_id, fum_ledger_id, entry_date);

-- =============================================================================
-- PAYABLES
-- =============================================================================

CREATE TABLE fin.purchase_invoice (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL REFERENCES core.tenant(id),
  company_id        uuid NOT NULL REFERENCES master.company(id),
  project_id        uuid REFERENCES master.project(id),
  vendor_id         uuid NOT NULL REFERENCES master.vendor(id),
  vendor_gstin      text,
  purchase_order_id uuid REFERENCES proc.purchase_order(id),
  document_no       text,                            -- our internal booking number
  invoice_no        text NOT NULL,                   -- the vendor's number
  invoice_date      date NOT NULL,
  financial_year    text NOT NULL,
  due_date          date NOT NULL,
  irn               text,                            -- e-invoice reference number
  taxable_amount    numeric(18,4) NOT NULL DEFAULT 0,
  cgst_amount       numeric(18,4) NOT NULL DEFAULT 0,
  sgst_amount       numeric(18,4) NOT NULL DEFAULT 0,
  igst_amount       numeric(18,4) NOT NULL DEFAULT 0,
  cess_amount       numeric(18,4) NOT NULL DEFAULT 0,
  other_charges     numeric(18,4) NOT NULL DEFAULT 0,
  round_off         numeric(18,4) NOT NULL DEFAULT 0,
  total_amount      numeric(18,4) NOT NULL,
  is_rcm            boolean NOT NULL DEFAULT false,
  itc_eligible      boolean NOT NULL DEFAULT true,
  itc_block_reason  text,
  tds_section       text,
  tds_amount        numeric(18,4) NOT NULL DEFAULT 0,
  retention_amount  numeric(18,4) NOT NULL DEFAULT 0,
  advance_adjusted  numeric(18,4) NOT NULL DEFAULT 0,
  net_payable       numeric(18,4) NOT NULL DEFAULT 0,
  paid_amount       numeric(18,4) NOT NULL DEFAULT 0,
  match_status      text NOT NULL DEFAULT 'PENDING'
                      CHECK (match_status IN ('PENDING','MATCHED','QTY_MISMATCH','RATE_MISMATCH',
                                              'NO_GRN','OVERRIDDEN','NOT_APPLICABLE')),
  match_override_by uuid,
  match_override_reason text,
  status            text NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','PENDING_APPROVAL','BOOKED','PARTIALLY_PAID',
                                        'PAID','ON_HOLD','DISPUTED','CANCELLED')),
  hold_reason       text,
  source_document_id uuid REFERENCES doc.document(id),
  extraction_id     uuid,                            -- link to the AI extraction that drafted it
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           int NOT NULL DEFAULT 1,
  CONSTRAINT invoice_total_math CHECK (
    abs(total_amount - (taxable_amount + cgst_amount + sgst_amount + igst_amount
                        + cess_amount + other_charges + round_off)) <= 1)
);
-- Duplicate invoice is structurally impossible (BR-005 / BR-PAY-03).
CREATE UNIQUE INDEX uq_vendor_invoice
  ON fin.purchase_invoice (tenant_id, vendor_id, invoice_no, financial_year)
  WHERE status <> 'CANCELLED';
CREATE INDEX ix_pi_due ON fin.purchase_invoice (tenant_id, status, due_date);

CREATE TABLE fin.purchase_invoice_line (
  id                 uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id          uuid NOT NULL,
  purchase_invoice_id uuid NOT NULL REFERENCES fin.purchase_invoice(id) ON DELETE CASCADE,
  line_no            int NOT NULL,
  purchase_order_line_id uuid REFERENCES proc.purchase_order_line(id),
  goods_receipt_line_id  uuid REFERENCES inv.goods_receipt_line(id),
  item_id            uuid REFERENCES master.item(id),
  description        text NOT NULL,
  hsn_sac            text,
  cost_head_id       uuid NOT NULL REFERENCES master.cost_head(id),
  boq_line_id        uuid REFERENCES plan.boq_line(id),
  uom                text REFERENCES master.uom(code),
  quantity           numeric(18,4) NOT NULL DEFAULT 0,
  rate               numeric(18,4) NOT NULL DEFAULT 0,
  taxable_amount     numeric(18,4) NOT NULL,
  tax_code           text,
  tax_amount         numeric(18,4) NOT NULL DEFAULT 0,
  line_total         numeric(18,4) NOT NULL,
  UNIQUE (purchase_invoice_id, line_no)
);

CREATE TABLE fin.payment_request (
  id              uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
  company_id      uuid NOT NULL REFERENCES master.company(id),
  project_id      uuid REFERENCES master.project(id),
  document_no     text,
  document_date   date NOT NULL DEFAULT CURRENT_DATE,
  request_type    text NOT NULL CHECK (request_type IN
                    ('VENDOR_INVOICE','RA_BILL','ADVANCE','MEMBER_OBLIGATION','STATUTORY',
                     'PETTY_CASH','SALARY','EXPENSE_CLAIM','OTHER')),
  payee_type      text NOT NULL CHECK (payee_type IN ('VENDOR','MEMBER','EMPLOYEE','STATUTORY','OTHER')),
  payee_id        uuid,
  payee_bank_account_id uuid REFERENCES master.vendor_bank_account(id),
  gross_amount    numeric(18,4) NOT NULL CHECK (gross_amount > 0),
  tds_amount      numeric(18,4) NOT NULL DEFAULT 0,
  retention_amount numeric(18,4) NOT NULL DEFAULT 0,
  advance_adjusted numeric(18,4) NOT NULL DEFAULT 0,
  other_deductions numeric(18,4) NOT NULL DEFAULT 0,
  net_amount      numeric(18,4) GENERATED ALWAYS AS
                    (gross_amount - tds_amount - retention_amount - advance_adjusted - other_deductions) STORED,
  currency_code   char(3) NOT NULL DEFAULT 'INR',
  priority        text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  due_date        date,
  purpose         text NOT NULL,
  duplicate_flag  boolean NOT NULL DEFAULT false,
  duplicate_of_id uuid,
  status          text NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','IN_PAYMENT_RUN',
                                      'PAID','RETURNED','REJECTED','CANCELLED')),
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  content_hash    text,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, company_id, document_no)
);
CREATE INDEX ix_payreq_pending ON fin.payment_request (tenant_id, status, due_date)
  WHERE status IN ('PENDING_APPROVAL','APPROVED');

CREATE TABLE fin.payment_request_line (
  id                 uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id          uuid NOT NULL,
  payment_request_id uuid NOT NULL REFERENCES fin.payment_request(id) ON DELETE CASCADE,
  reference_type     text NOT NULL,                 -- purchase_invoice | ra_bill | member_obligation
  reference_id       uuid NOT NULL,
  amount             numeric(18,4) NOT NULL CHECK (amount > 0),
  cost_head_id       uuid REFERENCES master.cost_head(id),
  boq_line_id        uuid REFERENCES plan.boq_line(id)
);

CREATE TABLE fin.payment_run (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  company_id    uuid NOT NULL,
  document_no   text,
  run_date      date NOT NULL DEFAULT CURRENT_DATE,
  bank_account_id uuid NOT NULL REFERENCES master.bank_account(id),
  payment_mode  text NOT NULL CHECK (payment_mode IN ('NEFT','RTGS','IMPS','UPI','CHEQUE','CASH','DD')),
  item_count    int NOT NULL DEFAULT 0,
  total_amount  numeric(18,4) NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','FILE_GENERATED',
                                    'RELEASED','PARTIALLY_FAILED','COMPLETED','CANCELLED')),
  file_generated_at timestamptz,
  file_checksum text,
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  released_by   uuid,
  released_at   timestamptz,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  version       int NOT NULL DEFAULT 1
);

CREATE TABLE fin.payment_voucher (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  company_id        uuid NOT NULL,
  project_id        uuid,
  document_no       text,
  voucher_date      date NOT NULL DEFAULT CURRENT_DATE,
  payment_request_id uuid REFERENCES fin.payment_request(id),
  payment_run_id    uuid REFERENCES fin.payment_run(id),
  bank_account_id   uuid REFERENCES master.bank_account(id),
  payee_type        text NOT NULL,
  payee_id          uuid,
  payee_name        text NOT NULL,
  payee_account_last4 text,
  payment_mode      text NOT NULL,
  gross_amount      numeric(18,4) NOT NULL,
  tds_amount        numeric(18,4) NOT NULL DEFAULT 0,
  net_amount        numeric(18,4) NOT NULL,
  utr_no            text,
  cheque_no         text,
  value_date        date,
  status            text NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','RELEASED','SETTLED','FAILED','RETURNED','CANCELLED')),
  failure_reason    text,
  journal_id        uuid REFERENCES fin.journal(id),
  is_fum            boolean NOT NULL DEFAULT false,
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  version           int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, company_id, document_no)
);
CREATE INDEX ix_pv_utr ON fin.payment_voucher (tenant_id, utr_no) WHERE utr_no IS NOT NULL;

-- Many-to-many settlement between vouchers and invoices/advances.
CREATE TABLE fin.payment_allocation (
  id                 uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id          uuid NOT NULL,
  payment_voucher_id uuid NOT NULL REFERENCES fin.payment_voucher(id) ON DELETE CASCADE,
  reference_type     text NOT NULL,
  reference_id       uuid NOT NULL,
  amount             numeric(18,4) NOT NULL CHECK (amount > 0)
);

CREATE TABLE fin.advance_payment (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  company_id     uuid NOT NULL,
  project_id     uuid,
  vendor_id      uuid NOT NULL REFERENCES master.vendor(id),
  purchase_order_id uuid REFERENCES proc.purchase_order(id),
  payment_voucher_id uuid REFERENCES fin.payment_voucher(id),
  advance_amount numeric(18,4) NOT NULL CHECK (advance_amount > 0),
  adjusted_amount numeric(18,4) NOT NULL DEFAULT 0,
  balance_amount numeric(18,4) GENERATED ALWAYS AS (advance_amount - adjusted_amount) STORED,
  advance_date   date NOT NULL,
  status         text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIALLY_ADJUSTED','CLOSED','WRITTEN_OFF')),
  CONSTRAINT advance_not_over_adjusted CHECK (adjusted_amount <= advance_amount)
);

CREATE TABLE fin.retention_ledger (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  project_id    uuid NOT NULL,
  vendor_id     uuid NOT NULL REFERENCES master.vendor(id),
  work_order_id uuid REFERENCES proc.work_order(id),
  ra_bill_id    uuid REFERENCES site.ra_bill(id),
  retained_amount numeric(18,4) NOT NULL,
  released_amount numeric(18,4) NOT NULL DEFAULT 0,
  balance_amount  numeric(18,4) GENERATED ALWAYS AS (retained_amount - released_amount) STORED,
  due_for_release_on date,
  release_tranche int,
  status        text NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD','PARTIALLY_RELEASED','RELEASED','FORFEITED'))
);

CREATE TABLE fin.tds_deduction (
  id                 uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id          uuid NOT NULL,
  company_id         uuid NOT NULL,
  deductee_type      text NOT NULL CHECK (deductee_type IN ('VENDOR','MEMBER','EMPLOYEE','OTHER')),
  deductee_id        uuid NOT NULL,
  pan                text,
  section            text NOT NULL,
  financial_year     text NOT NULL,
  quarter            text NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
  taxable_amount     numeric(18,4) NOT NULL,
  rate_pct           numeric(9,4) NOT NULL,
  tds_amount         numeric(18,4) NOT NULL,
  ldc_certificate_id uuid REFERENCES master.ldc_certificate(id),
  source_type        text NOT NULL,
  source_id          uuid NOT NULL,
  deduction_date     date NOT NULL,
  challan_id         uuid,
  certificate_issued boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_tds_return ON fin.tds_deduction (tenant_id, company_id, financial_year, quarter, section);

-- =============================================================================
-- BANKING & RECONCILIATION
-- =============================================================================

CREATE TABLE fin.bank_statement (
  id              uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id       uuid NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES master.bank_account(id),
  period_from     date NOT NULL,
  period_to       date NOT NULL,
  opening_balance numeric(18,4) NOT NULL,
  closing_balance numeric(18,4) NOT NULL,
  line_count      int NOT NULL DEFAULT 0,
  source          text NOT NULL CHECK (source IN ('UPLOAD_CSV','UPLOAD_PDF','EMAIL','MT940','ACCOUNT_AGGREGATOR')),
  document_id     uuid REFERENCES doc.document(id),
  parse_status    text NOT NULL DEFAULT 'PENDING'
                    CHECK (parse_status IN ('PENDING','PARSING','PARSED','FAILED','QUARANTINED')),
  parse_error     text,
  ingested_by     uuid,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stmt_period CHECK (period_to >= period_from)
);
-- No overlapping statements for the same account (BR-BNK-02 support).
CREATE INDEX ix_stmt_account ON fin.bank_statement (bank_account_id, period_from, period_to);

CREATE TABLE fin.bank_statement_line (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  bank_statement_id uuid NOT NULL REFERENCES fin.bank_statement(id) ON DELETE CASCADE,
  bank_account_id   uuid NOT NULL,
  line_no           int NOT NULL,
  txn_date          date NOT NULL,
  value_date        date,
  narration         text NOT NULL,
  reference_no      text,                            -- UTR / cheque no, parsed
  debit             numeric(18,4) NOT NULL DEFAULT 0,
  credit            numeric(18,4) NOT NULL DEFAULT 0,
  running_balance   numeric(18,4),
  matched_amount    numeric(18,4) NOT NULL DEFAULT 0,
  match_status      text NOT NULL DEFAULT 'UNMATCHED'
                      CHECK (match_status IN ('UNMATCHED','SUGGESTED','PARTIALLY_MATCHED','MATCHED','IGNORED')),
  suggested_party_type text,
  suggested_party_id   uuid,
  ai_confidence     numeric(5,4),
  UNIQUE (bank_statement_id, line_no),
  CONSTRAINT line_one_sided CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX ix_bsl_unmatched ON fin.bank_statement_line (tenant_id, bank_account_id, match_status, txn_date)
  WHERE match_status <> 'MATCHED';
CREATE INDEX ix_bsl_ref ON fin.bank_statement_line (tenant_id, reference_no) WHERE reference_no IS NOT NULL;

CREATE TABLE fin.reconciliation_match (
  id                    uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id             uuid NOT NULL,
  bank_statement_line_id uuid NOT NULL REFERENCES fin.bank_statement_line(id),
  reference_type        text NOT NULL,               -- payment_voucher | receipt | journal
  reference_id          uuid NOT NULL,
  amount                numeric(18,4) NOT NULL CHECK (amount > 0),
  match_type            text NOT NULL CHECK (match_type IN ('AUTO_EXACT','AI_SUGGESTED','MANUAL','RULE')),
  confidence            numeric(5,4),
  matched_by            uuid,
  matched_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_statement_line_id, reference_type, reference_id)
);

CREATE TABLE fin.reconciliation_rule (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  name          text NOT NULL,
  narration_pattern text,                            -- regex
  party_type    text,
  party_id      uuid,
  gl_account_id uuid REFERENCES master.gl_account(id),
  cost_head_id  uuid REFERENCES master.cost_head(id),
  auto_create   boolean NOT NULL DEFAULT false,
  priority      int NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  hit_count     int NOT NULL DEFAULT 0
);

-- =============================================================================
-- TALLY SYNC (one-way, idempotent)
-- =============================================================================

CREATE TABLE fin.tally_ledger_map (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  company_id    uuid NOT NULL,
  gl_account_id uuid REFERENCES master.gl_account(id),
  party_type    text,
  party_id      uuid,
  tally_ledger_name text NOT NULL,
  tally_parent_group text,
  last_synced_at timestamptz,
  UNIQUE (tenant_id, company_id, tally_ledger_name)
);

CREATE TABLE fin.tally_sync_queue (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  company_id     uuid NOT NULL,
  journal_id     uuid REFERENCES fin.journal(id),
  entity_type    text NOT NULL DEFAULT 'VOUCHER' CHECK (entity_type IN ('VOUCHER','LEDGER','STOCK_ITEM','COST_CENTRE')),
  entity_id      uuid,
  remote_id      text NOT NULL,                      -- 'aicos:{tenant}:{uuid}' -> Tally REMOTEID
  payload_xml    text,
  status         text NOT NULL DEFAULT 'QUEUED'
                   CHECK (status IN ('QUEUED','SENDING','SYNCED','FAILED','SKIPPED')),
  error_code     text,                               -- LEDGER_NOT_FOUND, PERIOD_LOCKED, TALLY_OFFLINE ...
  error_message  text,
  attempts       int NOT NULL DEFAULT 0,
  tally_guid     text,
  queued_at      timestamptz NOT NULL DEFAULT now(),
  synced_at      timestamptz,
  UNIQUE (tenant_id, remote_id)
);
CREATE INDEX ix_tally_pending ON fin.tally_sync_queue (tenant_id, status, queued_at)
  WHERE status IN ('QUEUED','FAILED');

CREATE TABLE fin.tally_drift_report (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  company_id    uuid NOT NULL,
  as_on         date NOT NULL,
  gl_account_id uuid REFERENCES master.gl_account(id),
  aicos_balance numeric(18,4) NOT NULL,
  tally_balance numeric(18,4) NOT NULL,
  difference    numeric(18,4) GENERATED ALWAYS AS (aicos_balance - tally_balance) STORED,
  resolved      boolean NOT NULL DEFAULT false,
  resolution_note text,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- AI TRACES & EXTRACTIONS
-- =============================================================================

CREATE TABLE ai.ai_trace (
  id             uuid NOT NULL DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  persona        text NOT NULL,                      -- 'ai_accountant', 'ai_purchase_officer'
  task_type      text NOT NULL,
  model          text NOT NULL,
  prompt_version text NOT NULL,
  user_id        uuid,
  entity_type    text,
  entity_id      uuid,
  input_tokens   int,
  output_tokens  int,
  cost_inr       numeric(12,4),
  latency_ms     int,
  tool_calls     jsonb,
  outcome        text CHECK (outcome IN ('SUCCESS','LOW_CONFIDENCE','VALIDATION_FAILED','ERROR','ESCALATED')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE ai.ai_trace_2026_07 PARTITION OF ai.ai_trace
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE ai.document_extraction (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  document_id   uuid NOT NULL REFERENCES doc.document(id),
  schema_name   text NOT NULL,                       -- 'vendor_invoice.v3'
  model         text NOT NULL,
  prompt_version text NOT NULL,
  extracted     jsonb NOT NULL,                      -- {field: {value, confidence, source_ref}}
  overall_confidence numeric(5,4),
  review_status text NOT NULL DEFAULT 'PENDING'
                  CHECK (review_status IN ('PENDING','ACCEPTED','CORRECTED','REJECTED')),
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  corrections   jsonb,                               -- feedback signal for evaluation
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_extract_review ON ai.document_extraction (tenant_id, review_status, created_at);

CREATE TABLE ai.document_chunk (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL,
  document_id  uuid NOT NULL REFERENCES doc.document(id) ON DELETE CASCADE,
  project_id   uuid,
  chunk_index  int NOT NULL,
  page_from    int,
  page_to      int,
  content      text NOT NULL,
  embedding    vector(1024),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX ix_chunk_vec ON ai.document_chunk
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ix_chunk_fts ON ai.document_chunk USING gin (to_tsvector('english', content));

-- Feedback loop: every accepted/rejected AI suggestion improves the next one.
CREATE TABLE ai.feedback (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  task_type     text NOT NULL,
  entity_type   text,
  entity_id     uuid,
  suggestion    jsonb NOT NULL,
  accepted      boolean NOT NULL,
  corrected_to  jsonb,
  user_id       uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- APPLY RLS
-- =============================================================================
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relnamespace::regnamespace::text AS s, c.relname AS n
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'
     WHERE c.relkind IN ('r','p') AND c.relnamespace::regnamespace::text IN ('fin','ai')
       AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
  LOOP
    BEGIN
      PERFORM core.apply_tenant_rls(t.s, t.n);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
