'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/Button';
import { ImageInput } from '@/components/ui/ImageInput';
import { TimeSelect } from '@/components/ui/TimeSelect';
import { DescribePlan } from '@/components/events/DescribePlan';
import { ImportFromLink } from '@/components/events/ImportFromLink';
import { PlaceSearchInput } from '@/components/events/PlaceSearchInput';
import type { PlanDraft } from '@/lib/actions/plan';
import type { ImportResult } from '@/lib/actions/import';
import {
  RECURRENCE_CHOICES,
  type RecurrenceKind,
} from '@/lib/engine/recurrence';
import { hasInviteDetails } from '@/lib/event-details';
import {
  FIELD,
  FIELD_LABEL,
  type LocationPoint,
  type WizardQuestion,
} from './wizard-types';

interface BasicsStepProps {
  userId: string;
  applyDraft: (draft: PlanDraft) => void;
  applyImport: (result: ImportResult) => void;
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
  date: string;
  setDate: Dispatch<SetStateAction<string>>;
  minDate: string;
  time: string;
  setTime: Dispatch<SetStateAction<string>>;
  endTime: string;
  setEndTime: Dispatch<SetStateAction<string>>;
  startsInPast: boolean;
  /** The end time equals the start: zero hours or twenty-four, so refused. */
  endsBeforeStart: boolean;
  /** The end is earlier on the clock than the start, so it is the next day. */
  endsNextDay: boolean;
  /** Why the spots field cannot be used, or null. */
  capacityError: string | null;
  recurrence: RecurrenceKind;
  setRecurrence: Dispatch<SetStateAction<RecurrenceKind>>;
  customDays: string;
  setCustomDays: Dispatch<SetStateAction<string>>;
  locationName: string;
  setLocationName: Dispatch<SetStateAction<string>>;
  locationPoint: LocationPoint;
  setLocationPoint: Dispatch<SetStateAction<LocationPoint>>;
  description: string;
  setDescription: Dispatch<SetStateAction<string>>;
  capacity: string;
  setCapacity: Dispatch<SetStateAction<string>>;
  coverUrl: string;
  setCoverUrl: Dispatch<SetStateAction<string>>;
  wishlistUrl: string;
  setWishlistUrl: Dispatch<SetStateAction<string>>;
  questions: WizardQuestion[];
  setQuestions: Dispatch<SetStateAction<WizardQuestion[]>>;
}

