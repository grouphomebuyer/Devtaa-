# Glossary, Numbering & Naming Conventions

**Document ID:** AICOS-REF-001 · **Version:** 1.0

---

## 1. Business glossary

### Redevelopment

| Term | Meaning in this system |
|---|---|
| **Self redevelopment** | The society redevelops its own property, funding it itself (often with a bank/NBFC loan). We act as PMC / Development Manager. Society money is fiduciary — tracked in the FUM ledger, never in our revenue. |
| **Society redevelopment (developer)** | We take development rights, bear the cost and risk, and sell the free-sale component. The project P&L is ours. |
| **Development Management (DM)** | We manage another developer's project for a fee. |
| **PMC** | Project Management Consultancy — supervision and management without development risk. |
| **Rehab component** | Area returned to existing members. Not saleable. |
| **Free-sale component** | Area we (or the society) may sell in the open market — the source of project funding. |
| **PAAA** | Permanent Alternate Accommodation Agreement — the contract with each member defining entitled area, corpus, rent and possession. |
| **Corpus** | A lump sum paid to members as compensation, usually in tranches at vacation and possession. |
| **Rent / alternate accommodation** | Monthly payment to members while their flats are demolished and rebuilt, typically escalating annually. The largest recurring disbursement in a redevelopment project. |
| **Shifting charges** | Payment for the physical move out and back. |
| **Hardship compensation** | Additional compensation where agreed. |
| **Consent** | Members' formal agreement to redevelopment; the required percentage is a statutory question configured per state. |
| **Conveyance / deemed conveyance** | Transfer of land title to the society — a precondition question for redevelopment. |
| **Entitlement** | A member's entitled carpet area, computed from the agreed formula on existing carpet area. |
| **Carpet / built-up / saleable area** | Three different numbers. Carpet is the RERA basis. The system stores all three and never conflates them. |
| **FSI / TDR / fungible FSI** | Floor Space Index and its purchasable/transferable components — the inputs to feasibility. |
| **IOD / CC / OC** | Intimation of Disapproval, Commencement Certificate, Occupation Certificate — the municipal approval milestones. |

### Construction and commercial

| Term | Meaning |
|---|---|
| **BOQ** | Bill of Quantities — the itemised quantity and rate schedule that becomes the budget baseline. |
| **WBS** | Work Breakdown Structure — the hierarchy against which work, cost and progress are tracked. |
| **PR / PO / WO** | Purchase Requisition (need), Purchase Order (commitment to a supplier), Work Order (contract with a contractor). |
| **RFQ** | Request for Quotation. |
| **GRN** | Goods Receipt Note — what actually arrived, in what condition. |
| **Three-way match** | PO ↔ GRN ↔ Invoice agreement within tolerance, before payment. |
| **MB** | Measurement Book — the record of measured work that justifies a contractor bill. |
| **RA bill** | Running Account bill — a progressive contractor bill with cumulative measurement less what was previously certified. |
| **Retention** | A percentage withheld from contractor bills, released after completion and the defect liability period. |
| **Mobilisation advance** | Money advanced to a contractor to start, recovered pro-rata from subsequent bills. |
| **LD** | Liquidated damages — the delay penalty under the work order. |
| **DLP** | Defect Liability Period. |
| **NCR** | Non-Conformance Report — a recorded quality failure with an owner and a due date. |
| **DPR** | Daily Progress Report. |
| **BBS** | Bar Bending Schedule — the basis for theoretical steel consumption. |
| **Commitment accounting** | Recognising an approved PO as committed spend immediately, so budget availability reflects reality rather than only what has been invoiced. |
| **Cost-to-complete** | The forecast remaining cost — the number that tells you whether the project is in trouble. |
| **S-curve / earned value** | Planned vs actual progress over time; SPI and CPI as schedule and cost performance indices. |

### Finance and statutory

