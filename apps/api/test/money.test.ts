import { describe, expect, it } from 'vitest';
import {
  add,
  compare,
  formatINR,
  fromMinor,
  multiply,
  percentOf,
  roundToPaise,
  subtract,
  toMinor,
} from '@aicos/contracts';

describe('money — exactness', () => {
  it('never loses precision the way floating point does', () => {
    // The canonical float failure: 0.1 + 0.2 !== 0.3
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(add('0.1000', '0.2000')).toBe('0.3000');
  });

  it('survives a long chain of additions without drift', () => {
    let total = '0.0000';
    for (let i = 0; i < 10_000; i++) total = add(total, '0.0001');
    expect(total).toBe('1.0000');
  });

  it('round-trips through minor units', () => {
    for (const v of ['0.0000', '1.0000', '425000.0000', '-58600.0000', '99999999.9999']) {
      expect(fromMinor(toMinor(v))).toBe(v);
    }
  });

  it('rejects malformed amounts rather than coercing them', () => {
    for (const bad of ['', 'abc', '1.23456', '1,000.00', '₹100']) {
      expect(() => toMinor(bad)).toThrow();
    }
  });
});

describe('money — arithmetic', () => {
  it('subtracts a deduction stack exactly (RA bill net payable)', () => {
    // gross - retention - advance recovery - material issued - TDS
    const net = subtract('875000.0000', '42150.0000', '125000.0000', '86400.0000', '16860.0000');
    expect(net).toBe('604590.0000');
  });

  it('multiplies quantity by rate', () => {
    expect(multiply('52400.0000', '12')).toBe('628800.0000');
    expect(multiply('380.0000', '400')).toBe('152000.0000');
  });

  it('computes statutory percentages', () => {
    expect(percentOf('425000.0000', '0.1')).toBe('425.0000'); // TDS 194Q at 0.1%
    expect(percentOf('843000.0000', '5')).toBe('42150.0000'); // retention at 5%
    expect(percentOf('843000.0000', '2')).toBe('16860.0000'); // TDS 194C at 2%
  });

  it('rounds half away from zero, not to even', () => {
    // Banker's rounding would give 2.36 here; Indian statutory practice is 2.37.
    expect(roundToPaise('2.3650')).toBe('2.3700');
    expect(roundToPaise('2.3750')).toBe('2.3800');
    expect(roundToPaise('-2.3650')).toBe('-2.3700');
  });

  it('orders amounts correctly', () => {
    expect(compare('100.0000', '99.9999')).toBe(1);
    expect(compare('100.0000', '100.0000')).toBe(0);
    expect(compare('-1.0000', '0.0000')).toBe(-1);
  });
});

describe('money — Indian presentation', () => {
  it('groups in lakhs and crores, not thousands', () => {
    expect(formatINR('1245678.0000')).toBe('₹12,45,678.00');
    expect(formatINR('425000.0000')).toBe('₹4,25,000.00');
    expect(formatINR('10000000.0000')).toBe('₹1,00,00,000.00');
    expect(formatINR('999.0000')).toBe('₹999.00');
  });

  it('handles negatives and suppressed paise', () => {
    expect(formatINR('-58600.0000')).toBe('-₹58,600.00');
    expect(formatINR('152000.0000', { paise: false })).toBe('₹1,52,000');
  });
});
