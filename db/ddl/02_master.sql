-- =============================================================================
-- AI-COS  |  02_master.sql
-- Company, project, society, member, vendor, item, cost head, GL account,
-- bank account, tax masters.
-- =============================================================================

-- =============================================================================
-- COMPANY (legal entity)
-- =============================================================================

CREATE TABLE master.company (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL REFERENCES core.tenant(id),
  code              text NOT NULL,
  name              text NOT NULL,
  legal_name        text NOT NULL,
  entity_type       text NOT NULL CHECK (entity_type IN
                      ('PRIVATE_LIMITED','LLP','PARTNERSHIP','PROPRIETORSHIP','SOCIETY','TRUST','AOP')),
  cin               text,
  pan               text CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  tan               text,
  registered_address jsonb NOT NULL,
  fy_start_month    int NOT NULL DEFAULT 4 CHECK (fy_start_month BETWEEN 1 AND 12),
  base_currency     char(3) NOT NULL DEFAULT 'INR',
  tally_company_name text,
  status            text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  version           int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code)
);
CREATE TRIGGER trg_touch BEFORE UPDATE ON master.company FOR EACH ROW EXECUTE FUNCTION core.touch_row();

CREATE TABLE master.company_gstin (
  id          uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id   uuid NOT NULL,
  company_id  uuid NOT NULL REFERENCES master.company(id),
  gstin       text NOT NULL CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  state_code  char(2) NOT NULL,
  address     jsonb NOT NULL,
  is_primary  boolean NOT NULL DEFAULT false,
  status      text NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (tenant_id, gstin)
);

-- Statutory register: directors, DIN, DSC expiry (Exec C-11).
CREATE TABLE master.company_officer (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL,
  company_id   uuid NOT NULL REFERENCES master.company(id),
  full_name    text NOT NULL,
  designation  text NOT NULL,            -- DIRECTOR, EXECUTIVE_DIRECTOR, CS, CFO
  din          text,
  pan          text,
  is_operational boolean NOT NULL DEFAULT true,
  is_signatory  boolean NOT NULL DEFAULT false,
  dsc_expires_on date,
  appointed_on date,
  resigned_on  date
);
CREATE INDEX ix_officer_dsc ON master.company_officer (tenant_id, dsc_expires_on)
  WHERE dsc_expires_on IS NOT NULL AND resigned_on IS NULL;

-- =============================================================================
-- SOCIETY & MEMBERS
-- =============================================================================

CREATE TABLE master.society (
  id                 uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id          uuid NOT NULL REFERENCES core.tenant(id),
  code               text NOT NULL,
  name               text NOT NULL,
  registration_no    text,
  registration_date  date,
  address            jsonb NOT NULL,
  ward               text,
  plot_area_sqm      numeric(18,4),
  total_members      int,
  building_count     int,
  year_of_construction int,
  conveyance_status  text CHECK (conveyance_status IN ('CONVEYED','DEEMED','PENDING','UNKNOWN')),
  consent_percentage numeric(9,4) DEFAULT 0,
  status             text NOT NULL DEFAULT 'ACTIVE',
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid,
  version            int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code)
);
CREATE TRIGGER trg_touch BEFORE UPDATE ON master.society FOR EACH ROW EXECUTE FUNCTION core.touch_row();

