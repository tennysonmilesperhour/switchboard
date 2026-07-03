import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accept' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-terracotta text-white hover:bg-terracotta-deep active:scale-[0.98] shadow-lift',
  secondary:
    'bg-card text-ink border border-line hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98]',
  ghost: 'text-ink-soft hover:text-ink hover:bg-cream',
  accept:
    'bg-sage text-white hover:bg-sage-deep active:scale-[0.98] shadow-lift',
  danger:
    'bg-rose-soft text-rose-deep hover:bg-rose-deep hover:text-white active:scale-[0.98]',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-[15px]',
  lg: 'px-7 py-3.5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
