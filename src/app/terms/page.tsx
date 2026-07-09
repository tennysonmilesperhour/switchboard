import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <h1 className="text-4xl font-black">Terms</h1>
      <div className="mt-8 space-y-5 leading-relaxed text-ink-soft">
        <p>Switchboard is an early-access service. Features may change and availability is not guaranteed.</p>
        <p>Use the service lawfully and respectfully. Do not harass people, impersonate others, scrape private information, or interfere with the service.</p>
        <p>You are responsible for content you upload and must have permission to share it. Accounts that create risk or abuse may be suspended.</p>
        <p>To the extent permitted by law, the service is provided as-is without warranties.</p>
      </div>
      <Link href="/welcome" className="mt-8 inline-block font-bold text-terracotta">Back to Switchboard</Link>
    </main>
  );
}
