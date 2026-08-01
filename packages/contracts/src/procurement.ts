/**
 * Purchase requisition contracts.
 *
 * These schemas are the single definition of a valid requisition, shared by the
 * API (runtime validation + OpenAPI generation) and the web/mobile clients
 * (form validation). Phase 3 §2.3.
 */

import { z } from 'zod';
import { moneyString } from './money.js';

export const uuid = z.string().uuid();

/** Quantities carry the same 4-dp precision as money and travel as strings. */
export const quantityString = z
  .string()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, 'must be a positive decimal with at most 4 places')
  .refine((v) => Number(v) > 0, 'must be greater than zero');

export const prStatus = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'PARTIALLY_ORDERED',
  'ORDERED',
  'RETURNED',
  'REJECTED',
  'CANCELLED',
  'CLOSED',
]);
export type PrStatus = z.infer<typeof prStatus>;

export const budgetState = z.enum(['WITHIN', 'NEAR_LIMIT', 'BREACH']);
export type BudgetState = z.infer<typeof budgetState>;

export const requisitionLineInput = z.object({
  itemId: uuid.optional(),
  description: z.string().min(3).max(500),
  boqLineId: uuid.optional(),
  costHeadId: uuid,
  uom: z.string().min(1).max(10),
  quantity: quantityString,
  estimatedRate: moneyString.default('0.0000'),
  requiredBy: z.string().date().optional(),
  remarks: z.string().max(1000).optional(),
});
export type RequisitionLineInput = z.infer<typeof requisitionLineInput>;

export const createRequisitionInput = z.object({
  /** Client-generated UUID v7 so offline retries are idempotent by construction. */
  id: uuid.optional(),
  projectId: uuid,
  requiredBy: z.string().date(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  purpose: z.string().max(500).optional(),
  /** Device capture time, preserved when a mobile record syncs later. */
  capturedAt: z.string().datetime().optional(),
  lines: z.array(requisitionLineInput).min(1).max(200),
});
export type CreateRequisitionInput = z.infer<typeof createRequisitionInput>;

export const budgetAvailability = z.object({
  boqLineId: uuid.nullable(),
  costHeadId: uuid,
  budgetAmount: moneyString,
  committedAmount: moneyString,
  incurredAmount: moneyString,
  availableAmount: moneyString,
  consumedPct: z.number(),
  state: budgetState,
});
export type BudgetAvailability = z.infer<typeof budgetAvailability>;

export const requisition = z.object({
  id: uuid,
  documentNo: z.string().nullable(),
  projectId: uuid,
  status: prStatus,
  requiredBy: z.string().date(),
  priority: z.string(),
  totalEstimatedAmount: moneyString,
  budgetState: budgetState.nullable(),
  version: z.number().int(),
  createdAt: z.string().datetime(),
  lines: z.array(
    requisitionLineInput.extend({
      id: uuid,
      lineNo: z.number().int(),
      estimatedAmount: moneyString,
    }),
  ),
});
export type Requisition = z.infer<typeof requisition>;

/** Uniform error envelope — Phase 3 §14. */
export const errorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    ruleCode: z.string().optional(),
    details: z.record(z.unknown()).optional(),
    fieldErrors: z
      .array(z.object({ field: z.string(), code: z.string(), message: z.string() }))
      .optional(),
    traceId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
