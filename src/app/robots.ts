import type { MetadataRoute } from 'next';

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Allow crawling of the public marketing/legal surface; disallow the
 * authenticated app and API. Everything behind the proxy auth gate is
 * session-only anyway, but stating it keeps private routes out of indexes.
 */
export default function robots(): MetadataRoute.Robots {
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
      ],
    },
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
