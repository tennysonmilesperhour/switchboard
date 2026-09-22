import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/format';
import { signMediaRef } from '@/lib/server/media';
import { CapsuleForm } from './CapsuleForm';

/** Memory Capsule: one line and one photo from everyone, kept forever. */
export default async function CapsulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: event } = await supabase
    .from('events')
    .select('id, title, starts_at, time_zone, location_name')
    .eq('id', id)
    .single();
  if (!event) notFound();

  const { data: entries } = await supabase
    .from('capsule_entries')
    .select('id, line, photo_url, user_id, created_at, author:profiles(display_name)')
    .eq('event_id', id)
    .order('created_at');

  const rows = await Promise.all(
    (entries ?? []).map(async (entry) => {
      const author = Array.isArray(entry.author) ? entry.author[0] : entry.author;
      return {
        ...entry,
        // Keep the raw stored path for re-submission, and a signed URL for
        // display (photo_url is a private-bucket path).
        photo_ref: entry.photo_url,
        photo_url: await signMediaRef(entry.photo_url),
        name: author?.display_name ?? 'Someone',
      };
    }),
  );
  const mine = rows.find((row) => row.user_id === user.id);

  return (
    <AppShell title="Memory Capsule" back={`/events/${id}`}>
      <div className="space-y-6">
        <div className="rounded-card bg-ink text-paper p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-gold-deep">
            {formatDate(event.starts_at, event.time_zone)}
          </p>
          <h2 className="font-extrabold tracking-tight text-3xl mt-1.5 text-balance">
            {event.title}
          </h2>
          {event.location_name && (
            <p className="text-sm opacity-70 mt-1 inline-flex items-center gap-1.5">
              <Icon name="mapPin" size={14} />
              {event.location_name}
            </p>
          )}
          <p className="text-sm opacity-70 mt-3">
            One line and one photo from everyone who was there. It lives here
            for good.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-plate text-plate-inset text-sm text-ink-faint text-center py-4">
            Nothing in the capsule yet. Start it below.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((row, i) => (
              <figure
                key={row.id}
                className={`animate-rise ${i % 2 === 0 ? '' : 'ml-8'}`}
              >
                {row.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.photo_url}
                    alt=""
                    className="rounded-card w-full max-h-64 object-cover shadow-lift mb-2"
                  />
                )}
                <blockquote className="rounded-card bg-cream px-4 py-3">
                  <p className="font-bold text-lg leading-snug tracking-tight">{row.line}</p>
                  <figcaption className="flex items-center gap-2 mt-2 text-xs text-ink-faint">
                    <Avatar name={row.name} seed={row.user_id} size="sm" />
                    {row.name}
                  </figcaption>
                </blockquote>
              </figure>
            ))}
          </div>
        )}

        <CapsuleForm
          eventId={id}
          userId={user.id}
          initialLine={mine?.line ?? ''}
          initialPhotoRef={mine?.photo_ref ?? ''}
          initialPhotoPreview={mine?.photo_url ?? ''}
        />
      </div>
    </AppShell>
  );
}
