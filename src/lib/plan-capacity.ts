/**
 * How many spots a plan has, checked where the host types it.
 *
 * `events.capacity` carries `CHECK (capacity > 0)` and the create function
 * casts it with `::int`, so "0", "-2" or "2.5" reached the database and came
 * back as a failed insert - "Something went wrong publishing your plan", coded
 * as an operator fault, with no hint that the number was the problem. The edit
 * path already refused these with a sentence; creating a plan now does too, in
 * the same words, from one rule.
 */

export const CAPACITY_MESSAGE = 'Spots must be a whole number of at least 1.';

/** Why this value cannot be a plan's capacity, or null when it can (or is blank). */
export function capacityProblem(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) return CAPACITY_MESSAGE;
  return null;
}
