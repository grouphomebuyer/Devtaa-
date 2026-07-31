# AI-COS — AI Construction Operating System

Production-ready design documentation for an **AI-first construction and redevelopment ERP**, built for an Indian self-redevelopment, society-redevelopment and development-management business — and architected to become a sellable SaaS product for the wider industry.

This repository is the **complete SDLC artefact set through Phase 10**. No application code is written yet: that is deliberate, and it is Phase 8's job. What is here is everything an engineering team needs to start building on Monday without re-deciding anything.

---

## What this system replaces

| Today | With AI-COS |
|---|---|
| Bank PDF → WhatsApp → re-keyed into Tally → reconciled weeks later | Statement ingested, 70–90% auto-matched, posted once, mirrored to Tally |
| Material request on WhatsApp, approval in chat, PO in Excel | PR against a BOQ line → budget-checked → DOA-routed → PO generated and dispatched |
| Payment approved by chat message, screenshot, Excel, then Tally | One payment object carrying its own approval, TDS, matching and bank evidence |
| 60–80 members' rent and corpus on a spreadsheet | Obligation engine with escalation, TDS and a one-click monthly payment run |
| "How much steel did we actually consume?" — unknown | Theoretical vs actual variance per material, per project, in real time |
| Data in Excel, Sheets, WhatsApp, Tally and people's memory | One source of truth, entered once, with a complete audit trail |

**The governing principle, everywhere in this design:**

> **AI prepares. Humans approve. The system remembers.**

No AI agent in this architecture has a tool that can approve, post, pay, release or file. That is enforced by the tool registry, not by prompt wording.

---

## Start here

| If you are… | Read |
|---|---|
| The board / Executive Director | [`docs/00-executive-summary.md`](docs/00-executive-summary.md) — including **twelve challenged assumptions** and the four-wave delivery plan |
| A CTO or engineering partner evaluating this | [`docs/03-technical-design.md`](docs/03-technical-design.md) → [`docs/05-system-architecture.md`](docs/05-system-architecture.md) → [`db/ddl/`](db/ddl) |
| The Senior Accountant / CA | [`docs/12-india-compliance-rules.md`](docs/12-india-compliance-rules.md) and [`docs/02b-functional-design-finance.md`](docs/02b-functional-design-finance.md) |
| A developer starting work | [`db/README.md`](db/README.md) → [`api/openapi.yaml`](api/openapi.yaml) → [`docs/08-development-plan.md`](docs/08-development-plan.md) |
| Anyone lost in the vocabulary | [`docs/13-glossary-and-conventions.md`](docs/13-glossary-and-conventions.md) |

---

## Contents

### SDLC phases

| Phase | Document | Covers |
|---|---|---|
| — | [Executive Summary](docs/00-executive-summary.md) | Scope strategy, challenged assumptions, decisions, waves, metrics, risks |
| 1 | [Business Requirements](docs/01-business-requirements.md) | As-is processes and their 30 failure points, to-be model, 90+ catalogued requirements, business rules, roles, NFRs, integrations |
| 2 | [Functional Design](docs/02-functional-design-core.md) · [Finance](docs/02b-functional-design-finance.md) · [Site & People](docs/02c-functional-design-site-people-sales.md) | 19 modules, each in the full 15-point format |
| 3 | [Technical Design](docs/03-technical-design.md) | Stack selection with comparisons, modulith structure, RLS tenancy, transactions and money, events, workflow/rule engines, offline sync, integrations, AI plumbing |
| 4 | [Database Design](docs/04-database-design.md) | ERD, table specifications, engagement-model modelling, indexing, partitioning, volume model, DR |
| 5 | [System Architecture](docs/05-system-architecture.md) | C4 views, data flows, deployment topology, scalability, resilience, observability, cost model, ADR index |
| 6 | [UI/UX Design](docs/06-ux-design.md) | Principles, information architecture, design system, key screens, mobile, WhatsApp, accessibility, measured journey targets |
| 7 | [API Design](docs/07-api-design.md) | Conventions, auth, errors, idempotency, endpoint catalogue, async jobs, webhooks, AI tool surface |
| 8 | [Development Plan](docs/08-development-plan.md) | Team, sprints, wave gates with go-live criteria, migration workstream, estimates, standards |
| 9 | [Test Strategy](docs/09-test-strategy.md) | Risk-based priorities, test pyramid, security and AI testing, performance targets, UAT, CI gates |
| 10 | [Deployment & DevOps](docs/10-deployment-devops.md) | IaC, CI/CD, migrations, secrets, the Tally connector's operations, security ops, backup/DR, alerting, runbooks |

