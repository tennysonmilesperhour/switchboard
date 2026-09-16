/**
 * The one answer to "what image formats do we accept, and what Content-Type do
 * we store them as?".
 *
 * There are now two upload paths — the signed-in one (`/api/uploads/image`) and
 * the checklist feedback box, which has no session by design — and the rule
 * they need is identical. Deciding it twice is how the invite links got into
 * the state `docs/AGENTS.md` describes: two call sites, one drifting looser
 * than the other. So it is decided here.
 *
 * The map is keyed by a *validated extension*, never by the client's
 * `file.type`, because a file claiming `image/svg+xml` served from a public
 * origin is stored XSS. SVG is absent on purpose: it can carry script, and
 * there is no version of it we want to host.
 */
export const IMAGE_MIME: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  heic: 'image/heic',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MIME));

/**
 * The extension we will store this file under, taken from its name and then
 * its declared type, and falling back to jpg. Only ever returns a key of
 * `IMAGE_MIME`, so the caller's `IMAGE_MIME[ext]` lookup cannot miss.
 */
export function imageExtensionFor(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  const cleaned = fromName.replace(/[^a-z0-9]/g, '');
  if (IMAGE_EXTENSIONS.has(cleaned)) return cleaned;

  const fromType = file.type.split('/')[1]?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(fromType)) return fromType;
  return 'jpg';
}

/**
 * Whether we will accept this file at all, judged before anything is written.
 * SVG is rejected by name as well as by absence from the map, so the refusal is
 * explicit at every call site rather than an accident of lookup order.
 */
export function isAcceptableImage(file: File): boolean {
  if (file.type === 'image/svg+xml') return false;
  if (!file.type.startsWith('image/')) return false;
  return true;
}
