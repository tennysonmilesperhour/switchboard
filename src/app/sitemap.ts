import type { MetadataRoute } from 'next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Only the public, indexable routes belong here — the rest of the app is behind
 * the session gate and intentionally excluded (see robots.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/welcome', '/login', '/privacy', '/terms', '/community', '/copyright'];
  return routes.map((route) => ({
    url: `${appUrl}${route || '/'}`,
    changeFrequency: 'monthly',
    priority: route === '' || route === '/welcome' ? 1 : 0.5,
  }));
}
