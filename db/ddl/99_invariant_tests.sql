\set ON_ERROR_STOP off
-- seed a tenant + company + period
INSERT INTO core.tenant (id, code, name) VALUES ('11111111-1111-1111-1111-111111111111','T1','Tenant One');
SET app.tenant_id = '11111111-1111-1111-1111-111111111111';
SET app.user_id   = '22222222-2222-2222-2222-222222222222';

INSERT INTO master.company (id, tenant_id, code, name, legal_name, entity_type, registered_address)
VALUES ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','DEVT','Devt','Devt Pvt Ltd','PRIVATE_LIMITED','{}');

INSERT INTO core.financial_period (tenant_id, company_id, fy, period_start, period_end, status)
VALUES ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','25-26','2026-07-01','2026-07-31','OPEN'),
       ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','25-26','2026-06-01','2026-06-30','LOCKED');

INSERT INTO master.gl_account (id, tenant_id, company_id, code, name, account_type)
VALUES ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','5000','Material','EXPENSE'),
       ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','2000','Creditors','LIABILITY');

\echo '--- TEST 1: unbalanced posted journal must FAIL'
BEGIN;
INSERT INTO fin.journal (id, tenant_id, company_id, journal_type, posting_date, narration, status, total_debit, total_credit, created_by)
VALUES ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','PURCHASE','2026-07-10','Test purchase entry','POSTED',100,100,'22222222-2222-2222-2222-222222222222');
INSERT INTO fin.journal_line (tenant_id, journal_id, company_id, line_no, gl_account_id, debit, posting_date)
VALUES ('11111111-1111-1111-1111-111111111111','66666666-6666-6666-6666-666666666666','33333333-3333-3333-3333-333333333333',1,'44444444-4444-4444-4444-444444444444',100,'2026-07-10');
COMMIT;

\echo '--- TEST 2: balanced posted journal must SUCCEED'
BEGIN;
INSERT INTO fin.journal (id, tenant_id, company_id, journal_type, posting_date, narration, status, total_debit, total_credit, created_by)
VALUES ('77777777-7777-7777-7777-777777777777','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','PURCHASE','2026-07-10','Test purchase entry','POSTED',100,100,'22222222-2222-2222-2222-222222222222');
INSERT INTO fin.journal_line (tenant_id, journal_id, company_id, line_no, gl_account_id, debit, posting_date)
VALUES ('11111111-1111-1111-1111-111111111111','77777777-7777-7777-7777-777777777777','33333333-3333-3333-3333-333333333333',1,'44444444-4444-4444-4444-444444444444',100,'2026-07-10');
INSERT INTO fin.journal_line (tenant_id, journal_id, company_id, line_no, gl_account_id, credit, posting_date)
VALUES ('11111111-1111-1111-1111-111111111111','77777777-7777-7777-7777-777777777777','33333333-3333-3333-3333-333333333333',2,'55555555-5555-5555-5555-555555555555',100,'2026-07-10');
COMMIT;
SELECT 'journals posted: ' || count(*) FROM fin.journal WHERE status='POSTED';

\echo '--- TEST 3: posting into a LOCKED period must FAIL'
INSERT INTO fin.journal (tenant_id, company_id, journal_type, posting_date, narration, status, total_debit, total_credit, created_by)
VALUES ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','JOURNAL','2026-06-15','Locked period test entry','POSTED',0,0,'22222222-2222-2222-2222-222222222222');

\echo '--- TEST 4: negative stock must FAIL'
INSERT INTO inv.stock_ledger (tenant_id, project_id, store_id, item_id, movement_type, quantity_out, value_out, source_type, source_id, movement_date)
VALUES ('11111111-1111-1111-1111-111111111111','88888888-8888-8888-8888-888888888888','99999999-9999-9999-9999-999999999999','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ISSUE',5,500,'material_issue','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','2026-07-10');

\echo '--- TEST 5: receipt then issue within stock must SUCCEED'
INSERT INTO inv.stock_ledger (tenant_id, project_id, store_id, item_id, movement_type, quantity_in, value_in, source_type, source_id, movement_date)
VALUES ('11111111-1111-1111-1111-111111111111','88888888-8888-8888-8888-888888888888','99999999-9999-9999-9999-999999999999','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','GRN',10,1000,'goods_receipt','cccccccc-cccc-cccc-cccc-cccccccccccc','2026-07-10');
INSERT INTO inv.stock_ledger (tenant_id, project_id, store_id, item_id, movement_type, quantity_out, value_out, source_type, source_id, movement_date)
VALUES ('11111111-1111-1111-1111-111111111111','88888888-8888-8888-8888-888888888888','99999999-9999-9999-9999-999999999999','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ISSUE',4,400,'material_issue','dddddddd-dddd-dddd-dddd-dddddddddddd','2026-07-10');
SELECT 'stock qty=' || quantity || ' value=' || value || ' avg=' || avg_rate FROM inv.stock_balance;

\echo '--- TEST 6: gap-free numbering'
INSERT INTO core.number_series (id, tenant_id, company_id, document_type, financial_year, pattern)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','purchase_order','25-26','PO/DEVT/25-26/{SEQ:5}');
SELECT core.next_document_no('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') AS n1,
       core.next_document_no('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') AS n2;

\echo '--- TEST 7: RLS blocks cross-tenant read'
SET app.tenant_id = '00000000-0000-0000-0000-000000000000';
SELECT 'rows visible to other tenant: ' || count(*) FROM master.company;
