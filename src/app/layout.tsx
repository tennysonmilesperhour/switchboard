import type { Metadata, Viewport } from 'next';
import { cache } from 'react';
import { Work_Sans } from 'next/font/google';
import './globals.css';
import { VersionWatcher } from '@/components/system/VersionWatcher';
import { InstallPrompt } from '@/components/system/InstallPrompt';
import { PmfSurvey } from '@/components/system/PmfSurvey';
import { ServiceWorkerRegistrar } from '@/components/system/ServiceWorkerRegistrar';
import { OfflineBanner } from '@/components/system/OfflineBanner';
import { PostHogProvider } from '@/components/system/PostHogProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { LiveNotifications } from '@/components/system/LiveNotifications';
import { createClient, getRenderUser } from '@/lib/supabase/server';
import { resolveTheme, themeById, type AppThemeId } from '@/lib/themes-app';
import {
  customThemeVars,
  hasWallpaper,
  parseCustomAppearance,
} from '@/lib/theme-custom';
import { APP_UNFURL_DESCRIPTION } from '@/lib/invite-links';
import { reportOperationalError } from '@/lib/server/observability';
import { BottomOverlayProvider } from '@/components/system/BottomOverlaySlot';
import { appOriginOrUndefined } from '@/lib/links';

const workSans = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-work',
});

const METADATA_ORIGIN = appOriginOrUndefined();

export const metadata: Metadata = {
  // Resolve relative OG/Twitter image URLs (e.g. /api/og/event/[id]) against the
  // deployment's real origin so shared links unfurl with the right host instead
  // of localhost / the wrong vercel.app domain. The validated origin from
  // links.ts, via the accessor that cannot throw: this runs for every page, so a
  // misconfigured origin must not crash them all. When it is missing or
  // malformed this is undefined and Next.js falls back to its own default.
  metadataBase: METADATA_ORIGIN ? new URL(METADATA_ORIGIN) : undefined,
  title: {
    default: 'Switchboard - plans without pressure',
    template: '%s · Switchboard',
  },
  description: APP_UNFURL_DESCRIPTION,
  // Emit `og:type` (and siteName/title/description) as a default on every page.
  // Auth and app pages that don't set their own Open Graph metadata previously
  // shipped with no `og:*` tags at all, so in-app browsers (Facebook, Instagram,
  // etc.) that read `meta[property="og:type"]` on open hit `null` and threw
  // "null is not an object (evaluating '...og:type...').content" — which showed
  // up in error tracking as a TypeError on /login. A page that sets its own
  // openGraph replaces this whole object rather than extending it, so the
  // invite unfurls restate these fields through `inviteOpenGraph`.
  openGraph: {
    type: 'website',
    siteName: 'Switchboard',
    title: 'Switchboard - plans without pressure',
    description: APP_UNFURL_DESCRIPTION,
  },
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

interface Shell {
  /** Null means no saved preference; CSS follows the operating-system scheme. */
  theme: AppThemeId | null;
  /** Token overrides for the custom preset; empty for every other theme. */
  themeVars: Record<string, string>;
  wallpaper: boolean;
  userId: string | null;
}

const SIGNED_OUT: Shell = {
  theme: null,
  themeVars: {},
  wallpaper: false,
  userId: null,
};

/**
 * Resolve the things the shell needs about the signed-in person in one
 * `auth.getUser()`: their appearance, and their id.
 *
 * The theme is applied server-side and inline on `<html>` rather than by a
 * client effect — a theme swapped after hydration is a visible flash of the
 * default palette on every navigation, worse than not offering themes at all.
 * The custom preset's tokens ride along the same way, as inline custom
 * properties. They are serialised into a style attribute here, so they ARE
 * parsed as CSS — what keeps that safe is that every one of them is derived
 * from values `parseCustomAppearance` has already validated to a strict hex or,
 * for the wallpaper URL, to a closed character set. See `customThemeVars`.
 *
 * The id powers the live-notifications subscription. A signed-out visitor, or
 * any failure to read the profile, gets the default theme and no listener —
 * this is chrome, and it must never be the reason a page doesn't render. A
 * failed read is reported rather than only swallowed: a column this query names
 * but cannot select fails the whole query, and the last time that happened the
 * only symptom was that Settings appeared to ignore the theme you picked.
 */
const resolveShell = cache(async (): Promise<Shell> => {
  try {
    const supabase = await createClient();
    const user = await getRenderUser();
    if (!user) return SIGNED_OUT;
    const { data, error } = await supabase
      .from('profiles')
      .select('appearance_theme, appearance_custom')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      await reportOperationalError('layout.appearance', error, { userId: user.id });
      return { ...SIGNED_OUT, userId: user.id };
    }

    const theme = data?.appearance_theme
      ? resolveTheme(data.appearance_theme)
      : null;
    if (!theme) return { ...SIGNED_OUT, userId: user.id };
    if (theme !== 'custom') {
      return { theme, themeVars: {}, wallpaper: false, userId: user.id };
    }
    const custom = parseCustomAppearance(data?.appearance_custom);
    return {
      theme,
      themeVars: customThemeVars(custom),
      wallpaper: hasWallpaper(custom),
      userId: user.id,
    };
  } catch {
    return SIGNED_OUT;
  }
});

export async function generateViewport(): Promise<Viewport> {
  const shell = await resolveShell();
  const themeColor = shell.theme
    ? shell.themeVars['--color-paper'] ?? themeById(shell.theme).swatches[0]
    : [
        { media: '(prefers-color-scheme: light)', color: '#f9fbfd' },
        { media: '(prefers-color-scheme: dark)', color: '#1e1712' },
      ];
  return {
    themeColor,
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { theme, themeVars, wallpaper, userId } = await resolveShell();
  return (
    <html
      lang="en"
      data-theme={theme ?? undefined}
      data-wallpaper={wallpaper ? 'on' : undefined}
      style={themeVars as React.CSSProperties}
      className={`${workSans.variable} antialiased`}
    >
      <body className="min-h-[100svh]">
        <PostHogProvider>
          <ToastProvider>
            <BottomOverlayProvider>
              <ConfirmProvider>
                {children}
                {userId && <LiveNotifications userId={userId} />}
                <VersionWatcher />
                <InstallPrompt />
                <PmfSurvey />
                <ServiceWorkerRegistrar />
                <OfflineBanner />
              </ConfirmProvider>
            </BottomOverlayProvider>
          </ToastProvider>
        </PostHogProvider>
        <div id="dialog-root" />
      </body>
    </html>
  );
}
