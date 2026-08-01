import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../cn';
import type { Tone } from './Badge';

export interface Toast {
  id: string;
  tone: Exclude<Tone, 'ai'> | 'ai';
  title: string;
  description?: string;
  /** Undo, "view document", etc. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds; `null` keeps it until dismissed (used for errors). */
  duration?: number | null;
}

interface ToastApi {
  push: (toast: Omit<Toast, 'id'>) => string;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

const ICON: Record<string, typeof Info> = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  info: Info,
  neutral: Info,
  ai: Info,
};

const TONE_BAR: Record<string, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
  neutral: 'bg-line-strong',
  ai: 'bg-ai',
};

const TONE_TEXT: Record<string, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  neutral: 'text-content-secondary',
  ai: 'text-ai',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `t${++seq.current}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      const duration = toast.duration === undefined ? 5000 : toast.duration;
      if (duration !== null) window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      success: (title, description) => void push({ tone: 'success', title, description }),
      error: (title, description) =>
        void push({ tone: 'danger', title, description, duration: null }),
      warning: (title, description) => void push({ tone: 'warning', title, description }),
      info: (title, description) => void push({ tone: 'info', title, description }),
    }),
    [push, dismiss],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div
          role="region"
          aria-label="Notifications"
          className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
        >
          {toasts.map((t) => {
            const Icon = ICON[t.tone] ?? Info;
            return (
              <div
                key={t.id}
                role={t.tone === 'danger' ? 'alert' : 'status'}
                aria-live={t.tone === 'danger' ? 'assertive' : 'polite'}
                className="pointer-events-auto relative flex gap-2.5 overflow-hidden rounded border border-line bg-surface-raised p-3 pr-2 shadow-overlay animate-slide-in-right"
              >
                <span aria-hidden className={cn('absolute inset-y-0 left-0 w-0.5', TONE_BAR[t.tone])} />
                <Icon aria-hidden className={cn('mt-px h-4 w-4 shrink-0', TONE_TEXT[t.tone])} />
                <div className="min-w-0 flex-1">
                  <p className="text-dense font-medium text-content">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 text-xs leading-4 text-content-secondary">
                      {t.description}
                    </p>
                  )}
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action!.onClick();
                        dismiss(t.id);
                      }}
                      className="mt-1.5 rounded text-xs font-medium text-primary-text hover:underline"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label={`Dismiss notification: ${t.title}`}
                  className="h-5 shrink-0 rounded p-0.5 text-content-tertiary hover:bg-surface-hover hover:text-content"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
