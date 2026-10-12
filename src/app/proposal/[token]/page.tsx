import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProposalDocument } from '@/components/proposal/ProposalDocument';
import { parseMarkdown } from '@/lib/proposal-markdown';
import { proposalAccessGranted } from '@/lib/server/proposal-access';

/**
 * The next-stage proposal, rendered live from `docs/PROPOSAL.md` at
 * `/proposal/<PROPOSAL_ACCESS_TOKEN>`.
 *
 * The file is the source of truth: edit it in the repository, merge, and this
 * page shows the new text on the next deploy. It holds fees and investor
 * strategy, so unlike `/scope-verification` it is not open to anyone who guesses
 * the path. A wrong or missing token, or an unset secret, renders the app's
 * ordinary not-found screen with no proposal text and no proposal title, so the
 * response does not confirm the page exists. (The app's root `loading.tsx` means
 * the status line is a streamed 200 either way; the body is what is gated.)
 */

const SOURCE_URL = 'https://github.com/tennysonmilesperhour/switchboard/blob/main/docs/PROPOSAL.md';

/**
 * The title is part of the page, so it is withheld with the page: metadata is
 * resolved before the body, and a static title would name the proposal to
 * anyone who guessed a path.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const robots = { index: false, follow: false, nocache: true };
  if (!proposalAccessGranted(token)) return { robots };
  return { title: 'Next Stage Proposal', robots };
}

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!proposalAccessGranted(token)) notFound();

  const source = await readFile(join(process.cwd(), 'docs/PROPOSAL.md'), 'utf-8');

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 text-ink">
      <ProposalDocument blocks={parseMarkdown(source)} />
      <p className="mt-12 border-t border-line pt-6 text-sm leading-relaxed text-ink-soft">
        Private page, not indexed. This is the text of <code>docs/PROPOSAL.md</code> on the
        deployed branch. To change it, edit that file in the{' '}
        <a
          href={SOURCE_URL}
          rel="noopener noreferrer"
          className="font-semibold text-terracotta-deep underline"
        >
          repository
        </a>{' '}
        and merge.
      </p>
    </main>
  );
}
