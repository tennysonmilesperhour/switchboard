import Link from 'next/link';

/** 404: warm, brief, and pointed back home. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="text-4xl" aria-hidden>
        🧭
      </span>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">
        Nothing here
      </h1>
      <p className="max-w-xs text-sm leading-relaxed text-ink-faint">
        This page moved on, or was never here. Let’s get you back to your plans.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center justify-center rounded-btn bg-brand-gradient px-7 py-3.5 text-base font-bold text-white shadow-lift"
      >
        Go home
      </Link>
    </div>
  );
}
