import {
  forwardRef,
  useCallback,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../cn';
import { groupIndian, parseAmount } from '../format';
import { useFieldProps } from './FormField';

const FIELD_BASE =
  'w-full rounded border bg-surface text-content placeholder:text-content-tertiary ' +
  'border-line-strong transition-colors ' +
  'hover:border-line-strong focus:border-primary focus:outline-none focus-visible:outline-none ' +
  'focus:ring-2 focus:ring-focus/35 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-inset disabled:text-content-tertiary ' +
  'read-only:bg-surface-inset';

const INVALID = 'border-danger focus:border-danger focus:ring-danger/30';

export type InputSize = 'sm' | 'md';

const SIZE: Record<InputSize, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-8 px-2.5 text-dense',
};

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  inputSize?: InputSize;
  invalid?: boolean;
  /** Leading adornment, e.g. an icon or `₹`. */
  prefix?: ReactNode;
  /** Trailing adornment, e.g. a unit of measure. */
  suffix?: ReactNode;
  /** Right-align and use tabular figures — for every numeric field. */
  numeric?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = 'md', invalid, prefix, suffix, numeric, className, ...rest },
  ref,
) {
  // Adopts the id / aria-describedby / aria-invalid of an enclosing FormField.
  const fieldProps = useFieldProps();
  const isInvalid = invalid ?? fieldProps.invalid;
  const field = (
    <input
      ref={ref}
      id={fieldProps.id}
      aria-describedby={fieldProps['aria-describedby']}
      aria-invalid={isInvalid || undefined}
      className={cn(
        FIELD_BASE,
        SIZE[inputSize],
        numeric && 'text-right tnum',
        isInvalid && INVALID,
        prefix && 'pl-7',
        suffix && 'pr-9',
        className,
      )}
      {...rest}
    />
  );

  if (!prefix && !suffix) return field;

  return (
    <div className="relative">
      {prefix && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-content-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5"
        >
          {prefix}
        </span>
      )}
      {field}
      {suffix && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-content-tertiary"
        >
          {suffix}
        </span>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 3, ...rest },
  ref,
) {
  const fieldProps = useFieldProps();
  const isInvalid = invalid ?? fieldProps.invalid;
  return (
    <textarea
      ref={ref}
      rows={rows}
      id={fieldProps.id}
      aria-describedby={fieldProps['aria-describedby']}
      aria-invalid={isInvalid || undefined}
      className={cn(FIELD_BASE, 'px-2.5 py-1.5 text-dense', isInvalid && INVALID, className)}
      {...rest}
    />
  );
});

/**
 * AmountInput — Phase 6 §4 core component.
 *
 * Shows Indian digit grouping (`12,45,678`) while idle and the raw number
 * while focused, so typing is never fought by the formatter. Keyboard-only
 * operation is unaffected; the value reported to the form is always a number.
 */
export interface AmountInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange' | 'prefix'> {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  inputSize?: InputSize;
  invalid?: boolean;
  decimals?: number;
  /** Unit shown on the right, e.g. `MT`. Omit for currency. */
  uom?: string;
  currency?: boolean;
}

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  {
    value,
    onValueChange,
    inputSize = 'md',
    invalid,
    decimals = 2,
    uom,
    currency = true,
    className,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const display = focused
    ? draft
    : value === null || value === undefined || Number.isNaN(value)
      ? ''
      : groupIndian(value, 0, decimals);

  return (
    <div className="relative">
      {currency && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-content-tertiary"
        >
          ₹
        </span>
      )}
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        value={display}
        aria-invalid={invalid || undefined}
        onFocus={(e) => {
          setFocused(true);
          setDraft(value === null || value === undefined ? '' : String(value));
          e.currentTarget.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.\-]/g, '');
          setDraft(raw);
          onValueChange(raw === '' || raw === '-' ? null : parseAmount(raw));
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          FIELD_BASE,
          SIZE[inputSize],
          'text-right tnum',
          currency && 'pl-6',
          uom && 'pr-10',
          invalid && INVALID,
          className,
        )}
        {...rest}
      />
      {uom && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-content-tertiary"
        >
          {uom}
        </span>
      )}
    </div>
  );
});

/** Search field used by the top bar and every filter bar. */
export function SearchInput({
  value,
  onValueChange,
  placeholder = 'Search',
  className,
  label,
  shortcutHint,
  ...rest
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  label: string;
  shortcutHint?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>) {
  const id = useId();
  const clear = useCallback(() => onValueChange(''), [onValueChange]);

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary"
      />
      <input
        id={id}
        type="search"
        role="searchbox"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          FIELD_BASE,
          'h-8 pl-7 pr-16 text-dense [&::-webkit-search-cancel-button]:appearance-none',
        )}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-content-tertiary hover:bg-surface-hover hover:text-content"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      ) : shortcutHint ? (
        <kbd
          aria-hidden
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-surface-subtle px-1 py-0.5 font-mono text-micro text-content-tertiary"
        >
          {shortcutHint}
        </kbd>
      ) : null}
    </div>
  );
}
