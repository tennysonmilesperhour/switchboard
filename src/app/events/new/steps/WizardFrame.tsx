'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { canJumpTo, previousStep } from '@/lib/wizard-steps';
import { STEP_META, type WizardStepKey } from './wizard-types';

interface WizardFrameProps {
  /** The steps this plan goes through, in order (`wizardSteps`). */
  steps: readonly WizardStepKey[];
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
  steps,
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
  const current = STEP_META[steps[step]];
  const previousLabel = STEP_META[steps[previousStep(step)]].label;
  return (
    <div className="space-y-6">
      <ol aria-label="Steps" className="flex items-center gap-1.5">
        {steps.map((key, index) => {
          const label = STEP_META[key].label;
          const reachable = canJumpTo(index, step, stepComplete);
          return (
            <li key={key} className="flex-1">
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

      {/* `text-plate` is inert on every ordinary theme; under a photo
          wallpaper it puts this whole header on a surface instead of on the
          picture. It is the largest type in the wizard and it had none — which
          is what "I'm still having a hard time seeing this text" was circling.
          The block wraps the step label, the back link, the heading and the
          sub, so the plate is one shape rather than four. */}
      <header key={step} className="text-plate text-plate-inset animate-rise">
        <div className="flex items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta-deep">
            Step {step + 1} of {steps.length}
          </p>
          {step > 0 && (
            <button
              type="button"
              onClick={() => goToStep(previousStep(step))}
              className="inline-flex items-center gap-1 rounded-pill text-xs font-bold text-ink-soft outline-none transition-colors hover:text-terracotta-deep focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
                <path d="M14.7 6.7 13.3 5.3 6.6 12l6.7 6.7 1.4-1.4-5.3-5.3z" />
              </svg>
              Back to {previousLabel}
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
          {current.heading}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          {current.sub}
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
        {step < steps.length - 1 ? (
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
