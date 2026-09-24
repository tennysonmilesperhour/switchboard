import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { createBoard } from '@/lib/actions/boards';

export const metadata: Metadata = { title: 'Neighborhood Boards' };

const ERRORS: Record<string, string> = {
  name: 'Give the board a name of at least 3 characters.',
  save: 'Switchboard couldn’t create the board.',
};

export default async function BoardsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS returns only boards the viewer belongs to.
  const { data: boards } = await supabase
    .from('boards')
    .select('id, slug, name, description')
    .order('created_at', { ascending: false });

  return (
    <AppShell title="Boards">
      <div className="space-y-7">
        <p className="text-sm text-ink-soft leading-relaxed -mt-1">
          A neighborhood board is a permanent, invite-only home for a local
          community - recurring open plans like a Saturday market walk or
          pickup basketball, plus notices from your neighbors.
        </p>

        {(boards?.length ?? 0) > 0 ? (
          <section>
            <SectionHeader title="Your boards" />
            <div className="space-y-2">
              {boards?.map((board) => (
                <Link key={board.id} href={`/boards/${board.slug}`} className="block group">
                  <Card className="group-hover:border-terracotta transition-colors">
                    <p className="font-medium">🏘️ {board.name}</p>
                    {board.description && (
                      <p className="text-sm text-ink-soft mt-0.5">{board.description}</p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            emoji="🏘️"
            title="No boards yet"
            body="Start one for your street, building, or neighborhood - then invite the neighbors you want in it."
          />
        )}

        <section>
          <SectionHeader
            title="Start a board"
            hint="You’ll be its first moderator"
          />
          {error && (
            <p role="alert" className="mb-3 rounded-card bg-rose-soft text-rose-deep text-sm p-3">
              {ERRORS[error] ?? 'Something went wrong.'}
              {error === 'save' && reason ? ` (${reason})` : ''}
            </p>
          )}
          <form action={createBoard}>
            <Card>
              <div className="space-y-2.5">
                <input
                  name="name"
                  required
                  placeholder="Board name (Maple Street, Building C, Riverside…)"
                  aria-label="Board name"
                  className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                />
                <input
                  name="description"
                  placeholder="One line about it (optional)"
                  aria-label="Board description"
                  className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                />
                <Button type="submit" size="sm" variant="secondary" className="w-full">
                  Create board
                </Button>
              </div>
            </Card>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