| Term | Meaning |
|---|---|
| **FUM** | Funds Under Management — money we operate but do not own (society/client funds), kept structurally separate from our P&L. |
| **DOA** | Delegation of Authority — the matrix determining who must approve what. |
| **SoD** | Segregation of Duties — the control that the same person should not both create and approve. Detected and logged here rather than blindly blocked, because at this team size it sometimes must happen. |
| **Maker-checker** | Two-person control on sensitive changes (notably vendor bank accounts). |
| **ITC** | Input Tax Credit under GST. |
| **RCM** | Reverse Charge Mechanism — the recipient pays the GST. |
| **LDC** | Lower Deduction Certificate — reduces the TDS rate for a specific deductee, within a limit and validity. |
| **QPR** | Quarterly Progress Report under RERA. |
| **Designated account** | The RERA 70% account for a registered project. |
| **BOCW cess** | 1% cess on construction cost under the Building and Other Construction Workers legislation. |
| **MSME / 43B(h)** | Micro and small enterprise vendors, whose delayed payment causes an income-tax disallowance. |

---

## 2. Document numbering

**Pattern:** `{TYPE}/{COMPANY}/{PROJECT}/{FY}/{SEQ}`

Example: `PO/DEVT/GKS/25-26/00042`

| Segment | Rule |
|---|---|
| `TYPE` | Fixed prefix per document type (below) |
| `COMPANY` | Company short code (2–6 chars) |
| `PROJECT` | Project short code; omitted for company-level documents |
| `FY` | Indian financial year, `YY-YY` (April–March) |
| `SEQ` | Zero-padded 5-digit sequence, **gap-free per series** |

The number is allocated **on submit, not on draft** — otherwise abandoned drafts create gaps that auditors ask about. A cancelled document keeps its number with status `CANCELLED`.

| Prefix | Document | Prefix | Document |
|---|---|---|---|
| `PR` | Purchase Requisition | `PI` | Purchase Invoice |
| `RFQ` | Request for Quotation | `PREQ` | Payment Request |
| `PO` | Purchase Order | `PV` | Payment Voucher |
| `WO` | Work Order | `PRUN` | Payment Run |
| `VO` | Variation Order | `RCT` | Receipt |
| `GRN` | Goods Receipt Note | `JV` | Journal Voucher |
| `MI` | Material Issue | `DN` / `CN` | Debit / Credit Note |
| `MT` | Material Transfer | `ADV` | Advance |
| `SA` | Stock Adjustment | `DL` | Demand Letter |
| `PVR` | Physical Verification | `BKG` | Booking |
| `MB` | Measurement Book | `MOR` | Member Obligation Run |
| `RA` | RA Bill | `NCR` | Non-Conformance Report |
| `DPR` | Daily Progress Report | `BOQ` | BOQ version |

---

## 3. Status vocabulary

Used consistently across every document type, so that a user who learns one screen has learned them all:

`DRAFT` → `PENDING_APPROVAL` → `APPROVED` → (`PARTIALLY_*` →) `CLOSED`
with the exits `RETURNED` (fixable), `REJECTED` (terminal), `CANCELLED` (terminal, reason required).

`RETURNED` is deliberately distinct from `REJECTED`: returned means "fix this and resubmit", rejected means "no". Conflating them is why people go back to WhatsApp to ask what the approver actually meant.

---

## 4. Technical naming conventions

| Element | Convention | Example |
|---|---|---|
| Schema / table / column | `snake_case`, singular table | `proc.purchase_order_line` |
| Primary key | `id` (uuid v7) | |
| Foreign key | `<referenced_table>_id` | `vendor_id` |
| Boolean | `is_` / `has_` prefix | `is_fum`, `has_expiry` |
| Timestamp | `_at` suffix, `timestamptz` UTC | `approved_at` |
| Business date | `_date` / `_on` suffix, `date` | `invoice_date`, `vacated_on` |
| Money | `_amount` suffix, `numeric(18,4)` | `taxable_amount` |
| Quantity | `_quantity` suffix, `numeric(18,4)` | `accepted_quantity` |
| Percentage | `_pct` suffix, `numeric(9,4)` | `retention_pct` |
| Enum-ish column | `text` + `CHECK`, or a lookup table where the business may extend it | |
| Index | `ix_<table-abbrev>_<purpose>`; unique `uq_` | `ix_po_vendor` |
| API path | plural kebab-case; actions as sub-resources | `POST /purchase-orders/{id}/approve` |
| API field | `snake_case`, matching the database | one vocabulary end to end |
| Event | `<Aggregate><PastTenseVerb>.v<N>` | `PurchaseOrderApproved.v1` |
| Permission | `<module>.<action>` | `payment_request.approve` |
| Error code | `SCREAMING_SNAKE_CASE` | `BUDGET_EXCEEDED` |
| Rule code | `BR-<AREA>-<NN>` / `CMP-<AREA>-<NN>` | `BR-PAY-04`, `CMP-GST-02` |
| Feature flag | `<module>.<feature>` | `finance.whatsapp_approvals` |

