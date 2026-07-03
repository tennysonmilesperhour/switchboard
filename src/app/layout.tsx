import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Switchboard — plans without pressure',
    template: '%s · Switchboard',
  },
  description:
    'Cascading invites, anonymous group decisions, and mutual-interest matching. Switchboard removes the social friction from making plans.',
  applicationName: 'Switchboard',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Switchboard',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#f7f3ea',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
