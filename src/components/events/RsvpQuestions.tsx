'use client';

export interface RsvpQuestion {
  id: string;
  prompt: string;
  required: boolean;
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
      {questions.map((question) => (
        <div key={question.id} className="space-y-1">
          <label
            htmlFor={`q-${question.id}`}
            className="text-sm font-semibold text-ink"
          >
            {question.prompt}
            {question.required && <span className="text-terracotta"> *</span>}
          </label>
          <input
            id={`q-${question.id}`}
            value={values[question.id] ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(question.id, e.target.value)}
            className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft disabled:opacity-60"
          />
        </div>
      ))}
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
