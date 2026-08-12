import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import { cn } from '../cn';
import type { Tone } from './Badge';

const ACCENT: Record<Tone, string> = {
  neutral: 'bg-line-strong',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  ai: 'bg-ai',
};

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  /** Secondary line, e.g. "across 3 projects". */
  caption?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  /** Signed change vs the comparison period, in percent. */
  delta?: { value: number; label: string; goodWhen?: 'up' | 'down' };
  /** Every dashboard tile drills through (Phase 6 §11). */
  onDrill?: () => void;
  drillLabel?: string;
  className?: string;
}

/**
 * KpiTile — the tiles on the Director's home. Value first, label small above,
 * everything else subordinate. Clicking drills through to the underlying rows.
 */
export function KpiTile({
  label,
  value,
  caption,
  tone = 'neutral',
  icon,
  delta,
  onDrill,
  drillLabel,
  className,
}: KpiTileProps) {
  const Wrapper = onDrill ? 'button' : 'div';
  const good =
    delta === undefined
      ? null
      : (delta.goodWhen ?? 'up') === 'up'
        ? delta.value >= 0
        : delta.value <= 0;

  return (
    <Wrapper
      {...(onDrill
        ? { type: 'button' as const, onClick: onDrill, 'aria-label': drillLabel ?? `${label}: view details` }
        : {})}
      className={cn(
        'group relative flex min-w-0 flex-col justify-between overflow-hidden rounded border border-line bg-surface px-3.5 py-3 text-left',
        onDrill && 'transition-colors hover:border-line-strong hover:bg-surface-hover',
        className,
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-0.5', ACCENT[tone])} />

      <div className="flex items-start justify-between gap-2">
        <span className="text-micro font-medium uppercase tracking-wide text-content-tertiary">
          {label}
        </span>
        {icon ? (
          <span className="shrink-0 text-content-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        ) : onDrill ? (
          <ChevronRight
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-content-tertiary opacity-0 transition-opacity group-hover:opacity-100"
          />
        ) : null}
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="truncate text-xl font-semibold tracking-tight tnum text-content">
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5 text-micro font-medium tnum',
              good ? 'text-success' : 'text-danger',
            )}
          >
            {delta.value >= 0 ? (
              <ArrowUpRight aria-hidden className="h-3 w-3" />
            ) : (
              <ArrowDownRight aria-hidden className="h-3 w-3" />
            )}
            {Math.abs(delta.value).toFixed(1)}%<span className="sr-only"> {delta.label}</span>
          </span>
        )}
      </div>

      {caption && <p className="mt-0.5 truncate text-micro text-content-tertiary">{caption}</p>}
    </Wrapper>
  );
}

/** Row of tiles with a consistent responsive grid. */
export function TileRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 md:grid-cols-4', className)}>{children}</div>
  );
}

/**
 * A labelled proportion bar. Used for budget consumption and reconciliation
 * progress. The numeric value is always rendered next to it — the bar is
 * decoration, not the information.
 */
export function MeterBar({
  segments,
  max,
  className,
  label,
  height = 'md',
}: {
  segments: { value: number; tone: Tone | 'data-1' | 'data-2' | 'data-3'; label: string }[];
  max: number;
  className?: string;
  label: string;
  height?: 'sm' | 'md';
}) {
  const safeMax = max > 0 ? max : 1;
  const colour: Record<string, string> = {
    ...ACCENT,
    'data-1': 'bg-data-1',
    'data-2': 'bg-data-2',
    'data-3': 'bg-data-3',
  };

  return (
    <div
      className={cn(
        'flex w-full overflow-hidden rounded-sm bg-surface-inset',
        height === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
      role="img"
      aria-label={`${label}: ${segments.map((s) => `${s.label} ${Math.round((s.value / safeMax) * 100)}%`).join(', ')}`}
    >
      {segments.map((s) => (
        <span
          key={s.label}
          className={colour[s.tone]}
          style={{ width: `${Math.min(100, Math.max(0, (s.value / safeMax) * 100))}%` }}
        />
      ))}
    </div>
  );
}
