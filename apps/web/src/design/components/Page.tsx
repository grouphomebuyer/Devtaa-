import type { ReactNode } from 'react';
import { cn } from '../cn';
import { Breadcrumb, type Crumb } from './Breadcrumb';

/**
 * PageHeader — the consistent top of every route: breadcrumb, title, status
 * chips, and the page's primary actions on the right. Nothing else may invent
 * its own header.
 */
export function PageHeader({
  breadcrumbs,
  title,
  subtitle,
  meta,
  actions,
  tabs,
  className,
}: {
  breadcrumbs?: Crumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  /** Chips / small facts rendered next to the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('border-b border-line bg-surface', className)}>
      <div className="px-4 pb-3 pt-2.5">
        {breadcrumbs && <Breadcrumb items={breadcrumbs} className="mb-1.5" />}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight text-content">
                {title}
              </h1>
              {meta}
            </div>
            {subtitle && (
              <p className="mt-0.5 text-xs text-content-secondary">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      {tabs && <div className="px-4">{tabs}</div>}
    </header>
  );
}

/** Scrolling body of a route. */
export function PageBody({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto', padded && 'p-4', className)}>
      {children}
    </div>
  );
}

/** Sticky bar of filters / bulk actions above a grid. */
export function Toolbar({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Keyboard hint rendered in the footer of keyboard-first workbenches. */
export function KeyHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-micro text-content-tertiary">
      {keys.map((k) => (
        <kbd
          key={k}
          className="rounded border border-line bg-surface-subtle px-1 py-px font-mono text-micro text-content-secondary"
        >
          {k}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}
