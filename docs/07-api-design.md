# Phase 7 — API Design

**Document ID:** AICOS-API-001 · **Version:** 1.0
**Machine-readable contract:** [`../api/openapi.yaml`](../api/openapi.yaml)

---

## 1. Objective

Define one API contract that serves the web app, the mobile app, external portals, the Tally connector, and the AI agent runtime — with consistent auth, errors, pagination, idempotency and versioning, so no client has to special-case anything.

---

## 2. Conventions

| Aspect | Convention |
|---|---|
| Style | REST + JSON, resource-oriented; **actions as sub-resources** (`POST /purchase-orders/{id}/approve`) rather than RPC verbs in paths |
| Base URL | `https://api.aicos.in/v1` |
| Versioning | URL major version (`/v1`); additive changes only within a version; breaking changes go to `/v2` with a 12-month overlap |
| Naming | plural kebab-case resources, `snake_case` JSON fields (matching the database, so there is one vocabulary end to end) |
| Dates | `date` as `YYYY-MM-DD`; timestamps as RFC 3339 UTC (`2026-07-31T14:23:11Z`); clients render IST |
| Money | **string** decimals (`"425000.0000"`) — never JSON numbers, which lose precision; always with `currency_code` |
| IDs | UUID v7 strings; clients may generate them (offline) |
| Content type | `application/json`; file upload via presigned S3 URLs, never multipart through the API |
| Compression | gzip/brotli; responses > 1 KB compressed |

---

## 3. Authentication & authorisation

```
POST /v1/auth/login            → { access_token (15 min), refresh_token (12 h), mfa_required }
POST /v1/auth/mfa/verify       → tokens on success
POST /v1/auth/refresh          → rotated pair; reuse of an old refresh token revokes the family
POST /v1/auth/otp/request      → site staff: phone OTP
POST /v1/auth/logout
GET  /v1/me                    → profile, companies, projects, permissions
```

All other endpoints require `Authorization: Bearer <jwt>`.

**Required headers**

| Header | Purpose |
|---|---|
| `X-Tenant-Id` | tenant scope (must match the JWT claim; mismatch → 403) |
| `X-Company-Id` | active legal entity for the request |
| `Idempotency-Key` | required on all `POST`/`PATCH` that create or change state |
| `X-Request-Id` | client correlation id, echoed in responses and logs |
| `X-Step-Up-Token` | required for sensitive actions (approve payment, release run, admin changes) |

**Authorisation:** every endpoint declares a permission (`purchase_order.approve`). Enforced in the guard *and* by RLS. External portals (vendor, society, customer) use a separate token audience with a hard-scoped `party_id` claim — a vendor token cannot address another vendor's resources even with a valid id.

---

## 4. Standard response shapes

**Single resource**
```json
{ "data": { "id": "01927…", "document_no": "PO/DEVT/GKS/25-26/00042", "…": "…" },
  "meta": { "request_id": "req_…", "version": 7 } }
```

**Collection (keyset pagination)**
```json
{ "data": [ … ],
  "meta": { "count": 50, "has_more": true,
            "next_cursor": "eyJpZCI6IjAxOTI3…" } }
```

Offset pagination is deliberately absent — it degrades and produces duplicates on large, actively-written tables.

**Error**
```json
{ "error": {
    "code": "BUDGET_EXCEEDED",
    "message": "BOQ line budget exhausted",
    "rule_code": "BR-001",
    "details": { "boq_line_id": "…", "available": "12500.0000", "requested": "48000.0000" },
    "field_errors": [ { "field": "lines[0].quantity", "code": "MAX_EXCEEDED", "message": "…" } ],
    "trace_id": "01J…" } }
```

| Status | Meaning in this API |
|---|---|
| 400 | malformed request |
| 401 | missing/invalid token |
| 403 | authenticated but not permitted (includes tenant/scope mismatch) |
| 404 | not found **or** not visible under RLS (deliberately indistinguishable) |
| 409 | optimistic-lock conflict, or state-transition not allowed |
| 422 | business-rule violation (`rule_code` always present) |
| 423 | locked (financial period closed, document frozen pending approval) |
| 429 | rate limited (`Retry-After` set) |
| 503 | dependency unavailable (Tally/GSP/AI) — always with a degradation hint |

**409 conflict responses include the current server version and a field-level diff**, so the UI can show "changed by Priya 4 minutes ago" rather than a generic failure.

---

## 5. Idempotency and concurrency

- `Idempotency-Key` + request-body hash stored 24 h. Same key + same body → the original response replayed. Same key + different body → `409 IDEMPOTENCY_KEY_REUSED`.
- Updates require `If-Match: <version>` (or `version` in the body). Mismatch → `409 STALE_VERSION`.
- Offline clients generate the resource `id` themselves; the server upserts on it, making retries safe by construction.

---

## 6. Endpoint catalogue

