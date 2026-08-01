import { describe, expect, it } from 'vitest';
import {
  checkBudget,
  computeAvailability,
  documentTotal,
  lineAmount,
  withinTolerance,
  type BudgetPosition,
} from '../src/domain/budget.js';

const position = (over: Partial<BudgetPosition> = {}): BudgetPosition => ({
  boqLineId: '00000000-0000-0000-0000-0000000000b1',
  costHeadId: '00000000-0000-0000-0000-0000000000c1',
  budgetAmount: '4820000.0000',
  committedAmount: '2740000.0000',
  incurredAmount: '1146000.0000',
  ...over,
});

describe('budget availability (BR-BOQ-03)', () => {
  it('available = budget - committed - incurred', () => {
    const a = computeAvailability(position());
    expect(a.availableAmount).toBe('934000.0000');
    expect(a.consumedPct).toBeCloseTo(80.62, 1);
    expect(a.state).toBe('WITHIN');
  });

  it('flags a line before it breaches, not only after', () => {
    const a = computeAvailability(position({ incurredAmount: '1900000.0000' }));
    expect(a.state).toBe('NEAR_LIMIT');
  });

  it('reports a real overrun rather than clamping it to zero', () => {
    const a = computeAvailability(position({ committedAmount: '4000000.0000' }));
    expect(a.availableAmount).toBe('-326000.0000');
    expect(a.state).toBe('BREACH');
  });

  it('treats a zero budget with spend as fully consumed', () => {
    const a = computeAvailability(
      position({ budgetAmount: '0.0000', committedAmount: '0.0000', incurredAmount: '100.0000' }),
    );
    expect(a.consumedPct).toBe(100);
    expect(a.state).toBe('BREACH');
  });
});

describe('budget check (BR-001)', () => {
  it('permits a requisition that fits', () => {
    const check = checkBudget(position(), '152000.0000');
    expect(check.withinBudget).toBe(true);
    expect(check.shortfall).toBe('0.0000');
  });

  it('reports the exact shortfall when it does not fit', () => {
    // 934000 available, 1520000 requested
    const check = checkBudget(position(), '1520000.0000');
    expect(check.withinBudget).toBe(false);
    expect(check.shortfall).toBe('586000.0000');
  });

  it('treats spending exactly the remaining budget as within', () => {
    const check = checkBudget(position(), '934000.0000');
    expect(check.withinBudget).toBe(true);
  });

  it('fails one rupee over the line', () => {
    const check = checkBudget(position(), '934000.0001');
    expect(check.withinBudget).toBe(false);
    expect(check.shortfall).toBe('0.0001');
  });
});

describe('document arithmetic', () => {
  it('computes a line total as quantity x rate', () => {
    expect(lineAmount('400', '380.0000')).toBe('152000.0000');
    expect(lineAmount('12.5', '52400.0000')).toBe('655000.0000');
  });

  it('sums lines to a document total', () => {
    const total = documentTotal([
      { quantity: '400', estimatedRate: '380.0000' },
      { quantity: '12', estimatedRate: '52400.0000' },
      { quantity: '0.5', estimatedRate: '1000.0000' },
    ]);
    expect(total).toBe('781300.0000');
  });
});

describe('tolerance comparison (BR-MAT-03, BR-PAY-02)', () => {
  it('accepts a difference inside tolerance', () => {
    expect(withinTolerance('100000.0000', '101500.0000', 2)).toBe(true);
  });

  it('rejects a difference outside tolerance', () => {
    expect(withinTolerance('100000.0000', '103000.0000', 2)).toBe(false);
  });

  it('is symmetric for short and excess supply', () => {
    expect(withinTolerance('100000.0000', '98500.0000', 2)).toBe(true);
    expect(withinTolerance('100000.0000', '97000.0000', 2)).toBe(false);
  });

  it('requires an exact match when nothing was expected', () => {
    expect(withinTolerance('0.0000', '0.0000', 2)).toBe(true);
    expect(withinTolerance('0.0000', '1.0000', 2)).toBe(false);
  });
});
