# Phase 3 — Technical Design Specification (TDS)

**Document ID:** AICOS-TDS-001 · **Version:** 1.0

---

## 1. Objective

Select the technology stack with reasoning, define the internal structure of the application, and specify the cross-cutting technical mechanisms (tenancy, transactions, events, idempotency, concurrency, offline sync, integrations, AI plumbing) precisely enough that an engineering team can build without re-deciding.

---

## 2. Technology selection

### 2.1 Backend runtime

| Option | Strengths | Weaknesses | Verdict |
|---|---|---|---|
| **NestJS (Node 22 + TypeScript)** | One language across web/mobile/backend; strong DI and module boundaries; excellent DX; large Indian hiring pool; first-class AI SDK support | Weaker for CPU-bound numeric work; discipline required to keep a monolith modular | **Selected** |
| Java (Spring Boot) | Best-in-class for financial systems; mature transaction handling | Slower iteration; heavier ops; costlier hiring at this size | Runner-up |
| .NET 8 | Excellent ERP heritage, strong typing, good performance | Smaller local talent pool in this segment; licensing perception | Rejected |
| Python (Django/FastAPI) | Fastest AI/ML integration | Weaker typing discipline for a 300-table ERP; ORM strain at scale | Rejected for core; used for ML jobs |

**Decision:** NestJS, with **all financial invariants enforced in PostgreSQL** (constraints, triggers, RLS) rather than only in application code — this neutralises the main argument against Node for financial systems.

### 2.2 Data layer

| Concern | Choice | Rationale |
|---|---|---|
| Primary OLTP | **PostgreSQL 16** (AWS RDS, Multi-AZ) | Transactions, RLS for tenancy, JSONB for flexible metadata, `numeric` for money, partitioning, `pgvector` for AI retrieval, `pg_trgm` for fuzzy matching — one engine covers OLTP + search + vectors at our scale |
| ORM | **Drizzle ORM** (SQL-first) + raw SQL for reports | Prisma's abstraction hurts on complex ERP joins; Drizzle keeps SQL visible and typed |
| Migrations | Drizzle Kit, forward-only, reviewed | Every schema change is a versioned artefact |
| Cache / queues | **Redis 7** (ElastiCache) + **BullMQ** | Sessions, rate limits, hot lookups, background jobs, scheduled jobs |
| Object storage | **S3** (`ap-south-1`) with Object Lock for legal hold | Documents, photos, statements, exports |
| Search | Postgres FTS + `pg_trgm` in Wave 1; **OpenSearch** only if document search exceeds ~5M docs | Avoid premature operational burden |
| Analytics | Read replica in W1–W2; **columnar warehouse** (Redshift Serverless / DuckDB-on-S3) in W3 | Keep reporting off the primary |
| Vectors | `pgvector` (HNSW) | Same backup/restore/RLS story as the rest of the data |

### 2.3 Frontend

- **React 19 + TypeScript + Vite**; **TanStack Router** (typed routes) and **TanStack Query** (server state, optimistic updates, offline hints).
- **Tailwind CSS + shadcn/ui (Radix)** — accessible primitives, fast to build a consistent ERP design system.
- **AG Grid Community** for data-dense grids (BOQ, stock, reconciliation, member grid). ERP lives and dies by its grid; hand-rolling one is a trap.
- **react-hook-form + Zod**, with **schemas shared between client and server** from a `packages/contracts` workspace — one definition of a valid Purchase Order.
- Charts: **Recharts** (dashboards), **frappe-gantt** or **vis-timeline** (bar charts / Gantt).
- Excel: **SheetJS** for import/export (non-negotiable for ERP adoption).

### 2.4 Mobile

**React Native (Expo, dev-client)** — one team, one language, shared contracts and validation with web.
Offline layer: **WatermelonDB (SQLite)** for site-capture entities only, with an outbound mutation queue (§9). Camera with EXIF+GPS watermarking, background upload, push via **FCM/APNs**.
Rejected: Flutter (second language, no contract sharing), PWA-only (camera/background upload/offline reliability insufficient for site use).

### 2.5 Identity

