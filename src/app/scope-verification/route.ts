import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';

/**
 * The client-facing scope-of-work checklist, at the URL the client already
 * has. It was removed in #180 when its source moved to the docs archive, and
 * the link then answered "not found" to the one person walking through it.
 *
 * The page is a static HTML file with its checklist script inline. The proxy
 * issues a per-request CSP that allows inline scripts only with the request's
 * nonce, so the nonce is stamped onto every `<script>` tag here; without it
 * the page renders its header and an empty list, with the only error in the
 * reader's console.
 */
export async function GET(request: NextRequest) {
  const html = await readFile(
    join(process.cwd(), 'docs/scope-of-work-verification.html'),
    'utf-8',
  );
  const nonce = request.headers.get('x-nonce');
  const body = nonce
    ? html.replaceAll('<script>', `<script nonce="${nonce}">`)
    : html;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
