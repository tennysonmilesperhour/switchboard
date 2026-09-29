import type { MetadataRoute } from 'next';
import { appOriginOrUndefined } from '@/lib/links';

/**
 * Only the public, indexable routes belong here — the rest of the app is behind
 * the session gate and intentionally excluded (see robots.ts).
 *
 * URLs are rooted at the validated origin from links.ts. When it isn't
 * configured the sitemap is empty rather than a list of localhost URLs, and
 * the accessor never throws, so a missing env var can't fail the build.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = appOriginOrUndefined();
  if (!appUrl) return [];
  const routes = [
    '',
    '/welcome',
    '/login',
    '/privacy',
    '/terms',
    '/sms-compliance',
    '/community',
    '/copyright',
  ];
  return routes.map((route) => ({
    url: `${appUrl}${route || '/'}`,
    changeFrequency: 'monthly',
    priority: route === '' || route === '/welcome' ? 1 : 0.5,
  }));
}