**Keycloak** (self-hosted on ECS, Postgres-backed) — OIDC, MFA (TOTP/SMS), per-tenant realms or a single realm with tenant claims, SSO-ready for the SaaS phase, no per-MAU cost.
Site staff log in with **phone + OTP**; office staff with email + password + MFA. Cognito was rejected on customisation limits; Auth0 on cost at SaaS scale.

### 2.6 AI

- **Claude models via the Anthropic API**, routed by task (Phase 11 §3): `claude-haiku-4-5` for high-volume classification/extraction, `claude-sonnet-5` for agentic workflows and reconciliation reasoning, `claude-opus-5` for complex document analysis (development agreements, feasibility, anomaly investigation).
- **OCR:** hybrid — AWS Textract for table-heavy structured documents (bank statements, BOQ scans), Claude vision for semantic extraction and messy real-world photos. Confidence from both is combined (Phase 11 §5).
- Orchestration: **in-house tool-calling loop** in the backend (no LangChain) — an ERP needs deterministic, auditable, permission-scoped tools, not framework magic.
- Retrieval: `pgvector` + BM25 hybrid, chunked per document with tenant/project scoping enforced in the SQL predicate, never in the prompt.

### 2.7 Cloud & platform

**AWS `ap-south-1` (Mumbai)** — data residency (DPDP Act 2023), latency, and mature managed services. Compute on **ECS Fargate** (not EKS: Kubernetes is unjustified operational cost for a team this size; migration path exists if needed). CloudFront + S3 for the SPA, ALB for the API, RDS Multi-AZ, ElastiCache, SQS/EventBridge for async, Secrets Manager, KMS, CloudWatch + OpenTelemetry.

### 2.8 Stack summary

```
Web:      React 19 · TS · Vite · TanStack · Tailwind/shadcn · AG Grid · Zod
Mobile:   React Native (Expo) · WatermelonDB · FCM
API:      NestJS · TS · Drizzle · Zod · BullMQ · OpenAPI
Data:     PostgreSQL 16 (+pgvector, pg_trgm) · Redis · S3
Identity: Keycloak (OIDC) · MFA · phone-OTP
AI:       Claude (Haiku/Sonnet/Opus routing) · Textract · pgvector RAG
Cloud:    AWS ap-south-1 · ECS Fargate · RDS Multi-AZ · CloudFront · KMS
Ops:      GitHub Actions · Terraform · OpenTelemetry · Grafana/CloudWatch · Sentry
```

---

## 3. Application architecture — the modulith

A **modular monolith**: one deployable, hard internal boundaries. Microservices are deliberately rejected at this team size (Exec §D-04); the boundaries below make extraction cheap later.

```
apps/
  api/                  NestJS HTTP + workers (single deployable, multiple run modes)
  web/                  React SPA
  mobile/               React Native
  tally-connector/      Windows-side agent (Node, packaged binary)
packages/
  contracts/            Zod schemas + generated TS types + OpenAPI (shared by all apps)
  domain/               Pure domain logic: calculators, rule engine, state machines (no I/O)
  db/                   Drizzle schema, migrations, RLS policies, seed data
  ui/                   Shared design-system components
  ai-kit/               Prompt registry, tool definitions, model router, eval harness
```

### 3.1 Module structure (repeated per domain module)

```
src/modules/procurement/
  api/            controllers, DTOs (Zod), OpenAPI decorators
  application/    use-cases (one class per business action), transaction boundaries
  domain/         entities, value objects, invariants, state machine
  infrastructure/ repositories (Drizzle), external adapters
  events/         published + subscribed domain events
  procurement.module.ts
```

**Rules enforced in CI:**
1. A module may import another module **only** through its `public/` barrel (index) — enforced by `dependency-cruiser`.
2. Cross-module writes are forbidden; a module writes only its own tables. Cross-module effects go through domain events.
3. `packages/domain` has zero I/O imports — it is unit-testable without a database.
4. Every use-case declares its required permission; a missing declaration fails the build.

### 3.2 Layering

```
HTTP / Job / Webhook / AI-tool  →  Use-case (application)
                                     ↓  (guards: authN, authZ, tenant, period-lock, idempotency)
                                   Domain (invariants, calculations, state transitions)
                                     ↓
                                   Repository (Drizzle, tenant-scoped session)
                                     ↓
                                   PostgreSQL (constraints + RLS = last line of defence)
```