---

## 5. Formatting standards

| Item | Standard |
|---|---|
| Currency | `₹12,45,678.50` — Indian digit grouping, 2 dp on screen, 4 dp stored |
| Large amounts in summaries | `₹1.25 Cr`, `₹45.60 L` |
| Date | `DD-MM-YYYY` display; `YYYY-MM-DD` in APIs and files |
| Date-time | `DD-MM-YYYY HH:mm` IST display; RFC 3339 UTC in APIs |
| Financial year | `FY 2025-26`, short form `25-26` |
| Quantity | up to 3 decimals, UOM always shown |
| Area | sq ft for member and sales contexts, sq m for statutory and area-statement contexts — **always labelled**, never inferred |
| Percentage | 2 decimals |
| Phone | `+91 98XXX XXXXX` |
| PAN / GSTIN / IFSC | uppercase, format-validated, masked where sensitive |

---

## 6. Document index

| Phase | Document |
|---|---|
| — | [`00-executive-summary.md`](00-executive-summary.md) — scope strategy, challenged assumptions, waves |
| 1 | [`01-business-requirements.md`](01-business-requirements.md) |
| 2 | [`02-functional-design-core.md`](02-functional-design-core.md) · [`02b-functional-design-finance.md`](02b-functional-design-finance.md) · [`02c-functional-design-site-people-sales.md`](02c-functional-design-site-people-sales.md) |
| 3 | [`03-technical-design.md`](03-technical-design.md) |
| 4 | [`04-database-design.md`](04-database-design.md) · [`../db/ddl/`](../db/ddl) |
| 5 | [`05-system-architecture.md`](05-system-architecture.md) |
| 6 | [`06-ux-design.md`](06-ux-design.md) |
| 7 | [`07-api-design.md`](07-api-design.md) · [`../api/openapi.yaml`](../api/openapi.yaml) |
| 8 | [`08-development-plan.md`](08-development-plan.md) |
| 9 | [`09-test-strategy.md`](09-test-strategy.md) |
| 10 | [`10-deployment-devops.md`](10-deployment-devops.md) |
| — | [`11-ai-architecture.md`](11-ai-architecture.md) · [`12-india-compliance-rules.md`](12-india-compliance-rules.md) |

---

## 7. Module index

| ID | Module | Wave |
|---|---|---|
| M01 | Platform foundation (tenancy, RBAC, DOA, workflow, audit, numbering) | W0 |
| M02 | Master data management | W0 |
| M03 | Project, society & member management | W1 |
| M04 | Planning, BOQ & budget | W1 |
| M05 | Procurement | W1 |
| M06 | Materials, inventory & stores | W1 |
| M07 | Accounts & general ledger | W1 |
| M08 | Payables, payments & expenses | W1 |
| M09 | Banking, reconciliation & Tally integration | W1 |
| M10 | Statutory compliance (GST/TDS/RERA/ROC/labour) | W2 |
| M11 | Receivables, flat sales & collections | W3 |
| M12 | Legal, contracts & document management | W2 |
| M13 | Site execution & daily progress | W1 |
| M14 | Contractor management & RA bill certification | W2 |
| M15 | Labour management | W2 |
| M16 | HR & payroll | W3 |
| M17 | CRM, lead & feasibility | W3 |
| M18 | Reporting, dashboards, notifications & analytics | W1 (v1) |
| M19 | Administration & configuration | W0 |
