'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { canJumpTo, previousStep } from '@/lib/wizard-steps';
import { STEPS, STEP_META } from './wizard-types';

interface WizardFrameProps {
  step: number;
  stepComplete: boolean[];
  goToStep: (step: number) => void;
  submitError: string | null;
  submitting: boolean;
  enablePoll: boolean;
  submit: () => Promise<void>;
  children: ReactNode;
}

export function WizardFrame({
  step,
  stepComplete,
  goToStep,
  submitError,
  submitting,
  enablePoll,
  submit,
  children,
}: WizardFrameProps) {
  const canNext = stepComplete[step];
  return (
    <div className="space-y-6">
      <ol aria-label="Steps" className="flex items-center gap-1.5">
        {STEPS.map((label, index) => {
          const reachable = canJumpTo(index, step, stepComplete);
          return (
            <li key={label} className="flex-1">
              <button
                type="button"
                disabled={!reachable}
                aria-current={index === step ? 'step' : undefined}
                aria-label={`Step ${index + 1}, ${label}`}
                onClick={() => goToStep(index)}
                title={label}
                className="group flex w-full items-center py-2.5 -my-2.5 outline-none disabled:cursor-default"
              >
                <span
                  className={`h-2 w-full rounded-pill transition-all duration-300 group-focus-visible:ring-2 group-focus-visible:ring-terracotta ${
                    index < step
                      ? 'bg-terracotta'
                      : index === step
                        ? 'bg-brand-gradient'
                        : 'bg-line'
                  } ${reachable ? 'group-hover:opacity-80' : ''}`}
                />
              </button>
            </li>
          );
        })}
      </ol>

      <header key={step} className="animate-rise">
        <div className="flex items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta">
            Step {step + 1} of {STEPS.length}
          </p>
          {step > 0 && (
            <button
              type="button"
              onClick={() => goToStep(previousStep(step))}
              className="inline-flex items-center gap-1 rounded-pill text-xs font-bold text-ink-soft outline-none transition-colors hover:text-terracotta focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
                <path d="M14.7 6.7 13.3 5.3 6.6 12l6.7 6.7 1.4-1.4-5.3-5.3z" />
              </svg>
              Back to {STEPS[previousStep(step)]}
            </button>
          )}
        </div>
        <h2
          className={`mt-2 tracking-tight text-ink ${
            step === 0
              ? 'text-[2.5rem] leading-[1.05] font-black'
              : 'text-[1.75rem] leading-tight font-extrabold'
          }`}
        >
          {STEP_META[step].heading}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          {STEP_META[step].sub}
        </p>
      </header>

      {children}

      {submitError && (
        <p
          role="alert"
          className="rounded-card bg-rose-soft text-rose-deep text-sm font-semibold p-3.5"
        >
          {submitError}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        {step > 0 && (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => goToStep(previousStep(step))}
          >
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            size="lg"
            className="flex-1"
            disabled={!canNext}
            onClick={() => goToStep(step + 1)}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="flex-1"
            disabled={submitting}
            onClick={submit}
          >
            {submitting
              ? 'Creating…'
              : enablePoll
                ? 'Create & start deciding'
                : 'Send invitations'}
          </Button>
        )}
      </div>
    </div>
  );
}
