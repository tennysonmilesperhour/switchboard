import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import { FeatureIndexClient } from './FeatureIndexClient';

export const metadata: Metadata = {
  title: 'Everything Switchboard does',
  description:
    'An index of every Switchboard feature and where to find it.',
};

/**
 * The feature index. Switchboard reveals itself a surface at a time, which
 * keeps it calm and means most people never meet half of it; this page is the
 * one place that lays it all out, with directions.
 *
 * There's no `getUser()` here because there's nothing personal on the page —
 * it's the same catalogue for everyone, and the proxy already keeps signed-out
 * visitors off `/features` (see `src/proxy.ts`). Rendering it without a session
 * read keeps it instant.
 */
export default function FeaturesPage() {
  return (
    <AppShell title="Everything" back="/">
      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-ink-soft">
          Switchboard shows you one thing at a time on purpose. Here’s the whole
          of it — what each part does, and where to find it.
        </p>
        <FeatureIndexClient />
      </div>
    </AppShell>
  );
}
