import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../cn';

export type ColumnAlign = 'left' | 'right' | 'center';

export interface Column<T> {
  /** Stable id — also the sort key. */
  id: string;
  header: string;
  /** Rendered cell content. */
  cell: (row: T, index: number) => ReactNode;
  /** Comparable value; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  /** CSS grid track, e.g. `minmax(180px,1.4fr)` or `120px`. */
  width?: string;
  align?: ColumnAlign;
  /** Right-aligns and applies tabular figures. */
  numeric?: boolean;
  /** Column footer, e.g. a total. */
  footer?: (rows: T[]) => ReactNode;
  /** Hidden from the header visually but announced to screen readers. */
  headerSrOnly?: boolean;
}

export type Density = 'compact' | 'default' | 'relaxed';

const ROW_H: Record<Density, string> = {
  compact: 'h-row-compact',
  default: 'h-row',
  relaxed: 'h-row-relaxed',
};

export interface DataGridProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Accessible name for the grid — required. */
  label: string;
  density?: Density;
  loading?: boolean;
  /** Rendered in place of the body when there are no rows. */
  empty?: ReactNode;
  /** Enter / double-click on a row. */
  onRowActivate?: (row: T) => void;
  /** Controlled single-row selection (e.g. master–detail panes). */
  selectedId?: string | null;
  onSelect?: (row: T) => void;
  /** Multi-select with a checkbox column. */
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void };
  /** Extra classes per row, e.g. exception highlighting. */
  rowClassName?: (row: T) => string | undefined;
  /** Renders a totals row from the columns' `footer`. */
  showFooter?: boolean;
  className?: string;
  /** Constrains height and scrolls the body under a sticky header. */
  maxBodyHeight?: string;
  stickyHeader?: boolean;
  initialSort?: { columnId: string; direction: 'asc' | 'desc' };
}

/**
 * DataGrid — the workhorse. `role="grid"` with a roving tab index so the whole
 * table is operable from the keyboard (UX-8, WCAG 2.1 AA):
 *
 *   ↑ ↓ ← →   move cell focus        Home / End      first / last column
 *   Ctrl+Home / Ctrl+End  first / last row
 *   Enter     activate the row       Space           toggle selection
 *
 * Columns are typed against the row, so a renamed field is a compile error.
 */
