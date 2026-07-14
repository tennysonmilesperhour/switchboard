import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Switchboard',
    short_name: 'Switchboard',
    description:
      'Plans without pressure - cascading invites, anonymous group decisions, and mutual-interest matching.',
    start_url: '/',
    display: 'standalone',
    // Match the app's actual paper background (--color-paper in globals.css) and
    // the root viewport themeColor so the installed PWA chrome doesn't flash a
    // different color than the page.
    background_color: '#f9fbfd',
    theme_color: '#f9fbfd',
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      // Raster fallbacks for platforms that don't accept SVG icons.
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
