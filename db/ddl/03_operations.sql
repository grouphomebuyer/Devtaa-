-- =============================================================================
-- AI-COS  |  03_operations.sql
-- BOQ & budget, procurement (PR/RFQ/PO/WO), inventory (GRN/stock/issue),
-- site execution (DPR, measurements, RA bills).
-- =============================================================================

-- =============================================================================
-- PLAN : BOQ, WBS, BUDGET
-- =============================================================================

CREATE TABLE plan.wbs_node (
  id          uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id   uuid NOT NULL,
  project_id  uuid NOT NULL REFERENCES master.project(id),
  parent_id   uuid REFERENCES plan.wbs_node(id),
  code        text NOT NULL,
  name        text NOT NULL,
  level       int NOT NULL DEFAULT 1,
  path        text,
  weightage   numeric(9,4) DEFAULT 0,
  UNIQUE (project_id, code)
);

CREATE TABLE plan.boq_version (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL,
  project_id   uuid NOT NULL REFERENCES master.project(id),
  version_no   int NOT NULL,
  label        text NOT NULL,                     -- 'BASELINE', 'REV-1'
  status       text NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN ('DRAFT','PENDING_APPROVAL','BASELINE','SUPERSEDED','REJECTED')),
  total_amount numeric(18,4) NOT NULL DEFAULT 0,
  revision_reason text,
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  approved_by  uuid,
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  version      int NOT NULL DEFAULT 1,
  UNIQUE (project_id, version_no)
);
-- Exactly one BASELINE per project (BR-BOQ-01).
CREATE UNIQUE INDEX uq_boq_baseline ON plan.boq_version (project_id) WHERE status = 'BASELINE';

CREATE TABLE plan.boq_line (
  id              uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id       uuid NOT NULL,
  boq_version_id  uuid NOT NULL REFERENCES plan.boq_version(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL,
  parent_id       uuid REFERENCES plan.boq_line(id),
  line_no         text NOT NULL,
  item_code       text,
  description     text NOT NULL,
  uom             text REFERENCES master.uom(code),
  quantity        numeric(18,4) NOT NULL DEFAULT 0,
  rate            numeric(18,4) NOT NULL DEFAULT 0,
  amount          numeric(18,4) NOT NULL DEFAULT 0,
  cost_head_id    uuid REFERENCES master.cost_head(id),
  wbs_node_id     uuid REFERENCES plan.wbs_node(id),
  item_id         uuid REFERENCES master.item(id),
  is_group        boolean NOT NULL DEFAULT false,
  is_provisional  boolean NOT NULL DEFAULT false,
  sort_order      int NOT NULL DEFAULT 0,
  CONSTRAINT boq_amount_math CHECK (is_group OR abs(amount - quantity * rate) <= 1)
);
CREATE INDEX ix_boq_line_version ON plan.boq_line (boq_version_id, sort_order);
CREATE INDEX ix_boq_line_costhead ON plan.boq_line (project_id, cost_head_id);

-- Commitment accounting: the live control behind BR-001.
CREATE TABLE plan.budget_line (
  id                 uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id          uuid NOT NULL,
  project_id         uuid NOT NULL REFERENCES master.project(id),
  boq_line_id        uuid REFERENCES plan.boq_line(id),
  cost_head_id       uuid NOT NULL REFERENCES master.cost_head(id),
  budget_amount      numeric(18,4) NOT NULL DEFAULT 0,
  committed_amount   numeric(18,4) NOT NULL DEFAULT 0,   -- open PO/WO value
  incurred_amount    numeric(18,4) NOT NULL DEFAULT 0,   -- GRN/invoice booked
  paid_amount        numeric(18,4) NOT NULL DEFAULT 0,
  available_amount   numeric(18,4) GENERATED ALWAYS AS
                       (budget_amount - committed_amount - incurred_amount) STORED,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, cost_head_id, boq_line_id)
);

