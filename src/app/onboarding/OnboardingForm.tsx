'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { completeOnboarding } from '@/lib/actions/profile';
import { Button } from '@/components/ui/Button';
import { InterestPicker } from '@/components/profile/InterestPicker';
import { INTEREST_CATEGORIES, DOWN_TO_GROUP } from '@/lib/interests';
import Link from 'next/link';
import { COMMUNITY_COVENANT_SUMMARY } from '@/lib/legal';
import { Chip } from '@/components/ui/Chip';
import { GENDERS, GENDER_LABEL, SELVES, itemKey, type Self } from '@/lib/discovery-lanes';
import { LANE_CARDS, MAX_TOP_PICKS } from '@/lib/onboarding-discovery';

interface OnboardingFormProps {
  initialName: string;
  initialHandle: string;
  next?: string;
  /** The `?error=` the last submission came back with. */
  error?: string;
  /**
   * A username sign-up: offer the optional recovery-email step, because
   * without a verified email a forgotten password cannot be reset.
   */
  askRecoveryEmail?: boolean;
}

/** Errors about fields on step 1, which later steps cannot show or fix. */
const STEP_ONE_ERRORS = new Set(['name', 'handle', 'handle_taken', 'agreement']);
/** Errors about the recovery step. */
const RECOVERY_ERRORS = new Set(['recovery_email']);

/** Step 1: who you are. 2: what you're here for. 3: interests. 4: recovery. */
type Step = 1 | 2 | 3 | 4;

/**
 * One form, a few light steps. Everything stays mounted (hidden, not
 * unmounted) so the single `completeOnboarding` submission still carries every
 * field; step 1 holds all the `required` inputs, so `reportValidity()` gates
 * the Continue button without touching the optional steps after it.
 */
