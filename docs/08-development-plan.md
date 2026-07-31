# Phase 8 — Development Plan

**Document ID:** AICOS-DEV-001 · **Version:** 1.0

---

## 1. Objective

Turn the design into a sequenced, staffed, estimated build plan with explicit go-live gates — so that Wave 1 reaches production in ~16 weeks rather than becoming an 18-month project that never ships (Exec §C-1).

---

## 2. Team

| Role | Count | Responsibility |
|---|---|---|
| Tech lead / architect | 1 | Architecture, code review, ADRs, integration design |
| Backend engineers | 2 | Domain modules, API, workers, integrations |
| Frontend engineer | 1.5 | Web SPA, design system |
| Mobile engineer | 1 | React Native, offline sync (joins week 6) |
| AI engineer | 1 | Extraction pipelines, agent runtime, evals (joins week 4) |
| DevOps | 0.5 | Infrastructure, CI/CD, observability |
| QA | 1 | Test strategy, automation, UAT coordination |
| Product / BA | 1 | Requirements, UAT, training, change management |

**Peak: ~9 people.** The plan starts at 4 and ramps.

**Critical non-engineering role:** a **business process owner** from the client — realistically the Senior Accountant, with a formal time allocation of ≥ 8 hours/week. Every mid-market ERP failure I have seen shares one root cause: no one on the business side owned the outcome.

---

## 3. Ways of working

Two-week sprints · trunk-based development with short-lived branches · every PR requires 1 reviewer plus green CI · feature flags for incomplete work (never long-lived feature branches) · demo to the business every sprint end, on real data · ADR required for any decision that is expensive to reverse.

**Definition of Done:** code + tests (unit, integration, and an authorisation test proving cross-tenant access fails) + OpenAPI updated + migration reviewed + audit events emitted + permissions declared + observability (metric/log/trace) + documentation + demoed to the process owner.

---

## 4. Wave 0 — Foundation (weeks 1–6)

| Sprint | Deliverables |
|---|---|
| **S1** | Repo, monorepo tooling, CI skeleton, Terraform for `dev`, Docker Compose local stack, Postgres schema `core`, RLS harness + the CI test that fails on any tenant table lacking a policy, Keycloak, login/MFA, `packages/contracts` scaffold |
| **S2** | RBAC (permissions, roles, scoped assignments), audit interceptor, numbering service, financial periods, settings/rule-engine skeleton, error envelope, idempotency middleware, design-system foundations, app shell with navigation |
| **S3** | Workflow + DOA engine with simulator, approval instances/steps/actions, notification bus (in-app + email), outbox + relay, document service (presign, upload, virus scan, versioning), master CRUD for company/project/vendor/item/cost-head/GL |

**Gate G0:** an administrator can configure a company, a project, users, roles and a DOA matrix; a dummy document routes through a real approval chain; every action appears in the audit log; a cross-tenant request returns 404. *Nothing proceeds until G0 passes.*

---

## 5. Wave 1 — Core operating loop (weeks 7–16)

| Sprint | Deliverables |
|---|---|
| **S4** | BOQ import (Excel with mapping + validation), BOQ tree UI, baseline approval, budget lines with commitment accounting, budget-availability API |
| **S5** | Purchase Requisition (web + mobile), budget check at submit/approve, PO creation from PR, PO approval and PDF, vendor dispatch by email; **mobile app shell + offline queue** |
| **S6** | GRN (mobile-first, offline), inspection, stock ledger + balance trigger, material issue, stock statements; document AI pipeline v1 (challan + invoice extraction with confidence and citations) |
| **S7** | Purchase invoice booking, three-way match engine, TDS computation, payment request, payment approval, payment voucher, payment run and bank file generation |
| **S8** | Bank statement ingestion (CSV + PDF), reconciliation rule engine, AI match suggestions, reconciliation workbench, GL posting engine, trial balance and project P&L |
| **S9** | **Tally connector** (Windows agent, queue, ack, drift report), society & member master, member obligation engine, monthly payment run console |
| **S10** | DPR (mobile, offline), dashboards v1 (Executive, Project, Accounts, Site), exception feed, notification templates, **data migration execution**, UAT fixes, training |

**Gate G1 (go-live criteria — all must be true):**
1. All 3 live projects fully configured with BOQ baselines and opening balances.
2. Two consecutive months of bank statements reconciled in-system with ≥ 70% auto-match.
3. Tally sync running for 30 days with zero unexplained drift.
4. 20 real POs and 20 real payments processed end to end by actual users.
5. One complete member rent payment run executed.
6. Every user trained and logged in independently for 5 consecutive working days.
7. **Excel and Google Sheets for these processes are deleted, not archived.** Wave 1 is not "live" while a parallel spreadsheet exists — that is the single most reliable predictor of ERP failure.

---

## 6. Wave 2 — Control & compliance (weeks 17–28)

Contractor management, work orders, measurement books, RA bill certification with the full deduction stack, retention register · labour/muster/attendance · GST engine (ITC, GSTR-2B reconciliation, RCM with the 80% rule, e-invoice via GSP) · TDS engine with LDC tracking and return data · budget-vs-actual analytics and 13-week cash-flow forecast · WhatsApp bot (approvals, DPR reminders, PO dispatch, member confirmations) · full mobile offline capture · vendor performance and duplicate-payment detection.

