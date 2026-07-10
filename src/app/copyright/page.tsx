import Link from 'next/link';

export default function CopyrightPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-sm font-bold text-terracotta">Effective July 9, 2026</p>
      <h1 className="mt-2 text-4xl font-black">Copyright Policy</h1>
      <div className="mt-8 space-y-6 leading-relaxed text-ink-soft">
        <section>
          <h2 className="text-xl font-extrabold text-ink">Your Rights</h2>
          <p className="mt-3">
            You keep ownership of content you create and upload. By sharing it
            on Switchboard, you give the service permission to store, display,
            resize, transmit, and otherwise use that content as needed to run
            the app and show it to the people you intended.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-extrabold text-ink">Respect Others</h2>
          <p className="mt-3">
            Do not upload images, text, logos, files, or other materials unless
            you own them or have permission to use them. Do not remove attribution
            or imply endorsement where none exists.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-extrabold text-ink">Reports</h2>
          <p className="mt-3">
            If you believe content on Switchboard infringes your rights, contact
            the operator with the content location, your contact information, and
            a short explanation of the rights involved. We may remove or restrict
            content while reviewing a report.
          </p>
        </section>
      </div>
      <div className="mt-10 flex flex-wrap gap-4 text-sm font-bold text-terracotta">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/community">Community Covenant</Link>
        <Link href="/welcome">Back to Switchboard</Link>
      </div>
    </main>
  );
}
