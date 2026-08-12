/**
 * Use case: create a purchase requisition.
 *
 * This is the layer the HTTP API, background jobs and AI tools all call — the
 * identical validation, permission and audit path regardless of caller
 * (Phase 3 §3.2). An AI agent drafting a requisition therefore cannot skip a
 * single control that applies to a human.
 */

import {
  add,
  createRequisitionInput,
  zero,
  type CreateRequisitionInput,
  type MoneyString,
} from '@aicos/contracts';
import { checkBudget, documentTotal, lineAmount, type BudgetPosition } from '../../domain/budget.js';
import type { RequestContext, Tx } from '../../db/context.js';
import { AppError } from '../../common/errors.js';

export interface CreateRequisitionResult {
  id: string;
  status: 'DRAFT';
  totalEstimatedAmount: MoneyString;
  budgetState: 'WITHIN' | 'NEAR_LIMIT' | 'BREACH';
  /** Advisory at draft stage; the same check blocks at approval (BR-PRC-02). */
  warnings: Array<{ code: string; message: string; ruleCode: string }>;
}

export const REQUIRED_PERMISSION = 'purchase_requisition.create';

export async function createRequisition(
  tx: Tx,
  ctx: RequestContext,
  raw: unknown,
): Promise<CreateRequisitionResult> {
  const input = parse(raw);

  await assertProjectVisible(tx, input.projectId);

  const warnings: CreateRequisitionResult['warnings'] = [];
  let worstState: 'WITHIN' | 'NEAR_LIMIT' | 'BREACH' = 'WITHIN';

  // Budget is evaluated per BOQ line, not per document: a requisition that is
  // affordable in total can still exhaust one line.
  const requestedByLine = new Map<string, MoneyString>();
  for (const line of input.lines) {
    if (!line.boqLineId) continue;
    const amount = lineAmount(line.quantity, line.estimatedRate);
    requestedByLine.set(line.boqLineId, add(requestedByLine.get(line.boqLineId) ?? zero(), amount));
  }

  for (const [boqLineId, requested] of requestedByLine) {
    const position = await loadBudgetPosition(tx, boqLineId);
    if (!position) {
      throw new AppError(422, 'BOQ_LINE_NOT_FOUND', 'Referenced BOQ line does not exist', {
        details: { boqLineId },
      });
    }

    const check = checkBudget(position, requested);
    if (!check.withinBudget) {
      worstState = 'BREACH';
      warnings.push({
        code: 'BUDGET_EXCEEDED',
        ruleCode: 'BR-001',
        message:
          `BOQ line budget exhausted: ${check.availability.availableAmount} available, ` +
          `${requested} requested (short by ${check.shortfall}). ` +
          'Approval will require a budget deviation.',
      });
    } else if (check.availability.state === 'NEAR_LIMIT' && worstState === 'WITHIN') {
      worstState = 'NEAR_LIMIT';
      warnings.push({
        code: 'BUDGET_NEAR_LIMIT',
        ruleCode: 'BR-001',
        message: `BOQ line is ${check.availability.consumedPct}% consumed.`,
      });
    }
  }

  const total = documentTotal(input.lines);

  // The client may supply the id (offline capture), so insertion is an upsert
  // on that id and a retry is a no-op rather than a duplicate document.
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO proc.purchase_requisition
       (id, tenant_id, company_id, project_id, document_date, required_by,
        priority, purpose, status, total_estimated_amount, budget_state,
        client_generated_id, created_by, created_at)
     VALUES (COALESCE($1::uuid, core.uuid_v7()), $2, $3, $4, CURRENT_DATE, $5,
             $6, $7, 'DRAFT', $8, $9, $1::uuid, $10, now())
     ON CONFLICT (id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [
      input.id ?? null,
      ctx.tenantId,
      await resolveCompanyId(tx, input.projectId),
      input.projectId,
      input.requiredBy,
      input.priority,
      input.purpose ?? null,
      total,
      worstState === 'BREACH' ? 'BREACH' : 'WITHIN',
      ctx.userId,
    ],
  );

  const id = rows[0]?.id;
  if (!id) throw new AppError(500, 'INSERT_FAILED', 'Requisition could not be created');

  for (const [index, line] of input.lines.entries()) {
    await tx.query(
      `INSERT INTO proc.purchase_requisition_line
         (tenant_id, purchase_requisition_id, line_no, item_id, description,
          boq_line_id, cost_head_id, uom, quantity, estimated_rate,
          estimated_amount, required_by, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (purchase_requisition_id, line_no) DO NOTHING`,
      [
        ctx.tenantId,
        id,
        index + 1,
        line.itemId ?? null,
        line.description,
        line.boqLineId ?? null,
        line.costHeadId,
        line.uom,
        line.quantity,
        line.estimatedRate,
        lineAmount(line.quantity, line.estimatedRate),
        line.requiredBy ?? null,
        line.remarks ?? null,
      ],
    );
  }

  await writeAudit(tx, ctx, id, { total, budgetState: worstState });

  return { id, status: 'DRAFT', totalEstimatedAmount: total, budgetState: worstState, warnings };
}

