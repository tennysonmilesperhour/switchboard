'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

interface ConfirmOptions {
  title: string;
  body?: string;
  /** Label for the confirming action. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Red/destructive styling for the confirm button. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PromptOptions {
  title: string;
  body?: string;
  placeholder?: string;
  /** Label for the submitting action. Defaults to "Send". */
  confirmLabel?: string;
  maxLength?: number;
}

/** Resolves with the trimmed text, or null when the reader cancels. */
type PromptFn = (options: PromptOptions) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const PromptContext = createContext<PromptFn | null>(null);

/**
 * Imperative confirm dialog. Mount once in the root layout; call `useConfirm()`
 * anywhere and `await confirm({...})` to gate a destructive action:
 *
 *   if (await confirm({ title: 'Remove Alex?', danger: true })) remove();
 *
 * Ask BEFORE `startTransition`, never inside it. The dialog opens with a state
 * update, and an update made inside an async transition is held until the
 * whole action settles — which it cannot, because it is waiting on this
 * answer. The button goes busy and nothing appears. That is how "Leave zone",
 * "Leave this board" and six other confirms shipped dead;
 * `src/lib/confirm-outside-transition.test.ts` now refuses the pattern.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const titleId = useId();
  const bodyId = useId();

  // A text version of the same dialog. `window.prompt` was used for reports,
  // and some in-app browsers block it outright: it returns null, which read as
  // "cancelled", so the report was never sent and nobody was told.
  const [promptOptions, setPromptOptions] = useState<PromptOptions | null>(null);
  const [promptText, setPromptText] = useState('');
  const promptResolver = useRef<((value: string | null) => void) | null>(null);
  const promptTitleId = useId();
  const promptBodyId = useId();

  const prompt = useCallback<PromptFn>((opts) => {
    setPromptText('');
    setPromptOptions(opts);
    return new Promise<string | null>((resolve) => {
      promptResolver.current = resolve;
    });
  }, []);

  const settlePrompt = useCallback((value: string | null) => {
    promptResolver.current?.(value);
    promptResolver.current = null;
    setPromptOptions(null);
  }, []);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
    <PromptContext.Provider value={prompt}>
      {children}
      {options && (
        <Dialog
          onClose={() => settle(false)}
          labelledBy={titleId}
          describedBy={options.body ? bodyId : undefined}
          layout="adaptive-sheet"
          panelClassName="animate-rise w-full max-w-sm rounded-card bg-card p-5 shadow-float"
        >
            <h2 id={titleId} className="text-lg font-extrabold tracking-tight text-ink">
              {options.title}
            </h2>
            {options.body && (
              <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {options.body}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                className="min-h-11 flex-1"
                onClick={() => settle(false)}
              >
                Cancel
              </Button>
              <Button
                variant={options.danger ? 'danger' : 'primary'}
                className="min-h-11 flex-1"
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
        </Dialog>
      )}
      {promptOptions && (
        <Dialog
          onClose={() => settlePrompt(null)}
          labelledBy={promptTitleId}
          describedBy={promptOptions.body ? promptBodyId : undefined}
          layout="adaptive-sheet"
          panelClassName="animate-rise w-full max-w-sm rounded-card bg-card p-5 shadow-float"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const text = promptText.trim();
              if (text) settlePrompt(text);
            }}
          >
            <h2 id={promptTitleId} className="text-lg font-extrabold tracking-tight text-ink">
              {promptOptions.title}
            </h2>
            {promptOptions.body && (
              <p id={promptBodyId} className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {promptOptions.body}
              </p>
            )}
            <textarea
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder={promptOptions.placeholder}
              maxLength={promptOptions.maxLength ?? 500}
              rows={4}
              aria-labelledby={promptTitleId}
              className="mt-3 w-full resize-none rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
            />
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 flex-1"
                onClick={() => settlePrompt(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="min-h-11 flex-1"
                disabled={!promptText.trim()}
              >
                {promptOptions.confirmLabel ?? 'Send'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </PromptContext.Provider>
    </ConfirmContext.Provider>
  );
}

/** Returns the app dialog. The provider is a required part of the root shell. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

/** Returns the app's text prompt, a replacement for `window.prompt`. */
export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error('usePrompt must be used inside ConfirmProvider');
  return ctx;
}
