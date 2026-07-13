import type { Metadata, Viewport } from 'next';
import { Work_Sans } from 'next/font/google';
import './globals.css';
import { VersionWatcher } from '@/components/system/VersionWatcher';
import { ServiceWorkerRegistrar } from '@/components/system/ServiceWorkerRegistrar';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';

const workSans = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-work',
});

export const metadata: Metadata = {
  // Resolve relative OG/Twitter image URLs (e.g. /api/og/event/[id]) against the
  // deployment's real origin so shared links unfurl with the right host instead
  // of localhost / the wrong vercel.app domain.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'Switchboard - plans without pressure',
    template: '%s · Switchboard',
  },
  description:
    'Cascading invites, anonymous group decisions, and mutual-interest matching. Switchboard removes the social friction from making plans.',
  applicationName: 'Switchboard',
  manifest: '/manifest.webmanifest',
  // iOS home-screen icon (Add to Home Screen). Without this iOS uses a page
  // screenshot instead of the app icon. Reuses the existing 192px PWA icon.
  icons: {
    apple: '/icons/icon-192.png',
  },
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
      <body className="min-h-dvh">
        <ToastProvider>
          <ConfirmProvider>
            {children}
            <VersionWatcher />
            <ServiceWorkerRegistrar />
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