CREATE TABLE plan.activity (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  project_id     uuid NOT NULL REFERENCES master.project(id),
  wbs_node_id    uuid REFERENCES plan.wbs_node(id),
  code           text NOT NULL,
  name           text NOT NULL,
  planned_start  date,
  planned_finish date,
  actual_start   date,
  actual_finish  date,
  baseline_start date,
  baseline_finish date,
  duration_days  int,
  weightage      numeric(9,4) DEFAULT 0,
  progress_pct   numeric(9,4) NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  is_critical    boolean NOT NULL DEFAULT false,
  UNIQUE (project_id, code)
);

CREATE TABLE plan.activity_dependency (
  predecessor_id uuid NOT NULL REFERENCES plan.activity(id) ON DELETE CASCADE,
  successor_id   uuid NOT NULL REFERENCES plan.activity(id) ON DELETE CASCADE,
  dep_type       text NOT NULL DEFAULT 'FS' CHECK (dep_type IN ('FS','SS','FF','SF')),
  lag_days       int NOT NULL DEFAULT 0,
  PRIMARY KEY (predecessor_id, successor_id),
  CONSTRAINT no_self_dep CHECK (predecessor_id <> successor_id)
);

-- Consumption norms drive theoretical-vs-actual variance (BR-MAT-07).
CREATE TABLE plan.consumption_norm (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  boq_item_code text,
  item_id       uuid NOT NULL REFERENCES master.item(id),
  per_uom       text NOT NULL REFERENCES master.uom(code),
  quantity      numeric(18,6) NOT NULL,            -- e.g. 6.4 bags cement per CUM M25
  tolerance_pct numeric(9,4) NOT NULL DEFAULT 3,
  source        text
);

-- =============================================================================
-- PROC : PURCHASE REQUISITION -> PO / WORK ORDER
-- =============================================================================

CREATE TABLE proc.purchase_requisition (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL REFERENCES core.tenant(id),
  company_id     uuid NOT NULL REFERENCES master.company(id),
  project_id     uuid NOT NULL REFERENCES master.project(id),
  document_no    text,
  document_date  date NOT NULL DEFAULT CURRENT_DATE,
  required_by    date NOT NULL,
  priority       text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  purpose        text,
  status         text NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PARTIALLY_ORDERED',
                                     'ORDERED','RETURNED','REJECTED','CANCELLED','CLOSED')),
  total_estimated_amount numeric(18,4) NOT NULL DEFAULT 0,
  currency_code  char(3) NOT NULL DEFAULT 'INR',
  budget_state   text CHECK (budget_state IN ('WITHIN','BREACH')),
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  content_hash   text,
  client_generated_id uuid,                       -- offline mobile idempotency
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  cancelled_at   timestamptz,
  cancellation_reason text,
  deleted_at     timestamptz,
  version        int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, company_id, document_no)
);
CREATE UNIQUE INDEX uq_pr_client_id ON proc.purchase_requisition (tenant_id, client_generated_id)
  WHERE client_generated_id IS NOT NULL;
CREATE INDEX ix_pr_list ON proc.purchase_requisition (tenant_id, project_id, status, document_date DESC);
CREATE TRIGGER trg_touch BEFORE UPDATE ON proc.purchase_requisition FOR EACH ROW EXECUTE FUNCTION core.touch_row();

CREATE TABLE proc.purchase_requisition_line (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  purchase_requisition_id uuid NOT NULL REFERENCES proc.purchase_requisition(id) ON DELETE CASCADE,
  line_no           int NOT NULL,
  item_id           uuid REFERENCES master.item(id),
  description       text NOT NULL,
  boq_line_id       uuid REFERENCES plan.boq_line(id),
  cost_head_id      uuid NOT NULL REFERENCES master.cost_head(id),
  wbs_node_id       uuid REFERENCES plan.wbs_node(id),
  uom               text NOT NULL REFERENCES master.uom(code),
  quantity          numeric(18,4) NOT NULL CHECK (quantity > 0),
  approved_quantity numeric(18,4),
  ordered_quantity  numeric(18,4) NOT NULL DEFAULT 0,
  estimated_rate    numeric(18,4) NOT NULL DEFAULT 0,
  estimated_amount  numeric(18,4) NOT NULL DEFAULT 0,
  required_by       date,
  remarks           text,
  UNIQUE (purchase_requisition_id, line_no),
  CONSTRAINT pr_ordered_within_approved
    CHECK (approved_quantity IS NULL OR ordered_quantity <= approved_quantity)
);