**The same use-case layer serves the web API, background jobs, and AI tools.** An AI agent calling "create purchase requisition" runs the identical validation, permission and audit path as a human. This is the single most important design decision for AI safety in this system.

---

## 4. Multi-tenancy

**Model:** shared database, shared schema, `tenant_id` on every table, enforced by **PostgreSQL Row-Level Security**.

Rejected alternatives: schema-per-tenant (migration pain past ~50 tenants), database-per-tenant (cost, connection sprawl) — both remain available for a future enterprise tier.

```sql
-- Every tenant-owned table
ALTER TABLE purchase_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON purchase_order
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Project-level visibility, layered on top
CREATE POLICY project_scope ON purchase_order
  USING (
    current_setting('app.all_projects', true) = 'true'
    OR project_id = ANY (string_to_array(current_setting('app.project_ids', true), ',')::uuid[])
  );
```

Every request checks out a pooled connection and sets the session context inside the transaction:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT set_config('app.tenant_id',   ${ctx.tenantId},  true)`);
  await tx.execute(sql`SELECT set_config('app.user_id',     ${ctx.userId},    true)`);
  await tx.execute(sql`SELECT set_config('app.project_ids', ${ctx.projectIds.join(',')}, true)`);
  await tx.execute(sql`SELECT set_config('app.all_projects',${String(ctx.allProjects)},  true)`);
  return work(tx);
});
```

Notes: `set_config(..., true)` is transaction-local, so a pooled connection cannot leak context. The application role is **not** the table owner and has no `BYPASSRLS`. Migrations run as a separate privileged role. A CI test asserts that every table with a `tenant_id` column has RLS enabled — a missing policy fails the build.

---

## 5. Transactions, concurrency and money

### 5.1 Transaction boundaries
One use-case = one database transaction. Never call an external API inside a transaction; enqueue via the transactional outbox instead (§6). Default isolation `READ COMMITTED`; `REPEATABLE READ` for stock movements and number allocation.

### 5.2 Concurrency control
- **Optimistic locking** on all editable documents: every row has `version int`; `UPDATE ... WHERE id = $1 AND version = $2`; zero rows affected → `409 Conflict` with a diff for the user.
- **Pessimistic locking** for stock: `SELECT ... FOR UPDATE` on `stock_balance` rows before a movement, ordered by primary key to avoid deadlocks.
- **Advisory locks** for sequence allocation: `pg_advisory_xact_lock(hashtext(series_key))` guarantees gap-free numbering without a global bottleneck.

### 5.3 Money
`NUMERIC(18,4)` everywhere. No floats, ever — a lint rule bans `float`/`double precision` in migrations. Rounding to 2 decimals happens only at presentation and at statutory computation points, using **banker's-rounding-free** commercial rounding (`ROUND(x, 2)` half-up), applied consistently and centrally in `packages/domain/money.ts`. Every amount column is accompanied by `currency_code` (default `INR`) even though multi-currency is deferred — retrofitting currency is expensive.

Tax amounts are stored per line **and** per document, with a constraint that the document total equals the sum of lines within ₹1 tolerance (rounding difference is booked to a rounding account).

### 5.4 Idempotency
All mutating endpoints accept `Idempotency-Key`. The key plus a request-body hash is stored with the response for 24 hours; a repeat returns the stored response. Mandatory for mobile/offline sync, payment operations and webhook handlers.

---

## 6. Events and the outbox

Domain events are the only cross-module write mechanism.

```
Use-case transaction:
  1. write business rows
  2. INSERT INTO outbox_event (id, tenant_id, type, payload, occurred_at)   -- same tx
  COMMIT
Relay worker:
  poll outbox → publish to EventBridge/SQS → mark dispatched (at-least-once)
Consumers:
  idempotent by event id; failures → retry with backoff → DLQ → admin alert
```

Core event catalogue (versioned, `v1` suffix): `PurchaseRequisitionApproved`, `PurchaseOrderApproved`, `GoodsReceived`, `MaterialIssued`, `PurchaseInvoiceBooked`, `PaymentApproved`, `PaymentReleased`, `BankLineMatched`, `JournalPosted`, `RaBillCertified`, `MemberObligationDue`, `DprSubmitted`, `BudgetThresholdBreached`, `ComplianceDueSoon`, `DocumentUploaded`.

