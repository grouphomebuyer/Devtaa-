/**
 * Budget control — the single mechanism that stops cost overrun.
 *
 * Pure functions, no I/O, so this is unit-testable without a database
 * (Phase 3 §3.1 rule 3). Implements BR-001 and BR-BOQ-03.
 */

import {
  add,
  compare,
  fromMinor,
  multiply,
  subtract,
  toMinor,
  zero,
  type BudgetAvailability,
  type BudgetState,
  type MoneyString,
} from '@aicos/contracts';

/** Commitment accounting inputs for one BOQ line or cost head. */
export interface BudgetPosition {
  boqLineId: string | null;
  costHeadId: string;
  budgetAmount: MoneyString;
  /** Value of approved but not yet received purchase/work orders. */
  committedAmount: MoneyString;
  /** Value already received or booked. */
  incurredAmount: MoneyString;
}

/** Below this proportion remaining, the line is flagged before it breaches. */
export const NEAR_LIMIT_THRESHOLD = 0.1;

/**
 * available = budget - committed - incurred   (BR-BOQ-03)
 *
 * Note that `available` may legitimately be negative: an approved budget
 * deviation lets committed exceed budget. We report the real position rather
 * than clamping it to zero, because hiding an overrun is how overruns survive.
 */
export function computeAvailability(position: BudgetPosition): BudgetAvailability {
  const available = subtract(
    position.budgetAmount,
    position.committedAmount,
    position.incurredAmount,
  );

  const budgetMinor = toMinor(position.budgetAmount);
  const consumedMinor = toMinor(add(position.committedAmount, position.incurredAmount));

  const consumedPct =
    budgetMinor === 0n
      ? consumedMinor === 0n
        ? 0
        : 100
      : Number((consumedMinor * 10000n) / budgetMinor) / 100;

  let state: BudgetState = 'WITHIN';
  if (toMinor(available) < 0n) {
    state = 'BREACH';
  } else if (
    budgetMinor > 0n &&
    toMinor(available) * BigInt(Math.round(1 / NEAR_LIMIT_THRESHOLD)) < budgetMinor
  ) {
    state = 'NEAR_LIMIT';
  }

  return {
    boqLineId: position.boqLineId,
    costHeadId: position.costHeadId,
    budgetAmount: position.budgetAmount,
    committedAmount: position.committedAmount,
    incurredAmount: position.incurredAmount,
    availableAmount: available,
    consumedPct: Math.round(consumedPct * 100) / 100,
    state,
  };
}

export interface BudgetCheck {
  /** Whether the requested amount fits within what remains. */
  withinBudget: boolean;
  availability: BudgetAvailability;
  requestedAmount: MoneyString;
  /** Zero when within budget, otherwise how far over. */
  shortfall: MoneyString;
}

/**
 * Evaluate a requested spend against a budget position.
 *
 * This does NOT decide whether to block — that is the use-case's job, because
 * the same check is a warning at submission and a hard stop at approval
 * (BR-PRC-02). Keeping the decision out of here keeps the rule honest.
 */
export function checkBudget(
  position: BudgetPosition,
  requestedAmount: MoneyString,
): BudgetCheck {
  const availability = computeAvailability(position);
  const withinBudget = compare(requestedAmount, availability.availableAmount) <= 0;
  const shortfall = withinBudget
    ? zero()
    : subtract(requestedAmount, availability.availableAmount);

  return { withinBudget, availability, requestedAmount, shortfall };
}

/** Line total = quantity x rate, exact in minor units. */
export function lineAmount(quantity: string, rate: MoneyString): MoneyString {
  return multiply(rate, quantity);
}

/** Document total = sum of line totals. */
export function documentTotal(
  lines: ReadonlyArray<{ quantity: string; estimatedRate: MoneyString }>,
): MoneyString {
  return lines.reduce<MoneyString>(
    (sum, line) => add(sum, lineAmount(line.quantity, line.estimatedRate)),
    zero(),
  );
}

/**
 * Tolerance comparison used by three-way match and GRN over-receipt checks
 * (BR-MAT-03, BR-PAY-02). Returns true when `actual` is within `tolerancePct`
 * of `expected`.
 */
export function withinTolerance(
  expected: MoneyString,
  actual: MoneyString,
  tolerancePct: number,
): boolean {
  const expectedMinor = toMinor(expected);
  if (expectedMinor === 0n) return toMinor(actual) === 0n;

  const difference = toMinor(actual) - expectedMinor;
  const absDifference = difference < 0n ? -difference : difference;
  const allowed = toMinor(multiply(expected, String(tolerancePct / 100)));
  const absAllowed = allowed < 0n ? -allowed : allowed;
  return absDifference <= absAllowed;
}

/** Convenience for tests and callers that hold raw minor units. */
export const minor = (value: bigint): MoneyString => fromMinor(value);
