# AI-COS — Database DDL

Reference DDL for Phase 4 ([`../docs/04-database-design.md`](../docs/04-database-design.md)).
This is the schema an engineering team implements against; in the application repo it is
re-expressed as Drizzle migrations (Phase 3 §2.2) — this directory is the authoritative
design artefact and the source for the first migration set.

## Files

| File | Contents |
|---|---|
| `01_core.sql` | Extensions, schemas, DB roles, tenancy, identity, RBAC, DOA, workflow/approvals, numbering, financial periods, audit log, settings & business rules, documents, notifications, outbox, idempotency |
| `02_master.sql` | Company & statutory officers, society, member & obligations, project & area statement, bank accounts, vendor (with maker-checker bank accounts), item/UOM/price, cost head, GL account, store, tax masters |
| `03_operations.sql` | WBS, BOQ & budget with commitment accounting, activities, consumption norms, PR → RFQ → PO → Work Order, GRN, stock ledger & balance, material issue, physical verification, DPR, measurements, RA bills, NCR |
| `04_finance.sql` | Journal & journal lines (partitioned), FUM ledger, purchase invoices, payment requests/runs/vouchers, advances, retention, TDS, bank statements & reconciliation, Tally sync queue & drift, AI traces/extractions/chunks/feedback |
| `99_invariant_tests.sql` | Executable checks for the invariants the database itself must enforce |

Apply in numeric order.

## Prerequisites

PostgreSQL 16 with `pgcrypto`, `citext`, `pg_trgm`, `btree_gist` and
[`pgvector`](https://github.com/pgvector/pgvector) available.

## Validation status

The DDL was executed against PostgreSQL 16.13. All four files apply cleanly.
`99_invariant_tests.sql` was run and the following behaved as designed:

| Invariant | Mechanism | Result |
|---|---|---|
| A posted journal must balance | deferred constraint trigger `fin.assert_journal_balanced` | rejected `debit 100 <> credit 0` at COMMIT |
| Balanced journal posts | same | accepted |
| No posting into a locked period | trigger → `core.assert_period_open` | rejected `PERIOD_LOCKED` |
| Stock can never go negative | `inv.apply_stock_movement` + `CHECK (quantity >= 0)` | rejected `NEGATIVE_STOCK` |
| Receipt then issue, weighted average | same trigger | 10 in − 4 out = qty 6, value 600, avg rate 100 |
| Gap-free document numbering | `core.next_document_no` + `pg_advisory_xact_lock` | `PO/DEVT/25-26/00001…00003`, no gaps |
| Tenant isolation | RLS with `FORCE ROW LEVEL SECURITY` | own tenant 1 row, other tenant 0 rows (as non-superuser `aicos_app`) |
| Audit log immutability | `REVOKE UPDATE, DELETE` | `permission denied for table audit_log` |

> Note on the stock trigger: `INSERT … ON CONFLICT DO UPDATE` cannot be used for the
> balance upsert. PostgreSQL evaluates CHECK constraints against the *proposed* insert
> tuple — the raw movement delta, which is negative for an issue — before conflict
> arbitration, so a valid issue-after-receipt would fail. The trigger therefore does a
> locking `SELECT … FOR UPDATE`, validates, then updates or inserts. This was found by
> running `99_invariant_tests.sql`, not by inspection.

## Running the tests locally

```bash
createdb aicos_dev
for f in db/ddl/0*.sql; do psql -v ON_ERROR_STOP=1 -d aicos_dev -f "$f"; done
psql -d aicos_dev -f db/ddl/99_invariant_tests.sql   # expect the FAIL cases to raise
```

Tests 1, 3 and 4 are **expected to raise errors** — that is the assertion. Tests 2, 5, 6
and 7 must succeed. Connect as a non-superuser member of `aicos_app` to exercise RLS;
superusers bypass row-level security and will see every tenant's rows.
