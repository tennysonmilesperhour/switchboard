'use client';

import { Glyph } from '@/components/ui/Glyph';
import { ImageInput } from '@/components/ui/ImageInput';
import { EVENT_THEMES } from '@/lib/themes';
import { MAX_PLAN_QUESTIONS, REMINDER_SCHEDULE_COPY, type NewQuestion } from '@/lib/plan-extras';
import type { EventTheme } from '@/lib/types';

const FIELD_LABEL = 'text-sm font-semibold text-ink';
const SMALL_FIELD =
  'w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft';

export interface PlanExtrasValue {
  coverUrl: string;
  theme: EventTheme;
  remindersEnabled: boolean;
  openTable: boolean;
  newQuestions: NewQuestion[];
}

/**
 * What a host can change after creating a plan, beyond its details (decision
 * D18): the cover, theme, reminders, Open Table, and new questions. Questions
 * already asked are listed, not editable: people have answered them, and an
 * answer to a question that has since changed would read as an answer to the
 * new one. Parental approval and recurrence stay as the plan was made.
 */
export function PlanExtrasFields({
  userId,
  value,
  onChange,
  existingQuestions,
  hasCapacity,
  fixedRules,
}: {
  userId: string;
  value: PlanExtrasValue;
  onChange: (next: PlanExtrasValue) => void;
  existingQuestions: string[];
  /** Open Table offers the seats left, so it needs a capacity. */
  hasCapacity: boolean;
  /** Plain descriptions of the rules this plan was made with, if any. */
  fixedRules: string[];
}) {
  const set = (patch: Partial<PlanExtrasValue>) => onChange({ ...value, ...patch });
  const setQuestion = (index: number, patch: Partial<NewQuestion>) =>
    set({
      newQuestions: value.newQuestions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    });
  const roomForQuestions =
    existingQuestions.length + value.newQuestions.length < MAX_PLAN_QUESTIONS;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className={`text-plate text-plate-inset ${FIELD_LABEL}`}>Cover image</p>
        <ImageInput
          userId={userId}
          value={value.coverUrl}
          onChange={(coverUrl) => set({ coverUrl })}
          pathPrefix="event-cover"
          label="cover image"
          aspect="video"
        />
      </div>

      <div className="space-y-1.5">
        <p className={`text-plate text-plate-inset ${FIELD_LABEL}`}>Theme</p>
        <div className="flex flex-wrap gap-2">
          {EVENT_THEMES.map((option) => {
            const active = value.theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => set({ theme: option.id })}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-pill border-2 py-1.5 pl-1.5 pr-3.5 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                  active ? 'border-terracotta bg-terracotta-soft' : 'border-line bg-card hover:border-terracotta/50'
                }`}
              >
                <span aria-hidden className={`size-6 rounded-full shadow-lift plan-${option.color}`} />
                <span className="text-sm font-bold">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer rounded-card bg-cream px-4 py-3">
        <input
          type="checkbox"
          checked={value.remindersEnabled}
          onChange={(e) => set({ remindersEnabled: e.target.checked })}
          className="mt-1 size-4 accent-terracotta"
        />
        <span>
          <span className="font-bold">Send reminders</span>
          <span className="block text-sm text-ink-soft mt-0.5">{REMINDER_SCHEDULE_COPY}</span>
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer rounded-card bg-cream px-4 py-3">
        <input
          type="checkbox"
          checked={value.openTable}
          onChange={(e) => set({ openTable: e.target.checked })}
          className="mt-1 size-4 accent-terracotta"
        />
        <span>
          <span className="font-bold">Open Table</span>
          <span className="block text-sm text-ink-soft mt-0.5">
            If seats stay empty, friends of your guests can ask to join. You approve every request.
            {!hasCapacity && ' It needs a capacity above, so there are seats to offer.'}
          </span>
        </span>
      </label>

      <div className="space-y-2">
        <p className={`text-plate text-plate-inset ${FIELD_LABEL}`}>Questions for guests</p>
        <p className="text-plate text-plate-inset text-xs text-ink-faint -mt-1">
          Asked when someone says yes. You can add questions; the ones already asked stay as they
          are, and people who already answered aren’t asked again.
        </p>
        {existingQuestions.length > 0 && (
          <ul className="space-y-1 text-sm text-ink-soft">
            {existingQuestions.map((prompt, i) => (
              <li key={i} className="rounded-card bg-cream px-3 py-2">{prompt}</li>
            ))}
          </ul>
        )}
        {value.newQuestions.map((question, index) => (
          <div key={index} className="space-y-2 rounded-card border border-line bg-paper p-3">
            <div className="flex items-center gap-2">
              <input
                value={question.prompt}
                onChange={(e) => setQuestion(index, { prompt: e.target.value })}
                placeholder="Dietary needs? What are you bringing?"
                aria-label={`New question ${index + 1}`}
                maxLength={200}
                className={SMALL_FIELD}
              />
              <button
                type="button"
                aria-label={`Remove new question ${index + 1}`}
                onClick={() => set({ newQuestions: value.newQuestions.filter((_, i) => i !== index) })}
                className="text-ink-faint hover:text-rose-deep px-1"
              >
                <Glyph emoji="✕" size={14} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-ink-soft">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={question.kind === 'choice'}
                  onChange={(e) =>
                    setQuestion(index, {
                      kind: e.target.checked ? 'choice' : 'text',
                      options: e.target.checked && question.options.length === 0 ? ['', ''] : question.options,
                    })
                  }
                  className="size-3.5 accent-terracotta"
                />
                Multiple choice
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={question.required}
                  onChange={(e) => setQuestion(index, { required: e.target.checked })}
                  className="size-3.5 accent-terracotta"
                />
                Required
              </label>
            </div>
            {question.kind === 'choice' && (
              <div className="space-y-1.5">
                {question.options.map((option, optionIndex) => (
                  <input
                    key={optionIndex}
                    value={option}
                    onChange={(e) =>
                      setQuestion(index, {
                        options: question.options.map((o, oi) => (oi === optionIndex ? e.target.value : o)),
                      })
                    }
                    placeholder={`Option ${optionIndex + 1}`}
                    aria-label={`New question ${index + 1} option ${optionIndex + 1}`}
                    maxLength={120}
                    className={SMALL_FIELD}
                  />
                ))}
                {question.options.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setQuestion(index, { options: [...question.options, ''] })}
                    className="text-xs font-semibold text-terracotta-deep"
                  >
                    + Add option
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {roomForQuestions && (
          <button
            type="button"
            onClick={() =>
              set({
                newQuestions: [
                  ...value.newQuestions,
                  { prompt: '', required: false, kind: 'text', options: [] },
                ],
              })
            }
            className="rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft hover:border-terracotta hover:text-terracotta-deep"
          >
            + Add a question
          </button>
        )}
      </div>

      {fixedRules.length > 0 && (
        <p className="text-plate text-plate-inset text-xs text-ink-faint">
          Set when the plan was made, and staying that way: {fixedRules.join(' · ')}.
        </p>
      )}
    </div>
  );
}
