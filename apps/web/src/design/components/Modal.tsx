import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../cn';
import { Button } from './Button';
import { Textarea } from './Input';
import { FormField } from './FormField';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Blocks Escape / backdrop dismissal — for in-flight destructive work. */
  dismissible?: boolean;
}

const SIZE = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

/**
 * Modal — `role="dialog" aria-modal`, labelled by its title, focus trapped and
 * restored on close, Escape to dismiss (WCAG 2.1 AA §2.1.2 no keyboard trap).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[10vh]"
      onKeyDown={onKeyDown}
    >
      <div
        aria-hidden
        onClick={dismissible ? onClose : undefined}
        className="fixed inset-0 bg-[rgb(var(--overlay))]/45 animate-fade-in"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full rounded-lg border border-line bg-surface-raised shadow-overlay animate-scale-in',
          SIZE[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-subtle px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold tracking-tight text-content">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-xs text-content-secondary">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <Button variant="ghost" size="sm" iconOnly aria-label="Close dialog" onClick={onClose}>
              <X aria-hidden />
            </Button>
          )}
        </header>

        <div className="max-h-[60vh] overflow-y-auto px-4 py-3.5">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line-subtle bg-surface-subtle/60 px-4 py-2.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * ConfirmDialog — destructive actions require typed confirmation and, where
 * the workflow demands it, a reason (Phase 6 §5.1: "rejection/return
 * **requires** a reason").
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Reason',
  reasonHint,
  typedConfirmation,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonHint?: string;
  /** The user must type this exact string, e.g. the document number. */
  typedConfirmation?: string;
  busy?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTyped('');
      setTouched(false);
    }
  }, [open]);

  const reasonMissing = requireReason && reason.trim().length < 3;
  const typedMismatch = Boolean(typedConfirmation) && typed !== typedConfirmation;
  const blocked = reasonMissing || typedMismatch;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="md"
            loading={busy}
            onClick={() => {
              setTouched(true);
              if (blocked) return;
              onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {requireReason && (
          <FormField
            label={reasonLabel}
            required
            hint={reasonHint ?? 'Recorded in the audit trail and shown to the requester.'}
            error={touched && reasonMissing ? 'Enter at least 3 characters explaining why.' : undefined}
          >
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              invalid={touched && reasonMissing}
              placeholder="e.g. Rate 3% above last purchase — renegotiate before approval."
              autoFocus
            />
          </FormField>
        )}

        {typedConfirmation && (
          <FormField
            label={`Type ${typedConfirmation} to confirm`}
            required
            error={touched && typedMismatch ? `Enter exactly “${typedConfirmation}”.` : undefined}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-invalid={touched && typedMismatch}
              className="h-8 w-full rounded border border-line-strong bg-surface px-2.5 font-mono text-dense text-content focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/35"
            />
          </FormField>
        )}
      </div>
    </Modal>
  );
}
