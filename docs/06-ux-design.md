# Phase 6 — UI / UX Design

**Document ID:** AICOS-UX-001 · **Version:** 1.0

---

## 1. Objective

Design an interface that a 55-year-old accountant, a site engineer on a dusty terrace with one bar of signal, and a director approving payments between society meetings can all use without training — while carrying the density an ERP requires.

**The adoption test:** if a task is faster on WhatsApp or Excel, users will do it there. Every screen below is measured against that.

---

## 2. Design principles

| # | Principle | Consequence |
|---|---|---|
| UX-1 | **Role-first, not module-first.** | The Director's home is an approval queue, not a menu tree. |
| UX-2 | **One screen per decision.** | Everything needed to approve a payment is on the approval card — no navigating away. |
| UX-3 | **Density where experts work, simplicity where they don't.** | Grid-heavy screens for accounts and QS; card-and-button screens for site and mobile. |
| UX-4 | **Never make a human type what the system knows.** | Prefill from masters, last transaction, BOQ, AI extraction. |
| UX-5 | **AI is a visible assistant, never an invisible actor.** | Purple-tinted fields = AI-suggested, with confidence and a click-through to the source region of the document. |
| UX-6 | **Show the money impact before the click.** | Budget consumed, cash after payment, TDS deducted — on the approval screen itself. |
| UX-7 | **Errors are instructions.** | "Budget exhausted on BOQ line 4.2.1 — ₹12,500 available, ₹48,000 requested. Request a budget deviation?" with the action attached. |
| UX-8 | **Keyboard-first for back office.** | Bank reconciliation and journal entry must be operable without a mouse. |
| UX-9 | **Offline is a visible state, not a failure.** | Persistent sync badge; queued items show where they are. |
| UX-10 | **Indian conventions by default.** | ₹ with lakh/crore grouping (₹12,45,678), DD-MM-YYYY, IST, financial year 25-26. |

---

## 3. Information architecture

```
Home (role-specific)
├── Approvals            inbox · delegated · history
├── Projects             list → Project 360 → { progress, budget, procurement,
│                          stock, site, members, documents, compliance }
├── Procurement          requisitions · RFQs · orders · work orders · vendors
├── Materials            receipts · issues · stock · transfers · reconciliation
├── Site                 DPR · measurements · RA bills · quality · labour
├── Finance              invoices · payments · banking · ledger · reports
├── Society & Members    societies · members · obligations · payment runs
├── Sales                inventory · leads · bookings · collections
├── Compliance           calendar · GST · TDS · RERA · statutory
├── Documents            explorer · search · expiring · templates
├── Reports              catalogue · saved views · schedules
└── Admin                users · roles · DOA · workflows · settings · integrations
```

Global: command palette (`Ctrl/Cmd-K`) for "go to PO-00042", "create PR", "vendor Shree Steel" · universal search · notification bell · company/project context switcher · AI assistant panel (right drawer, context-aware).

---

## 4. Design system

**Foundations:** 4 px spacing scale · Inter (Latin) + Noto Sans Devanagari (Hindi/Marathi) · type scale 12/14/16/20/24/32 · 8-step neutral ramp.

| Token | Use |
|---|---|
| `primary` | actions, links |
| `success` | approved, matched, within budget |
| `warning` | pending, near threshold, low confidence |
| `danger` | rejected, overdue, budget breach, negative variance |
| `ai` (violet) | AI-generated or AI-suggested content — reserved exclusively for this |
| `neutral` | structure, text, borders |

**Never rely on colour alone** — every status carries an icon and a text label (WCAG 2.1 AA, and site engineers work in bright sunlight).

**Core components:** DataGrid (virtualised, column chooser, group, pivot, inline edit, Excel export) · DocumentCard · ApprovalCard · AmountInput (Indian grouping, keyboard-friendly) · MasterPicker (search-as-you-type, recent-first, create-inline) · StatusChip · Timeline · SplitViewer (document ⟷ extracted fields) · FilterBar with saved views · MoneyBreakdown (gross → deductions → net) · ConfidenceBadge · SyncIndicator.

---

## 5. Key screens