export function DataGrid<T>({
  columns,
  rows,
  getRowId,
  label,
  density = 'default',
  loading = false,
  empty,
  onRowActivate,
  selectedId,
  onSelect,
  selection,
  rowClassName,
  showFooter = false,
  className,
  maxBodyHeight,
  stickyHeader = true,
  initialSort,
}: DataGridProps<T>) {
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(
    initialSort ?? null,
  );
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const bodyRef = useRef<HTMLDivElement>(null);

  const allColumns = useMemo<Column<T>[]>(() => {
    if (!selection) return columns;
    const checkbox: Column<T> = {
      id: '__select',
      header: 'Select',
      headerSrOnly: true,
      width: '36px',
      align: 'center',
      cell: (row) => {
        const id = getRowId(row);
        const checked = selection.selected.has(id);
        return (
          <input
            type="checkbox"
            checked={checked}
            aria-label={`Select row ${id}`}
            onChange={() => {
              const next = new Set(selection.selected);
              if (checked) next.delete(id);
              else next.add(id);
              selection.onChange(next);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 cursor-pointer accent-[rgb(var(--primary))]"
          />
        );
      },
    };
    return [checkbox, ...columns];
  }, [columns, selection, getRowId]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = allColumns.find((c) => c.id === sort.columnId);
    if (!col?.sortValue) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av === bv) return 0;
      return (av < bv ? -1 : 1) * dir;
    });
  }, [rows, sort, allColumns]);

  const template = allColumns.map((c) => c.width ?? 'minmax(120px, 1fr)').join(' ');

  const moveFocus = useCallback(
    (r: number, c: number) => {
      const nr = Math.max(0, Math.min(sorted.length - 1, r));
      const nc = Math.max(0, Math.min(allColumns.length - 1, c));
      setFocus({ r: nr, c: nc });
      const el = bodyRef.current?.querySelector<HTMLElement>(
        `[data-cell="${nr}-${nc}"]`,
      );
      el?.focus();
    },
    [sorted.length, allColumns.length],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const { r, c } = focus;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveFocus(r + 1, c);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveFocus(r - 1, c);
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveFocus(r, c + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveFocus(r, c - 1);
          break;
        case 'Home':
          e.preventDefault();
          moveFocus(e.ctrlKey ? 0 : r, 0);
          break;
        case 'End':
          e.preventDefault();
          moveFocus(e.ctrlKey ? sorted.length - 1 : r, allColumns.length - 1);
          break;
        case 'PageDown':
          e.preventDefault();
          moveFocus(r + 10, c);
          break;
        case 'PageUp':
          e.preventDefault();
          moveFocus(r - 10, c);
          break;
        case 'Enter': {
          const row = sorted[r];
          if (row) {
            e.preventDefault();
            onSelect?.(row);
            onRowActivate?.(row);
          }
          break;
        }
        case ' ': {
          const row = sorted[r];
          if (row && selection) {
            e.preventDefault();
            const id = getRowId(row);
            const next = new Set(selection.selected);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            selection.onChange(next);
          }
          break;
        }
        default:
          break;
      }
    },
    [focus, moveFocus, sorted, onRowActivate, onSelect, selection, getRowId, allColumns.length],
  );

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    setSort((prev) =>
      prev?.columnId === col.id
        ? prev.direction === 'asc'
          ? { columnId: col.id, direction: 'desc' }
          : null
        : { columnId: col.id, direction: 'asc' },
    );
  };

  const allSelected =
    selection !== undefined &&
    sorted.length > 0 &&
    sorted.every((row) => selection.selected.has(getRowId(row)));

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden', className)}>
      <div className="min-w-0 overflow-x-auto">
        <div
          role="grid"
          aria-label={label}
          aria-rowcount={sorted.length + 1}
          aria-colcount={allColumns.length}
          aria-busy={loading || undefined}
          className="min-w-full"
          style={{ minWidth: 'max-content' }}
        >
          {/* header */}
          <div role="rowgroup" className={cn(stickyHeader && 'sticky top-0 z-10')}>
            <div
              role="row"
              aria-rowindex={1}
              className="grid items-stretch border-b border-line bg-surface-subtle"
              style={{ gridTemplateColumns: template }}
            >
              {allColumns.map((col, ci) => {
                const active = sort?.columnId === col.id;
                const sortable = Boolean(col.sortValue);
                const isSelectAll = col.id === '__select' && selection;
                return (
                  <div
                    key={col.id}
                    role="columnheader"
                    aria-colindex={ci + 1}
                    aria-sort={
                      active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={cn(
                      'flex h-8 items-center gap-1 border-r border-line-subtle px-2 last:border-r-0',
                      col.numeric || col.align === 'right' ? 'justify-end' : '',
                      col.align === 'center' && 'justify-center',
                    )}
                  >
                    {isSelectAll ? (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        aria-label="Select all rows"
                        onChange={() =>
                          selection.onChange(
                            allSelected ? new Set() : new Set(sorted.map(getRowId)),
                          )
                        }
                        className="h-3.5 w-3.5 cursor-pointer accent-[rgb(var(--primary))]"
                      />
                    ) : sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className="inline-flex items-center gap-1 rounded text-micro font-semibold uppercase tracking-wide text-content-secondary hover:text-content"
                      >
                        <span className={cn(col.headerSrOnly && 'sr-only')}>{col.header}</span>
                        {active ? (
                          sort!.direction === 'asc' ? (
                            <ArrowUp aria-hidden className="h-3 w-3 text-primary" />
                          ) : (
                            <ArrowDown aria-hidden className="h-3 w-3 text-primary" />
                          )
                        ) : (
                          <ChevronsUpDown aria-hidden className="h-3 w-3 opacity-35" />
                        )}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          'truncate text-micro font-semibold uppercase tracking-wide text-content-secondary',
                          col.headerSrOnly && 'sr-only',
                        )}
                      >
                        {col.header}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* body */}
          <div
            ref={bodyRef}
            role="rowgroup"
            onKeyDown={onKeyDown}
            className={cn(maxBodyHeight && 'overflow-y-auto')}
            style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
          >
            {loading ? (
              <SkeletonRows columns={allColumns.length} template={template} density={density} />
            ) : sorted.length === 0 ? (
              <div role="row" aria-rowindex={2}>
                <div role="gridcell" className="p-0">
                  {empty ?? (
                    <p className="px-3 py-8 text-center text-dense text-content-tertiary">
                      No rows
                    </p>
                  )}
                </div>
              </div>
            ) : (
              sorted.map((row, ri) => {
                const id = getRowId(row);
                const isSelected = selectedId === id || selection?.selected.has(id);
                return (
                  <div
                    key={id}
                    role="row"
                    aria-rowindex={ri + 2}
                    aria-selected={
                      selectedId !== undefined || selection ? Boolean(isSelected) : undefined
                    }
                    onClick={() => onSelect?.(row)}
                    onDoubleClick={() => onRowActivate?.(row)}
                    className={cn(
                      'group grid items-stretch border-b border-line-subtle',
                      'hover:bg-surface-hover',
                      selectedId === id && 'bg-surface-selected hover:bg-surface-selected',
                      (onSelect || onRowActivate) && 'cursor-pointer',
                      rowClassName?.(row),
                    )}
                    style={{ gridTemplateColumns: template }}
                  >
                    {allColumns.map((col, ci) => (
                      <div
                        key={col.id}
                        role="gridcell"
                        aria-colindex={ci + 1}
                        data-cell={`${ri}-${ci}`}
                        tabIndex={focus.r === ri && focus.c === ci ? 0 : -1}
                        onFocus={() => setFocus({ r: ri, c: ci })}
                        className={cn(
                          'flex min-w-0 items-center px-2 text-dense text-content',
                          ROW_H[density],
                          col.numeric && 'justify-end tnum',
                          col.align === 'right' && 'justify-end',
                          col.align === 'center' && 'justify-center',
                          'focus-visible:relative focus-visible:z-10',
                        )}
                      >
                        <div className="min-w-0 truncate">{col.cell(row, ri)}</div>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>

          {/* footer totals */}
          {showFooter && sorted.length > 0 && (
            <div role="rowgroup">
              <div
                role="row"
                className="grid items-stretch border-t-2 border-line bg-surface-subtle"
                style={{ gridTemplateColumns: template }}
              >
                {allColumns.map((col, ci) => (
                  <div
                    key={col.id}
                    role="gridcell"
                    aria-colindex={ci + 1}
                    className={cn(
                      'flex h-8 min-w-0 items-center px-2 text-dense font-semibold text-content',
                      col.numeric && 'justify-end tnum',
                      col.align === 'right' && 'justify-end',
                    )}
                  >
                    <div className="truncate">{col.footer?.(sorted)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonRows({
  columns,
  template,
  density,
}: {
  columns: number;
  template: string;
  density: Density;
}) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, r) => (
        <div
          key={r}
          role="row"
          aria-rowindex={r + 2}
          className="grid border-b border-line-subtle"
          style={{ gridTemplateColumns: template }}
        >
          {Array.from({ length: columns }).map((__, c) => (
            <div
              key={c}
              role="gridcell"
              className={cn('flex items-center px-2', ROW_H[density])}
            >
              <span
                className="h-2.5 w-full animate-pulse rounded-sm bg-surface-inset"
                style={{ maxWidth: `${40 + ((r * 7 + c * 13) % 50)}%` }}
              />
            </div>
          ))}
        </div>
      ))}
      <span className="sr-only" role="status">
        Loading rows
      </span>
    </>
  );
}
