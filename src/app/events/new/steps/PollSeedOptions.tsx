'use client';

import { useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { MAX_SEED_OPTIONS } from '@/lib/poll-notices';
import { OPTION_LABEL_MAX, ideaKey } from '@/lib/poll-option-input';
import { FIELD } from './wizard-types';

interface PollSeedOptionsProps {
  options: string[];
  setOptions: Dispatch<SetStateAction<string[]>>;
}

/**
 * "Float a few options" — what the Help-me-figure-it-out door promises.
 *
 * Optional: leave it empty and the group starts from a blank list, as before.
 * Whatever is here becomes the first poll's opening ideas when the plan is
 * created (cleaned again on the server, `cleanSeedOptions`), and everyone can
 * add more from the plan page.
 */
export function PollSeedOptions({ options, setOptions }: PollSeedOptionsProps) {
  const [draft, setDraft] = useState('');
  const full = options.length >= MAX_SEED_OPTIONS;

  function add() {
    const text = draft.replace(/\s+/g, ' ').trim();
    if (!text || full) return;
    // A repeat would only split the votes that belong together.
    if (!options.some((option) => ideaKey(option) === ideaKey(text))) {
      setOptions([...options, text]);
    }
    setDraft('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    // Enter adds the idea; it must never submit or advance the wizard.
    event.preventDefault();
    add();
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor="seedOption" className="text-xs font-bold text-ink-soft">
        Float a few options (optional)
      </label>
      <p className="text-xs text-ink-faint">
        Start the list so nobody faces a blank poll. Everyone can add more.
      </p>
      {options.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Options to start with">
          {options.map((option) => (
            <li
              key={option}
              className="inline-flex items-center gap-1 rounded-pill border border-line bg-card py-1 pl-3.5 pr-1 text-sm font-semibold text-ink"
            >
              {option}
              <button
                type="button"
                onClick={() => setOptions(options.filter((entry) => entry !== option))}
                aria-label={`Remove ${option}`}
                className="grid size-8 place-items-center rounded-full text-ink-faint hover:bg-cream hover:text-ink"
              >
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <div className="flex gap-2">
          <input
            id="seedOption"
            value={draft}
            maxLength={OPTION_LABEL_MAX}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="An idea, a place, or a time"
            className={`${FIELD} min-w-0 flex-1 py-2.5 text-sm`}
          />
          <Button size="sm" variant="secondary" onClick={add} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