CREATE TABLE proc.rfq (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL,
  company_id   uuid NOT NULL,
  project_id   uuid NOT NULL,
  document_no  text,
  document_date date NOT NULL DEFAULT CURRENT_DATE,
  closing_at   timestamptz,
  is_sealed    boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN ('DRAFT','SENT','CLOSED','AWARDED','CANCELLED')),
  created_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  version      int NOT NULL DEFAULT 1
);

CREATE TABLE proc.quotation (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  rfq_id        uuid NOT NULL REFERENCES proc.rfq(id),
  vendor_id     uuid NOT NULL REFERENCES master.vendor(id),
  quotation_no  text,
  quotation_date date,
  valid_till    date,
  total_amount  numeric(18,4) NOT NULL DEFAULT 0,
  freight_amount numeric(18,4) NOT NULL DEFAULT 0,
  credit_days   int,
  delivery_days int,
  is_recommended boolean NOT NULL DEFAULT false,
  recommendation_reason text,
  document_id   uuid REFERENCES doc.document(id),
  received_at   timestamptz,
  UNIQUE (rfq_id, vendor_id)
);

CREATE TABLE proc.quotation_line (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  quotation_id   uuid NOT NULL REFERENCES proc.quotation(id) ON DELETE CASCADE,
  purchase_requisition_line_id uuid REFERENCES proc.purchase_requisition_line(id),
  item_id        uuid REFERENCES master.item(id),
  description    text NOT NULL,
  uom            text NOT NULL REFERENCES master.uom(code),
  quantity       numeric(18,4) NOT NULL,
  rate           numeric(18,4) NOT NULL,
  amount         numeric(18,4) NOT NULL
);

CREATE TABLE proc.purchase_order (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL REFERENCES core.tenant(id),
  company_id        uuid NOT NULL REFERENCES master.company(id),
  project_id        uuid NOT NULL REFERENCES master.project(id),
  vendor_id         uuid NOT NULL REFERENCES master.vendor(id),
  vendor_gstin_id   uuid REFERENCES master.vendor_gstin(id),
  document_no       text,
  document_date     date NOT NULL DEFAULT CURRENT_DATE,
  order_type        text NOT NULL DEFAULT 'MATERIAL'
                      CHECK (order_type IN ('MATERIAL','SERVICE','ASSET','RATE_CONTRACT')),
  delivery_store_id uuid REFERENCES master.store_location(id),
  delivery_date     date,
  payment_terms_days int NOT NULL DEFAULT 30,
  advance_pct       numeric(9,4) NOT NULL DEFAULT 0,
  retention_pct     numeric(9,4) NOT NULL DEFAULT 0,
  freight_terms     text,
  penalty_terms     text,
  warranty_terms    text,
  taxable_amount    numeric(18,4) NOT NULL DEFAULT 0,
  tax_amount        numeric(18,4) NOT NULL DEFAULT 0,
  other_charges     numeric(18,4) NOT NULL DEFAULT 0,
  total_amount      numeric(18,4) NOT NULL DEFAULT 0,
  currency_code     char(3) NOT NULL DEFAULT 'INR',
  status            text NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','DISPATCHED','ACKNOWLEDGED',
                                        'PARTIALLY_RECEIVED','RECEIVED','SHORT_CLOSED','CLOSED','REJECTED','CANCELLED')),
  amendment_no      int NOT NULL DEFAULT 0,
  parent_po_id      uuid REFERENCES proc.purchase_order(id),
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  content_hash      text,
  dispatched_at     timestamptz,
  acknowledged_at   timestamptz,
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  cancelled_at      timestamptz,
  cancellation_reason text,
  deleted_at        timestamptz,
  version           int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, company_id, document_no)
);
CREATE INDEX ix_po_list   ON proc.purchase_order (tenant_id, project_id, status, document_date DESC);
CREATE INDEX ix_po_vendor ON proc.purchase_order (tenant_id, vendor_id, document_date DESC);
CREATE TRIGGER trg_touch BEFORE UPDATE ON proc.purchase_order FOR EACH ROW EXECUTE FUNCTION core.touch_row();

