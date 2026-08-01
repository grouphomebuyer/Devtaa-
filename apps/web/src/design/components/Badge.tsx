import type { ComponentType, ReactNode } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  FileEdit,
  Info,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { cn } from '../cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'ai';

const TONE: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-content-secondary border-neutral-border',
  success: 'bg-success-bg text-success border-success-border',
  warning: 'bg-warning-bg text-warning border-warning-border',
  danger: 'bg-danger-bg text-danger border-danger-border',
  info: 'bg-info-bg text-info border-info-border',
  ai: 'bg-ai-bg text-ai border-ai-border',
};

const TONE_ICON: Record<Tone, ComponentType<{ className?: string }>> = {
  neutral: Circle,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  ai: Sparkles,
};

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  /** Softer treatment for counts and metadata. */
  variant?: 'outline' | 'solid';
  icon?: ReactNode;
  className?: string;
  title?: string;
}

/** Generic label. For document/workflow state use `StatusChip` instead. */
export function Badge({
  children,
  tone = 'neutral',
  variant = 'outline',
  icon,
  className,
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-sm border px-1.5 py-px text-micro font-medium leading-4',
        TONE[tone],
        variant === 'solid' && 'border-transparent',
        className,
      )}
    >
      {icon && <span className="shrink-0 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * StatusChip — Phase 6 §4.
 *
 * Status is **never** encoded by colour alone (WCAG 2.1 AA, and site engineers
 * work in sunlight): the chip always renders an icon *and* a text label.
 */
export function StatusChip({
  label,
  tone = 'neutral',
  icon,
  size = 'md',
  className,
}: {
  label: string;
  tone?: Tone;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Fallback = TONE_ICON[tone];
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-sm border font-medium leading-4',
        size === 'sm' ? 'px-1 py-px text-micro' : 'px-1.5 py-0.5 text-micro',
        TONE[tone],
        className,
      )}
    >
      {icon ?? <Fallback aria-hidden className="h-3 w-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Domain document states → tone + label, so no screen invents its own mapping. */
export const DOCUMENT_STATUS: Record<string, { label: string; tone: Tone; icon?: ReactNode }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: <FileEdit aria-hidden className="h-3 w-3" /> },
  pending_approval: {
    label: 'Pending approval',
    tone: 'warning',
    icon: <Clock aria-hidden className="h-3 w-3" />,
  },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  returned: { label: 'Returned', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: <Ban aria-hidden className="h-3 w-3" /> },
  matched: { label: 'Matched', tone: 'success' },
  unmatched: { label: 'Unmatched', tone: 'warning' },
  ignored: { label: 'Ignored', tone: 'neutral', icon: <Ban aria-hidden className="h-3 w-3" /> },
  overdue: { label: 'Overdue', tone: 'danger' },
  on_hold: { label: 'On hold', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  partially_paid: { label: 'Part paid', tone: 'info' },
  due: { label: 'Due', tone: 'info' },
};

export function DocumentStatusChip({
  status,
  size = 'md',
}: {
  status: string;
  size?: 'sm' | 'md';
}) {
  const meta = DOCUMENT_STATUS[status] ?? { label: status.replace(/_/g, ' '), tone: 'neutral' as Tone };
  return <StatusChip label={meta.label} tone={meta.tone} icon={meta.icon} size={size} />;
}

/**
 * ConfidenceBadge — AI output always shows its confidence (UX-5). Violet is
 * reserved for AI content and used nowhere else in the product.
 */
export function ConfidenceBadge({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  const tone: Tone = pct >= 95 ? 'success' : pct >= 80 ? 'warning' : 'danger';
  const wording = pct >= 95 ? 'high' : pct >= 80 ? 'medium' : 'low';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1 py-px text-micro font-medium tnum leading-4',
        TONE[tone],
        className,
      )}
      title={`AI confidence ${pct}% (${wording})`}
    >
      <Sparkles aria-hidden className="h-3 w-3 shrink-0 text-ai" />
      {pct}%<span className="sr-only"> AI confidence, {wording}</span>
    </span>
  );
}

/** Small count pill used in navigation and tabs. */
export function CountBadge({ value, tone = 'neutral' }: { value: number; tone?: Tone }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-micro font-semibold tnum tabular-nums',
        tone === 'danger'
          ? 'bg-danger text-white'
          : tone === 'warning'
            ? 'bg-warning text-white'
            : 'bg-neutral-bg text-content-secondary',
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}