### 5.1 Director home — Approval Inbox
The single most important screen in the product.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Good morning, Director            Cash ₹38.4L ▾   3 projects          │
│  ┌──────────┬──────────┬──────────┬──────────┐                         │
│  │ 7        │ ₹24.8L   │ 2        │ 4        │                         │
│  │ Awaiting │ Value    │ Overdue  │ Alerts   │                         │
│  └──────────┴──────────┴──────────┴──────────┘                         │
├────────────────────────────────────────────────────────────────────────┤
│ ▸ PAYMENT   Shree Steel Traders                 ₹4,25,000    2 days ago│
│   PO/GKS/25-26/00042 · 12 MT TMT Fe500D · Project: Ghatkopar           │
│   ┌ AI summary ─────────────────────────────────────────────────────┐  │
│   │ Against PO 00042. GRN 00071 received 12 MT, invoice matches.    │  │
│   │ Rate ₹52,400/MT — 3% above last purchase (₹50,900, 14-Jun).     │  │
│   │ Budget: steel line 68% consumed, ₹18.2L available.              │  │
│   │ TDS 194Q ₹425 deducted. No duplicate found.                     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│   [ Approve ]  [ Return ]  [ Reject ]      View invoice · PO · GRN      │
├────────────────────────────────────────────────────────────────────────┤
│ ▸ PURCHASE REQUISITION  Cement 400 bags        ₹1,52,000    5 hours ago│
│   ⚠ Budget breach: ₹1.52L requested, ₹0.94L available on line 3.1.2    │
│   [ Approve with deviation ]  [ Return ]  [ Reject ]                   │
└────────────────────────────────────────────────────────────────────────┘
```

Behaviour: cards ordered by urgency then value · expand in place, never navigate away · bulk-approve for same-type items under a threshold · swipe to approve on mobile · rejection/return **requires** a reason · every approval is a step-up-authenticated action.

### 5.2 Accountant — Bank Reconciliation Workbench

Three panes: statement lines (left) · match candidates (centre) · action panel (right). Colour-coded by confidence. Fully keyboard-driven: `↑/↓` navigate, `Enter` accept suggestion, `M` manual match, `C` create transaction from line, `I` ignore. A "Match all ≥ 95%" button clears the bulk in one action, and the remaining exceptions are the actual work. A running counter — *"142 of 168 matched (85%) · 26 remaining"* — makes progress visible, because this task's biggest problem today is that it feels endless.

### 5.3 Accountant — Invoice Inbox (split viewer)

Left: the source PDF/image with **highlighted regions**. Right: extracted fields, each showing its confidence; clicking a field scrolls and highlights its source region. Low-confidence fields are flagged and focused first. Below: the three-way match panel (PO ↔ GRN ↔ Invoice) with green ticks or explicit differences. The accountant's job becomes *verify and correct*, not *read and type*.

### 5.4 Site Engineer — Mobile DPR

One scrolling form, autosaving, offline-capable: date & weather (auto) → manpower (stepper per trade, prefilled from yesterday) → activities (prefilled from yesterday's open items; enter quantity done) → materials consumed → photos (camera, auto-watermarked) → hindrances → submit.

Targets: **under 3 minutes** to complete, works on 3G, every field prefilled where possible, sync state visible per section. Voice input for remarks in Hindi/Marathi.

### 5.5 Site Engineer — Mobile PR

Project (defaulted) → item (search, recent-first) → quantity → required-by → optional photo → submit. Shows live budget availability for the BOQ line **before** submitting, so the engineer isn't surprised by a rejection later. Under 45 seconds.

### 5.6 QS — RA Bill Computation Sheet

Item grid: WO qty · cumulative measured · previously billed · this bill · rate · amount — with drill-through to the measurement entries behind each number. Below, a deduction stack where each line is explained and traceable: retention 5% ₹42,150 · advance recovery ₹1,25,000 (₹3.75L outstanding) · material issued ₹86,400 (12 issue slips) · TDS 194C 2% ₹16,860 · net payable ₹6,12,590. Nothing on this screen is typed by hand; everything is computed and sourced.

### 5.7 Society & Member — Monthly Payment Run

Select month → the system lists every member obligation due, with exceptions surfaced first (bank details missing, agreement not executed, PAN absent above TDS threshold, member on hold). Totals: 64 members · gross ₹22,40,000 · TDS ₹2,24,000 · net ₹20,16,000. Submit once for approval; on release, each member receives a WhatsApp confirmation. What is a two-day spreadsheet exercise today becomes a ten-minute review.

### 5.8 Project 360

Header: name, engagement model, status, key dates, RAG. Tabs: Overview (S-curve, budget donut, milestones, alerts) · Financials · Procurement · Materials · Site · Members · Documents · Compliance. Every number drills through to its transactions — the rule is **no dead-end numbers**.

---

## 6. Mobile design

| Aspect | Decision |
|---|---|
| Navigation | Bottom tabs: Home · Approvals · Capture · Search · More |
| Primary actions | Single floating action button, role-aware (engineer → DPR/GRN/PR; director → approvals) |
| Touch targets | ≥ 48 dp; primary actions reachable one-handed in the lower third |
| Offline | Persistent badge: *Online* / *Offline — 3 items queued* / *Syncing 2 of 3*; queued items visible and editable |
| Camera | Auto-watermark (project, date-time, GPS); compress client-side; upload in background; DPR submits even while photos upload |
| Notifications | Approval requests, DPR reminders, delivery due, payment released — deep-linked to the exact screen |
| Sunlight | High-contrast theme option; no critical information conveyed by colour alone |
| Data | Delta sync only; images at ≤ 1600 px; explicit "sync on Wi-Fi only" setting |

---

## 7. WhatsApp interface (Wave 2)

Because fighting WhatsApp loses (Exec §C-3):

```
🔔 Approval needed — Payment ₹4,25,000
Shree Steel Traders · Ghatkopar
PO/GKS/25-26/00042 · 12 MT TMT

