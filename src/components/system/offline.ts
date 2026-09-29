/**
 * Whether a failure the error boundary caught is the connection rather than
 * the app: the next page's code or data never arrived. Chunk loads and RSC
 * fetches fail with these shapes across Chrome, Safari and Firefox; a device
 * the browser already knows is offline needs no guessing at all.
 */
export function looksOffline(error: Pick<Error, 'name' | 'message'>, online: boolean): boolean {
  if (!online) return true;
  const text = `${error.name} ${error.message}`;
  return /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch|Load failed|NetworkError|dynamically imported module|network error/i.test(
    text,
  );
}