CREATE TABLE proc.purchase_order_line (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  purchase_order_id uuid NOT NULL REFERENCES proc.purchase_order(id) ON DELETE CASCADE,
  line_no           int NOT NULL,
  purchase_requisition_line_id uuid REFERENCES proc.purchase_requisition_line(id),
  item_id           uuid REFERENCES master.item(id),
  description       text NOT NULL,
  hsn_sac           text,
  boq_line_id       uuid REFERENCES plan.boq_line(id),
  cost_head_id      uuid NOT NULL REFERENCES master.cost_head(id),
  uom               text NOT NULL REFERENCES master.uom(code),
  quantity          numeric(18,4) NOT NULL CHECK (quantity > 0),
  rate              numeric(18,4) NOT NULL CHECK (rate >= 0),
  discount_pct      numeric(9,4) NOT NULL DEFAULT 0,
  taxable_amount    numeric(18,4) NOT NULL,
  tax_code          text,
  cgst_amount       numeric(18,4) NOT NULL DEFAULT 0,
  sgst_amount       numeric(18,4) NOT NULL DEFAULT 0,
  igst_amount       numeric(18,4) NOT NULL DEFAULT 0,
  line_total        numeric(18,4) NOT NULL,
  received_quantity numeric(18,4) NOT NULL DEFAULT 0,
  invoiced_quantity numeric(18,4) NOT NULL DEFAULT 0,
  tolerance_pct     numeric(9,4) NOT NULL DEFAULT 2,
  delivery_date     date,
  UNIQUE (purchase_order_id, line_no)
);
CREATE INDEX ix_pol_po ON proc.purchase_order_line (purchase_order_id);

-- Work orders for contractors (rate/lump-sum) share the PO lifecycle.
CREATE TABLE proc.work_order (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  company_id        uuid NOT NULL,
  project_id        uuid NOT NULL REFERENCES master.project(id),
  vendor_id         uuid NOT NULL REFERENCES master.vendor(id),
  document_no       text,
  document_date     date NOT NULL DEFAULT CURRENT_DATE,
  wo_type           text NOT NULL CHECK (wo_type IN ('ITEM_RATE','LUMP_SUM','COST_PLUS','LABOUR_ONLY')),
  scope_of_work     text NOT NULL,
  start_date        date,
  completion_date   date,
  total_amount      numeric(18,4) NOT NULL DEFAULT 0,
  retention_pct     numeric(9,4) NOT NULL DEFAULT 5,
  mobilisation_advance_pct numeric(9,4) NOT NULL DEFAULT 0,
  advance_recovery_pct numeric(9,4) NOT NULL DEFAULT 0,
  ld_pct_per_week   numeric(9,4) NOT NULL DEFAULT 0,
  ld_cap_pct        numeric(9,4) NOT NULL DEFAULT 10,
  dlp_months        int NOT NULL DEFAULT 12,
  status            text NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','IN_PROGRESS',
                                        'COMPLETED','CLOSED','TERMINATED','CANCELLED')),
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, company_id, document_no)
);

CREATE TABLE proc.work_order_line (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  work_order_id  uuid NOT NULL REFERENCES proc.work_order(id) ON DELETE CASCADE,
  line_no        int NOT NULL,
  boq_line_id    uuid REFERENCES plan.boq_line(id),
  description    text NOT NULL,
  uom            text NOT NULL REFERENCES master.uom(code),
  quantity       numeric(18,4) NOT NULL,
  rate           numeric(18,4) NOT NULL,
  amount         numeric(18,4) NOT NULL,
  variation_quantity numeric(18,4) NOT NULL DEFAULT 0,
  certified_quantity numeric(18,4) NOT NULL DEFAULT 0,
  UNIQUE (work_order_id, line_no),
  CONSTRAINT wo_certified_within_scope
    CHECK (certified_quantity <= quantity + variation_quantity)
);

-- =============================================================================
-- INV : GRN, STOCK, ISSUE
-- =============================================================================