Rate 3% above last purchase.
Budget: ₹18.2L available.

[ Approve ]  [ Reject ]  [ View details ]
```

`Approve` posts back to the API and creates a real, audited approval — the record lives in AI-COS. `View details` opens a single-use, expiring deep link that requires authentication. Above a configurable amount, WhatsApp approval is disabled and the app (with MFA) is required. Other flows: DPR reminders, PO dispatch to vendors, member rent confirmations, and a Director morning brief at 08:00.

---

## 8. Accessibility & localisation

WCAG 2.1 AA: 4.5:1 contrast, full keyboard operability, visible focus rings, ARIA labelling on grids and dialogs, screen-reader-announced errors, no colour-only encoding, `prefers-reduced-motion` respected.

Localisation: English, Hindi, Marathi (UI strings externalised from day one, not retrofitted) · Indian digit grouping and lakh/crore in summaries · DD-MM-YYYY · IST · Indian financial year · rupee formatting utilities centralised so no component invents its own.

---

## 9. User journeys (measured)

| Journey | Today | Target | How |
|---|---|---|---|
| Engineer raises a material request | WhatsApp message, then chased for days | **45 s** to submit, decision < 8 h | Mobile PR with prefill + DOA routing + push |
| Director approves a payment | Scroll chat, ask questions, approve verbally | **20 s** per approval | Approval card with AI summary and money impact |
| Accountant books a vendor invoice | 8–10 min of keying | **90 s** to verify and post | Split viewer + extraction + 3-way match |
| Monthly bank reconciliation | 2–3 days | **2 hours** | Auto-match + suggestion queue + keyboard workflow |
| Member rent payment run | 2 days of spreadsheet work | **10 min** | Obligation engine + payment run console |
| Producing project P&L | Days, if at all | **instant** | Dimensional ledger + snapshots |

These are acceptance criteria for UAT, not aspirations.

---

## 10. Screen inventory (Wave 1)

Auth (3) · Home/dashboards (5) · Approvals (3) · Masters (12) · Project/Society/Member (9) · BOQ & budget (4) · Procurement (9) · Materials (8) · Site (5) · Finance (11) · Documents (4) · Reports (3) · Admin (8) · Mobile (10). **≈ 94 screens**, of which ~30 are variations of the same grid/detail patterns — which is exactly why the component library is built first.

---

## 11. Validation, roles, reports, dashboards, AI, security, future (mandated format)

- **Validation rules in the UI:** inline, on blur, with the server as the authority — client validation is UX, never a control. Errors name the field, the rule and the fix. Destructive actions require typed confirmation. Unsaved-change guards on navigation.
- **User roles:** each role's default landing page, navigation subset and dashboard are configuration, not code (Phase 2C M19).
- **Reports/dashboards:** every grid is exportable with the user's current filters; every dashboard tile drills through.
- **AI opportunities in the UI:** command palette accepts natural language ("show me overdue POs at Ghatkopar") · the assistant drawer sees the current screen's context · inline explain-this-number · draft-and-confirm for repetitive documents.
- **Security in the UI:** masked PII with an explicit, audited unmask action · step-up auth for approvals and admin · session-timeout warning · watermarked exports · no sensitive data in URLs or notification previews.
- **Future enhancements:** dark mode · full offline read for project data · voice-driven site capture · AR/photo-based progress capture · a member-facing app · white-label theming for SaaS tenants.
