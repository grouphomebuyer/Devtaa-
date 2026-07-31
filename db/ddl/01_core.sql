-- =============================================================================
-- AI-COS  |  01_core.sql
-- Extensions, schemas, roles, tenancy, identity, RBAC, DOA, workflow,
-- numbering, audit, settings, documents, notifications, outbox.
-- PostgreSQL 16
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS master;
CREATE SCHEMA IF NOT EXISTS plan;
CREATE SCHEMA IF NOT EXISTS proc;
CREATE SCHEMA IF NOT EXISTS inv;
CREATE SCHEMA IF NOT EXISTS site;
CREATE SCHEMA IF NOT EXISTS fin;
CREATE SCHEMA IF NOT EXISTS comp;
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS doc;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS rpt;

-- -----------------------------------------------------------------------------
-- Database roles.  The application NEVER connects as the table owner and never
-- has BYPASSRLS.  Migrations run as aicos_migrator.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicos_app')      THEN CREATE ROLE aicos_app      NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicos_readonly') THEN CREATE ROLE aicos_readonly NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicos_migrator') THEN CREATE ROLE aicos_migrator NOLOGIN; END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- UUID v7 (time-ordered) - index friendly, safe for offline generation.
CREATE OR REPLACE FUNCTION core.uuid_v7() RETURNS uuid
LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(set_bit(overlay(uuid_send(gen_random_uuid())
      PLACING substring(int8send((extract(epoch FROM clock_timestamp())*1000)::bigint) FROM 3)
      FROM 1 FOR 6), 52, 1), 53, 1), 'hex')::uuid;
$$;

CREATE OR REPLACE FUNCTION core.current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION core.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

