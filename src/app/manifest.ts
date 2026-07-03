import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Switchboard',
    short_name: 'Switchboard',
    description:
      'Plans without pressure — cascading invites, anonymous group decisions, and mutual-interest matching.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f3ea',
    theme_color: '#f7f3ea',
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