CREATE TABLE inv.goods_receipt (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  company_id        uuid NOT NULL,
  project_id        uuid NOT NULL REFERENCES master.project(id),
  store_id          uuid NOT NULL REFERENCES master.store_location(id),
  vendor_id         uuid NOT NULL REFERENCES master.vendor(id),
  purchase_order_id uuid REFERENCES proc.purchase_order(id),
  document_no       text,
  document_date     date NOT NULL DEFAULT CURRENT_DATE,
  challan_no        text NOT NULL,
  challan_date      date NOT NULL,
  vehicle_no        text,
  gross_weight      numeric(18,4),
  tare_weight       numeric(18,4),
  is_direct_grn     boolean NOT NULL DEFAULT false,   -- emergency receipt without PO
  regularisation_ref uuid,
  status            text NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','PENDING_INSPECTION','ACCEPTED','PARTIALLY_REJECTED','REJECTED','CANCELLED')),
  client_generated_id uuid,
  captured_at       timestamptz,                      -- device time (offline)
  received_at       timestamptz NOT NULL DEFAULT now(),
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, company_id, document_no)
);
CREATE UNIQUE INDEX uq_grn_challan ON inv.goods_receipt (tenant_id, vendor_id, challan_no, challan_date);
CREATE UNIQUE INDEX uq_grn_client  ON inv.goods_receipt (tenant_id, client_generated_id)
  WHERE client_generated_id IS NOT NULL;

CREATE TABLE inv.goods_receipt_line (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  goods_receipt_id  uuid NOT NULL REFERENCES inv.goods_receipt(id) ON DELETE CASCADE,
  line_no           int NOT NULL,
  purchase_order_line_id uuid REFERENCES proc.purchase_order_line(id),
  item_id           uuid NOT NULL REFERENCES master.item(id),
  batch_no          text,
  heat_no           text,                             -- steel traceability
  uom               text NOT NULL REFERENCES master.uom(code),
  challan_quantity  numeric(18,4) NOT NULL CHECK (challan_quantity > 0),
  received_quantity numeric(18,4) NOT NULL,
  accepted_quantity numeric(18,4) NOT NULL DEFAULT 0,
  rejected_quantity numeric(18,4) NOT NULL DEFAULT 0,
  short_quantity    numeric(18,4) NOT NULL DEFAULT 0,
  rate              numeric(18,4) NOT NULL DEFAULT 0,
  landed_rate       numeric(18,4) NOT NULL DEFAULT 0, -- incl. freight & non-creditable tax
  value             numeric(18,4) NOT NULL DEFAULT 0,
  rejection_reason  text,
  UNIQUE (goods_receipt_id, line_no),
  CONSTRAINT grn_qty_split CHECK (accepted_quantity + rejected_quantity + short_quantity = challan_quantity)
);

CREATE TABLE inv.material_issue (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  company_id     uuid NOT NULL,
  project_id     uuid NOT NULL REFERENCES master.project(id),
  store_id       uuid NOT NULL REFERENCES master.store_location(id),
  document_no    text,
  document_date  date NOT NULL DEFAULT CURRENT_DATE,
  issue_type     text NOT NULL DEFAULT 'CONSUMPTION'
                   CHECK (issue_type IN ('CONSUMPTION','TO_CONTRACTOR','TRANSFER_OUT','RETURN_TO_VENDOR','SCRAP')),
  wbs_node_id    uuid REFERENCES plan.wbs_node(id),
  activity_id    uuid REFERENCES plan.activity(id),
  contractor_id  uuid REFERENCES master.vendor(id),
  is_recoverable boolean NOT NULL DEFAULT false,      -- deducted in RA bill
  issued_to      text,
  receiver_ack   text,                                -- PIN/OTP/signature reference
  status         text NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','ISSUED','CANCELLED')),
  client_generated_id uuid,
  captured_at    timestamptz,
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  version        int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, company_id, document_no)
);

CREATE TABLE inv.material_issue_line (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  material_issue_id uuid NOT NULL REFERENCES inv.material_issue(id) ON DELETE CASCADE,
  line_no           int NOT NULL,
  item_id           uuid NOT NULL REFERENCES master.item(id),
  batch_no          text,
  uom               text NOT NULL REFERENCES master.uom(code),
  quantity          numeric(18,4) NOT NULL CHECK (quantity > 0),
  rate              numeric(18,4) NOT NULL DEFAULT 0,
  value             numeric(18,4) NOT NULL DEFAULT 0,
  UNIQUE (material_issue_id, line_no)
);

