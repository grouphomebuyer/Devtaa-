import { Link, useRouterState } from '@tanstack/react-router';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/design';
import { CountBadge } from '@/design';
import { asRoute } from '@/lib/links';
import { useApp } from './context';
import { NAV } from './nav';

/**
 * Collapsible left navigation. Collapsed state persists, and the rail keeps
 * icons plus accessible names so it stays usable at 52 px.
 */
export function SideNav({ approvalCount }: { approvalCount: number }) {
  const { navCollapsed, toggleNav } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150',
        navCollapsed ? 'w-nav-collapsed' : 'w-nav',
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {NAV.map((group) => (
          <div key={group.label} className="mb-1 px-2">
            {!navCollapsed && (
              <p className="px-2 pb-1 pt-2 text-micro font-semibold uppercase tracking-wider text-content-tertiary">
                {group.label}
              </p>
            )}
            {navCollapsed && <div aria-hidden className="mx-2 my-2 border-t border-line-subtle" />}
            <ul className="grid gap-px">
              {group.items.map((item) => {
                const active =
                  pathname === item.to ||
                  (item.to !== '/' && pathname.startsWith(item.to) && item.to !== '/projects') ||
                  (item.to === '/projects' && pathname.startsWith('/projects'));
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={asRoute(item.to)}
                      title={navCollapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex h-8 items-center gap-2.5 rounded px-2 text-dense transition-colors',
                        active
                          ? 'bg-primary-subtle font-medium text-primary-text'
                          : 'text-content-secondary hover:bg-surface-hover hover:text-content',
                        navCollapsed && 'justify-center px-0',
                      )}
                    >
                      <Icon
                        aria-hidden
                        className={cn(
                          'h-4 w-4 shrink-0',
                          active ? 'text-primary' : 'text-content-tertiary group-hover:text-content-secondary',
                        )}
                      />
                      {!navCollapsed && (
                        <>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badgeKey === 'approvals' && (
                            <CountBadge value={approvalCount} tone="danger" />
                          )}
                          {item.placeholder && (
                            <span className="text-micro text-content-tertiary">·</span>
                          )}
                        </>
                      )}
                      {navCollapsed && <span className="sr-only">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line-subtle p-2">
        <button
          type="button"
          onClick={toggleNav}
          aria-expanded={!navCollapsed}
          aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          className={cn(
            'flex h-7 w-full items-center gap-2 rounded px-2 text-xs text-content-tertiary transition-colors hover:bg-surface-hover hover:text-content',
            navCollapsed && 'justify-center px-0',
          )}
        >
          {navCollapsed ? (
            <PanelLeftOpen aria-hidden className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose aria-hidden className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