export function OnboardingForm({
  initialName,
  initialHandle,
  next = '/',
  error,
  askRecoveryEmail = false,
}: OnboardingFormProps) {
  const steps = askRecoveryEmail ? 4 : 3;
  const [step, setStep] = useState<Step>(1);
  // A failed save redirects back here with only the query string changed, so
  // this component stays mounted. Return to the step that holds the field the
  // error names instead of leaving the reader on step 2, unable to see it.
  const [seenError, setSeenError] = useState(error);
  if (error !== seenError) {
    setSeenError(error);
    if (error && STEP_ONE_ERRORS.has(error)) setStep(1);
    if (error && askRecoveryEmail && RECOVERY_ERRORS.has(error)) setStep(4);
  }
  const formRef = useRef<HTMLFormElement>(null);
  const recoveryRef = useRef<HTMLInputElement>(null);
  const [lanes, setLanes] = useState<Self[]>([]);
  // Picked interests and activities, as discovery item keys, so the top-three
  // row can offer exactly what was picked. A pick that is deselected falls out
  // of the top three with it.
  const [picked, setPicked] = useState<{ interests: string[]; downTo: string[] }>({
    interests: [],
    downTo: [],
  });
  const [top, setTop] = useState<string[]>([]);
  const pickedKeys = [
    ...picked.interests.map((label) => ({ key: itemKey('interest', label), label })),
    ...picked.downTo.map((label) => ({ key: itemKey('down_to', label), label })),
  ];
  const liveTop = top.filter((key) => pickedKeys.some((item) => item.key === key));

  function toggleLane(self: Self) {
    setLanes((current) =>
      current.includes(self) ? current.filter((lane) => lane !== self) : [...current, self],
    );
  }

  function toggleTop(key: string) {
    setTop((current) => {
      const live = current.filter((k) => pickedKeys.some((item) => item.key === k));
      if (live.includes(key)) return live.filter((k) => k !== key);
      if (live.length >= MAX_TOP_PICKS) return live;
      return [...live, key];
    });
  }

  function goTo(next: Step) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }
  // Normalize the handle to lowercase as it's typed so the validated value
  // matches what the user sees. The `lowercase` CSS class only changes the
  // display, so without this the browser would reject a value that looks valid.
  const [handle, setHandle] = useState(initialHandle.toLowerCase());
  // Set after mount to avoid a server/client hydration mismatch.
  const [timezone, setTimezone] = useState('UTC');
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function continueFromStepOne() {
    if (formRef.current?.reportValidity()) goTo(2);
  }

  return (
    <form
      ref={formRef}
      action={completeOnboarding}
      className="mt-6 space-y-6"
    >
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="timezone" value={timezone} />
      <p className="text-xs font-bold uppercase tracking-widest text-ink-faint">
        Step {step} of {steps}
      </p>

      <div hidden={step !== 1} className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="display_name" className="text-sm font-medium text-ink">
            Your name
          </label>
          <input
            id="display_name"
            name="display_name"
            required
            pattern=".*\S.*"
            title="Add your name."
            defaultValue={initialName}
            placeholder="Alex Rivera"
            className="w-full rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="handle" className="text-sm font-medium text-ink">
            Handle
          </label>
          <div className="flex items-center rounded-card border border-line bg-card focus-within:border-terracotta transition-colors">
            <span className="pl-4 text-ink-faint">@</span>
            <input
              id="handle"
              name="handle"
              required
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              pattern="[a-z0-9_]{3,24}"
              title="Use 3–24 lowercase letters, numbers, or underscores."
              placeholder="alexr"
              className="flex-1 bg-transparent px-1.5 py-3 outline-none lowercase"
            />
          </div>
          <p className="text-xs text-ink-faint">
            Lowercase letters, numbers, and underscores.
          </p>
        </div>

        <p className="rounded-card bg-cream p-4 text-sm text-ink-soft leading-relaxed">
          We’ll set up three private circles — <strong>Close Friends</strong>,{' '}
          <strong>Family</strong>, and <strong>Neighbors</strong> — for choosing
          who sees what. Adjust them anytime in People.
        </p>

        <div className="rounded-card border border-line bg-card p-4 text-sm text-ink-soft">
          <p className="font-bold text-ink">Community Covenant</p>
          <ul className="mt-3 space-y-1.5">
            {COMMUNITY_COVENANT_SUMMARY.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="text-terracotta-deep">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <label className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              name="community_agreement"
              required
              className="mt-1 size-4 accent-terracotta"
            />
            <span>
              I agree to use Switchboard with kindness, curiosity, openness,
              generous assumptions, and respect for each matching context.
            </span>
          </label>
          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              name="terms_agreement"
              required
              className="mt-1 size-4 accent-terracotta"
            />
            <span>
              I confirm I am at least 18 years old and agree to the{' '}
              <Link href="/terms" className="font-bold text-terracotta-deep">Terms</Link>
              ,{' '}
              <Link href="/privacy" className="font-bold text-terracotta-deep">Privacy Notice</Link>
              , and{' '}
              <Link href="/community" className="font-bold text-terracotta-deep">Community Covenant</Link>
              .
            </span>
          </label>
        </div>

        <Button type="button" size="lg" className="w-full" onClick={continueFromStepOne}>
          Continue
        </Button>
      </div>

      <div hidden={step !== 2} className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-ink">What are you here for?</h2>
          <p className="text-sm text-ink-soft leading-relaxed">
            Pick any that fit. You can change this anytime in Discover.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-card border border-line bg-cream p-4">
          <div className="flex-1">
            <p className="text-sm font-bold text-ink">Plans with people I already know</p>
            <p className="text-sm text-ink-soft">Friends, family, and your circles.</p>
          </div>
          <span className="rounded-pill bg-card px-2 py-0.5 text-xs font-bold text-ink-faint">
            Always on
          </span>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-ink mb-1">
            Open to meeting new people?{' '}
            <span className="text-ink-faint font-normal">(optional)</span>
          </legend>
          {SELVES.map((self) => (
            <label
              key={self}
              className={`flex items-start gap-3 rounded-card border p-4 transition-colors ${
                lanes.includes(self) ? 'border-terracotta bg-card' : 'border-line bg-card'
              }`}
            >
              <input
                type="checkbox"
                name="lanes"
                value={self}
                checked={lanes.includes(self)}
                onChange={() => toggleLane(self)}
                className="mt-1 size-4 accent-terracotta"
              />
              <span>
                <span className="block text-sm font-bold text-ink">{LANE_CARDS[self].label}</span>
                <span className="block text-sm text-ink-soft">{LANE_CARDS[self].blurb}</span>
              </span>
            </label>
          ))}
          {lanes.length > 0 ? (
            <p className="rounded-card bg-cream p-3 text-sm text-ink-soft leading-relaxed">
              People outside your circles who share your interests can find you
              in Discover, only in the lanes you picked. Nobody learns you’re
              interested in them unless it’s mutual.
            </p>
          ) : null}
        </fieldset>

        {lanes.includes('dating') ? (
          <div className="space-y-4 rounded-card border border-line bg-card p-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink">
                I am{' '}
                <span className="text-ink-faint font-normal">(optional)</span>
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {GENDERS.map((gender) => (
                  <label key={gender} className="flex items-center gap-2 text-sm text-ink-soft">
                    <input
                      type="radio"
                      name="identifies_as"
                      value={gender}
                      className="size-4 accent-terracotta"
                    />
                    {GENDER_LABEL[gender]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink">
                Interested in{' '}
                <span className="text-ink-faint font-normal">(optional, leave blank for anyone)</span>
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {GENDERS.map((gender) => (
                  <label key={gender} className="flex items-center gap-2 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      name="interested_in"
                      value={gender}
                      className="size-4 accent-terracotta"
                    />
                    {GENDER_LABEL[gender]}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        <Button type="button" size="lg" className="w-full" onClick={() => goTo(3)}>
          Continue
        </Button>
        <button
          type="button"
          onClick={() => goTo(1)}
          className="w-full text-center text-sm font-bold text-ink-faint hover:text-ink"
        >
          ← Back
        </button>
      </div>

      <div hidden={step !== 3} className="space-y-6">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-ink mb-1">
            What do you enjoy?{' '}
            <span className="text-ink-faint font-normal">(optional)</span>
          </legend>
          <p className="text-sm text-ink-soft leading-relaxed">
            Pick a few to start — you can add more anytime in Settings.
          </p>
          <InterestPicker
            name="interests"
            groups={INTEREST_CATEGORIES}
            onChange={(interests) => setPicked((current) => ({ ...current, interests }))}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-ink mb-1">
            What are you usually down to do?{' '}
            <span className="text-ink-faint font-normal">(optional)</span>
          </legend>
          <InterestPicker
            name="down_to"
            groups={[DOWN_TO_GROUP]}
            searchable={false}
            onChange={(downTo) => setPicked((current) => ({ ...current, downTo }))}
          />
        </fieldset>

        {pickedKeys.length > 0 ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-ink mb-1">
              Which matter most?{' '}
              <span className="text-ink-faint font-normal">(up to {MAX_TOP_PICKS}, optional)</span>
            </legend>
            <p className="text-sm text-ink-soft leading-relaxed">
              We’ll lean on these when suggesting plans and people.
            </p>
            <div className="flex flex-wrap gap-2">
              {pickedKeys.map(({ key, label }) => {
                const starred = liveTop.includes(key);
                return (
                  <Chip
                    key={key}
                    selected={starred}
                    emoji={starred ? '✦' : undefined}
                    disabled={!starred && liveTop.length >= MAX_TOP_PICKS}
                    onClick={() => toggleTop(key)}
                  >
                    {label}
                  </Chip>
                );
              })}
            </div>
            {liveTop.map((key) => (
              <input key={key} type="hidden" name="top" value={key} />
            ))}
          </fieldset>
        ) : null}

        {askRecoveryEmail ? (
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => goTo(4)}
          >
            Continue
          </Button>
        ) : (
          <SubmitButton />
        )}
        <button
          type="button"
          onClick={() => goTo(2)}
          className="w-full text-center text-sm font-bold text-ink-faint hover:text-ink"
        >
          ← Back
        </button>
      </div>

      {askRecoveryEmail && (
        <div hidden={step !== 4} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="recovery_email" className="text-sm font-medium text-ink">
              A recovery email{' '}
              <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <p className="text-sm text-ink-soft leading-relaxed">
              You signed up with a username, so if you ever forget your password this is the
              only way back in. We’ll send a link to confirm it’s yours; nobody else sees it.
            </p>
            <input
              ref={recoveryRef}
              id="recovery_email"
              name="recovery_email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta transition-colors"
            />
            <p className="text-xs text-ink-faint">
              You can add or change it later in Settings.
            </p>
          </div>
          <SubmitButton />
          <SkipRecoveryButton
            onSkip={() => {
              if (recoveryRef.current) recoveryRef.current.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => goTo(3)}
            className="w-full text-center text-sm font-bold text-ink-faint hover:text-ink"
          >
            ← Back
          </button>
        </div>
      )}
    </form>
  );
}

/**
 * Pending comes from the form's own submission, so it clears when the action
 * settles (including a redirect back with an error) rather than sticking.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Saving…' : 'Start connecting'}
    </Button>
  );
}

/** Finish without a recovery email: clears the field, then submits. */
function SkipRecoveryButton({ onSkip }: { onSkip: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={onSkip}
      className="w-full text-center text-sm font-bold text-ink-soft hover:text-ink"
    >
      Skip for now
    </button>
  );
}
