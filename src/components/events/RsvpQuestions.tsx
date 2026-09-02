'use client';

export interface RsvpQuestion {
  id: string;
  prompt: string;
  required: boolean;
  /** 'text' (free response) or 'choice' (pick one of `options`). Absent = text. */
  kind?: 'text' | 'choice';
  /** Selectable answers when `kind` is 'choice'. */
  options?: string[];
}

interface RsvpQuestionsProps {
  questions: RsvpQuestion[];
  values: Record<string, string>;
  onChange: (questionId: string, value: string) => void;
  disabled?: boolean;
}

/** Host-defined intake questions shown when accepting an invite. */
export function RsvpQuestions({
  questions,
  values,
  onChange,
  disabled,
}: RsvpQuestionsProps) {
  if (questions.length === 0) return null;
  return (
    <div className="space-y-3 text-left">
      {questions.map((question) => {
        const isChoice =
          question.kind === 'choice' && (question.options?.length ?? 0) > 0;
        return (
          <div key={question.id} className="space-y-1">
            <label
              htmlFor={isChoice ? undefined : `q-${question.id}`}
              className="text-sm font-semibold text-ink"
            >
              {question.prompt}
              {question.required && <span className="text-terracotta-deep"> *</span>}
            </label>
            {isChoice ? (
              <div
                role="radiogroup"
                aria-label={question.prompt}
                className="space-y-1.5 pt-0.5"
              >
                {question.options!.map((option, optionIndex) => (
                  <label
                    key={`${optionIndex}-${option}`}
                    className="flex items-center gap-2 text-sm text-ink cursor-pointer"
                  >
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      value={option}
                      checked={(values[question.id] ?? '') === option}
                      disabled={disabled}
                      onChange={() => onChange(question.id, option)}
                      className="size-4 accent-terracotta disabled:opacity-60"
                    />
                    {option}
                  </label>
                ))}
              </div>
            ) : (
              <input
                id={`q-${question.id}`}
                value={values[question.id] ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(question.id, e.target.value)}
                className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft disabled:opacity-60"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Are all required questions answered? Shared by both RSVP surfaces. */
export function requiredAnswered(
  questions: RsvpQuestion[],
  values: Record<string, string>,
): boolean {
  return questions
    .filter((q) => q.required)
    .every((q) => (values[q.id] ?? '').trim().length > 0);
}
