# India Compliance Rule Pack — GST · TDS · RERA · Labour · Companies Act

**Document ID:** AICOS-CMP-001 · **Version:** 1.0
**Implements:** BRD §5.8 · FDS M10 · DB `comp.*` and `master.tds_section` / `master.tax_code`

---

## 0. How to read this document — and an important caveat

> **Every rate, threshold and due date below is *configuration*, not code** (BRD assumption A-01). They are stored in effective-dated tables (`master.tds_section`, `master.tax_code`, `comp.compliance_obligation`) so that a Budget change or a GST Council notification is a data update, never a deployment.
>
> **The values shown here are indicative reference values to seed the configuration.** They must be verified by the Senior Accountant against the position in force on the go-live date before the system is used for any statutory purpose, and re-verified each financial year. This document specifies *how the rules behave*; your CA owns *what the numbers are*. The system is designed so that being wrong about a number is a five-minute correction rather than a release.

The genuine engineering contribution here is the **rule structure**: what must be checked, when, against which data, with what consequence.

---

## 1. Engagement model drives everything

Before any tax rule applies, the system must know whose transaction it is (Exec §C-4, DB §6).

| Engagement model | Whose money | Our revenue | GST on our output | RERA promoter | Flat sales |
|---|---|---|---|---|---|
| `SELF_REDEVELOPMENT_PMC` | Society's (FUM ledger) | PMC/DM fee | Service fee (standard services rate) | Society | Society sells |
| `SOCIETY_REDEVELOPMENT_DEV` | Ours | Sale of free-sale units | Construction service (scheme rates) | **Us** | We sell |
| `DEVELOPMENT_MANAGEMENT` | Client's | DM fee | Service fee | Client | Client sells |
| `CONSTRUCTION_MANAGEMENT` | Client's | PMC fee | Service fee | Client | n/a |
| `CONSULTANCY` | n/a | Professional fee | Service fee | n/a | n/a |

**Rule CMP-000 (structural):** for FUM projects, society funds post to `fin.fum_entry`, never to `fin.journal` revenue accounts. This is enforced by the generated `project.is_fum` column and the posting-rule engine, so it cannot be bypassed by a user or a bug in a single code path.

---

## 2. GST

### 2.1 Rate configuration model

`master.tax_code` rows are effective-dated and carry `cgst_pct / sgst_pct / igst_pct / cess_pct`, `is_rcm`, `itc_eligible` and `blocked_reason`. Seed set to be confirmed with the CA:

| Code | Applies to | ITC | Notes |
|---|---|---|---|
| `GST18_SERVICES` | PMC / DM / consultancy fee output | eligible for the recipient | Our principal revenue line in redevelopment consultancy |
| `GST18_WORKS_CONTRACT` | Contractor works-contract bills received | **generally blocked** for immovable property (§2.4) | Defaults to ineligible; override requires justification |
| `GST_RESI_SCHEME_LOW` / `GST_RESI_SCHEME_STD` | Residential construction under the post-April-2019 promoter scheme (affordable / other) | **no ITC** by scheme design | Applies where we are the promoter selling units |
| `GST5_MATERIAL` … `GST28_MATERIAL` | Cement, steel, tiles, fittings etc. per HSN | eligible unless blocked | Rate comes from `master.item.gst_rate` by HSN |
| `RCM_UNREGISTERED` | Purchases from unregistered suppliers under the promoter 80% rule (§2.3) | eligible per scheme | Computed, not entered |
| `RCM_SERVICES` | Notified reverse-charge services (e.g. GTA, legal, director services) | eligible unless blocked | Flagged on the vendor/service master |

### 2.2 Input tax credit — the four-condition gate

**Rule CMP-GST-01.** ITC is released only when **all four** are true; until then it sits in `comp.itc_ledger` with status `HELD` and a stated reason:

1. A valid tax invoice exists with the supplier's GSTIN **active** on the invoice date.
2. The invoice appears in **GSTR-2B** for the relevant period (matched by GSTIN + invoice number + date + value, with fuzzy invoice-number matching because vendors format them inconsistently).
3. Payment to the supplier is made **within 180 days** of the invoice date — otherwise the credit is reversed with interest and re-availed on payment.
4. The supply is not blocked credit (§2.4).

The 2B reconciliation produces three actionable buckets: *matched*, *in 2B but not in books* (missing purchase entry — chase internally), *in books but not in 2B* (supplier has not filed — chase the vendor; the system drafts the message and tracks the follow-up). ITC at risk in rupees is a dashboard tile, because it is real money.

