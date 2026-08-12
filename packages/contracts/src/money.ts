/**
 * Money handling.
 *
 * Rule GR-8: money is NUMERIC(18,4) in the database and a decimal *string* on
 * the wire. It is never a JavaScript number in transit, because IEEE-754 cannot
 * represent 0.1 exactly and an ERP that loses paise loses trust.
 *
 * Internally we compute in integer paise (1 rupee = 10000 units at 4 dp) so
 * that addition and subtraction are exact. Only presentation rounds to 2 dp.
 */

import { z } from 'zod';

/** Scale of the on-wire decimal: 4 places, matching NUMERIC(18,4). */
export const MONEY_SCALE = 4;
const SCALE_FACTOR = 10n ** BigInt(MONEY_SCALE);

export const moneyString = z
  .string()
  .regex(/^-?\d{1,14}(\.\d{1,4})?$/, 'must be a decimal with at most 4 places');

export type MoneyString = z.infer<typeof moneyString>;

/** Parse a wire decimal string into exact integer minor units. */
export function toMinor(value: MoneyString): bigint {
  const parsed = moneyString.safeParse(value);
  if (!parsed.success) throw new RangeError(`Invalid money value: ${value}`);

  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const parts = unsigned.split('.');
  const whole = parts[0] ?? '0';
  const fraction = parts[1] ?? '';
  const padded = (fraction + '0'.repeat(MONEY_SCALE)).slice(0, MONEY_SCALE);
  const minor = BigInt(whole) * SCALE_FACTOR + BigInt(padded);
  return negative ? -minor : minor;
}

/** Render integer minor units back to the wire decimal string. */
export function fromMinor(minor: bigint): MoneyString {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / SCALE_FACTOR;
  const fraction = (abs % SCALE_FACTOR).toString().padStart(MONEY_SCALE, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export const zero = (): MoneyString => fromMinor(0n);

export function add(...values: MoneyString[]): MoneyString {
  return fromMinor(values.reduce((sum, v) => sum + toMinor(v), 0n));
}

export function subtract(from: MoneyString, ...values: MoneyString[]): MoneyString {
  return fromMinor(values.reduce((acc, v) => acc - toMinor(v), toMinor(from)));
}

/**
 * Multiply a money amount by a quantity or rate expressed as a decimal string.
 * Used for `quantity x rate` and for percentage computations (TDS, retention).
 */
export function multiply(value: MoneyString, factor: string): MoneyString {
  const factorScale = (factor.split('.')[1] ?? '').length;
  const factorMinor = toScaledInt(factor, factorScale);
  const product = toMinor(value) * factorMinor;
  return fromMinor(divideRoundHalfUp(product, 10n ** BigInt(factorScale)));
}

/** Percentage of an amount, e.g. percentOf('100000.0000', '2.5') -> '2500.0000'. */
export function percentOf(value: MoneyString, percent: string): MoneyString {
  return multiply(multiply(value, percent), '0.01');
}

export function compare(a: MoneyString, b: MoneyString): -1 | 0 | 1 {
  const [x, y] = [toMinor(a), toMinor(b)];
  return x < y ? -1 : x > y ? 1 : 0;
}

export const isNegative = (v: MoneyString): boolean => toMinor(v) < 0n;
export const isZero = (v: MoneyString): boolean => toMinor(v) === 0n;
export const max = (a: MoneyString, b: MoneyString): MoneyString => (compare(a, b) >= 0 ? a : b);

/**
 * Commercial rounding to 2 decimal places, half away from zero.
 *
 * Deliberately NOT banker's rounding: Indian statutory computation and every
 * accountant's expectation is half-up, and consistency with the auditor's
 * arithmetic matters more than statistical neutrality.
 */
export function roundToPaise(value: MoneyString): MoneyString {
  const minor = toMinor(value);
  const divisor = 10n ** BigInt(MONEY_SCALE - 2);
  return fromMinor(divideRoundHalfUp(minor, divisor) * divisor);
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = abs / denominator;
  const remainder = abs % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function toScaledInt(decimal: string, scale: number): bigint {
  const negative = decimal.startsWith('-');
  const unsigned = negative ? decimal.slice(1) : decimal;
  const parts = unsigned.split('.');
  const whole = parts[0] ?? '0';
  const fraction = parts[1] ?? '';
  const padded = (fraction + '0'.repeat(scale)).slice(0, scale);
  const value = BigInt(whole || '0') * 10n ** BigInt(scale) + BigInt(padded || '0');
  return negative ? -value : value;
}

/**
 * Indian presentation format: lakh/crore digit grouping.
 * formatINR('1245678.0000') -> '₹12,45,678.00'
 */
export function formatINR(value: MoneyString, opts: { paise?: boolean } = {}): string {
  const rounded = roundToPaise(value);
  const negative = isNegative(rounded);
  const parts = (negative ? rounded.slice(1) : rounded).split('.');
  const whole = parts[0] ?? '0';
  const fraction = parts[1] ?? '0000';
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;
  const paise = opts.paise === false ? '' : `.${fraction.slice(0, 2)}`;
  return `${negative ? '-' : ''}₹${grouped}${paise}`;
}
