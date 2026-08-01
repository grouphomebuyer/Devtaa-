import { createContext, useContext, useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../cn';

interface FieldContext {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

const Ctx = createContext<FieldContext | null>(null);

/**
 * Wires label ⇄ control ⇄ hint ⇄ error with the ids and ARIA attributes that
 * WCAG 2.1 AA requires, so no screen is free to get it wrong.
 *
 * Errors are announced (`role="alert"`) and phrased as instructions (UX-7).
 */
export function FormField({
  label,
  hint,
  error,
  required,
  optional,
  children,
  className,
  /** Renders the label to the left in a fixed column — for dense forms. */
  layout = 'stacked',
  labelSuffix,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
  className?: string;
  layout?: 'stacked' | 'inline';
  labelSuffix?: ReactNode;
}) {
  const base = useId();
  const id = `${base}-control`;
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <Ctx.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div
        className={cn(
          layout === 'inline' ? 'grid grid-cols-[180px_1fr] items-start gap-x-3 gap-y-1' : 'grid gap-1.5',
          className,
        )}
      >
        <div className={cn('flex items-center gap-1.5', layout === 'inline' && 'h-8')}>
          <label htmlFor={id} className="text-xs font-medium text-content-secondary">
            {label}
            {required && (
              <>
                <span aria-hidden className="ml-0.5 text-danger">
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </>
            )}
            {optional && <span className="ml-1 font-normal text-content-tertiary">optional</span>}
          </label>
          {labelSuffix}
        </div>

        <div className="grid gap-1">
          {children}
          {hint && !error && (
            <p id={hintId} className="text-micro leading-4 text-content-tertiary">
              {hint}
            </p>
          )}
          {error && (
            <p
              id={errorId}
              role="alert"
              className="flex items-start gap-1 text-micro leading-4 text-danger"
            >
              <AlertCircle aria-hidden className="mt-px h-3 w-3 shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}

/**
 * Props a control must spread to be correctly labelled by its FormField.
 * Returns empty props when used outside a FormField, so controls stay usable
 * standalone.
 */
export function useFieldProps(): {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  invalid?: boolean;
} {
  const ctx = useContext(Ctx);
  if (!ctx) return {};
  return {
    id: ctx.id,
    'aria-describedby': ctx.describedBy,
    ...(ctx.invalid ? { 'aria-invalid': true as const, invalid: true } : {}),
  };
}

/** Groups related fields with a visible heading — a `<fieldset>` under the hood. */
export function FieldSet({
  legend,
  description,
  children,
  className,
  actions,
}: {
  legend: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-line-subtle pb-2">
        <div>
          <legend className="text-dense font-semibold tracking-tight text-content">{legend}</legend>
          {description && <p className="mt-0.5 text-xs text-content-tertiary">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </fieldset>
  );
}