### 2.3 The 80% procurement rule (promoters) — the one most often missed

**Rule CMP-GST-02.** A promoter under the post-April-2019 residential scheme must procure at least **80% of the value of inputs and input services from registered suppliers**, computed project-wise for the financial year. On any shortfall, the promoter pays GST under reverse charge (with cement having its own stricter treatment — RCM on any cement purchased from an unregistered supplier, irrespective of the 80% position).

System behaviour:
- Every purchase is tagged registered/unregistered from `master.vendor.is_registered_gst`.
- A **running gauge** shows the registered-procurement percentage per project per FY, so the position is visible in month 3, not discovered in month 12.
- At 78% the system warns; below 80% at year end it computes the RCM liability on the shortfall and creates the accrual entry for review.
- Cement purchases from unregistered suppliers raise an immediate flag at PO stage — the cheapest moment to fix the problem is before the order.

### 2.4 Blocked credit (Section 17(5))

**Rule CMP-GST-03.** Goods and services received for **construction of immovable property on one's own account** are blocked credit. The system therefore **defaults works-contract and construction-input lines to `itc_eligible = false`** with the clause cited, and requires a written justification (recorded against the invoice, reportable) to mark them eligible. This is deliberately the conservative default: over-claimed ITC attracts interest and penalty; under-claimed ITC is recoverable through review.

Other blocked categories configured: motor vehicles below the seating threshold, food and beverages, club and health services, personal consumption, goods lost/stolen/written off/given as free samples.

### 2.5 E-invoicing and e-way bill

**Rule CMP-GST-04.** Where the entity's aggregate turnover exceeds the notified e-invoicing threshold, a B2B invoice is **not valid without an IRN**. The system therefore blocks issue of such an invoice until the IRN and signed QR are received from the IRP via the GSP, and stores both against the invoice. Cancellation is permitted only within the statutory window (currently 24 hours) — after that a credit note is the only route, and the UI says so.

**Rule CMP-GST-05.** E-way bill generation is required for movement of goods above the applicable value threshold, with validity by distance. The system generates it from the PO/challan data via the GSP and tracks the expiry — an expired e-way bill on a vehicle is a real operational problem, so the alert goes to the site engineer, not to accounts.

### 2.6 Returns and calendar

| Return | Content | Typical due date (configure per period) |
|---|---|---|
| GSTR-1 | Outward supplies | 11th of the following month |
| GSTR-3B | Summary and payment | 20th of the following month (staggered for some taxpayers) |
| GSTR-2B | Auto-drafted ITC statement (download) | generated ~14th |
| GSTR-9 / 9C | Annual return / reconciliation | as notified |

The system prepares the working papers, flags differences, and stores the ARN and filing evidence. **It does not file autonomously** — filing is a human act with a step-up-authenticated confirmation.

---

## 3. TDS / TCS

### 3.1 Section configuration

`master.tds_section` is effective-dated per `(section, deductee_type)`. Indicative seed set for a construction and redevelopment business:

| Section | Nature | Typical rate | Threshold behaviour |
|---|---|---|---|
| 194C | Contractor / sub-contractor payments | lower rate for individual/HUF, higher for others | Both a single-payment threshold and a higher aggregate annual threshold; the system tracks **both** |
| 194J | Professional / technical fees (architect, RCC consultant, legal, CA) | professional rate; a reduced rate applies to certain technical services | Annual threshold per deductee |
| 194I | Rent — land/building vs plant & machinery have different rates | two distinct rates | Annual threshold; **relevant to member rent payments** |
| 194IA | Purchase of immovable property | 1% of consideration | Applies at or above the notified consideration; deducted by the **buyer** — matters for flat sales |
| 194H | Commission / brokerage (channel partners) | commission rate | Annual threshold |
| 194Q | Purchase of goods above the annual purchase threshold | 0.1% on the excess | Buyer-side; takes precedence over 206C(1H) |
| 206C(1H) | TCS on sale of goods | 0.1% on the excess | Seller-side; **suppressed where 194Q applies** |
| 192 | Salary | slab-based | Annual projection, monthly adjustment |
| No PAN (206AA) | any of the above | higher of the section rate or 20% | Automatic where PAN is absent or invalid |

### 3.2 Behavioural rules

