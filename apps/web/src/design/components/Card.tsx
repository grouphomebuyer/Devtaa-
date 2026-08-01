import type { ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Card — a bordered content surface. Enterprise density: 1 px hairline,
 * 5 px radius, no drop shadow (shadows are reserved for overlays, so
 * elevation actually means something).
 */
export function Card({
  children,
  className,
  as: As = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
} & { 'aria-label'?: string; 'aria-labelledby'?: string }) {
  return (
    <As
      className={cn('min-w-0 rounded border border-line bg-surface', className)}
      {...rest}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
  id,
  size = 'md',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  id?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-3 border-b border-line-subtle',
        size === 'sm' ? 'h-9 px-3' : 'min-h-10 px-3.5 py-2',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="shrink-0 text-content-tertiary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <div className="min-w-0">
          <h2 id={id} className="truncate text-dense font-semibold tracking-tight text-content">
            {title}
          </h2>
          {description && (
            <p className="truncate text-micro text-content-tertiary">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

export function CardBody({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={cn(padded && 'p-3.5', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cn(
        'flex items-center justify-between gap-3 border-t border-line-subtle bg-surface-subtle/60 px-3.5 py-2',
        className,
      )}
    >
      {children}
    </footer>
  );
}

/** A label/value pair — the atom of every detail panel. */
export function DetailItem({
  label,
  children,
  className,
  numeric,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-micro uppercase tracking-wide text-content-tertiary">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 truncate text-dense text-content',
          numeric && 'tnum font-medium',
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function DetailList({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </dl>
  );
}
