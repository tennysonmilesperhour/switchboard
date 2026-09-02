import Link from 'next/link';

const SECTIONS = [
  {
    title: 'Eligibility',
    body: 'You must be at least 18 years old to create or use a Switchboard account. Adults may organize plans where children attend with their parent or guardian, but children may not hold accounts or participate independently.',
  },
  {
    title: 'Early Access Service',
    body: 'Switchboard is an early-access service. Features may change, break, or be removed. We may limit, suspend, or discontinue parts of the service.',
  },
  {
    title: 'Community Covenant',
    body: 'By using Switchboard, you agree to use it to foster positive, safe, nourishing human connection. Lead with curiosity, openness, kindness, and generous assumptions. Respect consent, boundaries, privacy, and the fact that no one owes anyone a response.',
  },
  {
    title: 'Context-Specific Matching',
    body: 'Discovery and matchmaking features are for the context shown in the app. If you match with someone around hiking, volunteering, a shared interest, a high number of mutual friends, or another category, you agree to show up honestly for that context and not use the match as a pretext for an unrelated or ulterior motive.',
  },
  {
    title: 'Acceptable Use',
    body: 'Do not harass, threaten, stalk, exploit, impersonate, spam, scrape private information, violate the law, interfere with the service, or pressure people outside the consent and context of the feature you are using.',
  },
  {
    title: 'Your Content',
    body: 'You are responsible for profile text, messages, images, invitations, comments, and other content you share. You must have the rights and permission needed to upload or share it. Do not upload sensitive information you would not want visible to the intended audience.',
  },
  {
    title: 'SMS Notifications',
    body: 'If you add and verify a mobile phone number and opt in to SMS notifications, you agree that Switchboard may send transactional text messages about phone verification, your account, invitations, RSVPs, reminders, schedule changes, cancellations, and event-related updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out of SMS notifications or HELP for help.',
  },
  {
    title: 'Safety and Enforcement',
    body: 'Meetups involve real people and real-world risk. Use an appropriate public or trusted venue, tell someone you trust where you are going, keep guardians present for kid-inclusive plans, and never publish a child’s name, age, school, contact details, or live location. We may remove content, restrict features, suspend accounts, preserve records, or report activity if needed to protect users, comply with law, prevent abuse, or keep the service reliable.',
  },
  {
    title: 'No Warranty',
    body: 'To the extent permitted by law, Switchboard is provided as-is and as-available, without warranties of any kind. Social features can support connection, but they cannot guarantee compatibility, safety, attendance, or outcomes.',
  },
] as const;

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-sm font-bold text-terracotta-deep">Effective August 31, 2026</p>
      <h1 className="mt-2 text-4xl font-black">Terms of Use</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        These terms are the basic rules for using Switchboard. They work together
        with the Privacy Notice, Community Covenant, and Copyright Policy.
      </p>
      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-extrabold text-ink">{section.title}</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{section.body}</p>
          </section>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-4 text-sm font-bold text-terracotta-deep">
        <Link href="/privacy">Privacy</Link>
        <Link href="/community">Community Covenant</Link>
        <Link href="/copyright">Copyright</Link>
        <Link href="/welcome">Back to Switchboard</Link>
      </div>
    </main>
  );
}
