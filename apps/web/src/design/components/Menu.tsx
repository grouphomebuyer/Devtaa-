import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Check } from 'lucide-react';
import { cn } from '../cn';

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  selected?: boolean;
  danger?: boolean;
  /** Renders a non-interactive section heading above this item. */
  sectionStart?: string;
}

/**
 * Menu — a dropdown built on the WAI-ARIA menu-button pattern.
 * Escape closes and returns focus, ArrowUp/Down move, Enter selects,
 * clicking outside dismisses.
 */
export function Menu({
  trigger,
  items,
  align = 'start',
  width = 'w-64',
  label,
}: {
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'menu';
    id: string;
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  width?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(
    (restoreFocus = true) => {
      setOpen(false);
      if (restoreFocus) buttonRef.current?.focus();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const first = items.findIndex((i) => !i.disabled);
      setActive(first < 0 ? 0 : first);
      window.setTimeout(() => listRef.current?.focus(), 0);
    }
  }, [open, items]);

  const move = (delta: number) => {
    setActive((prev) => {
      let next = prev;
      for (let i = 0; i < items.length; i++) {
        next = (next + delta + items.length) % items.length;
        if (!items[next].disabled) break;
      }
      return next;
    });
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActive(items.findIndex((i) => !i.disabled));
        break;
      case 'End':
        e.preventDefault();
        setActive(items.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const item = items[active];
        if (item && !item.disabled) {
          item.onSelect?.();
          close();
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        ref: buttonRef,
        id,
        onClick: () => setOpen((v) => !v),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        },
      })}

      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          aria-activedescendant={`${id}-item-${active}`}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className={cn(
            'absolute z-50 mt-1 overflow-hidden rounded-md border border-line bg-surface-raised py-1 shadow-popover animate-scale-in focus:outline-none',
            align === 'end' ? 'right-0' : 'left-0',
            width,
          )}
        >
          {items.map((item, i) => (
            <div key={item.id}>
              {item.sectionStart && (
                <p className="px-2.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-wide text-content-tertiary">
                  {item.sectionStart}
                </p>
              )}
              <button
                id={`${id}-item-${i}`}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  item.onSelect?.();
                  close();
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-dense',
                  active === i ? 'bg-surface-hover' : '',
                  item.danger ? 'text-danger' : 'text-content',
                  item.disabled && 'cursor-not-allowed opacity-45',
                )}
              >
                {item.icon && (
                  <span className="shrink-0 text-content-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5">
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.description && (
                    <span className="block truncate text-micro text-content-tertiary">
                      {item.description}
                    </span>
                  )}
                </span>
                {item.selected && <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