**Gate G2:** one full quarter's GST and TDS returns prepared from AI-COS data and independently agreed by the Senior Accountant against manually prepared figures. Approvals arriving over WhatsApp with a full audit trail.

---

## 7. Wave 3 — Growth & externalisation (weeks 29–44)

CRM and lead management · feasibility engine · flat sales, demand letters and collections · RERA pack (designated account, Form 1/2/3, QPR) · legal and contract lifecycle · HR and payroll · vendor, society and customer portals · AI predictive suite (cash flow, material, delay, risk) · conversational analytics.

**Gate G3:** a society committee and five vendors using the portals unassisted; a RERA QPR generated from the system; sales and collections operating in-system.

---

## 8. Wave 4 — SaaS readiness (week 45+)

Tenant self-onboarding, usage metering and billing, white-labelling, configuration packs per state, marketplace connectors, SOC 2 control track, per-tenant key hierarchy.

---

## 9. Data migration workstream (starts week 2, not week 14)

| Step | Detail |
|---|---|
| Inventory | Catalogue every Excel/Sheet/Tally source, its owner and its true reliability |
| Profile | Automated quality report: duplicates, missing keys, inconsistent UOM/dates/amounts |
| Cleanse | Business owner corrects **at source**; engineering does not silently "fix" business data |
| Map | Documented field mapping with a transformation rule per field |
| Load | `mig.*` staging schema → validate → load, in order: masters → opening balances → open POs/PRs → open invoices & advances → stock → member obligations → documents |
| Reconcile | Trial balance, vendor balances, stock value and member dues must tie to Tally **exactly** at the cut-off date; a signed reconciliation is the acceptance artefact |
| Rehearse | Full dry run in staging at least twice, with timings |
| Cut over | At a month end (ideally a quarter end); freeze legacy entry; go live |

**Non-negotiable:** migration is not "done" when data loads. It is done when the business signs a reconciliation statement.

---

## 10. Estimation summary

| Wave | Duration | Effort (person-weeks) |
|---|---|---|
| W0 Foundation | 6 weeks | ~30 |
| W1 Core loop | 10 weeks | ~75 |
| W2 Control & compliance | 12 weeks | ~90 |
| W3 Growth | 16 weeks | ~120 |
| **Through W3** | **~44 weeks** | **~315** |

Estimates assume the DDL and API contracts in this repository are used as-is rather than re-litigated, and that the business process owner is genuinely available. Add 25% contingency for the first two waves; integration surprises (bank formats, Tally versions, GSP onboarding) are the usual overrun source.

---

## 11. Risks specific to delivery

| Risk | Mitigation |
|---|---|
| Business availability for UAT and data cleansing | Contractual time commitment; sprint demos on real data; migration starts in week 2 |
| Scope creep back to a 35-module big bang | Wave gates with written criteria; new requests default to the next wave |
| Tally version/edition differences at the client | Version-detect in the connector; test against the actual client installation in week 3, not week 14 |
| Bank statement format variety | Build the parser generic-first (AI + heuristics), template second; collect 12 months of real statements from every bank in week 1 |
| GSP and WhatsApp BSP onboarding lead times (2–6 weeks) | Start commercial onboarding in week 1 of Wave 1, well before the code needs it |
| Mobile adoption by site engineers | Ship the mobile PR/DPR early (S5/S10), sit on site during the first week, iterate on friction |
| AI quality below expectations | Golden-set evaluations from S6; a documented fallback to manual entry; AI is never on the critical path |
| Key-person dependency in engineering | ADRs, two reviewers, no single-owner module |

---

## 12. Coding standards (enforced, not aspirational)

TypeScript `strict` with `noUncheckedIndexedAccess` · ESLint + Prettier + import-boundary rules (`dependency-cruiser`) · no `any` outside typed adapter boundaries · money only through `packages/domain/money.ts` · all SQL parameterised · every use-case declares its permission (build fails otherwise) · conventional commits · migrations forward-only and reviewed · secrets never in code (CI secret scanning) · test coverage gates: `packages/domain` ≥ 90%, use-cases ≥ 80%, overall ≥ 70%.

---

## 13. Reports, dashboards, AI, security, roles, future (mandated format)

- **Delivery reports/dashboards:** sprint burndown, gate-criteria tracker, defect density and escape rate, migration reconciliation status, AI evaluation scores per release, DORA metrics (lead time, deploy frequency, change-failure rate, MTTR).
- **AI in development:** AI-assisted code review and test generation, migration-mapping suggestions from legacy headers, synthetic test-data generation, release-note drafting. Human review remains mandatory on every merge.
- **Security in development:** SAST/DAST and dependency scanning in CI, threat-modelling session per wave, secret scanning on every commit, security review before each gate, least-privilege CI credentials via OIDC (no long-lived cloud keys).
- **Roles in delivery:** RACI per gate — tech lead accountable for technical readiness, product owner for business readiness, Senior Accountant for financial correctness sign-off, Executive Director for go/no-go.
- **Future enhancements:** contract-first client SDK generation, ephemeral preview environments per PR, mutation testing on the domain package, load-test gates in CI before each wave release.