-- Append-only movement ledger, partitioned monthly.
CREATE TABLE inv.stock_ledger (
  id             uuid NOT NULL DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  project_id     uuid NOT NULL,
  store_id       uuid NOT NULL,
  item_id        uuid NOT NULL,
  batch_no       text NOT NULL DEFAULT '',
  movement_type  text NOT NULL CHECK (movement_type IN
                   ('GRN','ISSUE','RETURN','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT','OPENING','SCRAP')),
  quantity_in    numeric(18,4) NOT NULL DEFAULT 0,
  quantity_out   numeric(18,4) NOT NULL DEFAULT 0,
  rate           numeric(18,4) NOT NULL DEFAULT 0,
  value_in       numeric(18,4) NOT NULL DEFAULT 0,
  value_out      numeric(18,4) NOT NULL DEFAULT 0,
  source_type    text NOT NULL,
  source_id      uuid NOT NULL,
  movement_date  date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  PRIMARY KEY (id, movement_date)
) PARTITION BY RANGE (movement_date);
CREATE TABLE inv.stock_ledger_2026_07 PARTITION OF inv.stock_ledger
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE INDEX ix_sl_item ON inv.stock_ledger (tenant_id, project_id, item_id, movement_date DESC);

-- Materialised balance; negative stock is structurally impossible (BR-MAT-04).
CREATE TABLE inv.stock_balance (
  tenant_id       uuid NOT NULL,
  project_id      uuid NOT NULL,
  store_id        uuid NOT NULL,
  item_id         uuid NOT NULL,
  batch_no        text NOT NULL DEFAULT '',
  quantity        numeric(18,4) NOT NULL DEFAULT 0,
  value           numeric(18,4) NOT NULL DEFAULT 0,
  avg_rate        numeric(18,4) NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  PRIMARY KEY (tenant_id, project_id, store_id, item_id, batch_no),
  CONSTRAINT stock_never_negative CHECK (quantity >= 0)
);

-- Lock the balance row, validate, then apply.  Note: a plain
-- INSERT ... ON CONFLICT DO UPDATE cannot be used here, because PostgreSQL
-- evaluates CHECK constraints against the *proposed* insert tuple (the raw
-- delta, which is negative for an issue) before conflict arbitration, so a
-- perfectly valid issue-after-receipt would fail.
CREATE OR REPLACE FUNCTION inv.apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_qty      numeric(18,4);
  v_val      numeric(18,4);
  v_exists   boolean := false;
BEGIN
  SELECT b.quantity, b.value INTO v_qty, v_val
    FROM inv.stock_balance b
   WHERE b.tenant_id  = NEW.tenant_id
     AND b.project_id = NEW.project_id
     AND b.store_id   = NEW.store_id
     AND b.item_id    = NEW.item_id
     AND b.batch_no   = NEW.batch_no
   FOR UPDATE;                                   -- serialises concurrent movements

  v_exists := FOUND;
  IF NOT v_exists THEN v_qty := 0; v_val := 0; END IF;

  IF v_qty + NEW.quantity_in - NEW.quantity_out < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_STOCK: item % at store % has %, movement would take it to %',
      NEW.item_id, NEW.store_id, v_qty, v_qty + NEW.quantity_in - NEW.quantity_out
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_exists THEN
    UPDATE inv.stock_balance b
       SET quantity = b.quantity + NEW.quantity_in - NEW.quantity_out,
           value    = b.value    + NEW.value_in    - NEW.value_out,
           -- weighted average is recomputed on receipts only
           avg_rate = CASE
                        WHEN NEW.quantity_in > 0 AND (b.quantity + NEW.quantity_in) > 0
                          THEN (b.value + NEW.value_in) / (b.quantity + NEW.quantity_in)
                        ELSE b.avg_rate END,
           last_movement_at = now()
     WHERE b.tenant_id  = NEW.tenant_id
       AND b.project_id = NEW.project_id
       AND b.store_id   = NEW.store_id
       AND b.item_id    = NEW.item_id
       AND b.batch_no   = NEW.batch_no;
  ELSE
    -- First movement for this grain is necessarily a receipt (validated above).
    INSERT INTO inv.stock_balance AS b
      (tenant_id, project_id, store_id, item_id, batch_no, quantity, value, avg_rate, last_movement_at)
    VALUES
      (NEW.tenant_id, NEW.project_id, NEW.store_id, NEW.item_id, NEW.batch_no,
       NEW.quantity_in - NEW.quantity_out, NEW.value_in - NEW.value_out,
       CASE WHEN NEW.quantity_in > 0 THEN NEW.value_in / NEW.quantity_in ELSE 0 END, now())
    ON CONFLICT (tenant_id, project_id, store_id, item_id, batch_no) DO UPDATE
      SET quantity = b.quantity + EXCLUDED.quantity,
          value    = b.value    + EXCLUDED.value,
          last_movement_at = now();
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_stock_balance
  AFTER INSERT ON inv.stock_ledger
  FOR EACH ROW EXECUTE FUNCTION inv.apply_stock_movement();

