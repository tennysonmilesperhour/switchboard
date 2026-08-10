'use client';

import { useEffect, useState } from 'react';
import { resolveTimeZone } from '@/lib/client/time-zone';
import { greetingFor, type Greeting as GreetingText } from '@/lib/greeting';

interface GreetingProps {
  /** First name, already trimmed by the caller. */
  name: string;
  /**
   * The greeting the server computed from the reader's stored
   * `profiles.timezone`. Rendered as-is for the first paint so SSR and
   * hydration agree, and so a reader with no JS still gets their own clock.
   */
  initial: GreetingText;
}

/**
 * "Good morning, Sam." — timed by the reader's clock.
 *
 * The server can only go on the zone stored at onboarding, which is stale for
 * anyone who has since travelled or moved. The browser knows the real one, so
 * after mount we recompute from it; the state starts at the server's answer, so
 * hydration matches and the correction is invisible unless it's needed.
 */
export function Greeting({ name, initial }: GreetingProps) {
  const [greeting, setGreeting] = useState<GreetingText>(initial);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setGreeting(greetingFor(new Date(), resolveTimeZone()));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <h1 className="text-3xl font-extrabold tracking-tight text-ink">
      {greeting}, {name}.
    </h1>
  );
}
