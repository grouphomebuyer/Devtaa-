# AI-COS — Executive Summary, Scope Strategy & Challenged Assumptions

**Document ID:** AICOS-EXEC-001
**Version:** 1.0
**Status:** For Board Approval
**Audience:** Executive Director (Director 2), Board, Senior Accountant, incoming engineering partner

---

## 1. What we are actually building

An **AI-first Construction & Redevelopment Operating System** for an Indian self-redevelopment / redevelopment / development-management company, designed to be the **single source of truth** for projects, procurement, materials, labour, money, compliance and documents — replacing the current Excel + WhatsApp + Tally + Google Drive patchwork.

The system's operating philosophy is three words:

> **AI prepares. Humans approve. The system remembers.**

Every AI output is a *draft with a confidence score and a citation to its source document*. No AI action posts to the ledger, releases a payment, or issues a purchase order without a named human clicking Approve. Every such click is recorded immutably.

---

## 2. The five things that will actually change on Day 1

Ignore the 35-module wish list for a moment. If the system only did these five things, it would already pay for itself:

| # | Today | With AI-COS |
|---|---|---|
| 1 | Director downloads bank PDF → WhatsApp → Junior re-keys into Tally | Bank statement auto-ingested → AI matches 80–90% of lines to existing PRs/POs/payment vouchers → Junior reviews exceptions only → posts to Tally via connector |
| 2 | Engineer asks for material on WhatsApp → Director approves on WhatsApp → PO on Excel | PR raised on mobile against BOQ line → DOA-based approval routing → PO auto-generated from approved PR → vendor gets it by email/WhatsApp with a portal link |
| 3 | Payment approved on WhatsApp, screenshot shared, Excel updated, reconciled later | Payment Request → approval chain → payment file/UPI → auto-reconciliation → Tally → dashboard, all one object with one ID |
| 4 | Member rent/corpus for 40–80 society members tracked on a spreadsheet | Member Disbursement Register: recurring rent schedule, escalation clauses, TDS 194-I where applicable, one-click monthly payment run |
| 5 | "How much steel did we consume vs. BBS?" — nobody knows until it's too late | Real-time theoretical-vs-actual consumption variance per project, per material, with pilferage alerts |

**Everything else in the module list is real, needed, and sequenced later.** See §5.

---

## 3. Challenged assumptions — where I disagree with the brief

You asked to be challenged. Here are twelve points where the brief, as written, would produce a worse system. Each has a recommendation.

### C-1. "Build all 35+ modules" is the single biggest risk to this project
A 35-module big-bang ERP built for a company with ~6 operational users and 3 projects has a very high probability of never going live. Every failed ERP I have seen in the mid-market failed the same way: 18 months of building, zero months of using.
**Recommendation:** Ship in 4 waves (§5). Wave 1 goes live in ~14–16 weeks and covers Procurement + Materials + Payments + Approvals + Site Progress + Tally sync. The architecture is designed for all 35 modules from day one; the *delivery* is not.

### C-2. Tally should not remain the accounting source of truth — but do not kill it in Wave 1
The brief treats Tally as the destination. That keeps the duplication problem alive forever, because Tally cannot hold project-dimension, BOQ-linked, approval-linked data.
**Recommendation:** AI-COS holds a **full double-entry general ledger** internally (it must, for project P&L and RERA/escrow reporting). Tally becomes a **downstream mirror** used for statutory filing and the auditor's comfort, synced one-way from AI-COS. Re-evaluate retiring Tally at the end of Wave 3, ideally at a financial-year boundary.
Rationale: two-way sync between two systems that both think they are the master is the most common cause of ERP data corruption. Pick a master. It should be AI-COS.

### C-3. "Eliminate WhatsApp" is the wrong goal — "eliminate WhatsApp as a system of record" is the right one
Site engineers, contractors, vendors and 60-year-old society committee members will not adopt a new app for everything. Fighting WhatsApp loses.
**Recommendation:** Keep WhatsApp as a *transport*, remove it as a *database*. Ship a **WhatsApp Business API bot** in Wave 2: approvals with Approve/Reject buttons, photo upload that lands directly in the DPR, vendor PO dispatch, member rent payment confirmations. The record lives in AI-COS; the conversation happens where people already are.

### C-4. Self-redevelopment is a fundamentally different business object from redevelopment — the data model must know this
In **self-redevelopment**, the society is the developer; you are the PMC / Development Manager. The bank account, the RERA registration, the loan, and the flat-sale revenue belong to the *society*, not you. Your revenue is a fee. In **society redevelopment as developer/JV**, the project's P&L is yours.
Modelling both as "Project" with a flag will produce wrong financials.
**Recommendation:** `project.engagement_model` is a first-class enum driving different ledger behaviour, different revenue recognition, different RERA obligations, and a **funds-under-management (FUM) accounting mode** where you *operate* an account you do not *own*. Detailed in Phase 4 §6 and Phase 12 §2.