Consumers include: GL posting, notification bus, Tally sync queue, KPI/snapshot updates, exception engine, AI indexing (document → chunk → embed).

---

## 7. Approval and workflow engine

Workflows are **data, not code**.

```ts
type WorkflowDefinition = {
  documentType: string;                 // 'purchase_order'
  states: string[];
  transitions: Array<{
    from: string; to: string; action: string;
    guard?: RuleExpression;             // JSON-logic style, evaluated in packages/domain
    effects?: Array<'allocate_number'|'freeze_doa'|'post_gl'|'emit_event'>;
    requiredPermission: string;
  }>;
  slaHours?: Record<string, number>;    // per state, drives escalation
};
```

**DOA resolution** happens once, at submit:

```
resolveApprovers({company, project, docType, amount, costCategory, budgetState})
  → ordered steps [{ sequence, approverType: ROLE|USER, approverRef, condition? }]
  → persisted to approval_instance + approval_step, with a snapshot of the matching rule id
```

The document's content hash is stored on the instance. Any edit changes the hash and invalidates prior approvals (BR-PLT-04). Escalation is a scheduled job that walks overdue steps and notifies up the chain.

---

## 8. Rule engine (business & compliance rules)

Statutory and business rules are configuration with effective dates, evaluated by a small deterministic engine — **not** by AI.

```ts
type Rule = {
  code: 'BR-PAY-04'; scope: 'tenant'|'company'|'project';
  effectiveFrom: Date; effectiveTo?: Date;
  when: Expression;                 // typed AST over a documented fact model
  then: { severity: 'BLOCK'|'WARN'|'INFO'; message: string; params?: object };
};
```

Rules are versioned, unit-tested with fixtures, and every evaluation is logged against the document (`rule_evaluation` table) so an auditor can see which rule version passed or failed on a given date. Tax rates, thresholds and tolerances are rows, never constants (BRD A-01).

---

## 9. Offline synchronisation (mobile)

**Scope:** DPR, attendance/muster, GRN, material issue, measurements, photos, PR creation. **Never:** approvals, payments, postings.

```
Local (WatermelonDB)                 Server
─────────────────────                ──────
mutation queue (ordered)   ──POST /sync/batch──►  per-item processing
  {clientId, entity, op,                          (idempotent by clientId)
   payload, capturedAt,                    ◄──   results[]: applied | conflict | rejected
   deviceId, attempt}                              + server entity versions
pull: GET /sync/changes?since=cursor  ◄────────   changed rows for the device's projects
```

Rules:
- Every offline-created record carries a client-generated UUID; the server upserts on it (idempotent).
- `capturedAt` (device) and `receivedAt` (server) are both stored; business dating uses `capturedAt`, audit uses both.
- **Last-write-wins is banned.** Conflicts (server version newer) return `conflict` with both versions; the app shows a resolution screen. Financially relevant entities reject rather than merge.
- Reference data (items, vendors, BOQ lines, open POs for my projects) is pulled and cached with a delta cursor; cache TTL 7 days, then read-only until refresh.
- Photos upload separately via presigned S3 URLs with resumable multipart; the DPR references the object key and tolerates a pending upload state.
- Device clock skew is measured on each sync and recorded; skew > 10 minutes flags the record.

---

## 10. Integration architecture

### 10.1 Tally connector (the one that matters most)

Tally Prime is a desktop application exposing an **HTTP XML gateway on port 9000**, on the client's LAN. It cannot be reached from the cloud. Therefore:

```
AI-COS (cloud)                     Client Windows host
──────────────                     ───────────────────
tally_sync_queue  ◄── mTLS, outbound-only poll ──  tally-connector agent (Windows service)
                                                     │ HTTP XML → localhost:9000 (Tally)
                                                     │ parse response, capture Tally GUID
                  ── POST /tally/ack (status) ──────►│
```