### 6.1 Masters
```
GET    /vendors                       ?q=&type=&status=&cursor=
POST   /vendors
GET    /vendors/{id}
PATCH  /vendors/{id}
POST   /vendors/{id}/bank-accounts               (maker)
POST   /vendors/{id}/bank-accounts/{bid}/verify  (checker; distinct user enforced)
POST   /vendors/validate-gstin
GET    /vendors/{id}/performance
GET    /items                         ?q=&category=&cursor=
POST   /items · POST /items/import
GET    /cost-heads/tree · GET /gl-accounts/tree
GET    /projects ?status=&engagement_model= · POST /projects · GET /projects/{id}
GET    /societies/{id}/members · POST /societies/{id}/members/import
```

### 6.2 Planning
```
POST   /projects/{id}/boq/import                 → job id (async)
GET    /projects/{id}/boq/versions
POST   /boq-versions/{id}/baseline
GET    /boq-lines/{id}/budget-availability       → { budget, committed, incurred, available }
POST   /boq-versions/{id}/revisions
GET    /projects/{id}/s-curve ?from=&to=
```

### 6.3 Procurement
```
GET/POST /purchase-requisitions
POST   /purchase-requisitions/{id}/submit
POST   /purchase-requisitions/{id}/cancel        { reason }
GET    /purchase-requisitions/open-lines ?project=&item=     (consolidation)
POST   /rfqs · POST /rfqs/{id}/quotations · GET /rfqs/{id}/comparative
POST   /purchase-orders                           { from_requisition_lines: [...] }
POST   /purchase-orders/{id}/submit|approve|dispatch|cancel|short-close
POST   /purchase-orders/{id}/amendments
GET    /purchase-orders/{id}/pdf                  → signed URL
GET    /purchase-orders ?status=pending_delivery&overdue=true
```

### 6.4 Inventory
```
POST   /goods-receipts                            (offline-capable, client id)
POST   /goods-receipts/{id}/inspect
GET    /stock/balances ?project=&store=&item=
GET    /stock/ledger  ?item=&from=&to=&cursor=
POST   /material-issues
POST   /stock-transfers · POST /stock-transfers/{id}/receive
POST   /physical-verifications · POST /physical-verifications/{id}/post
GET    /projects/{id}/material-reconciliation
```

### 6.5 Site & contracts
```
POST   /dpr · GET /dpr ?project=&date=
POST   /dpr/{id}/photos/presign                   → { url, fields, object_key }
POST   /measurements · POST /measurement-books/{id}/lock
POST   /ra-bills/generate                         { work_order_id, upto_date }
GET    /ra-bills/{id}/computation                 → full deduction breakdown
POST   /ra-bills/{id}/certify|approve
GET    /contractors/{id}/retention
POST   /ncrs · POST /ncrs/{id}/close
```

### 6.6 Finance
```
POST   /purchase-invoices
POST   /purchase-invoices/from-document           { document_id }  → AI-drafted invoice
GET    /purchase-invoices/{id}/match
POST   /purchase-invoices/{id}/override-match     { reason }
POST   /payment-requests · POST /payment-requests/{id}/submit
GET    /payment-requests ?status=pending_approval
POST   /payment-runs · POST /payment-runs/{id}/approve
GET    /payment-runs/{id}/bank-file ?format=hdfc_neft   (single-use signed URL, checksummed)
POST   /payment-vouchers/{id}/record-utr
POST   /bank-accounts/{id}/statements/upload      → job id
GET    /bank-statements/{id}/lines ?status=unmatched
POST   /reconciliation/auto-run                   { bank_account_id, statement_id }
GET    /reconciliation/suggestions ?line_id=
POST   /reconciliation/matches · DELETE /reconciliation/matches/{id}
POST   /bank-statement-lines/{id}/create-transaction
GET    /gl/trial-balance ?company=&as_on=
GET    /projects/{id}/pnl ?from=&to=
POST   /periods/{id}/close · POST /periods/{id}/reopen   (privileged, reason required)
```

### 6.7 Society & members
```
POST   /members/{id}/obligations/generate-schedule
GET    /projects/{id}/obligations ?month=&status=
POST   /obligation-runs · POST /obligation-runs/{id}/submit|approve
GET    /members/{id}/ledger
POST   /members/{id}/possession
```

### 6.8 Approvals, documents, reports, admin
```
GET    /approvals/inbox ?document_type=&project=
POST   /approvals/{id}/approve|reject|return      { remarks }   (step-up token required)
POST   /approvals/bulk-approve                    { ids[], remarks }
GET    /approvals/{id}/history

POST   /documents/presign · POST /documents · GET /documents/search ?q=&semantic=true
POST   /documents/{id}/links · GET /documents/{id}/download   (signed, logged)

GET    /reports · POST /reports/{id}/run → job id · GET /jobs/{id}
GET    /dashboards/{key} · GET /exceptions ?severity=

GET/PUT /admin/settings/{key} · POST /admin/doa-rules · POST /admin/doa-rules/simulate
GET    /admin/integrations/health · POST /admin/integrations/{id}/test
```