export function BasicsStep({
  userId,
  applyDraft,
  applyImport,
  title,
  setTitle,
  date,
  setDate,
  minDate,
  time,
  setTime,
  endTime,
  setEndTime,
  startsInPast,
  endsBeforeStart,
  endsNextDay,
  capacityError,
  recurrence,
  setRecurrence,
  customDays,
  setCustomDays,
  locationName,
  setLocationName,
  locationPoint,
  setLocationPoint,
  description,
  setDescription,
  capacity,
  setCapacity,
  coverUrl,
  setCoverUrl,
  wishlistUrl,
  setWishlistUrl,
  questions,
  setQuestions,
}: BasicsStepProps) {
  return (
        <div className="space-y-4 animate-rise">
          <DescribePlan onDraft={applyDraft} />
          <ImportFromLink onImport={applyImport} />
          <div className="space-y-1.5">
            <label htmlFor="title" className="sr-only">What is the plan?</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Coffee downtown, Game night, Saturday hike…"
              className="w-full rounded-card border-2 border-line bg-card px-5 py-4 text-xl font-semibold text-ink outline-none transition-colors placeholder:font-normal placeholder:text-ink-faint focus:border-terracotta focus:ring-4 focus:ring-terracotta-soft"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 min-w-0">
              <label htmlFor="date" className={FIELD_LABEL}>Date</label>
              <input
                id="date" type="date" value={date}
                min={minDate || undefined}
                onChange={(e) => setDate(e.target.value)}
                className={`${FIELD} min-w-0 appearance-none [color-scheme:light]`}
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <label htmlFor="time" className={FIELD_LABEL}>Start</label>
              <TimeSelect id="time" value={time} onChange={setTime} className="min-w-0" />
            </div>
            <div className="space-y-1.5 min-w-0 sm:col-span-2">
              <label htmlFor="endTime" className={FIELD_LABEL}>
                Ends <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <TimeSelect
                id="endTime"
                value={endTime}
                onChange={setEndTime}
                emptyLabel="No end time"
                className="min-w-0"
              />
            </div>
          </div>
          {startsInPast && (
            <p role="alert" className="text-plate text-plate-inset text-sm font-medium text-rose-deep">
              That date and time have already passed. Pick a moment in the future.
            </p>
          )}
          {endsBeforeStart && (
            <p role="alert" className="text-plate text-plate-inset text-sm font-medium text-rose-deep">
              The end time is the same as the start. Pick when it wraps up, or
              leave it as &ldquo;No end time&rdquo;.
            </p>
          )}
          {/* An end earlier on the clock than the start is a late night, not a
              mistake: said out loud so the host can see which day it lands on. */}
          {endsNextDay && (
            <p className="text-plate text-plate-inset text-sm text-ink-soft">
              🌙 Ends the next day, after midnight.
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="recurrence" className={FIELD_LABEL}>
              Repeats?
            </label>
            <div className="flex gap-2">
              <select
                id="recurrence"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrenceKind)}
                className={`${FIELD} flex-1`}
              >
                {RECURRENCE_CHOICES.map((choice) => (
                  <option key={choice.kind} value={choice.kind}>
                    {choice.label}
                  </option>
                ))}
              </select>
              {recurrence === 'custom' && (
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm text-ink-soft">every</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    aria-label="Repeat every how many days"
                    className={`${FIELD} w-20`}
                  />
                  <span className="text-sm text-ink-soft">days</span>
                </span>
              )}
            </div>
            {recurrence !== 'none' && (
              <p className="text-plate text-plate-inset text-xs text-ink-faint">
                🔁 We’ll tag this as a standing plan. When it’s behind you, one
                tap gathers the same crew for the next one.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="location" className={FIELD_LABEL}>
              Where?
            </label>
            <PlaceSearchInput
              id="location"
              value={locationName}
              onChange={setLocationName}
              onPointChange={setLocationPoint}
              pinned={locationPoint !== null}
              placeholder="Café Luna, my place, Miller Park…"
              className={FIELD}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="description" className={FIELD_LABEL}>
              Details
            </label>
            <textarea
              id="description" value={description} rows={3}
              onChange={(e) => setDescription(e.target.value)}
              className={`${FIELD} resize-none`}
            />
          </div>
          <p
            className={`text-plate text-plate-inset text-xs ${
              hasInviteDetails(locationName, description)
                ? 'text-ink-faint'
                : 'font-semibold text-terracotta-deep'
            }`}
          >
            Add at least a location or a short detail so people know what
            they’re responding to.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="capacity" className={FIELD_LABEL}>
              How many spots? <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            {/* What blank means depends on the rhythm picked two steps later:
                no limit for everyone at once or in waves, one spot when asking
                one at a time. "Leave blank for one-on-one" was only true of the
                last, and read wrong on a plan sent to a whole group. */}
            <input
              id="capacity" type="number" min={1} step={1} value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="No limit"
              aria-invalid={capacityError !== null}
              aria-describedby={capacityError ? 'capacity-hint capacity-error' : 'capacity-hint'}
              className={`${FIELD} w-36`}
            />
            <p id="capacity-hint" className="text-plate text-plate-inset text-xs text-ink-faint">
              Leave it blank for no limit. If you ask people one at a time, the
              first yes fills it.
            </p>
            {capacityError && (
              <p
                id="capacity-error"
                role="alert"
                className="text-plate text-plate-inset text-sm font-medium text-rose-deep"
              >
                {capacityError}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <p className={`text-plate text-plate-inset ${FIELD_LABEL}`}>
              Cover image <span className="font-normal text-ink-faint">(optional)</span>
            </p>
            <ImageInput
              userId={userId}
              value={coverUrl}
              onChange={setCoverUrl}
              pathPrefix="event-cover"
              label="cover image"
              aspect="video"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="wishlist" className={FIELD_LABEL}>
              Wishlist or registry link <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <input
              id="wishlist" type="url" value={wishlistUrl}
              onChange={(e) => setWishlistUrl(e.target.value)}
              placeholder="https://…"
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <p className={`text-plate text-plate-inset ${FIELD_LABEL}`}>
              Questions for guests <span className="font-normal text-ink-faint">(optional)</span>
            </p>
            <p className="text-plate text-plate-inset text-xs text-ink-faint -mt-0.5">
              Asked when someone accepts. Only you see the answers.
            </p>
            {questions.map((question, index) => {
              const updateQuestion = (
                patch: Partial<(typeof questions)[number]>,
              ) =>
                setQuestions((current) =>
                  current.map((q, i) => (i === index ? { ...q, ...patch } : q)),
                );
              return (
                <div
                  key={index}
                  className="space-y-2 rounded-card border border-line bg-paper p-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={question.prompt}
                      onChange={(e) => updateQuestion({ prompt: e.target.value })}
                      placeholder="Dietary needs? What are you bringing?"
                      aria-label={`Question ${index + 1}`}
                      className="flex-1 rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft"
                    />
                    <button
                      type="button"
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() =>
                        setQuestions((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                      className="text-ink-faint hover:text-rose-deep px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="inline-flex rounded-pill border border-line p-0.5 text-xs font-semibold">
                      {(['text', 'choice'] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          aria-pressed={question.kind === kind}
                          onClick={() =>
                            updateQuestion({
                              kind,
                              // Seed two blank options the first time a question
                              // becomes multiple choice.
                              options:
                                kind === 'choice' && question.options.length === 0
                                  ? ['', '']
                                  : question.options,
                            })
                          }
                          className={`rounded-pill px-2.5 py-1 transition-colors ${
                            question.kind === kind
                              ? 'bg-terracotta text-white'
                              : 'text-ink-soft'
                          }`}
                        >
                          {kind === 'text' ? 'Text' : 'Multiple choice'}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-ink-soft whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(e) =>
                          updateQuestion({ required: e.target.checked })
                        }
                        className="size-3.5 accent-terracotta"
                      />
                      Required
                    </label>
                  </div>
                  {question.kind === 'choice' && (
                    <div className="space-y-1.5">
                      {question.options.map((option, optionIndex) => (
                        <div
                          key={optionIndex}
                          className="flex items-center gap-2"
                        >
                          <span aria-hidden className="text-ink-faint text-sm">
                            ○
                          </span>
                          <input
                            value={option}
                            onChange={(e) =>
                              updateQuestion({
                                options: question.options.map((o, oi) =>
                                  oi === optionIndex ? e.target.value : o,
                                ),
                              })
                            }
                            placeholder={`Option ${optionIndex + 1}`}
                            aria-label={`Question ${index + 1} option ${optionIndex + 1}`}
                            className="flex-1 rounded-card border border-line bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft"
                          />
                          {question.options.length > 2 && (
                            <button
                              type="button"
                              aria-label={`Remove option ${optionIndex + 1}`}
                              onClick={() =>
                                updateQuestion({
                                  options: question.options.filter(
                                    (_, oi) => oi !== optionIndex,
                                  ),
                                })
                              }
                              className="text-ink-faint hover:text-rose-deep px-1"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {question.options.length < 10 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateQuestion({
                              options: [...question.options, ''],
                            })
                          }
                          className="pl-6 text-xs font-semibold text-terracotta-deep hover:text-terracotta-deep"
                        >
                          + Add option
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {questions.length < 5 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setQuestions((current) => [
                    ...current,
                    { prompt: '', required: false, kind: 'text', options: [] },
                  ])
                }
              >
                + Add a question
              </Button>
            )}
          </div>
        </div>
  );
}
