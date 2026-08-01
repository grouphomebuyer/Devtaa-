/**
 * Integration tests for the purchase requisition use case.
 *
 * These run against a real PostgreSQL instance with row-level security active,
 * connected as a NON-SUPERUSER member of aicos_app. That detail is the whole
 * point: a superuser bypasses RLS unconditionally, so the same suite run as
 * `postgres` would pass while proving nothing about tenant isolation.
 *
 * Two connection strings are needed, and the split is deliberate:
 *   AICOS_TEST_DATABASE_URL       — the application role (aicos_app), RLS applies
 *   AICOS_TEST_ADMIN_DATABASE_URL — a privileged role, used only to seed
 *
 * The application role cannot insert tenants, which is correct: provisioning a
 * tenant is not something the application may do to itself. Seeding through the
 * app role would have required loosening that grant and quietly weakening the
 * very boundary these tests exist to prove.
 *
 * Skipped when unset, so a developer without a local database still gets a
 * green unit suite.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { Database, assertRlsActive, type RequestContext } from '../src/db/context.js';
import { createRequisition } from '../src/modules/procurement/create-requisition.js';
import { AppError } from '../src/common/errors.js';

const CONNECTION = process.env.AICOS_TEST_DATABASE_URL;
const ADMIN_CONNECTION = process.env.AICOS_TEST_ADMIN_DATABASE_URL;
const suite = CONNECTION && ADMIN_CONNECTION ? describe : describe.skip;

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER_A = '33333333-3333-3333-3333-333333333333';
const COMPANY_A = '44444444-4444-4444-4444-444444444444';
const PROJECT_A = '55555555-5555-5555-5555-555555555555';
const COSTHEAD_A = '66666666-6666-6666-6666-666666666666';
const BOQ_VERSION_A = '77777777-7777-7777-7777-777777777777';
const BOQ_LINE_A = '88888888-8888-8888-8888-888888888888';

const ctxA: RequestContext = {
  tenantId: TENANT_A,
  userId: USER_A,
  projectIds: [PROJECT_A],
  allProjects: true,
};
const ctxB: RequestContext = { ...ctxA, tenantId: TENANT_B };

let db: Database;

suite('createRequisition (real PostgreSQL, RLS active)', () => {
  beforeAll(async () => {
    db = new Database(new Pool({ connectionString: CONNECTION, max: 4 }));
    await seed();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('refuses to run as a superuser, so isolation is never falsely proven', async () => {
    await db.withContext(ctxA, async (tx) => {
      await expect(assertRlsActive(tx)).resolves.toBeUndefined();
    });
  });

  it('creates a requisition within budget and reports no warnings', async () => {
    const result = await db.withContext(ctxA, (tx) =>
      createRequisition(tx, ctxA, {
        projectId: PROJECT_A,
        requiredBy: '2026-08-20',
        lines: [
          {
            description: 'OPC 53 grade cement',
            costHeadId: COSTHEAD_A,
            boqLineId: BOQ_LINE_A,
            uom: 'Bag',
            quantity: '400',
            estimatedRate: '380.0000',
          },
        ],
      }),
    );

    expect(result.status).toBe('DRAFT');
    expect(result.totalEstimatedAmount).toBe('152000.0000');
    expect(result.budgetState).toBe('WITHIN');
    expect(result.warnings).toHaveLength(0);
  });

  it('flags a budget breach with the exact shortfall and rule code', async () => {
    const result = await db.withContext(ctxA, (tx) =>
      createRequisition(tx, ctxA, {
        projectId: PROJECT_A,
        requiredBy: '2026-08-20',
        lines: [
          {
            description: 'OPC 53 grade cement — bulk',
            costHeadId: COSTHEAD_A,
            boqLineId: BOQ_LINE_A,
            uom: 'Bag',
            quantity: '5000',
            estimatedRate: '380.0000',
          },
        ],
      }),
    );

    expect(result.budgetState).toBe('BREACH');
    const warning = result.warnings.find((w) => w.code === 'BUDGET_EXCEEDED');
    expect(warning?.ruleCode).toBe('BR-001');
    // budget 1,000,000 - committed 600,000 - incurred 200,000 = 200,000 available
    // requested 1,900,000 -> short by 1,700,000
    expect(warning?.message).toContain('1700000.0000');
  });

  it('is idempotent: the same client-generated id does not create a second document', async () => {
    const id = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
    const payload = {
      id,
      projectId: PROJECT_A,
      requiredBy: '2026-08-25',
      lines: [
        {
          description: 'Binding wire',
          costHeadId: COSTHEAD_A,
          uom: 'Kg',
          quantity: '50',
          estimatedRate: '82.0000',
        },
      ],
    };

    const first = await db.withContext(ctxA, (tx) => createRequisition(tx, ctxA, payload));
    const second = await db.withContext(ctxA, (tx) => createRequisition(tx, ctxA, payload));

    expect(first.id).toBe(id);
    expect(second.id).toBe(id);

    const count = await db.withContext(ctxA, async (tx) => {
      const { rows } = await tx.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM proc.purchase_requisition WHERE id = $1',
        [id],
      );
      return Number(rows[0]?.n);
    });
    expect(count).toBe(1);
  });

  it('writes an immutable audit row for every creation', async () => {
    const before = await auditCount();
    await db.withContext(ctxA, (tx) =>
      createRequisition(tx, ctxA, {
        projectId: PROJECT_A,
        requiredBy: '2026-08-21',
        lines: [
          {
            description: 'Shuttering ply',
            costHeadId: COSTHEAD_A,
            uom: 'Nos',
            quantity: '20',
            estimatedRate: '1450.0000',
          },
        ],
      }),
    );
    expect(await auditCount()).toBe(before + 1);
  });

  it('cannot delete the audit trail even with a valid session', async () => {
    await expect(
      db.withContext(ctxA, (tx) => tx.query('DELETE FROM core.audit_log')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('hides another tenant\'s project rather than reporting it as forbidden', async () => {
    // Tenant B presents a real project id belonging to tenant A. RLS makes the
    // row invisible, and the API deliberately answers 404 rather than 403 so it
    // does not confirm that the record exists (Phase 7 §4).
    await expect(
      db.withContext(ctxB, (tx) =>
        createRequisition(tx, ctxB, {
          projectId: PROJECT_A,
          requiredBy: '2026-08-20',
          lines: [
            {
              description: 'Probe',
              costHeadId: COSTHEAD_A,
              uom: 'Nos',
              quantity: '1',
              estimatedRate: '1.0000',
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ status: 404, code: 'PROJECT_NOT_FOUND' });
  });

  it('rolls the whole transaction back when any line fails', async () => {
    const before = await requisitionCount();
    await expect(
      db.withContext(ctxA, (tx) =>
        createRequisition(tx, ctxA, {
          projectId: PROJECT_A,
          requiredBy: '2026-08-20',
          lines: [
            {
              description: 'Valid line',
              costHeadId: COSTHEAD_A,
              uom: 'Nos',
              quantity: '1',
              estimatedRate: '100.0000',
            },
            {
              description: 'References a BOQ line that does not exist',
              costHeadId: COSTHEAD_A,
              boqLineId: '99999999-9999-4999-8999-999999999999',
              uom: 'Nos',
              quantity: '1',
              estimatedRate: '100.0000',
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(AppError);

    expect(await requisitionCount()).toBe(before);
  });

  it('rejects an invalid payload with field-level errors', async () => {
    await expect(
      db.withContext(ctxA, (tx) =>
        createRequisition(tx, ctxA, {
          projectId: PROJECT_A,
          requiredBy: '2026-08-20',
          lines: [
            {
              description: 'x',
              costHeadId: 'not-a-uuid',
              uom: 'Nos',
              quantity: '-5',
              estimatedRate: '100.0000',
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });
});

// --------------------------------------------------------------------- setup

async function auditCount(): Promise<number> {
  return db.withContext(ctxA, async (tx) => {
    const { rows } = await tx.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM core.audit_log WHERE entity_type = 'purchase_requisition'",
    );
    return Number(rows[0]?.n);
  });
}

async function requisitionCount(): Promise<number> {
  return db.withContext(ctxA, async (tx) => {
    const { rows } = await tx.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM proc.purchase_requisition',
    );
    return Number(rows[0]?.n);
  });
}

/**
 * Seed runs with a privileged connection because inserting the tenant row
 * itself precedes any tenant context. Everything the tests then do goes through
 * the RLS-scoped path.
 */
