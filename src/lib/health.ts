export const EXPECTED_SCHEMA_VERSION = '20260902015913';

export interface EvaluatedSchemaStatus {
  current: string | null;
  healthy: boolean;
  missing: string[];
}

/**
 * Turn the privileged database probe into the small, explicit contract exposed
 * by `/api/health`. Keep this pure so a missing production column can be tested
 * without importing the route's server clients.
 */
export function evaluateSchemaStatus(
  value: unknown,
  error: unknown,
): EvaluatedSchemaStatus {
  const status =
    value !== null && typeof value === 'object'
      ? (value as { complete?: unknown; current?: unknown; missing?: unknown })
      : null;
  const current = typeof status?.current === 'string' ? status.current : null;
  const missing = Array.isArray(status?.missing)
    ? status.missing.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : [];

  return {
    current,
    missing,
    healthy:
      !error &&
      status?.complete === true &&
      current === EXPECTED_SCHEMA_VERSION &&
      missing.length === 0,
  };
}
