/** Maximum number of invite rows a single plan may carry at once. */
export const MAX_INVITEES_PER_EVENT = 100;

/**
 * Shared validation for publish, add-people, and direct-invite actions.
 * PostgreSQL enforces the same ceiling under the event-row lock.
 */
export function canAddInvitees(existing: number, additions: number): boolean {
  return (
    Number.isInteger(existing) &&
    Number.isInteger(additions) &&
    existing >= 0 &&
    additions >= 0 &&
    existing + additions <= MAX_INVITEES_PER_EVENT
  );
}
