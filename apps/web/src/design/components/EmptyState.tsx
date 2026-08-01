import type { ReactNode } from 'react';
import { cn } from '../cn';

/**
 * EmptyState — an empty grid must say what to do next, not just "no data".
 * `tone="success"` is used when empty is the *goal* (an empty approval inbox).
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md',
  tone = 'neutral',
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  tone?: 'neutral' | 'success';
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'gap-1.5 px-4 py-8' : 'gap-2 px-6 py-14',
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            'mb-1 flex items-center justify-center rounded-full border',
            size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
            tone === 'success'
              ? 'border-success-border bg-success-bg text-success'
              : 'border-line bg-surface-subtle text-content-tertiary',
            '[&>svg]:h-4 [&>svg]:w-4',
          )}
        >
          {icon}
        </span>
      )}
      <p className={cn('font-semibold text-content', size === 'sm' ? 'text-dense' : 'text-sm')}>
        {title}
      </p>
      {description && (
        <p className="max-w-md text-xs leading-5 text-content-secondary">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-2 flex items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
