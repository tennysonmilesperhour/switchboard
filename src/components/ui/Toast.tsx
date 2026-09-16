'use client';

import { errorRef, type ErrorCode } from '@/lib/errors';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type ToastTone = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  /** Rendered after the message, quietly, when the caller has one. */
  code?: ErrorCode | null;
}

interface ToastApi {
  /**
   * Surface a failure to the user (the common case for swallowed errors).
   *
   * Pass the `code` from the action result whenever there is one. A toast is
   * the most screenshot-hostile surface in the app — it disappears in five
   * seconds — so the code has to be in the same glance as the message, not
   * behind anything.
   */
  error: (message: string, code?: ErrorCode | null) => void;
  /** Subtle confirmation that something worked. */
  success: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** App-wide toast host. Mounted once in the root layout. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone, code?: ErrorCode | null) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone, code }]);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      error: (m, code) => push(m, 'error', code),
      success: (m) => push(m, 'success'),
      info: (m) => push(m, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Named, because it isn't the only status region on a page — the event
          page alone has three — and an unlabelled live region is one more
          anonymous "status" to anyone navigating by landmark.

          `pointer-events-none` on the host, `pointer-events-auto` on each
          toast: the host is a full-width band pinned at `bottom-24`, above
          everything at z-50, and while a toast is up it was swallowing every
          tap that landed in that band. The Settings save bar sits at exactly
          the same `bottom-24`, one layer down — so the toast raised by a failed
          save covered the Save button that raised it, and the retry tap hit
          the toast instead. Only the toasts themselves are meant to be
          tappable (tapping one dismisses it); the band around them is not. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDone={() => remove(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONES: Record<ToastTone, string> = {
  error: 'bg-rose-deep text-white',
  success: 'bg-sage-deep text-white',
  info: 'bg-ink text-white',
};

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, toast.tone === 'error' ? 5000 : 3000);
    return () => clearTimeout(timer);
  }, [toast.tone, onDone]);

  return (
    <button
      type="button"
      onClick={onDone}
      className={`animate-rise pointer-events-auto max-w-sm rounded-btn px-4 py-3 text-sm font-semibold shadow-float ${TONES[toast.tone]}`}
    >
      {toast.message}
      {toast.code && (
        <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide opacity-70">
          {errorRef(toast.code)}
        </span>
      )}
    </button>
  );
}

/**
 * Access the toast API. Safe to call anywhere under ToastProvider; falls back to
 * console so a component never crashes if rendered outside the provider (e.g.
 * in a test).
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    error: (m, code) => console.error('[toast:error]', code ?? '', m),
    success: (m) => console.info('[toast:success]', m),
    info: (m) => console.info('[toast:info]', m),
  };
}
