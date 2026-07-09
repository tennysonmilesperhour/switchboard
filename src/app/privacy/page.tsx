import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <h1 className="text-4xl font-black">Privacy</h1>
      <div className="mt-8 space-y-5 leading-relaxed text-ink-soft">
        <p>Switchboard stores the profile, connection, plan, message, RSVP, and notification data needed to provide the service.</p>
        <p>Private votes and mutual-interest signals are protected by database access policies. We do not sell personal information.</p>
        <p>Uploaded images are stored publicly when you attach them to a profile or plan. Do not upload sensitive information.</p>
        <p>You can change your password or permanently delete your account from Settings. Contact the operator for access or correction requests.</p>
      </div>
      <Link href="/welcome" className="mt-8 inline-block font-bold text-terracotta">Back to Switchboard</Link>
    </main>
  );
}
