import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '../cn';

export interface Crumb {
  label: string;
  /** Omit on the last crumb — the current page is not a link. */
  to?: string;
  params?: Record<string, string>;
}

export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-xs">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {item.to && !last ? (
                <Link
                  to={item.to}
                  params={item.params as never}
                  className="truncate rounded text-content-tertiary transition-colors hover:text-content hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn('truncate', last ? 'font-medium text-content' : 'text-content-tertiary')}
                >
                  {item.label}
                </span>
              )}
              {!last && (
                <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-content-tertiary/70" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