### C-5. You are missing the highest-ROI module in your own list: Member / Society Relations
For a redevelopment firm, the operationally heaviest recurring work is not procurement — it is **members**: PAAA agreements, carpet-area entitlement, corpus, monthly rent (with annual escalation), shifting charges, brokerage, possession, and the endless "when is my rent coming" calls.
**Recommendation:** Promote **Society & Member Management** to a Wave 1 core module. It is not in your list; it should be near the top of it.

### C-6. "AI Director / AI Accountant / AI Site Engineer" as 21 separate AI products is a marketing frame, not an architecture
Building 21 bespoke agents means 21 things to maintain, evaluate and secure.
**Recommendation:** One **agent runtime** with a shared tool layer, a shared retrieval layer, and shared guardrails. The 21 "AI roles" become **personas = (system prompt + tool allowlist + data scope + approval policy)** — configuration, not code. Adding "AI HR" later becomes a config row, not a project. Detailed in Phase 11.

### C-7. Offline support is not a generic requirement — it is a site-engineer requirement
Full offline-first for the whole ERP would double cost and introduce merge conflicts in financial data (unacceptable).
**Recommendation:** Offline only for the **mobile site capture surface**: DPR, attendance/muster, photos, material receipt, measurement entry. Everything financial is online-only. Conflict policy: last-write-wins is banned; queued mutations are idempotent, server-authoritative, and surfaced for manual resolution.

### C-8. 500 concurrent users / 1,000 projects should shape the *schema and tenancy*, not the *infrastructure bill*
Designing today's infrastructure for 500 concurrent users would waste money for years. But schema mistakes (no tenant key, no partitioning strategy, numeric money types) are unfixable later.
**Recommendation:** Get **multi-tenancy, money types, audit, and event model** right on day one; run on a deliberately small footprint (single RDS + 2 app containers) and scale by configuration. Capacity model in Phase 5 §9.

### C-9. Do not build your own e-invoice / GST / bank connectivity
IRP, GSTN and bank APIs are regulated, versioned, and painful.
**Recommendation:** Use a licensed **GSP** (e.g. ClearTax / Masters India / Zoho) for e-invoicing, e-way bill and GSTR filing; use **bank statement ingestion (file + AA)** rather than payment-initiation APIs in Waves 1–2. Payment *initiation* (H2H / corporate API) is Wave 3, after controls are proven.

### C-10. Approval-by-amount alone is insufficient governance
"Director approves everything above ₹X" collapses the moment there are 20 projects.
**Recommendation:** A **Delegation of Authority (DOA) matrix**: dimension = (company, project, document type, amount band, cost category, budget-availability state). Plus **budget-block enforcement**: a PR that breaches the BOQ line budget cannot be approved without an explicit, reasoned budget-deviation approval. This is the single control that stops cost overrun.

### C-11. The Sleeping Director is a compliance object, not an absence
A non-operational director still signs MCA filings, board resolutions, and bank mandates.
**Recommendation:** Model **Board & Statutory Register** (DIN, DSC expiry, board resolutions, mandate signatories) in the Legal/Compliance module. DSC expiry alerts alone will save a filing penalty.

### C-12. Two site engineers cannot run three projects on a system that assumes a store keeper exists
Most construction ERPs assume separate roles for storekeeper, QS, purchase officer, and accountant. You have one person wearing four hats.
**Recommendation:** **Role composition, not role assumption.** Every permission is atomic; roles are bundles; one user may hold several bundles across different projects. Segregation-of-duties conflicts (e.g. same person raises PR *and* approves PO) are *detected and logged as an SoD exception*, not silently blocked — because at your size, sometimes it must happen. The auditor gets a report; the business keeps moving.

---

## 4. Scope decisions taken (record of decision)

| ID | Decision | Rationale |
|---|---|---|
| D-01 | AI-COS is the accounting master; Tally is a synced mirror | Ends duplicate entry; enables project-dimension P&L |
| D-02 | Internal double-entry ledger with project/cost-centre dimensions | Required for RERA Form-3, escrow, and project P&L |
| D-03 | Multi-tenant from day one (shared schema + `tenant_id` + RLS) | Enables SaaS commercialisation without a rewrite |
| D-04 | Modular monolith ("modulith") backend, not microservices | Team size 4–8; microservices would be self-harm |
| D-05 | PostgreSQL as primary store for both OLTP and analytics initially | One system to operate; add read replica / warehouse at scale |
| D-06 | AWS Mumbai (`ap-south-1`) with data residency | DPDP Act 2023, RERA record-keeping, latency |
| D-07 | AI = Claude models via API, routed by task complexity | Best-in-class document reasoning; strict human-in-the-loop |
| D-08 | Human approval mandatory for all financial state transitions | Non-negotiable control |
| D-09 | Mobile = React Native (Expo), offline for site capture only | One codebase, targeted offline |
| D-10 | Vendor & Society/Member external portals in Wave 3 | Removes the largest remaining WhatsApp load |

---

## 5. Delivery waves

