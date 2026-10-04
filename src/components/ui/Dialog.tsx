'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, type RefObject } from 'react';

const PORTAL_ID = 'dialog-root';
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type DialogLayout = 'center' | 'adaptive-sheet' | 'bottom-sheet';

interface DialogProps {
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  children: React.ReactNode;
  layout?: DialogLayout;
  panelClassName?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
}

interface InertState {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
}

function makeBackgroundInert(portal: HTMLElement): () => void {
  const states: InertState[] = [];
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement) || child === portal) continue;
    states.push({
      element: child,
      inert: child.inert,
      ariaHidden: child.getAttribute('aria-hidden'),
    });
    child.inert = true;
    child.setAttribute('aria-hidden', 'true');
  }
  return () => {
    for (const state of states) {
      state.element.inert = state.inert;
      if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden');
      else state.element.setAttribute('aria-hidden', state.ariaHidden);
    }
  };
}

function focusableElements(dialog: HTMLDialogElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  );
}

/** Pure tab-wrap rule, exported so the keyboard contract stays unit-testable. */
export function trappedFocusIndex(
  currentIndex: number,
  count: number,
  backwards: boolean,
): number | null {
  if (count === 0) return null;
  if (backwards && currentIndex <= 0) return count - 1;
  if (!backwards && (currentIndex < 0 || currentIndex >= count - 1)) return 0;
  return null;
}

/**
 * The one modal primitive. Native showModal supplies top-layer semantics; the
 * explicit focus loop, background inert state, and focus restoration make the
 * keyboard contract visible and consistent across every Switchboard overlay.
 */
export function Dialog({
  onClose,
  labelledBy,
  describedBy,
  children,
  layout = 'center',
  panelClassName = '',
  initialFocusRef,
  closeOnBackdrop = true,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const portal = document.getElementById(PORTAL_ID);
    if (!dialog || !portal) throw new Error(`Dialog requires #${PORTAL_ID}`);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const restoreBackground = makeBackgroundInert(portal);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();

    const first = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
    first.focus();

    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      restoreBackground();
      previouslyFocused?.focus();
    };
  }, [initialFocusRef]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeRef.current();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = focusableElements(dialog);
    const next = trappedFocusIndex(
      focusable.indexOf(document.activeElement as HTMLElement),
      focusable.length,
      event.shiftKey,
    );
    if (next === null) return;
    event.preventDefault();
    (focusable[next] ?? dialog).focus();
  }

  const portal = document.getElementById(PORTAL_ID);
  if (!portal) throw new Error(`Dialog requires #${PORTAL_ID}`);

  // A bottom sheet meets the bottom edge (its top corners are the rounded
  // ones); with the padding every other layout keeps, a strip of the page
  // showed beneath it.
  const placement = layout === 'center'
    ? 'items-center p-4'
    : layout === 'bottom-sheet'
      ? 'items-end justify-center px-4 pt-4 pb-0'
      : 'items-end sm:items-center p-4';

  return createPortal(
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) closeRef.current();
      }}
      className={`app-dialog fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent text-inherit outline-none ${placement}`}
    >
      <div className={panelClassName}>{children}</div>
    </dialog>,
    portal,
  );
}

export function Sheet(props: Omit<DialogProps, 'layout'> & { bottomOnly?: boolean }) {
  const { bottomOnly = false, ...dialogProps } = props;
  return (
    <Dialog
      {...dialogProps}
      layout={bottomOnly ? 'bottom-sheet' : 'adaptive-sheet'}
    />
  );
}

/** Shared anchored surface for ARIA listboxes that must remain non-modal. */
export function Popover({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`absolute z-20 mt-1 w-full ${className}`}>
      {children}
    </div>
  );
}
