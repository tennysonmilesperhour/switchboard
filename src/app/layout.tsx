import type { Metadata, Viewport } from 'next';
import { Work_Sans } from 'next/font/google';
import './globals.css';

const workSans = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-work',
});

export const metadata: Metadata = {
  title: {
    default: 'Switchboard - plans without pressure',
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
  themeColor: '#f9fbfd',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${workSans.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