- The agent **initiates** all connections; no inbound port is opened at the client site.
- Each voucher carries `REMOTEID = aicos:{tenant}:{voucher_uuid}` so re-push updates instead of duplicating.
- Master sync (ledgers, stock items, cost centres) runs before voucher sync; a missing ledger auto-creates from the `tally_ledger_map`.
- Failures are typed (`LEDGER_NOT_FOUND`, `PERIOD_LOCKED`, `DUPLICATE`, `TALLY_OFFLINE`) and retried with backoff; permanent failures surface in the sync console.
- A nightly job compares AI-COS ledger balances with Tally's (via `Trial Balance` XML export) and writes a drift report; drift > ₹1 blocks period close.
- One-way only (Exec §C-2). Tally-side edits appear as drift, never as an inbound update.

### 10.2 Other integrations

| Integration | Pattern | Failure handling |
|---|---|---|
| Bank statements | Upload / scheduled IMAP fetch / (W3) Account Aggregator | Parse errors quarantined with the raw file retained |
| GSP (e-invoice, e-way bill, GSTR-2B) | REST, per-GSTIN tokens in Secrets Manager | Retry with backoff; IRN failures block invoice issue where mandatory |
| WhatsApp Business (BSP) | Outbound templates; inbound webhook with signature verification | Delivery status tracked per message; fallback to SMS/email |
| Email | SES outbound (DKIM/SPF/DMARC); IMAP inbound for invoice capture | Bounce/complaint handling; inbound quarantined until classified |
| Push | FCM/APNs via a device registry | Token invalidation cleanup |
| Payment gateway (W3) | Hosted checkout + signed webhook | Reconcile against settlement reports, never trust the client callback |
| e-Sign (W3) | Provider REST + callback | Signed-document hash stored |

All outbound integrations run through a shared **connector framework**: typed config, secret handling, circuit breaker, rate limiter, retry policy, structured logging with request/response capture (PII-redacted), and a health endpoint feeding the integration console.

---

## 11. AI plumbing (technical view; behaviour in Phase 11)

```
Request → AgentRuntime
  ├─ Persona resolution (system prompt vN, tool allowlist, data scope, approval policy)
  ├─ Context assembly (RAG: hybrid pgvector + BM25, SQL-filtered by tenant/project/permission)
  ├─ Model router (task class + payload size + confidence history → haiku | sonnet | opus)
  ├─ Tool loop (tools are the SAME use-cases as the HTTP API, permission-checked per call)
  ├─ Output validation (Zod schema; retry once on parse failure; then escalate to human)
  └─ Trace persistence (prompt version, model, tokens, cost, latency, tool calls, citations)
```

Hard technical constraints:
- **Tools are permission-scoped to the invoking user**, not to a service account. An agent can never see or do more than the human who triggered it.
- **No agent holds a write tool for money.** Payment/journal/approval tools are absent from every persona's allowlist; agents can only draft (`create_draft_*`).
- All extractions return `{value, confidence, sourceRef:{documentId, page, bbox}}` so the UI can highlight the exact source region.
- Prompts are versioned files in `packages/ai-kit/prompts/` with an eval suite; a prompt change requires passing the golden-set evaluation in CI.
- Cost guard: per-tenant monthly AI budget with soft (alert) and hard (degrade to cheaper model / queue) limits.

---

## 12. Security design

| Layer | Control |
|---|---|
| Network | Private subnets for RDS/Redis/ECS; ALB only public; WAF (OWASP + rate limiting); no SSH (SSM Session Manager) |
| Transport | TLS 1.3; HSTS; certificate management via ACM |
| Identity | OIDC (Keycloak); access token 15 min, refresh 12 h with rotation and reuse detection; MFA by role; step-up auth for payments/admin |
| Authorisation | Permission checked in the use-case guard **and** RLS at the database — defence in depth |
| Data at rest | KMS-encrypted RDS, S3, EBS; per-tenant envelope keys for documents; column-level encryption for PAN/Aadhaar/bank |
| Secrets | AWS Secrets Manager with rotation; no secrets in env files or code; connector secrets scoped per tenant |
| PII | Field-level masking by default; unmask is a privileged, audited action; DPDP consent records for member/customer data |
| Files | Virus scan (ClamAV) before availability; content-type sniffing; presigned URLs ≤ 10 min, single-use for sensitive docs |
| Injection | Parameterised queries only; no string-built SQL; AI-generated SQL restricted to an allow-listed semantic layer with parameter binding |
| Prompt injection | Documents/emails/WhatsApp are untrusted input: instructions inside them are never followed; agent output is schema-validated; tools are allow-listed; no tool can escalate scope |
| Audit | Append-only `audit_log` (DB-level revoke of UPDATE/DELETE); daily hash-chain anchoring; 8-year retention |
| Application | Helmet, CSRF for cookie flows, strict CORS allow-list, request size limits, dependency scanning, SAST/DAST in CI |

