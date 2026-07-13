'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for errors thrown by the root layout itself (which the
 * route-level `error.tsx` cannot catch, since it renders *inside* the layout).
 * It must provide its own <html>/<body>. Styles are inline because the app's
 * stylesheet may not have loaded in this failure path.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: '#f9fbfd',
          color: '#191d22',
          fontFamily: 'system-ui, sans-serif',
          minHeight: '100dvh',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <span aria-hidden style={{ fontSize: '2.25rem' }}>
          🌫️
        </span>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
          Something slipped
        </h1>
        <p style={{ maxWidth: '20rem', fontSize: '0.875rem', color: '#565a60' }}>
          A hiccup on our end, not yours. Give it another try in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: '#f82a63',
            color: '#fff',
            border: 'none',
            borderRadius: '19px',
            padding: '0.625rem 1.25rem',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
