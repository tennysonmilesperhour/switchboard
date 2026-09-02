'use client';

import { useId, useState, type InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Password field with a show/hide toggle. Toggling swaps the input `type`
 * between `password` and `text` — the value lives in the DOM either way, so
 * this works for both controlled and uncontrolled (server-action) forms.
 */
export function PasswordInput({ id, className = '', ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        id={inputId}
        type={visible ? 'text' : 'password'}
        className={`w-full rounded-card border border-line bg-card px-4 py-3.5 pr-12 text-ink placeholder:text-ink-faint outline-none focus:border-terracotta transition-colors ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={inputId}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center rounded-card px-3.5 text-ink-faint transition-colors hover:text-ink outline-none focus-visible:text-terracotta-deep focus-visible:ring-2 focus-visible:ring-terracotta"
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </div>
  );
}