async function seed(): Promise<void> {
  const admin = new Pool({ connectionString: ADMIN_CONNECTION, max: 2 });
  try {
    await admin.query('BEGIN');
    await admin.query(
      `INSERT INTO core.tenant (id, code, name) VALUES ($1,'T-A','Tenant A'), ($2,'T-B','Tenant B')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_A, TENANT_B],
    );
    await admin.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT_A]);
    // UOM is a platform master, not tenant data — every transaction references it.
    await admin.query(
      `INSERT INTO master.uom (code, name, decimals) VALUES
         ('Nos','Numbers',0), ('Bag','Bag',0), ('Kg','Kilogram',3),
         ('MT','Metric Tonne',3), ('Cum','Cubic Metre',3), ('Sqft','Square Foot',2)
       ON CONFLICT (code) DO NOTHING`,
    );
    await admin.query(
      `INSERT INTO master.company (id, tenant_id, code, name, legal_name, entity_type, registered_address)
       VALUES ($1,$2,'DEVT','Devtaa','Devtaa Pvt Ltd','PRIVATE_LIMITED','{}')
       ON CONFLICT (id) DO NOTHING`,
      [COMPANY_A, TENANT_A],
    );
    await admin.query(
      `INSERT INTO master.project (id, tenant_id, company_id, code, name, engagement_model, address)
       VALUES ($1,$2,$3,'GKS','Ganesh Krupa CHS','SELF_REDEVELOPMENT_PMC','{}')
       ON CONFLICT (id) DO NOTHING`,
      [PROJECT_A, TENANT_A, COMPANY_A],
    );
    await admin.query(
      `INSERT INTO master.cost_head (id, tenant_id, code, name, cost_type)
       VALUES ($1,$2,'CH-CEM','Cement','DIRECT') ON CONFLICT (id) DO NOTHING`,
      [COSTHEAD_A, TENANT_A],
    );
    await admin.query(
      `INSERT INTO plan.boq_version (id, tenant_id, project_id, version_no, label, status)
       VALUES ($1,$2,$3,1,'BASELINE','BASELINE') ON CONFLICT (id) DO NOTHING`,
      [BOQ_VERSION_A, TENANT_A, PROJECT_A],
    );
    await admin.query(
      `INSERT INTO plan.boq_line
         (id, tenant_id, boq_version_id, project_id, line_no, description, uom,
          quantity, rate, amount, cost_head_id)
       VALUES ($1,$2,$3,$4,'3.1.2','PCC / RCC cement','Bag','2500','400','1000000',$5)
       ON CONFLICT (id) DO NOTHING`,
      [BOQ_LINE_A, TENANT_A, BOQ_VERSION_A, PROJECT_A, COSTHEAD_A],
    );
    await admin.query(
      `INSERT INTO plan.budget_line
         (tenant_id, project_id, boq_line_id, cost_head_id,
          budget_amount, committed_amount, incurred_amount)
       VALUES ($1,$2,$3,$4,'1000000','600000','200000')
       ON CONFLICT (project_id, cost_head_id, boq_line_id) DO UPDATE
         SET budget_amount = '1000000', committed_amount = '600000', incurred_amount = '200000'`,
      [TENANT_A, PROJECT_A, BOQ_LINE_A, COSTHEAD_A],
    );
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await admin.end();
  }
}
