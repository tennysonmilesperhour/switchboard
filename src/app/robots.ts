import type { MetadataRoute } from 'next';
import { appOriginOrUndefined } from '@/lib/links';

/**
 * Allow crawling of the public marketing/legal surface; disallow the
 * authenticated app and API. Everything behind the proxy auth gate is
 * session-only anyway, but stating it keeps private routes out of indexes.
 */
export default function robots(): MetadataRoute.Robots {
  // The sitemap must be an absolute URL on the validated origin (links.ts); with
  // none configured, the line is omitted rather than pointing crawlers at a guess.
  const appUrl = appOriginOrUndefined();
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/welcome', '/login', '/privacy', '/terms', '/community', '/copyright'],
      disallow: [
        '/api/',
        '/you',
        '/people',
        '/profile',
        '/settings',
        '/plans',
        '/events/',
        '/rooms',
        '/mutual',
        '/moments',
        '/discover',
        '/boards',
        '/zones',
        '/notifications',
        '/onboarding',
        '/moderation',
        '/features',
      ],
    },
    ...(appUrl ? { sitemap: `${appUrl}/sitemap.xml` } : {}),
  };
}
