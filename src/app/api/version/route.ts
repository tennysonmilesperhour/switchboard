// Reports the build id of the deployment currently serving this route. The
// client compares it against the build id baked into its own bundle to detect
// when a newer production build has shipped. Always dynamic + uncached so the
// answer reflects the live deployment, not a cached response.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
