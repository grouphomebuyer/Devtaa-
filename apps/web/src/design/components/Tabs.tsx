import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../cn';
import { CountBadge } from './Badge';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
  icon?: ReactNode;
}

/**
 * Tabs — `role="tablist"` with a roving tab index and Left/Right/Home/End
 * key handling, per the WAI-ARIA tabs pattern. Panels are rendered by the
 * caller so tab state can be driven from the URL (a tab must be linkable).
 */
export function Tabs({
  items,
  value,
  onChange,
  label,
  className,
  size = 'md',
  idPrefix,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
  /**
   * Shared with the matching `<TabPanel tabsId>` so `aria-controls` and
   * `aria-labelledby` resolve to real elements. A generated id cannot be used
   * here because the panels are rendered by the caller.
   */
  idPrefix: string;
}) {
  const base = idPrefix;
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.id === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = enabled[next];
    onChange(target.id);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${base}-tab-${target.id}`)}`)
      ?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('flex items-center gap-0.5 border-b border-line', className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            id={`${base}-tab-${item.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${base}-panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 font-medium transition-colors',
              size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-dense',
              active
                ? 'border-primary text-content'
                : 'border-transparent text-content-secondary hover:border-line-strong hover:text-content',
              item.disabled && 'cursor-not-allowed opacity-45',
            )}
          >
            {item.icon && <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{item.icon}</span>}
            {item.label}
            {item.count !== undefined && <CountBadge value={item.count} />}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  tabsId,
  active,
  children,
  className,
}: {
  id: string;
  /** Must equal the `idPrefix` given to the matching `<Tabs>`. */
  tabsId: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`${tabsId}-panel-${id}`}
      aria-labelledby={`${tabsId}-tab-${id}`}
      tabIndex={0}
      className={cn('focus-visible:outline-none', className)}
    >
      {children}
    </div>
  );
}