function parse(raw: unknown): CreateRequisitionInput {
  const result = createRequisitionInput.safeParse(raw);
  if (result.success) return result.data;

  throw new AppError(400, 'VALIDATION_FAILED', 'Requisition payload is not valid', {
    fieldErrors: result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      code: issue.code,
      message: issue.message,
    })),
  });
}

/**
 * RLS already prevents reading another tenant's project, so a miss here means
 * "not visible to you" — reported as 404 rather than 403 so the API does not
 * confirm the existence of records the caller may not see (Phase 7 §4).
 */
async function assertProjectVisible(tx: Tx, projectId: string): Promise<void> {
  const { rowCount } = await tx.query('SELECT 1 FROM master.project WHERE id = $1', [projectId]);
  if (!rowCount) {
    throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found');
  }
}

async function resolveCompanyId(tx: Tx, projectId: string): Promise<string> {
  const { rows } = await tx.query<{ company_id: string }>(
    'SELECT company_id FROM master.project WHERE id = $1',
    [projectId],
  );
  const companyId = rows[0]?.company_id;
  if (!companyId) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found');
  return companyId;
}

async function loadBudgetPosition(tx: Tx, boqLineId: string): Promise<BudgetPosition | null> {
  const { rows } = await tx.query<{
    boq_line_id: string;
    cost_head_id: string;
    budget_amount: string;
    committed_amount: string;
    incurred_amount: string;
  }>(
    `SELECT bl.id            AS boq_line_id,
            bl.cost_head_id  AS cost_head_id,
            COALESCE(b.budget_amount,    bl.amount) AS budget_amount,
            COALESCE(b.committed_amount, '0')       AS committed_amount,
            COALESCE(b.incurred_amount,  '0')       AS incurred_amount
       FROM plan.boq_line bl
       LEFT JOIN plan.budget_line b ON b.boq_line_id = bl.id
      WHERE bl.id = $1`,
    [boqLineId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    boqLineId: row.boq_line_id,
    costHeadId: row.cost_head_id,
    budgetAmount: row.budget_amount,
    committedAmount: row.committed_amount,
    incurredAmount: row.incurred_amount,
  };
}

async function writeAudit(
  tx: Tx,
  ctx: RequestContext,
  documentId: string,
  after: Record<string, unknown>,
): Promise<void> {
  await tx.query(
    `INSERT INTO core.audit_log
       (tenant_id, entity_type, entity_id, action, actor_type, actor_user_id, after, occurred_at)
     VALUES ($1, 'purchase_requisition', $2, 'CREATE', 'USER', $3, $4, now())`,
    [ctx.tenantId, documentId, ctx.userId, JSON.stringify(after)],
  );
}
