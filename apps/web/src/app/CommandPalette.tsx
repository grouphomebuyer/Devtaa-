import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { CornerDownLeft, FileText, Search } from 'lucide-react';
import { cn } from '@/design';
import { asRoute } from '@/lib/links';
import { APPROVALS, PROJECTS } from '@/mocks/fixtures';
import { NAV_FLAT } from './nav';
import { useApp } from './context';

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

/**
 * Command palette (Ctrl/Cmd-K) — Phase 6 §3. Combobox pattern: the input keeps
 * focus and owns `aria-activedescendant`, the list is `role="listbox"`.
 */
export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setCommandOpen]);

  useEffect(() => {
    if (commandOpen) {
      setQ('');
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [commandOpen]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      setCommandOpen(false);
      void navigate({ to: asRoute(to) });
    };
    return [
      ...NAV_FLAT.map((n) => ({
        id: `nav-${n.to}`,
        label: n.label,
        hint: n.placeholder ? 'Not in this build' : 'Go to',
        group: 'Navigate',
        run: go(n.to),
      })),
      ...PROJECTS.map((p) => ({
        id: `prj-${p.id}`,
        label: `${p.code} · ${p.name}`,
        hint: 'Project 360',
        group: 'Projects',
        run: go(`/projects/${p.id}`),
      })),
      ...APPROVALS.map((a) => ({
        id: `apr-${a.id}`,
        label: `${a.document_no} — ${a.title}`,
        hint: a.counterparty,
        group: 'Documents awaiting you',
        run: go('/approvals'),
      })),
    ];
  }, [navigate, setCommandOpen]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = needle
      ? commands.filter((c) => `${c.label} ${c.group} ${c.hint ?? ''}`.toLowerCase().includes(needle))
      : commands;
    return rows.slice(0, 12);
  }, [commands, q]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!commandOpen) return null;

  /* A listbox may only contain options and groups, so results are bucketed
   * into `role="group"` sections rather than list items with headings. */
  const grouped: { group: string; items: { command: Command; index: number }[] }[] = [];
  results.forEach((command, index) => {
    const bucket = grouped.find((g) => g.group === command.group);
    if (bucket) bucket.items.push({ command, index });
    else grouped.push({ group: command.group, items: [{ command, index }] });
  });

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div
        aria-hidden
        className="fixed inset-0 bg-[rgb(var(--overlay))]/45 animate-fade-in"
        onClick={() => setCommandOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface-raised shadow-overlay animate-scale-in"
      >
        <div className="flex items-center gap-2 border-b border-line-subtle px-3">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-content-tertiary" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            aria-label="Search commands, documents and projects"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => (i + 1) % Math.max(1, results.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (i - 1 + results.length) % Math.max(1, results.length));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                results[active]?.run();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setCommandOpen(false);
              }
            }}
            placeholder="Go to PO-00042, create PR, vendor Shree Steel…"
            className="h-11 w-full bg-transparent text-sm text-content placeholder:text-content-tertiary focus:outline-none"
          />
          <kbd className="rounded border border-line bg-surface-subtle px-1 py-px font-mono text-micro text-content-tertiary">
            Esc
          </kbd>
        </div>

        <div
          id="command-list"
          ref={listRef}
          role="listbox"
          aria-label="Results"
          className="max-h-80 overflow-y-auto py-1"
        >
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-dense text-content-tertiary">
              Nothing matches “{q}”.
            </p>
          )}
          {grouped.map((bucket) => (
            <div key={bucket.group} role="group" aria-label={bucket.group}>
              <p
                aria-hidden
                className="px-3 pb-1 pt-2 text-micro font-semibold uppercase tracking-wide text-content-tertiary"
              >
                {bucket.group}
              </p>
              {bucket.items.map(({ command, index }) => (
                <div
                  key={command.id}
                  id={`cmd-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={command.run}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-dense',
                    index === active ? 'bg-primary-subtle text-primary-text' : 'text-content',
                  )}
                >
                  <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint && (
                    <span className="shrink-0 text-micro text-content-tertiary">{command.hint}</span>
                  )}
                  {index === active && (
                    <CornerDownLeft aria-hidden className="h-3 w-3 shrink-0 text-content-tertiary" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