### 6.9 Sync (mobile)
```
POST   /sync/batch        { mutations: [ { client_id, entity, op, payload, captured_at } ] }
                          → { results: [ { client_id, status: applied|conflict|rejected,
                                           server_id, version, error? } ] }
GET    /sync/changes      ?since=<cursor>&entities=item,vendor,boq_line,purchase_order
                          → { changes: [...], next_cursor, full_resync_required: false }
```

`POST /sync/batch` is partial-success by design: one bad record never fails the batch.

### 6.10 Connector & webhooks
```
GET    /connector/tally/queue ?limit=50           (mTLS client cert; outbound-only agent)
POST   /connector/tally/ack                       { items: [{ id, status, tally_guid, error }] }
POST   /connector/heartbeat

POST   /webhooks/whatsapp     (signature-verified)
POST   /webhooks/gsp
POST   /webhooks/payment-gateway
```

---

## 7. Async operations

Long-running work (BOQ import, statement parse, report generation, bulk export, AI extraction) returns `202 Accepted` with a job:

```json
{ "data": { "job_id": "job_01J…", "status": "queued",
            "poll_url": "/v1/jobs/job_01J…" } }
```

`GET /jobs/{id}` → `queued | running | succeeded | failed` with `progress_pct`, `result` (or a signed result URL) and structured `errors[]`. Clients poll with backoff, or subscribe to server-sent events at `/events/stream` for live progress.

---

## 8. Rate limiting & quotas

| Scope | Limit |
|---|---|
| Per user | 300 req/min sustained, burst 600 |
| Per tenant | 3,000 req/min |
| Auth endpoints | 10/min per IP + account (brute-force protection) |
| AI endpoints | per-tenant token budget (daily), plus 20 req/min per user |
| Export/report | 10 concurrent jobs per tenant |
| Sync batch | 500 mutations per request |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on 429.

---

## 9. Webhooks (outbound)

Tenants may subscribe to events (`purchase_order.approved`, `payment.released`, `dpr.submitted`, `compliance.due`, …).

Delivery: `POST` with `X-AICOS-Signature: t=<ts>,v1=<hmac-sha256>` over `timestamp.body`; retries at 1 m, 5 m, 30 m, 2 h, 12 h; auto-disable after 5 consecutive days of failure with an admin alert; replay endpoint for missed events. Consumers must be idempotent on `event_id`.

---

## 10. AI tool API (internal)

AI agents do **not** get a separate API. Each tool maps to an existing use-case and executes with the **invoking user's** permissions and tenant context:

| Tool | Underlying endpoint | Write? |
|---|---|---|
| `search_documents` | `GET /documents/search` | no |
| `get_project_summary` | `GET /projects/{id}` + snapshots | no |
| `query_ledger` | governed semantic layer (allow-listed, parameterised) | no |
| `extract_invoice` | `POST /purchase-invoices/from-document` | **draft only** |
| `suggest_bank_match` | `GET /reconciliation/suggestions` | no |
| `create_draft_purchase_requisition` | `POST /purchase-requisitions` with `status=DRAFT` | draft only |

There is deliberately **no tool that approves, posts, pays, or releases** (Phase 3 §11). Every tool call is written to `ai.ai_trace` with arguments, result summary and cost.

---

## 11. Security, validation, testing, documentation

- **Validation:** shared Zod schemas from `packages/contracts` generate both the OpenAPI document and runtime validation, so the spec cannot drift from the implementation. Unknown fields are rejected (`additionalProperties: false`). Payload cap 1 MB (files go to S3 directly).
- **Security:** TLS 1.3 only · strict CORS allow-list · no sensitive data in query strings or logs · signed, short-lived, single-use URLs for downloads · mTLS for the connector · signature verification on every inbound webhook · per-endpoint permission declarations enforced at build time.
- **Testing:** contract tests generated from OpenAPI run in CI; a breaking-change detector fails the build on incompatible schema edits; every endpoint has an authorisation test proving a wrong-tenant token gets 404/403.
- **Documentation:** Swagger UI at `/docs` (non-production), a published Postman collection, generated TypeScript and Python clients, and a changelog per version.

---

## 12. Reports, dashboards, AI, roles, future (mandated format)

- **Reports/dashboards exposed:** `GET /reports`, `POST /reports/{id}/run`, `GET /dashboards/{key}`, `GET /exceptions` — all RLS-scoped identically to the UI.
- **User roles:** the API is role-agnostic; permissions are evaluated per request, so the same endpoints serve every role and external portals differ only by token audience and scope claims.
- **AI opportunities:** natural-language query endpoint over the governed semantic layer; auto-generated client SDKs; anomaly detection on API usage patterns.
- **Future enhancements:** GraphQL gateway for dashboard composition (read-only) · gRPC for the connector at higher volume · partner/marketplace API with OAuth client credentials · public sandbox tenant for integrators.