-- Applies tenant RLS + standard grants to a table in one call.
CREATE OR REPLACE FUNCTION core.apply_tenant_rls(p_schema text, p_table text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', p_schema, p_table);
  EXECUTE format($f$
    CREATE POLICY tenant_isolation ON %I.%I
      USING (tenant_id = core.current_tenant())
      WITH CHECK (tenant_id = core.current_tenant())
  $f$, p_schema, p_table);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I.%I TO aicos_app', p_schema, p_table);
  EXECUTE format('GRANT SELECT ON %I.%I TO aicos_readonly', p_schema, p_table);
END $$;

-- Maintains updated_at and bumps the optimistic-lock version on every UPDATE.
CREATE OR REPLACE FUNCTION core.touch_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(core.current_user_id(), NEW.updated_by);
  NEW.version    := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END $$;

-- =============================================================================
-- TENANCY & IDENTITY
-- =============================================================================

CREATE TABLE core.tenant (
  id              uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  plan_code       text NOT NULL DEFAULT 'STANDARD',
  data_region     text NOT NULL DEFAULT 'ap-south-1',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 1
);

CREATE TABLE core.user_account (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id         uuid NOT NULL REFERENCES core.tenant(id) ON DELETE RESTRICT,
  external_subject  text,                       -- Keycloak "sub"
  email             citext,
  phone             text,
  full_name         text NOT NULL,
  status            text NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','DISABLED')),
  mfa_enrolled      boolean NOT NULL DEFAULT false,
  default_company_id uuid,
  locale            text NOT NULL DEFAULT 'en-IN',
  last_login_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  version           int NOT NULL DEFAULT 1,
  CONSTRAINT user_contact_present CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX uq_user_email ON core.user_account (tenant_id, email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX uq_user_phone ON core.user_account (tenant_id, phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE TRIGGER trg_touch BEFORE UPDATE ON core.user_account FOR EACH ROW EXECUTE FUNCTION core.touch_row();

-- =============================================================================
-- RBAC
-- =============================================================================

CREATE TABLE core.permission (
  code        text PRIMARY KEY,               -- e.g. 'purchase_order.approve'
  module      text NOT NULL,
  action      text NOT NULL,
  description text NOT NULL,
  is_sensitive boolean NOT NULL DEFAULT false -- requires step-up auth
);

CREATE TABLE core.role (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL REFERENCES core.tenant(id),
  code         text NOT NULL,
  name         text NOT NULL,
  is_system    boolean NOT NULL DEFAULT false, -- system roles are not editable
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, code)
);

CREATE TABLE core.role_permission (
  role_id         uuid NOT NULL REFERENCES core.role(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES core.permission(code),
  PRIMARY KEY (role_id, permission_code)
);

-- A user may hold different roles on different projects/companies.
CREATE TABLE core.user_role_assignment (
  id          uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id   uuid NOT NULL REFERENCES core.tenant(id),
  user_id     uuid NOT NULL REFERENCES core.user_account(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES core.role(id) ON DELETE CASCADE,
  scope_type  text NOT NULL CHECK (scope_type IN ('TENANT','COMPANY','PROJECT')),
  scope_id    uuid,                            -- null only when scope_type = TENANT
  valid_from  date NOT NULL DEFAULT CURRENT_DATE,
  valid_to    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  CONSTRAINT scope_id_required CHECK (scope_type = 'TENANT' OR scope_id IS NOT NULL),
  UNIQUE (user_id, role_id, scope_type, scope_id, valid_from)
);
CREATE INDEX ix_ura_user ON core.user_role_assignment (tenant_id, user_id);

-- Time-bounded approval delegation ("Director on leave").
CREATE TABLE core.delegation (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL REFERENCES core.tenant(id),
  from_user_id   uuid NOT NULL REFERENCES core.user_account(id),
  to_user_id     uuid NOT NULL REFERENCES core.user_account(id),
  document_types text[],                       -- null = all
  valid_from     timestamptz NOT NULL,
  valid_to       timestamptz NOT NULL,
  reason         text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NOT NULL,
  CONSTRAINT delegation_period CHECK (valid_to > valid_from),
  CONSTRAINT delegation_not_self CHECK (from_user_id <> to_user_id)
);

-- =============================================================================
-- DELEGATION OF AUTHORITY (approval routing matrix)
-- =============================================================================

CREATE TABLE core.doa_rule (
  id              uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id       uuid NOT NULL REFERENCES core.tenant(id),
  company_id      uuid,                       -- null = all companies
  project_id      uuid,                       -- null = all projects
  document_type   text NOT NULL,
  cost_category   text,                       -- null = any
  amount_from     numeric(18,4) NOT NULL DEFAULT 0,
  amount_to       numeric(18,4),              -- null = unbounded
  budget_state    text CHECK (budget_state IN ('WITHIN','BREACH','ANY')) DEFAULT 'ANY',
  priority        int NOT NULL DEFAULT 100,   -- lower wins on tie
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  version         int NOT NULL DEFAULT 1,
  CONSTRAINT amount_band_valid CHECK (amount_to IS NULL OR amount_to > amount_from)
);
CREATE INDEX ix_doa_lookup ON core.doa_rule (tenant_id, document_type, company_id, project_id, amount_from);

CREATE TABLE core.doa_rule_step (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  doa_rule_id    uuid NOT NULL REFERENCES core.doa_rule(id) ON DELETE CASCADE,
  sequence       int NOT NULL,
  approver_type  text NOT NULL CHECK (approver_type IN ('ROLE','USER','PROJECT_MANAGER','REPORTING_MANAGER')),
  approver_ref   uuid,                        -- role_id or user_id when applicable
  is_mandatory   boolean NOT NULL DEFAULT true,
  quorum         int NOT NULL DEFAULT 1,      -- any-of-N when > 1 approver resolves
  sla_hours      int,
  UNIQUE (doa_rule_id, sequence)
);

-- =============================================================================
-- WORKFLOW / APPROVALS
-- =============================================================================

CREATE TABLE core.workflow_definition (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL REFERENCES core.tenant(id),
  document_type text NOT NULL,
  version       int  NOT NULL DEFAULT 1,
  definition    jsonb NOT NULL,               -- states, transitions, guards, effects
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_type, version)
);

CREATE TABLE core.approval_instance (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL REFERENCES core.tenant(id),
  document_type  text NOT NULL,
  document_id    uuid NOT NULL,
  document_no    text,
  project_id     uuid,
  company_id     uuid,
  amount         numeric(18,4),
  content_hash   text NOT NULL,               -- invalidates approvals if the doc changes
  doa_rule_id    uuid REFERENCES core.doa_rule(id),
  status         text NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','APPROVED','REJECTED','RETURNED','CANCELLED')),
  current_step   int  NOT NULL DEFAULT 1,
  submitted_by   uuid NOT NULL REFERENCES core.user_account(id),
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  UNIQUE (document_type, document_id, content_hash)
);
CREATE INDEX ix_appr_pending ON core.approval_instance (tenant_id, status, submitted_at)
  WHERE status = 'PENDING';

CREATE TABLE core.approval_step (
  id                   uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  approval_instance_id uuid NOT NULL REFERENCES core.approval_instance(id) ON DELETE CASCADE,
  sequence             int NOT NULL,
  approver_type        text NOT NULL,
  approver_role_id     uuid REFERENCES core.role(id),
  approver_user_id     uuid REFERENCES core.user_account(id),
  status               text NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING','APPROVED','REJECTED','RETURNED','SKIPPED')),
  due_at               timestamptz,
  escalated_at         timestamptz,
  UNIQUE (approval_instance_id, sequence)
);
CREATE INDEX ix_step_inbox ON core.approval_step (approver_user_id, status) WHERE status = 'PENDING';

CREATE TABLE core.approval_action (
  id                uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  approval_step_id  uuid NOT NULL REFERENCES core.approval_step(id) ON DELETE CASCADE,
  actor_user_id     uuid NOT NULL REFERENCES core.user_account(id),
  on_behalf_of      uuid REFERENCES core.user_account(id),   -- delegation
  action            text NOT NULL CHECK (action IN ('APPROVE','REJECT','RETURN','COMMENT')),
  remarks           text,
  acted_at          timestamptz NOT NULL DEFAULT now(),
  ip                inet,
  device            text,
  CONSTRAINT remarks_required CHECK (action = 'APPROVE' OR remarks IS NOT NULL)
);

-- Segregation-of-duties exceptions are logged, not silently blocked (Exec C-12).
CREATE TABLE core.sod_exception (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL REFERENCES core.tenant(id),
  document_type text NOT NULL,
  document_id   uuid NOT NULL,
  user_id       uuid NOT NULL REFERENCES core.user_account(id),
  conflict_code text NOT NULL,                -- 'CREATOR_IS_APPROVER', ...
  justification text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- DOCUMENT NUMBERING (gap-free)
-- =============================================================================

CREATE TABLE core.number_series (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL REFERENCES core.tenant(id),
  company_id     uuid,
  project_id     uuid,
  document_type  text NOT NULL,
  financial_year text NOT NULL,               -- '25-26'
  pattern        text NOT NULL,               -- 'PO/{COMPANY}/{PROJECT}/{FY}/{SEQ:5}'
  next_value     bigint NOT NULL DEFAULT 1,
  is_active      boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, company_id, project_id, document_type, financial_year)
);

CREATE OR REPLACE FUNCTION core.next_document_no(p_series_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_seq bigint; v_pattern text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_series_id::text));
  UPDATE core.number_series
     SET next_value = next_value + 1
   WHERE id = p_series_id
  RETURNING next_value - 1, pattern INTO v_seq, v_pattern;
  IF v_seq IS NULL THEN RAISE EXCEPTION 'Number series % not found', p_series_id; END IF;
  RETURN replace(v_pattern, '{SEQ:5}', lpad(v_seq::text, 5, '0'));
END $$;

-- =============================================================================
-- FINANCIAL PERIODS
-- =============================================================================

CREATE TABLE core.financial_period (
  id           uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id    uuid NOT NULL REFERENCES core.tenant(id),
  company_id   uuid NOT NULL,
  fy           text NOT NULL,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  status       text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SOFT_CLOSED','LOCKED')),
  locked_by    uuid REFERENCES core.user_account(id),
  locked_at    timestamptz,
  reopen_reason text,
  UNIQUE (tenant_id, company_id, period_start),
  CONSTRAINT period_valid CHECK (period_end >= period_start)
);

CREATE OR REPLACE FUNCTION core.assert_period_open(p_company uuid, p_date date)
RETURNS void LANGUAGE plpgsql STABLE AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM core.financial_period
   WHERE company_id = p_company AND p_date BETWEEN period_start AND period_end;
  IF v_status = 'LOCKED' THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: cannot post to % for company %', p_date, p_company
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- =============================================================================
-- AUDIT LOG (append-only, monthly partitions)
-- =============================================================================

CREATE TABLE core.audit_log (
  id            uuid NOT NULL DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  action        text NOT NULL,
  actor_type    text NOT NULL DEFAULT 'USER'
                  CHECK (actor_type IN ('USER','SYSTEM','AI_AGENT','CONNECTOR')),
  actor_user_id uuid,
  actor_ref     text,                          -- agent/persona or connector id
  before        jsonb,
  after         jsonb,
  diff_keys     text[],
  reason        text,
  ip            inet,
  user_agent    text,
  request_id    text,
  trace_id      text,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  prev_hash     bytea,
  row_hash      bytea,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX ix_audit_entity ON core.audit_log (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_actor  ON core.audit_log (tenant_id, actor_user_id, occurred_at DESC);

-- Immutability is enforced by grants, not convention.
REVOKE UPDATE, DELETE ON core.audit_log FROM PUBLIC;
GRANT  INSERT, SELECT ON core.audit_log TO aicos_app;
GRANT  SELECT          ON core.audit_log TO aicos_readonly;

-- Example partitions; created ahead of time by a scheduled job.
CREATE TABLE core.audit_log_2026_07 PARTITION OF core.audit_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE core.audit_log_2026_08 PARTITION OF core.audit_log
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- =============================================================================
-- SETTINGS / RULES / FEATURE FLAGS
-- =============================================================================

CREATE TABLE core.setting_definition (
  key           text PRIMARY KEY,             -- 'proc.rfq_threshold_amount'
  data_type     text NOT NULL CHECK (data_type IN ('INT','DECIMAL','BOOL','TEXT','JSON','PERCENT','CRON')),
  default_value jsonb NOT NULL,
  scope_level   text NOT NULL CHECK (scope_level IN ('TENANT','COMPANY','PROJECT')),
  is_sensitive  boolean NOT NULL DEFAULT false, -- requires maker-checker
  description   text NOT NULL,
  validation    jsonb                          -- {min, max, enum:[...]}
);

CREATE TABLE core.setting_value (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL REFERENCES core.tenant(id),
  key            text NOT NULL REFERENCES core.setting_definition(key),
  scope_type     text NOT NULL CHECK (scope_type IN ('TENANT','COMPANY','PROJECT')),
  scope_id       uuid,
  value          jsonb NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  EXCLUDE USING gist (
    tenant_id WITH =, key WITH =, scope_type WITH =, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)') WITH &&
  )
);

-- Business/compliance rules as data (Phase 3 §8).
CREATE TABLE core.business_rule (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid REFERENCES core.tenant(id),  -- null = platform default
  code           text NOT NULL,                     -- 'BR-PAY-04'
  document_type  text,
  severity       text NOT NULL CHECK (severity IN ('BLOCK','WARN','INFO')),
  expression     jsonb NOT NULL,                    -- typed AST over the fact model
  message        text NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to   date,
  is_active      boolean NOT NULL DEFAULT true
);

CREATE TABLE core.rule_evaluation (
  id            uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  rule_id       uuid NOT NULL REFERENCES core.business_rule(id),
  document_type text NOT NULL,
  document_id   uuid NOT NULL,
  outcome       text NOT NULL CHECK (outcome IN ('PASS','WARN','FAIL','OVERRIDDEN')),
  facts         jsonb,
  overridden_by uuid,
  override_reason text,
  evaluated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.feature_flag (
  tenant_id  uuid NOT NULL REFERENCES core.tenant(id),
  flag       text NOT NULL,
  enabled    boolean NOT NULL DEFAULT false,
  rollout_pct int NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  PRIMARY KEY (tenant_id, flag)
);

-- =============================================================================
-- DOCUMENTS / ATTACHMENTS
-- =============================================================================

CREATE TABLE doc.document_type (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  category        text NOT NULL,
  metadata_schema jsonb,                       -- JSON schema for required metadata
  has_expiry      boolean NOT NULL DEFAULT false,
  retention_years int NOT NULL DEFAULT 8
);

CREATE TABLE doc.document (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL REFERENCES core.tenant(id),
  type_code      text REFERENCES doc.document_type(code),
  title          text NOT NULL,
  storage_key    text NOT NULL,                -- S3 object key
  sha256         bytea NOT NULL,
  size_bytes     bigint NOT NULL,
  mime_type      text NOT NULL,
  page_count     int,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocr_status     text NOT NULL DEFAULT 'PENDING'
                   CHECK (ocr_status IN ('PENDING','PROCESSING','DONE','FAILED','SKIPPED')),
  ocr_text       text,
  virus_scan     text NOT NULL DEFAULT 'PENDING'
                   CHECK (virus_scan IN ('PENDING','CLEAN','INFECTED','FAILED')),
  expires_on     date,
  legal_hold     boolean NOT NULL DEFAULT false,
  retention_until date,
  uploaded_by    uuid REFERENCES core.user_account(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  version        int NOT NULL DEFAULT 1
);
CREATE INDEX ix_doc_sha    ON doc.document (tenant_id, sha256);          -- duplicate detection
CREATE INDEX ix_doc_expiry ON doc.document (tenant_id, expires_on) WHERE expires_on IS NOT NULL;
CREATE INDEX ix_doc_fts    ON doc.document USING gin (to_tsvector('english', coalesce(ocr_text,'')));

CREATE TABLE doc.document_link (
  document_id uuid NOT NULL REFERENCES doc.document(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  link_role   text NOT NULL DEFAULT 'ATTACHMENT',  -- INVOICE, CHALLAN, PHOTO, AGREEMENT ...
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, entity_type, entity_id, link_role)
);
CREATE INDEX ix_doclink_entity ON doc.document_link (entity_type, entity_id);

-- =============================================================================
-- NOTIFICATIONS & OUTBOX
-- =============================================================================

CREATE TABLE core.notification (
  id            uuid NOT NULL DEFAULT core.uuid_v7(),
  tenant_id     uuid NOT NULL,
  user_id       uuid NOT NULL,
  category      text NOT NULL,
  severity      text NOT NULL DEFAULT 'NORMAL' CHECK (severity IN ('CRITICAL','HIGH','NORMAL','LOW')),
  title         text NOT NULL,
  body          text NOT NULL,
  deep_link     text,
  entity_type   text,
  entity_id     uuid,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
CREATE TABLE core.notification_2026_07 PARTITION OF core.notification
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE core.notification_delivery (
  id              uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  notification_id uuid NOT NULL,
  channel         text NOT NULL CHECK (channel IN ('IN_APP','EMAIL','WHATSAPP','PUSH','SMS')),
  status          text NOT NULL DEFAULT 'QUEUED'
                    CHECK (status IN ('QUEUED','SENT','DELIVERED','READ','FAILED')),
  provider_ref    text,
  error           text,
  attempts        int NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Transactional outbox: the only way modules affect each other.
CREATE TABLE core.outbox_event (
  id             uuid PRIMARY KEY DEFAULT core.uuid_v7(),
  tenant_id      uuid NOT NULL,
  event_type     text NOT NULL,                -- 'PurchaseOrderApproved.v1'
  aggregate_type text NOT NULL,
  aggregate_id   uuid NOT NULL,
  payload        jsonb NOT NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  dispatched_at  timestamptz,
  attempts       int NOT NULL DEFAULT 0,
  last_error     text
);
CREATE INDEX ix_outbox_undispatched ON core.outbox_event (occurred_at) WHERE dispatched_at IS NULL;

-- Idempotency for all mutating API calls (mobile/offline safety).
CREATE TABLE core.idempotency_key (
  key           text PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  user_id       uuid NOT NULL,
  request_hash  text NOT NULL,
  response_code int,
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '24 hours'
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
     WHERE c.relkind = 'r'
       AND c.relnamespace::regnamespace::text IN ('core','doc')
       AND c.relname <> 'tenant'
  LOOP
    PERFORM core.apply_tenant_rls(t.s, t.n);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA core, master, plan, proc, inv, site, fin, comp, sales, hr, doc, ai, rpt
  TO aicos_app, aicos_readonly;
