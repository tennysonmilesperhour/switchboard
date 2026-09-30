/**
 * RSVP answers, as the host reads them on their plan page.
 *
 * Grouped by invitation, never by display name (G24): two guests called Sam
 * used to merge into one card holding both of their answers, and a host
 * reading "Sam: vegetarian, no restrictions" had no way to know which Sam was
 * which. The name is only the label on the card; the invite is the key.
 */

/** One `invite_answers` row as the plan page reads it. */
export interface AnswerRow {
  invite_id: string;
  question_id: string;
  answer: string;
  invite:
    | InviteLabel
    | InviteLabel[]
    | null;
}

interface InviteLabel {
  guest_name: string | null;
  invitee: { display_name: string | null } | Array<{ display_name: string | null }> | null;
}

export interface GuestAnswers {
  inviteId: string;
  name: string;
  answers: Array<{ prompt: string; answer: string }>;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * Group answers by the invitation that gave them, in the order the questions
 * are asked. `questions` is the plan's questions in position order; an answer
 * to a question that is not among them is dropped, as it could not be labelled.
 * Guests appear in the order their first answer arrives.
 */
export function groupAnswersByInvite(
  rows: readonly AnswerRow[],
  questions: ReadonlyArray<{ id: string; prompt: string }>,
): GuestAnswers[] {
  const order = new Map(questions.map((question, index) => [question.id, index]));
  const prompts = new Map(questions.map((question) => [question.id, question.prompt]));
  const byInvite = new Map<string, { name: string; answers: Array<{ at: number; prompt: string; answer: string }> }>();

  for (const row of rows) {
    const at = order.get(row.question_id);
    if (at === undefined) continue;
    const invite = one(row.invite);
    const profile = one(invite?.invitee);
    const entry = byInvite.get(row.invite_id) ?? {
      name: profile?.display_name?.trim() || invite?.guest_name?.trim() || 'Guest',
      answers: [],
    };
    entry.answers.push({ at, prompt: prompts.get(row.question_id) ?? '', answer: row.answer });
    byInvite.set(row.invite_id, entry);
  }

  return [...byInvite.entries()].map(([inviteId, entry]) => ({
    inviteId,
    name: entry.name,
    answers: entry.answers
      .sort((a, b) => a.at - b.at)
      .map(({ prompt, answer }) => ({ prompt, answer })),
  }));
}
