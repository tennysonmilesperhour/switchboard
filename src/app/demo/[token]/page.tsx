import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemoPlayer } from '@/components/demo/DemoPlayer';
import { INVESTOR_DEMO } from '@/lib/investor-demo';
import { demoAccessGranted } from '@/lib/server/demo-access';

/**
 * The investor demo at `/demo/<DEMO_ACCESS_TOKEN>`: the story in
 * `src/lib/investor-demo.ts`, played on staged screens. `?mode=present` opens
 * it in presenter mode with the talk track showing.
 *
 * Gated the same way as `/proposal/<token>` (docs/SECURITY.md): a wrong or
 * missing token, or an unset secret, renders the ordinary not-found screen with
 * no demo title, so a guess cannot confirm the page exists. Nothing on the page
 * is real data; the gate keeps the pitch's framing and talk track private.
 */

const ROBOTS = { index: false, follow: false, nocache: true };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  if (!demoAccessGranted(token)) return { robots: ROBOTS, referrer: 'no-referrer' };
  return { title: 'Demo', robots: ROBOTS, referrer: 'no-referrer' };
}

export default async function DemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { token } = await params;
  if (!demoAccessGranted(token)) notFound();
  const { mode } = await searchParams;

  return <DemoPlayer beats={INVESTOR_DEMO} initialMode={mode === 'present' ? 'present' : 'auto'} />;
}