CREATE TABLE master.society_committee_member (
  id          uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id   uuid NOT NULL,
  society_id  uuid NOT NULL REFERENCES master.society(id),
  member_id   uuid,
  full_name   text NOT NULL,
  designation text NOT NULL,             -- CHAIRMAN, SECRETARY, TREASURER, MEMBER
  phone       text,
  email       citext,
  term_from   date,
  term_to     date,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE master.society_resolution (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  society_id     uuid NOT NULL REFERENCES master.society(id),
  meeting_type   text NOT NULL CHECK (meeting_type IN ('SGM','AGM','MC','OTHER')),
  meeting_date   date NOT NULL,
  resolution_no  text,
  subject        text NOT NULL,
  outcome        text,
  members_present int,
  votes_for      int,
  votes_against  int,
  document_id    uuid REFERENCES doc.document(id)
);

CREATE TABLE master.member (
  id                    uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id             uuid NOT NULL REFERENCES core.tenant(id),
  society_id            uuid NOT NULL REFERENCES master.society(id),
  membership_no         text,
  flat_no               text NOT NULL,
  building              text,
  full_name             text NOT NULL,
  co_owner_names        text[],
  phone                 text,
  alt_phone             text,
  email                 citext,
  pan_masked            text,                    -- 'ABCDE****F'
  pan_hash              bytea,                   -- for duplicate detection
  pan_encrypted         bytea,                   -- pgcrypto, KMS-wrapped key
  aadhaar_masked        text,
  existing_carpet_sqft  numeric(18,4) NOT NULL,
  entitled_carpet_sqft  numeric(18,4),
  additional_area_sqft  numeric(18,4) DEFAULT 0,
  additional_area_rate  numeric(18,4) DEFAULT 0,
  parking_count         int DEFAULT 0,
  is_commercial         boolean NOT NULL DEFAULT false,
  vacated_on            date,
  possession_on         date,
  alternate_address     jsonb,
  bank_account_no_enc   bytea,
  bank_ifsc             text CHECK (bank_ifsc IS NULL OR bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  status                text NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE','VACATED','POSSESSION_GIVEN','DISPUTED','EXITED')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid,
  version               int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, society_id, flat_no),
  CONSTRAINT carpet_positive CHECK (existing_carpet_sqft > 0)
);
CREATE TRIGGER trg_touch BEFORE UPDATE ON master.member FOR EACH ROW EXECUTE FUNCTION core.touch_row();

CREATE TABLE master.member_agreement (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  member_id      uuid NOT NULL REFERENCES master.member(id),
  project_id     uuid NOT NULL,
  agreement_type text NOT NULL CHECK (agreement_type IN ('CONSENT','PAAA','SUPPLEMENTARY','POSSESSION','NOC')),
  status         text NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT','VETTED','EXECUTED','REGISTERED','CANCELLED')),
  executed_on    date,
  registered_on  date,
  registration_no text,
  stamp_duty     numeric(18,4),
  registration_fee numeric(18,4),
  document_id    uuid REFERENCES doc.document(id),
  clauses        jsonb,                          -- AI-extracted key clauses with citations
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Rent / corpus / shifting / brokerage obligations to members.
CREATE TABLE master.member_obligation (
  id               uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id        uuid NOT NULL,
  member_id        uuid NOT NULL REFERENCES master.member(id),
  project_id       uuid NOT NULL,
  obligation_type  text NOT NULL CHECK (obligation_type IN
                     ('RENT','CORPUS','SHIFTING','BROKERAGE','HARDSHIP','OTHER')),
  due_date         date NOT NULL,
  period_from      date,
  period_to        date,
  gross_amount     numeric(18,4) NOT NULL CHECK (gross_amount >= 0),
  tds_section      text,
  tds_amount       numeric(18,4) NOT NULL DEFAULT 0,
  net_amount       numeric(18,4) GENERATED ALWAYS AS (gross_amount - tds_amount) STORED,
  status           text NOT NULL DEFAULT 'SCHEDULED'
                     CHECK (status IN ('SCHEDULED','IN_RUN','APPROVED','PAID','HELD','WAIVED','CANCELLED')),
  hold_reason      text,
  obligation_run_id uuid,
  payment_voucher_id uuid,
  source_clause    text,                          -- traceable back to the agreement clause
  created_at       timestamptz NOT NULL DEFAULT now(),
  version          int NOT NULL DEFAULT 1,
  UNIQUE (member_id, obligation_type, period_from, period_to)
);
CREATE INDEX ix_obligation_due ON master.member_obligation (tenant_id, project_id, status, due_date);

CREATE TABLE master.member_obligation_run (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  project_id    uuid NOT NULL,
  company_id    uuid NOT NULL,
  document_no   text NOT NULL,
  run_month     date NOT NULL,                    -- first day of month
  member_count  int NOT NULL,
  gross_total   numeric(18,4) NOT NULL,
  tds_total     numeric(18,4) NOT NULL,
  net_total     numeric(18,4) NOT NULL,
  status        text NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PAID','CANCELLED')),
  approval_instance_id uuid REFERENCES core.approval_instance(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  version       int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, project_id, run_month)
);

-- =============================================================================
-- PROJECT
-- =============================================================================

CREATE TYPE master.engagement_model AS ENUM (
  'SELF_REDEVELOPMENT_PMC',
  'SOCIETY_REDEVELOPMENT_DEV',
  'DEVELOPMENT_MANAGEMENT',
  'CONSTRUCTION_MANAGEMENT',
  'CONSULTANCY'
);

CREATE TABLE master.project (
  id                 uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id          uuid NOT NULL REFERENCES core.tenant(id),
  company_id         uuid NOT NULL REFERENCES master.company(id),
  society_id         uuid REFERENCES master.society(id),
  code               text NOT NULL,
  name               text NOT NULL,
  engagement_model   master.engagement_model NOT NULL,
  -- Society/client money we operate but do not own -> fiduciary (FUM) accounting.
  is_fum             boolean GENERATED ALWAYS AS
                       (engagement_model IN ('SELF_REDEVELOPMENT_PMC','DEVELOPMENT_MANAGEMENT','CONSTRUCTION_MANAGEMENT'))
                       STORED,
  address            jsonb NOT NULL,
  city               text,
  state_code         char(2),
  rera_registration_no text,
  rera_valid_till    date,
  status             text NOT NULL DEFAULT 'PLANNING'
                       CHECK (status IN ('PIPELINE','PLANNING','APPROVALS','EXECUTION','HANDOVER','DLP','CLOSED','ON_HOLD')),
  start_date         date,
  planned_end_date   date,
  actual_end_date    date,
  contract_value     numeric(18,4),
  fee_percentage     numeric(9,4),
  currency_code      char(3) NOT NULL DEFAULT 'INR',
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid,
  deleted_at         timestamptz,
  version            int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code)
);
CREATE TRIGGER trg_touch BEFORE UPDATE ON master.project FOR EACH ROW EXECUTE FUNCTION core.touch_row();

-- Engagement model is immutable once money has moved (BR-PRJ-01) - enforced in
-- the application layer plus this guard trigger.
CREATE OR REPLACE FUNCTION master.guard_engagement_model() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.engagement_model <> OLD.engagement_model
     AND EXISTS (SELECT 1 FROM fin.journal_line jl WHERE jl.project_id = OLD.id LIMIT 1) THEN
    RAISE EXCEPTION 'ENGAGEMENT_MODEL_LOCKED: project % already has financial postings', OLD.code;
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE master.project_area_statement (
  project_id            uuid PRIMARY KEY REFERENCES master.project(id),
  tenant_id             uuid NOT NULL,
  plot_area_sqm         numeric(18,4),
  road_setback_sqm      numeric(18,4),
  net_plot_area_sqm     numeric(18,4),
  base_fsi              numeric(9,4),
  tdr_fsi               numeric(9,4),
  fungible_fsi          numeric(9,4),
  premium_fsi           numeric(9,4),
  total_permissible_bua_sqm numeric(18,4),
  rehab_carpet_sqft     numeric(18,4),
  free_sale_carpet_sqft numeric(18,4),
  existing_carpet_total_sqft numeric(18,4),
  entitlement_formula   jsonb,                   -- {increment_pct, fixed_addition_sqft}
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE master.project_milestone (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  project_id     uuid NOT NULL REFERENCES master.project(id),
  code           text NOT NULL,                  -- LOI, DA, IOD, CC, PLINTH, SLAB_5, OC, POSSESSION
  name           text NOT NULL,
  planned_date   date,
  actual_date    date,
  is_billing_milestone boolean NOT NULL DEFAULT false,
  billing_percentage numeric(9,4),
  certified_by   uuid,
  certified_at   timestamptz,
  UNIQUE (project_id, code)
);

CREATE TABLE master.project_team (
  id          uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id   uuid NOT NULL,
  project_id  uuid NOT NULL REFERENCES master.project(id),
  user_id     uuid NOT NULL REFERENCES core.user_account(id),
  role_code   text NOT NULL,                     -- PM, SITE_ENGINEER, QS, ACCOUNTANT
  is_primary  boolean NOT NULL DEFAULT false,
  from_date   date NOT NULL DEFAULT CURRENT_DATE,
  to_date     date,
  UNIQUE (project_id, user_id, role_code, from_date)
);

CREATE TABLE master.bank_account (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL REFERENCES core.tenant(id),
  company_id     uuid REFERENCES master.company(id),
  project_id     uuid REFERENCES master.project(id),
  society_id     uuid REFERENCES master.society(id),
  account_name   text NOT NULL,
  account_no_enc bytea NOT NULL,
  account_no_last4 text NOT NULL,
  ifsc           text NOT NULL CHECK (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name      text NOT NULL,
  branch         text,
  account_type   text NOT NULL CHECK (account_type IN ('CURRENT','SAVINGS','CC','OD','ESCROW','RERA_DESIGNATED','RERA_FREE')),
  gl_account_id  uuid,
  is_fum         boolean NOT NULL DEFAULT false,  -- money we operate but do not own
  opening_balance numeric(18,4) NOT NULL DEFAULT 0,
  opening_date   date,
  status         text NOT NULL DEFAULT 'ACTIVE',
  created_at     timestamptz NOT NULL DEFAULT now(),
  version        int NOT NULL DEFAULT 1
);

-- =============================================================================
-- VENDOR / CONTRACTOR
-- =============================================================================

CREATE TABLE master.vendor (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL REFERENCES core.tenant(id),
  code              text NOT NULL,
  name              text NOT NULL,
  legal_name        text,
  vendor_type       text NOT NULL CHECK (vendor_type IN
                      ('SUPPLIER','CONTRACTOR','CONSULTANT','LABOUR_CONTRACTOR','SERVICE','TRANSPORTER','OTHER')),
  pan               text CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  pan_verified      boolean NOT NULL DEFAULT false,
  is_msme           boolean NOT NULL DEFAULT false,
  udyam_no          text,
  msme_category     text CHECK (msme_category IN ('MICRO','SMALL','MEDIUM')),
  payment_terms_days int NOT NULL DEFAULT 30,
  default_tds_section text,
  is_registered_gst boolean NOT NULL DEFAULT true,   -- drives the 80% RCM rule
  address           jsonb,
  contact_person    text,
  phone             text,
  email             citext,
  rating            numeric(4,2),
  status            text NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','ON_HOLD','BLACKLISTED','INACTIVE')),
  hold_reason       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  version           int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX uq_vendor_pan ON master.vendor (tenant_id, pan) WHERE pan IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_vendor_name_trgm ON master.vendor USING gin (name gin_trgm_ops);
CREATE TRIGGER trg_touch BEFORE UPDATE ON master.vendor FOR EACH ROW EXECUTE FUNCTION core.touch_row();

CREATE TABLE master.vendor_gstin (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL,
  vendor_id    uuid NOT NULL REFERENCES master.vendor(id),
  gstin        text NOT NULL CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  state_code   char(2) NOT NULL,
  legal_name   text,
  gst_status   text,                              -- from the GSTN API
  last_verified_at timestamptz,
  is_primary   boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, gstin)
);

-- Bank accounts are the highest-risk master: maker-checker + cooling period.
CREATE TABLE master.vendor_bank_account (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL,
  vendor_id         uuid NOT NULL REFERENCES master.vendor(id),
  account_name      text NOT NULL,
  account_no_enc    bytea NOT NULL,
  account_no_last4  text NOT NULL,
  account_no_hash   bytea NOT NULL,               -- duplicate-beneficiary detection
  ifsc              text NOT NULL CHECK (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name         text NOT NULL,
  is_primary        boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'PENDING_VERIFICATION'
                      CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','REJECTED','INACTIVE')),
  created_by        uuid NOT NULL,                -- maker
  created_at        timestamptz NOT NULL DEFAULT now(),
  verified_by       uuid,                         -- checker (must differ from maker)
  verified_at       timestamptz,
  usable_from       timestamptz,                  -- verified_at + cooling period
  penny_drop_ref    text,
  CONSTRAINT maker_checker_distinct CHECK (verified_by IS NULL OR verified_by <> created_by)
);
CREATE INDEX ix_vba_dup ON master.vendor_bank_account (tenant_id, account_no_hash);

CREATE TABLE master.vendor_document (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL,
  vendor_id    uuid NOT NULL REFERENCES master.vendor(id),
  doc_type     text NOT NULL,                     -- PAN, GST_CERT, MSME, LDC, INSURANCE, LICENCE
  document_id  uuid NOT NULL REFERENCES doc.document(id),
  valid_from   date,
  valid_to     date,
  is_verified  boolean NOT NULL DEFAULT false
);

CREATE TABLE master.vendor_performance (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  vendor_id      uuid NOT NULL REFERENCES master.vendor(id),
  period_month   date NOT NULL,
  orders_count   int NOT NULL DEFAULT 0,
  on_time_pct    numeric(9,4),
  rejection_pct  numeric(9,4),
  price_variance_pct numeric(9,4),
  quality_score  numeric(4,2),
  overall_score  numeric(4,2),
  UNIQUE (vendor_id, period_month)
);

-- =============================================================================
-- ITEM / UOM / COST HEAD / GL
-- =============================================================================

CREATE TABLE master.uom (
  code        text PRIMARY KEY,                   -- NOS, KG, MT, CUM, SQM, BAG, LTR
  name        text NOT NULL,
  decimals    int NOT NULL DEFAULT 3
);

CREATE TABLE master.item_category (
  id         uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id  uuid NOT NULL,
  parent_id  uuid REFERENCES master.item_category(id),
  code       text NOT NULL,
  name       text NOT NULL,
  path       text,                                -- materialised path for fast tree queries
  UNIQUE (tenant_id, code)
);

CREATE TABLE master.item (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL REFERENCES core.tenant(id),
  code              text NOT NULL,
  name              text NOT NULL,
  description       text,
  category_id       uuid REFERENCES master.item_category(id),
  item_type         text NOT NULL DEFAULT 'MATERIAL'
                      CHECK (item_type IN ('MATERIAL','CONSUMABLE','ASSET','SERVICE','LABOUR')),
  base_uom          text NOT NULL REFERENCES master.uom(code),
  hsn_sac           text,
  gst_rate          numeric(9,4),
  brand             text,
  specification     jsonb,
  is_batch_tracked  boolean NOT NULL DEFAULT false,
  is_steel          boolean NOT NULL DEFAULT false,   -- drives BBS reconciliation
  is_cement         boolean NOT NULL DEFAULT false,
  reorder_level     numeric(18,4),
  lead_time_days    int,
  wastage_tolerance_pct numeric(9,4) DEFAULT 0,
  status            text NOT NULL DEFAULT 'ACTIVE',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code)
);
CREATE INDEX ix_item_name_trgm ON master.item USING gin (name gin_trgm_ops);

CREATE TABLE master.uom_conversion (
  id          uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id   uuid NOT NULL,
  item_id     uuid NOT NULL REFERENCES master.item(id),
  from_uom    text NOT NULL REFERENCES master.uom(code),
  to_uom      text NOT NULL REFERENCES master.uom(code),
  factor      numeric(18,8) NOT NULL CHECK (factor > 0),
  UNIQUE (item_id, from_uom, to_uom)
);

-- Effective-dated purchase price per vendor (no overlapping periods).
CREATE TABLE master.item_price (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  item_id        uuid NOT NULL REFERENCES master.item(id),
  vendor_id      uuid REFERENCES master.vendor(id),
  project_id     uuid REFERENCES master.project(id),
  uom            text NOT NULL REFERENCES master.uom(code),
  rate           numeric(18,4) NOT NULL CHECK (rate >= 0),
  effective_from date NOT NULL,
  effective_to   date,
  source         text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','PO','RATE_CONTRACT','QUOTATION')),
  EXCLUDE USING gist (
    tenant_id WITH =, item_id WITH =,
    COALESCE(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    COALESCE(project_id,'00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    daterange(effective_from, COALESCE(effective_to,'infinity'::date), '[)') WITH &&
  )
);

CREATE TABLE master.cost_head (
  id          uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id   uuid NOT NULL,
  parent_id   uuid REFERENCES master.cost_head(id),
  code        text NOT NULL,
  name        text NOT NULL,
  cost_type   text NOT NULL CHECK (cost_type IN ('DIRECT','INDIRECT','OVERHEAD','FINANCE','STATUTORY','CONTINGENCY')),
  gl_account_id uuid,
  is_leaf     boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);

CREATE TABLE master.gl_account (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  company_id    uuid REFERENCES master.company(id),
  parent_id     uuid REFERENCES master.gl_account(id),
  code          text NOT NULL,
  name          text NOT NULL,
  account_type  text NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
  is_posting    boolean NOT NULL DEFAULT true,     -- only leaves accept postings
  is_control    boolean NOT NULL DEFAULT false,    -- vendor/customer/member control accounts
  control_of    text CHECK (control_of IN ('VENDOR','CUSTOMER','MEMBER','EMPLOYEE','STOCK','BANK','CASH')),
  tally_ledger_name text,
  tally_group_name  text,
  is_fum        boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (tenant_id, company_id, code)
);

CREATE TABLE master.store_location (
  id          uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id   uuid NOT NULL,
  project_id  uuid NOT NULL REFERENCES master.project(id),
  code        text NOT NULL,
  name        text NOT NULL,
  address     jsonb,
  keeper_user_id uuid REFERENCES core.user_account(id),
  status      text NOT NULL DEFAULT 'ACTIVE',
  UNIQUE (tenant_id, project_id, code)
);

-- =============================================================================
-- TAX MASTERS (effective-dated; never hard-coded - BRD A-01)
-- =============================================================================

CREATE TABLE master.tds_section (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid,                              -- null = platform default
  section        text NOT NULL,                     -- '194C','194J','194Q','194I','194IA','194H'
  description    text NOT NULL,
  deductee_type  text NOT NULL CHECK (deductee_type IN ('INDIVIDUAL_HUF','COMPANY','FIRM','ANY')),
  rate_pct       numeric(9,4) NOT NULL,
  rate_no_pan_pct numeric(9,4) NOT NULL DEFAULT 20,
  single_txn_threshold numeric(18,4),
  annual_threshold     numeric(18,4),
  effective_from date NOT NULL,
  effective_to   date,
  EXCLUDE USING gist (
    COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    section WITH =, deductee_type WITH =,
    daterange(effective_from, COALESCE(effective_to,'infinity'::date), '[)') WITH &&
  )
);

CREATE TABLE master.tax_code (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid,
  code           text NOT NULL,                     -- 'GST18','GST5_NOITC','RCM18'
  description    text NOT NULL,
  cgst_pct       numeric(9,4) NOT NULL DEFAULT 0,
  sgst_pct       numeric(9,4) NOT NULL DEFAULT 0,
  igst_pct       numeric(9,4) NOT NULL DEFAULT 0,
  cess_pct       numeric(9,4) NOT NULL DEFAULT 0,
  is_rcm         boolean NOT NULL DEFAULT false,
  itc_eligible   boolean NOT NULL DEFAULT true,
  blocked_reason text,                              -- Sec 17(5) clause when ineligible
  effective_from date NOT NULL,
  effective_to   date
);

CREATE TABLE master.ldc_certificate (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  vendor_id     uuid NOT NULL REFERENCES master.vendor(id),
  certificate_no text NOT NULL,
  section       text NOT NULL,
  rate_pct      numeric(9,4) NOT NULL,
  limit_amount  numeric(18,4) NOT NULL,
  consumed_amount numeric(18,4) NOT NULL DEFAULT 0,
  valid_from    date NOT NULL,
  valid_to      date NOT NULL,
  document_id   uuid REFERENCES doc.document(id),
  status        text NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT ldc_limit CHECK (consumed_amount <= limit_amount)
);

-- =============================================================================
-- APPLY RLS TO MASTER
-- =============================================================================
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relnamespace::regnamespace::text AS s, c.relname AS n
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'
     WHERE c.relkind IN ('r','p') AND c.relnamespace::regnamespace::text = 'master'
       AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
  LOOP
    BEGIN
      PERFORM core.apply_tenant_rls(t.s, t.n);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