---

## 13. Performance design

| Technique | Where |
|---|---|
| Keyset (cursor) pagination | All list endpoints; offset pagination banned beyond page 100 |
| Covering indexes on `(tenant_id, project_id, status, created_at desc)` | Every transactional list screen |
| Materialised `stock_balance` maintained by trigger from `stock_ledger` | Avoids summing a growing ledger |
| Nightly `kpi_snapshot` + hourly incremental refresh | Dashboards never aggregate raw transactions live |
| Partitioning by `created_at` (monthly) | `audit_log`, `stock_ledger`, `journal_line`, `notification`, `ai_trace` |
| Redis caching | Permission sets (TTL 5 min, invalidated on role change), master lookups, dashboard tiles (TTL 60 s) |
| Read replica routing | All reports and analytics |
| Async jobs | PDF/Excel generation, bulk imports, AI extraction, notifications, Tally sync |
| N+1 elimination | DataLoader batching; a CI test fails on query count regressions in key endpoints |
| Payload discipline | List endpoints return projections, never full aggregates; documents fetched on demand |

**Budgets:** P95 API read < 400 ms · write < 800 ms · list of 50 rows < 300 ms · dashboard < 3 s (from snapshots) · mobile sync batch of 100 mutations < 5 s · AI extraction of a 1-page invoice < 8 s.

---

## 14. Error handling and observability

Uniform error envelope:

```json
{ "error": { "code": "BUDGET_EXCEEDED", "message": "BOQ line budget exhausted",
  "details": { "boqLineId": "…", "available": "12500.0000", "requested": "48000.0000" },
  "traceId": "01J…", "ruleCode": "BR-001" } }
```

Error codes are a versioned enum shared via `packages/contracts` so the UI can render specific, actionable messages (and Hindi/Marathi translations).

Observability: OpenTelemetry traces across HTTP → use-case → SQL → external calls; structured JSON logs with `traceId`, `tenantId`, `userId`, `documentId` (PII redacted); RED metrics per endpoint plus business metrics (approvals pending, sync lag, auto-match rate, AI cost/day); Sentry for exceptions; synthetic checks on login, PR creation, Tally sync heartbeat. Alert thresholds and runbooks in Phase 10.

---

## 15. Environments and configuration

`local` (Docker Compose: Postgres, Redis, MinIO, Keycloak, mock Tally) → `dev` → `staging` (anonymised production-shaped data) → `production`. Configuration by environment variables validated at boot with Zod; the app refuses to start on invalid config. Feature flags per tenant for progressive rollout. Database migrations run as a separate CI step with an approval gate for production.

---

## 16. Technical risks and mitigations

| Risk | Mitigation |
|---|---|
| Modulith degrades into a big ball of mud | Import boundaries enforced in CI; module ownership; architecture fitness tests |
| RLS misconfiguration leaks tenant data | CI test asserting RLS on every tenant table + automated cross-tenant probe tests in staging |
| Tally connector unreliability at the client site | Outbound-only agent, offline queue, health heartbeat, drift report, documented manual fallback |
| AI extraction errors reaching the ledger | Confidence gates, mandatory human approval, source citation, golden-set evals in CI |
| Offline sync conflicts corrupting site data | No LWW, idempotent upserts, explicit conflict UI, financial entities online-only |
| Postgres becomes the bottleneck | Read replicas, partitioning, snapshot tables; warehouse offload in W3 |
| AI cost overrun | Model routing, caching, per-tenant budget with hard limits, cost per document tracked as a KPI |
| Key-person dependency in engineering | ADRs for every significant decision, ≥ 2 reviewers, no single-owner modules |