| Wave | Weeks | Modules | Go-live definition |
|---|---|---|---|
| **W0 — Foundation** | 0–6 | Tenancy, auth, RBAC/DOA, audit, masters (company, project, society, vendor, item, UOM, cost head), numbering, document store, notification bus | Admin can configure a company and a project |
| **W1 — Core Operating Loop** | 6–16 | Project master, BOQ, Purchase Requisition, PO, GRN/Inspection, Stock, Material Issue, Payment Request → Approval → Payment Voucher, Bank statement ingestion + AI reconciliation, Tally connector, DPR, Society & Member register + rent/corpus disbursement, Dashboards v1, AI OCR (invoice/bank) | All 3 live projects run procurement + payments in AI-COS. Excel retired for these. |
| **W2 — Control & Compliance** | 16–28 | Contractor management, RA bill certification with measurements & retention, labour/muster/attendance, GST (ITC, RCM 80% rule, e-invoice via GSP), TDS engine, budget vs actual, cash-flow forecast, WhatsApp bot, mobile offline capture, vendor performance, duplicate-payment detection | Statutory returns prepared from AI-COS; site runs on mobile |
| **W3 — Growth & Externalisation** | 28–44 | CRM/Lead, Feasibility engine, Flat sales & customer collections, demand letters, RERA QPR & Form 1/2/3 pack, escrow/70% rule tracking, Legal & document lifecycle, HR & payroll, vendor portal, member portal, AI predictive suite (delay, cash-flow, material) | Sales & RERA operate in-system; external parties self-serve |
| **W4 — SaaS readiness** | 44+ | Tenant self-onboarding, billing/metering, white-label, marketplace connectors, data-residency options, SOC2-track controls | Sellable to other redevelopment firms |

---

## 6. Success metrics (measured, not asserted)

| Metric | Baseline (today) | W1 target | W3 target |
|---|---|---|---|
| Duplicate data entry per transaction | 3–4 times | 1 | 1 |
| Days to close monthly books | 20–30 | 12 | 5 |
| % bank lines auto-reconciled | 0% | 70% | 92% |
| Approval turnaround (PR → PO) | 2–7 days | < 24 h | < 8 h |
| Untracked site material variance | unknown | measured | < 2% |
| % invoices captured by OCR without manual keying | 0% | 65% | 90% |
| WhatsApp messages that *are* the record | ~100% | < 20% | ~0% |
| Time to produce project P&L | days | on demand | on demand |

---

## 7. Indicative cost envelope (for budgeting, not a quote)

| Item | Wave 1 | Steady state (monthly) |
|---|---|---|
| Engineering (4–6 people, 16 weeks) | one-time build cost | — |
| AWS `ap-south-1` (RDS + ECS + S3 + CloudFront) | — | ₹35k–₹70k |
| AI inference (Claude, routed) | — | ₹15k–₹50k, usage-linked |
| GSP (e-invoice/GST), WhatsApp BSP, SMS/OTP | — | ₹8k–₹20k |
| Observability, backups, DR | — | ₹10k–₹15k |

AI cost control is a design requirement, not an afterthought: cheap model first, escalate on low confidence, cache aggressively, never send a 200-page PDF where 3 pages will do. See Phase 11 §7.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Adoption failure (people return to WhatsApp) | Fatal | WhatsApp bot as an official channel; mobile-first for site; go-live means Excel is deleted, not archived |
| Tally sync drift | High | One-way, idempotent, with daily 3-way reconciliation report and a blocking alert |
| AI extraction errors reaching the ledger | High | Confidence thresholds, mandatory human approval, field-level source citation, full replay log |
| Scope creep back to 35-module big bang | High | Wave gates with written go-live criteria; new requests go to the next wave by default |
| Key-person dependency (Senior Accountant) | Medium | Encode rules in the compliance rule tables (Phase 12), not in one person's head |
| Data migration from Excel/Tally is dirtier than expected | Medium | Dedicated migration workstream from week 2, not week 14; opening-balance cut-off at a month end |

---

## 9. How to read this repository

| Phase | Document |
|---|---|
| 1 | [`01-business-requirements.md`](01-business-requirements.md) |
| 2 | [`02-functional-design-core.md`](02-functional-design-core.md), [`02b-functional-design-finance.md`](02b-functional-design-finance.md), [`02c-functional-design-site-people-sales.md`](02c-functional-design-site-people-sales.md) |
| 3 | [`03-technical-design.md`](03-technical-design.md) |
| 4 | [`04-database-design.md`](04-database-design.md) + [`../db/ddl/`](../db/ddl) |
| 5 | [`05-system-architecture.md`](05-system-architecture.md) |
| 6 | [`06-ux-design.md`](06-ux-design.md) |
| 7 | [`07-api-design.md`](07-api-design.md) + [`../api/openapi.yaml`](../api/openapi.yaml) |
| 8 | [`08-development-plan.md`](08-development-plan.md) |
| 9 | [`09-test-strategy.md`](09-test-strategy.md) |
| 10 | [`10-deployment-devops.md`](10-deployment-devops.md) |
| — | [`11-ai-architecture.md`](11-ai-architecture.md), [`12-india-compliance-rules.md`](12-india-compliance-rules.md), [`13-glossary-and-conventions.md`](13-glossary-and-conventions.md) |
