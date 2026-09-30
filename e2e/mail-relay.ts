import { createServer, type IncomingMessage, type Server } from 'node:http';

/**
 * A Resend-shaped front door for the local stack's mail catcher.
 *
 * The app sends every email itself, through Resend's HTTP API
 * (src/lib/server/email.ts): sign-up confirmation, password recovery, guest
 * invitations. GoTrue never mails anything, so the local Supabase's Mailpit
 * would otherwise stay empty and the journeys that start with "open the link
 * we sent you" could not be walked by a browser at all.
 *
 * When the app is started with `RESEND_API_URL` pointing at a loopback address,
 * this listens there for the whole run and hands each message to Mailpit's own
 * send API, where the specs read it back (`e2e/support.ts`, `waitForMail`). The
 * app code path is the production one; only the endpoint differs, and the app
 * refuses a non-loopback http endpoint.
 *
 * Nothing starts when `RESEND_API_URL` is unset, so the no-database smoke suite
 * is unaffected. A port already in use is logged and left alone: another run's
 * relay is forwarding to the same Mailpit.
 */
const MAILPIT = (process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324').replace(/\/$/, '');

interface ResendMessage {
  from?: string;
  to?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  reply_to?: string | string[];
}

/** `Name <address>` or a bare address, as Resend accepts it. */
function mailbox(value: string): { Email: string; Name?: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { Email: match[2], Name: match[1] || undefined } : { Email: value.trim() };
}

function list(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function relayTarget(): URL | null {
  const raw = process.env.RESEND_API_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    return url.protocol === 'http:' && loopback ? url : null;
  } catch {
    return null;
  }
}

export default async function startMailRelay(): Promise<(() => Promise<void>) | void> {
  const target = relayTarget();
  if (!target) return;

  const server: Server = createServer(async (request, response) => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.method !== 'POST' || request.url !== target.pathname) {
      reply(404, { message: 'not found' });
      return;
    }
    // Resend refuses a request without its key; so does this, so a missing key
    // in the app's configuration fails here rather than passing unnoticed.
    if (!/^Bearer \S+/.test(request.headers.authorization ?? '')) {
      reply(401, { message: 'missing API key' });
      return;
    }
    try {
      const message = JSON.parse(await readBody(request)) as ResendMessage;
      const sent = await fetch(`${MAILPIT}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: mailbox(message.from ?? 'Switchboard <e2e@switchboard.test>'),
          To: list(message.to).map(mailbox),
          ReplyTo: list(message.reply_to).map(mailbox),
          Subject: message.subject ?? '',
          Text: message.text ?? '',
          ...(message.html ? { HTML: message.html } : {}),
          ...(message.headers ? { Headers: message.headers } : {}),
        }),
      });
      if (!sent.ok) {
        console.warn(`[mail-relay] Mailpit refused a message: HTTP ${sent.status}`);
        reply(502, { message: `mailpit_${sent.status}` });
        return;
      }
      const { ID } = (await sent.json()) as { ID?: string };
      reply(200, { id: ID ?? 'relayed' });
    } catch (error) {
      console.warn(`[mail-relay] could not relay a message: ${String(error)}`);
      reply(502, { message: 'relay_failed' });
    }
  });

  const listening = await new Promise<boolean>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen(Number(target.port || 80), target.hostname.replace(/^\[|\]$/g, ''), () =>
      resolve(true),
    );
  });
  if (!listening) {
    console.warn(`[mail-relay] ${target.host} is already in use; assuming another relay owns it`);
    return;
  }

  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