| ID | Rule |
|---|---|
| CMP-TDS-01 | TDS is deducted at the **earlier of credit or payment**. Booking an invoice creates the liability even if payment is later. |
| CMP-TDS-02 | Thresholds are evaluated **cumulatively per deductee, per section, per financial year**. Crossing a threshold triggers deduction on the *whole* aggregate where the section requires it, not merely the excess — the system computes the catch-up automatically and shows it as a separate line so the vendor conversation is easy. |
| CMP-TDS-03 | A **Lower Deduction Certificate** reduces the rate only within its validity **and** up to its certified limit. Consumption is tracked in `master.ldc_certificate.consumed_amount`; on exhaustion the rate reverts to the normal section rate mid-payment, and the payment shows both slices. |
| CMP-TDS-04 | Where PAN is absent or fails format/validation, the higher no-PAN rate applies automatically and the vendor master is flagged. |
| CMP-TDS-05 | 194Q and 206C(1H) cannot both apply to the same transaction; 194Q (buyer) takes precedence. |
| CMP-TDS-06 | TDS on **member rent** (194I) is evaluated per payer per member per year — many members individually fall below the threshold, so blanket deduction is as wrong as blanket non-deduction. |
| CMP-TDS-07 | Deposit is due by the 7th of the following month (30 April for March deductions, as configured). Late deposit accrues interest; the system computes and displays the exposure rather than letting it surface in an assessment. |
| CMP-TDS-08 | Quarterly statements (26Q for residents, 27Q for non-residents, 27EQ for TCS) are generated as data files for the return-filing utility; TDS certificates (Form 16A) are issued from the same data. |
| CMP-TDS-09 | GST is excluded from the TDS base where the GST component is separately shown on the invoice. |

---

## 4. RERA

Applicable where **we** are the promoter (`SOCIETY_REDEVELOPMENT_DEV`); where the society is the promoter, the system produces the same pack in a support capacity.

| ID | Rule |
|---|---|
| CMP-RERA-01 | **70% of every amount realised from allottees** must be deposited in the project's separate designated account, to cover land and construction cost. Every receipt is split 70:30 at the point of recording, and the split is tracked per receipt — not reconstructed at quarter end. |
| CMP-RERA-02 | Withdrawal from the designated account is permitted **in proportion to the percentage of completion**, and requires the certificate set: **Form 1** (architect), **Form 2** (engineer), **Form 3** (chartered accountant). The system blocks a withdrawal entry that exceeds the certified percentage and holds the certificates as linked documents. |
| CMP-RERA-03 | A **quarterly progress report** is due within the state-prescribed window after each quarter end. The QPR pack is assembled from DPR, milestone and financial data; quarter close is blocked until it is generated. |
| CMP-RERA-04 | The agreement for sale may not take more than the permitted advance (currently 10% of cost) before registration of the agreement. |
| CMP-RERA-05 | Carpet area is the statutory basis for sale and disclosure; the system stores carpet, built-up and saleable separately and uses carpet for all RERA-facing outputs. |
| CMP-RERA-06 | Registration validity, extensions and amendments are tracked with alerts at T-90 and T-30 days. |
| CMP-RERA-07 | Defect liability of five years from possession is tracked per unit, with a member/customer-raised defect workflow. |

---

## 5. Labour and site statutory

| ID | Rule |
|---|---|
| CMP-LAB-01 | **BOCW cess at 1%** of the cost of construction accrues as cost is incurred and must be remitted within the statutory period; the accrual is automatic from certified construction cost. |
| CMP-LAB-02 | Contractors engaging labour above the notified headcount require registration/licence under the Contract Labour Act; validity is tracked and expiry blocks new work orders. |
| CMP-LAB-03 | PF and ESIC applicability for contract labour is verified monthly; missing evidence raises a compliance hold on that contractor's RA bill payment (warn and escalate rather than hard-block, because site work cannot stop for a paperwork lag — but the exception is visible and reported). |
| CMP-LAB-04 | Wage rates are validated against the applicable **state minimum wage** by trade and skill category; a lower rate is blocked. |
| CMP-LAB-05 | Statutory registers (muster roll, wage register, overtime, fines, advances) are generated in the prescribed formats. |
| CMP-LAB-06 | Site welfare obligations (drinking water, first aid, crèche, sanitation, accommodation) are tracked as a periodic checklist with photographic evidence. |

---

## 6. Companies Act / MCA

