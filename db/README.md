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

The DDL was executed against PostgreSQL 16.13 — all four files apply cleanly,
creating 123 tables. `99_invariant_tests.sql` was then run in full and every
assertion behaved as designed:

| # | Invariant | Mechanism | Result |
|---|---|---|---|
| 1 | A posted journal must balance | deferred constraint trigger `fin.assert_journal_balanced` | rejected `JOURNAL_UNBALANCED: debit 100 <> credit 0` at COMMIT |
| 2 | A balanced journal posts | same | accepted |
| 3 | No posting into a locked period | trigger → `core.assert_period_open` | rejected `PERIOD_LOCKED` |
| 4 | Stock can never go negative | `inv.apply_stock_movement` + `CHECK (quantity >= 0)` | rejected `NEGATIVE_STOCK` |
| 5 | Receipt then issue, weighted average | same trigger | 10 in − 4 out → qty 6, value 600, avg rate 100 |
| 6 | Gap-free document numbering | `core.next_document_no` + `pg_advisory_xact_lock` | `PO/DEVT/25-26/00001`, `…00002` — no gaps |
| 7 | Tenant isolation | RLS with `FORCE ROW LEVEL SECURITY` | own tenant 1 row, other tenant 0 rows |
| 8 | Audit log immutability | `REVOKE UPDATE, DELETE` | `permission denied for table audit_log` |
| 9 | No tenant table left unprotected | catalogue query over `pg_class.relrowsecurity` | `none - all tenant tables protected` |

Test 9 is the one worth wiring into CI unchanged (Phase 9 §5): it fails the build
the moment someone adds a table with a `tenant_id` column and forgets its policy.
It caught four such tables during authoring — two partitioned parents that the
`relkind = 'r'` loop skipped, and two platform-default rate masters whose
`tenant_id` is nullable. `core.apply_tenant_rls` now handles both cases: it
covers partitioned parents (RLS propagates to their partitions), and for nullable
`tenant_id` it emits a policy where platform-default rows (`tenant_id IS NULL`)
are readable by every tenant while `WITH CHECK` still forbids any tenant from
writing them.

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

Tests 1, 3, 4 and 8 are **expected to raise errors** — the error *is* the assertion.
Tests 2, 5, 6, 7 and 9 must succeed with the values shown above.

The suite is self-contained: test 7 creates and assumes a non-superuser role
(`aicos_rls_probe`, a member of `aicos_app`) before probing tenant isolation.
This matters — superusers bypass row-level security unconditionally, so running
the probe as `postgres` would report every tenant's rows as visible and appear
to show a leak that does not exist.