### Supporting

| Document | Covers |
|---|---|
| [AI Architecture](docs/11-ai-architecture.md) | Agent runtime, personas as configuration, model routing, extraction and reconciliation pipelines, RAG, guardrails, evaluations, cost model |
| [India Compliance Rules](docs/12-india-compliance-rules.md) | GST (incl. the 80% promoter rule and blocked credit), TDS/TCS, RERA 70:30 and QPR, labour, Companies Act, income-tax transaction controls, the compliance calendar engine |
| [Glossary & Conventions](docs/13-glossary-and-conventions.md) | Business vocabulary, document numbering, status vocabulary, naming and formatting standards |

### Implementable artefacts

| Artefact | Status |
|---|---|
| [`db/ddl/*.sql`](db/ddl) | **Executed against PostgreSQL 16.13 — applies cleanly** |
| [`db/ddl/99_invariant_tests.sql`](db/ddl/99_invariant_tests.sql) | **Run and verified** — see the results table in [`db/README.md`](db/README.md) |
| [`api/openapi.yaml`](api/openapi.yaml) | **Validated against the OpenAPI 3.1 specification** — 24 paths, 26 schemas, all references resolving |

---

## Verified, not just asserted

The database design is not a diagram. It was applied to a real PostgreSQL 16 instance and the invariants were tested:

| Invariant | Result |
|---|---|
| A posted journal must balance | Rejected `debit 100 ≠ credit 0` at commit |
| No posting into a locked financial period | Rejected `PERIOD_LOCKED` |
| Stock can never go negative | Rejected `NEGATIVE_STOCK` |
| Weighted-average valuation | 10 in − 4 out → qty 6, value 600, avg rate 100 |
| Gap-free document numbering | `PO/DEVT/25-26/00001…00003`, no gaps |
| Tenant isolation under RLS | Own tenant 1 row, other tenant 0 rows (as the non-superuser app role) |
| Audit log immutability | `permission denied for table audit_log` |
| No tenant table left unprotected | `none — all tenant tables protected` (123 tables) |

Running those tests found two genuine defects that inspection had missed:

1. The stock-balance upsert failed on **valid** issues, because PostgreSQL evaluates CHECK constraints against the proposed insert tuple — the raw negative delta — before `ON CONFLICT` arbitration.
2. Four tenant-scoped tables had no RLS policy: two partitioned parents skipped by a `relkind = 'r'` loop, and two rate masters with a nullable `tenant_id`.

Both are fixed, and the RLS-coverage check is written to be wired into CI unchanged so neither class of mistake can return. The reasoning is recorded in [`db/README.md`](db/README.md).

---

## Delivery shape

| Wave | Weeks | Outcome |
|---|---|---|
| **W0 Foundation** | 0–6 | Tenancy, auth, RBAC, DOA, workflow, audit, masters |
| **W1 Core loop** | 6–16 | Procurement, materials, payments, bank reconciliation, Tally sync, DPR, members, dashboards — **Excel retired for these processes** |
| **W2 Control & compliance** | 16–28 | Contractors and RA bills, labour, GST/TDS engines, WhatsApp bot, mobile offline |
| **W3 Growth** | 28–44 | CRM, feasibility, sales and collections, RERA pack, legal, HR/payroll, external portals, predictive AI |
| **W4 SaaS** | 44+ | Self-onboarding, metering, white-label, multi-state configuration packs |

The system is designed for **1,000+ projects, 500 concurrent users and multi-company multi-tenancy from day one**, while deliberately running on a small infrastructure footprint until the load justifies more (Exec §C-8).

---

## Scope note

Phases 1–10 are documentation and design deliverables, as instructed — no application code has been written. Phase 8 defines what gets built, in what order, by whom, with the go-live criteria for each gate. The DDL and OpenAPI documents in this repository are intended to be used directly as the first migration set and the first API contract, not rewritten.

The compliance rates and thresholds in Phase 12 are **indicative seed values that must be verified by the Senior Accountant/CA before go-live**; they are stored as effective-dated configuration precisely so that keeping them current is a data change, never a release.
