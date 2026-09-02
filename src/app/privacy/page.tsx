import Link from 'next/link';

const SECTIONS = [
  {
    title: 'What We Collect',
    body: [
      'Account details such as your name, handle, login email, optional contact email, optional phone number, profile photo, profile text, interests, activities, and settings.',
      'Social graph and planning data such as connections, circles, household groups, plans, invitations, RSVPs, messages, rooms, polls, votes, availability signals, discovery settings, mutual-interest signals, matches, reports, and blocks.',
      'Uploaded media such as profile images, plan covers, room photos, capsule photos, and voice notes. Profile, plan, and room images are public if you attach them to public or shared surfaces; access-gated media is stored privately.',
      'Technical data needed to run the service, including authentication sessions, push subscriptions, rate-limit records, operational logs, and device/browser information sent by your browser.',
    ],
  },
  {
    title: 'How We Use It',
    body: [
      'To create accounts, authenticate users, show profiles, send invitations, run RSVPs, support plan rooms, manage notifications, prevent abuse, and provide customer or operational support.',
      'To power privacy-preserving features, including anonymous weighted input, mutual-interest matching, people discovery, and contact matching.',
      'To improve reliability and safety, including debugging errors, enforcing rate limits, handling reports, and blocking abusive behavior.',
    ],
  },
  {
    title: 'Privacy by Design',
    body: [
      'Mutual-interest signals are private unless both people independently choose each other for the same context. Unmatched interest is not shown to the other person.',
      'People discovery is opt-in. You choose whether to appear and which categories or contexts can be used.',
      'Contact matching is used to help you find people you already know or invite guests. We do not sell personal information.',
      'We do not share mobile phone numbers or SMS opt-in information with third parties for marketing or promotional purposes.',
      'Private poll votes and mutual-interest signals are protected by database access policies and should not be visible to other users except as aggregated or matched outcomes.',
    ],
  },
  {
    title: 'SMS Notifications',
    body: [
      'If you add and verify a mobile phone number and opt in to SMS notifications, Switchboard may send text messages about your account, phone verification, invitations, RSVPs, reminders, schedule changes, cancellations, and other event-related updates.',
      'Message frequency varies based on your activity and notification settings. Message and data rates may apply.',
      'You can opt out of SMS notifications at any time by replying STOP. Reply HELP for help. You can also manage notification settings from your Switchboard account.',
    ],
  },
  {
    title: 'Choices and Deletion',
    body: [
      'You can edit your profile, contact details, interests, discoverability, quiet hours, notification settings, and password from the app.',
      'You can download a JSON copy of your profile, plans, RSVPs, messages, and availability signals from Settings.',
      'You can delete your account from Settings. Before removing the account, Switchboard deletes the avatars, covers, room photos, and private media stored under your account; associated database records are then removed according to the service relationships.',
      'You can turn off discoverability at any time. Existing mutual matches or rooms may remain unless you leave or delete them.',
    ],
  },
] as const;

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-sm font-bold text-terracotta-deep">Effective August 31, 2026</p>
      <h1 className="mt-2 text-4xl font-black">Privacy Notice</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        This notice explains how Switchboard handles information for an early-access
        social planning app. It is written plainly so people can understand what
        they are sharing and why.
      </p>
      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-extrabold text-ink">{section.title}</h2>
            <div className="mt-3 space-y-3 leading-relaxed text-ink-soft">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-4 text-sm font-bold text-terracotta-deep">
        <Link href="/terms">Terms</Link>
        <Link href="/community">Community Covenant</Link>
        <Link href="/copyright">Copyright</Link>
        <Link href="/welcome">Back to Switchboard</Link>
      </div>
    </main>
  );
}
