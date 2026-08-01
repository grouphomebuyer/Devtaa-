import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-fg border-primary hover:bg-primary-hover active:bg-primary-active',
  secondary:
    'bg-surface text-content border-line-strong hover:bg-surface-hover active:bg-surface-subtle',
  ghost:
    'bg-transparent text-content-secondary border-transparent hover:bg-surface-hover hover:text-content',
  danger: 'bg-danger text-white border-danger hover:bg-danger-hover active:bg-danger-hover',
  subtle:
    'bg-primary-subtle text-primary-text border-primary-border hover:bg-primary-subtle/70',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-dense gap-1.5',
  lg: 'h-9 px-4 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner, disables the control and announces busy state. */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Square icon-only button. `aria-label` becomes mandatory in review. */
  iconOnly?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    iconOnly = false,
    fullWidth = false,
    className,
    disabled,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded border font-medium',
        'transition-colors duration-75',
        'disabled:pointer-events-none disabled:opacity-45',
        SIZE[size],
        iconOnly && (size === 'sm' ? 'w-7 px-0' : size === 'md' ? 'w-8 px-0' : 'w-9 px-0'),
        VARIANT[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
      ) : (
        iconLeft && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{iconLeft}</span>
      )}
      {!iconOnly && children}
      {!loading && iconRight && (
        <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{iconRight}</span>
      )}
    </button>
  );
});

/** Segmented group — buttons share borders, e.g. density or view switchers. */
export function ButtonGroup({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  'aria-label': string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded border border-line bg-surface p-0.5 gap-0.5',
        className,
      )}
    >
      {children}
    </div>
  );
}