CREATE TABLE inv.physical_verification (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  project_id    uuid NOT NULL,
  store_id      uuid NOT NULL,
  document_no   text,
  verification_date date NOT NULL,
  status        text NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED','CANCELLED')),
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inv.physical_verification_line (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  physical_verification_id uuid NOT NULL REFERENCES inv.physical_verification(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES master.item(id),
  batch_no      text NOT NULL DEFAULT '',
  book_quantity numeric(18,4) NOT NULL,
  physical_quantity numeric(18,4) NOT NULL,
  variance_quantity numeric(18,4) GENERATED ALWAYS AS (physical_quantity - book_quantity) STORED,
  reason        text
);

-- =============================================================================
-- SITE : DPR, MEASUREMENTS, RA BILLS
-- =============================================================================

CREATE TABLE site.dpr (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  project_id     uuid NOT NULL REFERENCES master.project(id),
  report_date    date NOT NULL,
  shift          text NOT NULL DEFAULT 'DAY' CHECK (shift IN ('DAY','NIGHT')),
  weather        text,
  temperature_c  numeric(5,2),
  rainfall_mm    numeric(6,2),
  total_manpower int NOT NULL DEFAULT 0,
  remarks        text,
  status         text NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','SUBMITTED','REVIEWED','APPROVED')),
  client_generated_id uuid,
  captured_at    timestamptz,
  device_id      text,
  clock_skew_seconds int,
  submitted_by   uuid,
  submitted_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  version        int NOT NULL DEFAULT 1,
  UNIQUE (project_id, report_date, shift)
);
CREATE UNIQUE INDEX uq_dpr_client ON site.dpr (tenant_id, client_generated_id)
  WHERE client_generated_id IS NOT NULL;

CREATE TABLE site.dpr_manpower (
  id          uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id   uuid NOT NULL,
  dpr_id      uuid NOT NULL REFERENCES site.dpr(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES master.vendor(id),
  trade       text NOT NULL,
  skilled     int NOT NULL DEFAULT 0,
  unskilled   int NOT NULL DEFAULT 0,
  supervisors int NOT NULL DEFAULT 0
);

CREATE TABLE site.dpr_activity_progress (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL,
  dpr_id       uuid NOT NULL REFERENCES site.dpr(id) ON DELETE CASCADE,
  activity_id  uuid REFERENCES plan.activity(id),
  boq_line_id  uuid REFERENCES plan.boq_line(id),
  description  text NOT NULL,
  uom          text REFERENCES master.uom(code),
  quantity_done numeric(18,4) NOT NULL DEFAULT 0,
  location     text,
  remarks      text
);

CREATE TABLE site.measurement_entry (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  project_id     uuid NOT NULL,
  work_order_line_id uuid NOT NULL REFERENCES proc.work_order_line(id),
  measurement_date date NOT NULL,
  location       text NOT NULL,
  drawing_ref    text,
  nos            numeric(18,4) NOT NULL DEFAULT 1,
  length         numeric(18,4),
  breadth        numeric(18,4),
  height         numeric(18,4),
  quantity       numeric(18,4) NOT NULL,
  remarks        text,
  is_locked      boolean NOT NULL DEFAULT false,
  ra_bill_id     uuid,
  recorded_by    uuid NOT NULL,
  checked_by     uuid,
  checked_at     timestamptz,
  client_generated_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_meas_wol ON site.measurement_entry (work_order_line_id, is_locked);

CREATE TABLE site.ra_bill (
  id               uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id        uuid NOT NULL,
  company_id       uuid NOT NULL,
  project_id       uuid NOT NULL REFERENCES master.project(id),
  work_order_id    uuid NOT NULL REFERENCES proc.work_order(id),
  vendor_id        uuid NOT NULL REFERENCES master.vendor(id),
  document_no      text,
  bill_no          int NOT NULL,                  -- RA-1, RA-2 ...
  is_final         boolean NOT NULL DEFAULT false,
  period_from      date NOT NULL,
  period_to        date NOT NULL,
  cumulative_gross numeric(18,4) NOT NULL DEFAULT 0,
  previous_gross   numeric(18,4) NOT NULL DEFAULT 0,
  this_bill_gross  numeric(18,4) GENERATED ALWAYS AS (cumulative_gross - previous_gross) STORED,
  total_deductions numeric(18,4) NOT NULL DEFAULT 0,
  tax_amount       numeric(18,4) NOT NULL DEFAULT 0,
  net_payable      numeric(18,4) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','PENDING_CERTIFICATION','CERTIFIED','PENDING_APPROVAL',
                                       'APPROVED','PAID','REJECTED','CANCELLED')),
  certified_by     uuid,
  certified_at     timestamptz,
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  version          int NOT NULL DEFAULT 1,
  UNIQUE (work_order_id, bill_no),
  CONSTRAINT ra_period CHECK (period_to >= period_from)
);

CREATE TABLE site.ra_bill_line (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  ra_bill_id        uuid NOT NULL REFERENCES site.ra_bill(id) ON DELETE CASCADE,
  work_order_line_id uuid NOT NULL REFERENCES proc.work_order_line(id),
  cumulative_quantity numeric(18,4) NOT NULL,
  previous_quantity   numeric(18,4) NOT NULL DEFAULT 0,
  this_bill_quantity  numeric(18,4) GENERATED ALWAYS AS (cumulative_quantity - previous_quantity) STORED,
  rate              numeric(18,4) NOT NULL,
  amount            numeric(18,4) NOT NULL,
  UNIQUE (ra_bill_id, work_order_line_id)
);

CREATE TABLE site.ra_bill_deduction (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL,
  ra_bill_id   uuid NOT NULL REFERENCES site.ra_bill(id) ON DELETE CASCADE,
  deduction_type text NOT NULL CHECK (deduction_type IN
                   ('RETENTION','ADVANCE_RECOVERY','MATERIAL_ISSUED','WATER_ELECTRICITY',
                    'PENALTY_LD','TDS','GST_TDS','OTHER')),
  description  text,
  amount       numeric(18,4) NOT NULL CHECK (amount >= 0),
  reference_id uuid,
  is_override  boolean NOT NULL DEFAULT false,
  override_reason text
);

CREATE TABLE site.ncr (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  project_id    uuid NOT NULL,
  document_no   text,
  raised_on     date NOT NULL DEFAULT CURRENT_DATE,
  raised_by     uuid NOT NULL,
  contractor_id uuid REFERENCES master.vendor(id),
  activity_id   uuid REFERENCES plan.activity(id),
  severity      text NOT NULL CHECK (severity IN ('CRITICAL','MAJOR','MINOR')),
  description   text NOT NULL,
  corrective_action text,
  due_date      date,
  status        text NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED','ESCALATED')),
  closed_by     uuid,
  closed_at     timestamptz
);
CREATE INDEX ix_ncr_open ON site.ncr (tenant_id, project_id, status) WHERE status <> 'CLOSED';

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
     WHERE c.relkind IN ('r','p') AND c.relnamespace::regnamespace::text IN ('plan','proc','inv','site')
       AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)  -- skip partitions
  LOOP
    BEGIN
      PERFORM core.apply_tenant_rls(t.s, t.n);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
