import { describe, expect, it } from 'vitest';
import { groupAnswersByInvite, type AnswerRow } from './event-answers';

const QUESTIONS = [
  { id: 'q-diet', prompt: 'Dietary needs?' },
  { id: 'q-bring', prompt: 'Bringing anything?' },
];

function row(inviteId: string, questionId: string, answer: string, name: string | null, guest: string | null = null): AnswerRow {
  return {
    invite_id: inviteId,
    question_id: questionId,
    answer,
    invite: { guest_name: guest, invitee: name === null ? null : { display_name: name } },
  };
}

describe('groupAnswersByInvite', () => {
  it('keeps two guests with the same name apart (G24)', () => {
    const grouped = groupAnswersByInvite(
      [
        row('invite-1', 'q-diet', 'Vegetarian', 'Sam'),
        row('invite-2', 'q-diet', 'None', 'Sam'),
      ],
      QUESTIONS,
    );
    expect(grouped).toEqual([
      { inviteId: 'invite-1', name: 'Sam', answers: [{ prompt: 'Dietary needs?', answer: 'Vegetarian' }] },
      { inviteId: 'invite-2', name: 'Sam', answers: [{ prompt: 'Dietary needs?', answer: 'None' }] },
    ]);
  });

  it('orders one guest’s answers as the questions are asked', () => {
    const [guest] = groupAnswersByInvite(
      [
        row('invite-1', 'q-bring', 'Chips', 'Ada'),
        row('invite-1', 'q-diet', 'None', 'Ada'),
      ],
      QUESTIONS,
    );
    expect(guest.answers.map((answer) => answer.prompt)).toEqual([
      'Dietary needs?',
      'Bringing anything?',
    ]);
  });

  it('labels a guest without an account by the name the host typed, then "Guest"', () => {
    const grouped = groupAnswersByInvite(
      [
        { ...row('invite-1', 'q-diet', 'Vegan', null, 'Priya'), invite: [{ guest_name: 'Priya', invitee: null }] },
        row('invite-2', 'q-diet', 'None', null, null),
      ],
      QUESTIONS,
    );
    expect(grouped.map((guest) => guest.name)).toEqual(['Priya', 'Guest']);
  });

  it('drops an answer to a question the plan no longer asks', () => {
    expect(groupAnswersByInvite([row('invite-1', 'q-gone', 'x', 'Ada')], QUESTIONS)).toEqual([]);
  });
});
