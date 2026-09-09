import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'SMS Program Compliance',
  description:
    'Public SMS program and consent-flow details for Switchboard Social transactional text notifications.',
};

const sampleMessages = [
  'Switchboard Social: Your verification code is 123456. This code expires in 10 minutes. Reply STOP to opt out or HELP for help.',
  'Switchboard Social: You were invited to Brunch on Saturday at 11:00 AM. View details: https://switchboardsocial.me/events/example. Reply STOP to opt out or HELP for help.',
  'Switchboard Social: Reminder: Brunch starts at 11:00 AM on Saturday. Reply STOP to opt out or HELP for help.',
  'Switchboard Social: Brunch has been canceled by the organizer. Reply STOP to opt out or HELP for help.',
] as const;

const consentSteps = [
  {
    title: '1. Add a mobile number',
    body: 'A signed-in user opens Settings, edits their contact details, and adds a mobile phone number to their Switchboard account.',
  },
  {
    title: '2. Request verification by text',
    body: 'The Settings page shows the phone number as not verified and offers a “Text code” button. Pressing it sends a one-time verification code by SMS.',
  },
  {
    title: '3. Enter the 6-digit code',
    body: 'The user enters the 6-digit code on the Settings page and presses “Verify.” Only verified phone numbers can receive SMS notifications.',
  },
  {
    title: '4. Manage notification preferences',
    body: 'After verification, users separately check “I agree to receive these text messages” and save SMS preferences. Invitations and important plan changes, and event reminders, have independent SMS controls. Consent is recorded with the current number, time, source, and policy version. Push controls do not subscribe users to SMS.',
  },
] as const;

function ScreenshotCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-paper p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-terracotta">
        Flow illustration
      </p>
      <h3 className="mt-2 text-lg font-extrabold text-ink">{title}</h3>
      <div className="mt-4 rounded-[1.5rem] border border-line bg-cream p-4">
        {children}
      </div>
    </section>
  );
}

export default function SmsCompliancePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 text-ink">
      <p className="text-sm font-bold text-terracotta">Public reviewer page</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight">
        Switchboard Social SMS Program
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-soft">
        Switchboard Social is an early-access social planning app for adults.
        It helps people create plans, invite guests, collect RSVPs, coordinate
        updates, and receive reminders. This page publicly documents the SMS
        program and opt-in flow for A2P 10DLC reviewers.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ['Business', 'Switchboard Social LLC'],
          ['Website', 'https://switchboardsocial.me'],
          ['SMS use case', 'Low-volume transactional notifications'],
        ].map(([label, value]) => (
          <section key={label} className="rounded-card border border-line bg-paper p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">
              {label}
            </p>
            <p className="mt-1 text-sm font-extrabold text-ink">{value}</p>
          </section>
        ))}
      </div>

      <section className="mt-10 rounded-card border border-line bg-paper p-6">
        <h2 className="text-2xl font-black">What messages are sent</h2>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Switchboard sends transactional SMS messages only to users or guests
          who have verified their current number and separately opted in. A user may also request a one-time verification code before subscribing.
          Messages may include phone verification codes, event invitations,
          reminders, schedule changes, cancellations, and host announcements. Switchboard does not send marketing or
          promotional SMS through this campaign.
        </p>
      </section>

      <section className="mt-8 rounded-card border border-line bg-paper p-6">
        <h2 className="text-2xl font-black">How users consent</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {consentSteps.map((step) => (
            <article key={step.title} className="rounded-card bg-cream p-4">
              <h3 className="text-sm font-extrabold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {step.body}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          The in-app opt-in language links to the{' '}
          <Link href="/terms" className="font-bold text-terracotta-deep">
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="font-bold text-terracotta-deep">
            Privacy Notice
          </Link>
          , discloses that message frequency varies, message and data rates may
          apply, and users can reply STOP to opt out or HELP for help.
        </p>
      </section>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <ScreenshotCard title="Phone verification flow">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-ink">Phone</p>
                <p className="text-sm text-ink-soft">+1 (555) 010-1234</p>
                <p className="text-xs font-semibold text-gold-deep">Not verified</p>
              </div>
              <span className="rounded-pill bg-ink px-4 py-2 text-sm font-bold text-paper">
                Text code
              </span>
            </div>
            <div className="flex gap-2 border-t border-line pt-4">
              <div className="min-w-0 flex-1 rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm text-ink-faint">
                6-digit code
              </div>
              <span className="rounded-pill bg-terracotta px-4 py-2 text-sm font-bold text-paper">
                Verify
              </span>
            </div>
          </div>
        </ScreenshotCard>

        <ScreenshotCard title="Separate SMS agreement">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-bold text-ink">Text messages</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                SMS starts off. After verification, check the agreement and save your SMS preferences. Push controls are separate.
              </p>
            </div>
            <p className="rounded-card border border-line p-3 text-sm">☐ I agree to receive these text messages.</p>
            {['Invitations and important plan changes', 'Event reminders'].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-card bg-paper px-3 py-2"
              >
                <span className="text-sm font-medium text-ink">{item}</span>
                <span className="rounded-full bg-sage px-3 py-1 text-xs font-bold text-sage-deep">
                  Optional
                </span>
              </div>
            ))}
          </div>
        </ScreenshotCard>
      </div>

      <section className="mt-8 rounded-card border border-line bg-paper p-6">
        <h2 className="text-2xl font-black">Sample messages</h2>
        <div className="mt-4 space-y-3">
          {sampleMessages.map((message) => (
            <p
              key={message}
              className="rounded-card border border-line bg-cream p-4 text-sm leading-relaxed text-ink-soft"
            >
              {message}
            </p>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-card border border-line bg-paper p-6">
        <h2 className="text-2xl font-black">Opt-out and help</h2>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Users can reply STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPTOUT,
          or REVOKE to opt out. Users can reply HELP or INFO for help. Standard
          message and data rates may apply, and message frequency varies based
          on account activity and notification settings.
        </p>
      </section>

      <section className="mt-8 rounded-card border border-line bg-paper p-6">
        <h2 className="text-2xl font-black">Data sharing</h2>
        <p className="mt-3 leading-relaxed text-ink-soft">
          Switchboard does not sell personal information. Mobile phone numbers
          and SMS opt-in data are not shared with third parties for marketing or
          promotional purposes.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-4 text-sm font-bold text-terracotta">
        <Link href="/privacy">Privacy Notice</Link>
        <Link href="/terms">Terms of Use</Link>
        <Link href="/community">Community Covenant</Link>
        <Link href="/welcome">Back to Switchboard</Link>
      </div>
    </main>
  );
}