| ID | Rule |
|---|---|
| CMP-ROC-01 | The statutory register holds directors, DIN, shareholding, charges and board resolutions. |
| CMP-ROC-02 | **DSC expiry** is tracked per signatory with alerts at T-60/T-30/T-7 — the sleeping director's DSC is exactly the one that expires unnoticed and delays a filing (Exec §C-11). |
| CMP-ROC-03 | Annual filing obligations (financial statements, annual return, director KYC) sit on the compliance calendar with named owners. |
| CMP-ROC-04 | Related-party transactions are flagged where a vendor's PAN or director matches a company officer — a control auditors specifically look for. |
| CMP-ROC-05 | Books of account and supporting records are retained for **8 years**; the audit log is retained for the same period and is immutable. |

---

## 7. Income Tax — transaction-level controls

| ID | Rule |
|---|---|
| CMP-IT-01 | **Section 40A(3):** cash payment exceeding ₹10,000 to a single person in a single day is disallowed as expenditure — the system **blocks** it at entry rather than reporting it at audit. |
| CMP-IT-02 | **Section 269ST:** receipt of ₹2,00,000 or more in cash from a person in a day, or for a single transaction, is prohibited — blocked. |
| CMP-IT-03 | **Section 43B(h):** payments to micro and small enterprises beyond the MSME time limit (45 days with a written agreement, 15 days without) are disallowed in the year of accrual. The system flags MSME vendors, computes days outstanding, and alerts the Director **before** the deadline — this is one of the highest-value alerts in the product for an Indian SME. |
| CMP-IT-04 | Advance tax instalment dates sit on the compliance calendar with a computed estimate. |
| CMP-IT-05 | Form 26AS / AIS reconciliation against our own TDS-receivable records (Wave 3). |

---

## 8. Compliance calendar engine

Every obligation is a row in `comp.compliance_obligation`:

```
{ code, name, statute, frequency (monthly|quarterly|annual|event),
  due_rule (e.g. "20th of month+1", "quarter_end + 30d"),
  applicable_when (entity type, turnover band, engagement model, state),
  owner_role, escalation_chain, evidence_required[], penalty_note }
```

The scheduler materialises `comp.compliance_event` instances ahead of time. Reminder ladder: **T-15, T-7, T-3, T-1, and daily after the due date**, escalating owner → Senior Accountant → Executive Director. Closure requires evidence (challan, ARN, acknowledgement) attached to the event — an obligation cannot be marked done by assertion alone.

Applicability is evaluated per entity, so a small SPV does not inherit the holding company's obligations, and a Maharashtra project does not inherit another state's professional tax.

---

## 9. Maharashtra self-redevelopment starter pack

Because this is the client's primary business, the seed configuration includes:

- **Consent framework** for society redevelopment under the cooperative societies framework and the applicable government directives, with the consent percentage configurable per state and the basis displayed on screen alongside the number (so nobody has to remember which rule was applied).
- **Member entitlement formula** stored per project (`existing carpet × (1 + agreed increment) + fixed addition`), so entitlement is computed identically for every member and is auditable against the development agreement clause it came from.
- **Standard member obligation set:** monthly rent with annual escalation, corpus in agreed tranches, shifting charges (typically at vacation and at re-possession), and brokerage where agreed.
- **Statutory approval checklist** for a Mumbai/MMR redevelopment: society resolution → LOI → development agreement → IOD → commencement certificate → plinth → slab-wise checks → occupation certificate → possession, each with its documents, owner and expected duration.
- **Cost head template** for redevelopment: land and TDR, construction, rent and corpus to members, approvals and premiums, professional fees, finance cost, marketing, statutory, contingency.

This pack is a data seed, not code, which is what makes the same product resellable to a firm operating in a different state (Wave 4).

---

## 10. What the system does *not* do

Stated plainly, because compliance software that overpromises is dangerous:

- It does **not** file returns autonomously. It prepares; a human files.
- It does **not** replace the Senior Accountant's or the CA's judgement. It encodes decisions they have made, applies them consistently, and shows its working.
- It does **not** guarantee that a configured rate matches the current law. It guarantees that the rate is versioned, effective-dated, attributable to whoever set it, and changeable in minutes.
- It does **not** interpret ambiguous positions (for example, whether a specific input qualifies for credit). It applies the conservative default, records the override and the justification, and reports every override for review.

That boundary is the point: the system makes compliance *systematic and auditable*, and leaves the *judgement* with the people who are professionally accountable for it.
