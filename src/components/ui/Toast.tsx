'use client';

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
}

interface ToastApi {
  /** Surface a failure to the user (the common case for swallowed errors). */
  error: (message: string) => void;
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

  const push = useCallback((message: string, tone: ToastTone) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      error: (m) => push(m, 'error'),
      success: (m) => push(m, 'success'),
      info: (m) => push(m, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
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
    error: (m) => console.error('[toast:error]', m),
    success: (m) => console.info('[toast:success]', m),
    info: (m) => console.info('[toast:info]', m),
  };
}
