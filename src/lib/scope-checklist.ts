/** Stable ids on the client checklist. A test keeps these tied to the actual page. */
export const SCOPE_ITEM_IDS = [
  'A1', 'A2', 'A3', 'A4',
  'B1', 'B2', 'B3',
  'C1', 'C2', 'C3',
  'D1', 'D2', 'D3',
  'E1', 'E2', 'E3',
  'F1', 'F2', 'F3',
  'G1', 'G2',
  'H1', 'H2', 'H3', 'H4',
  'I1', 'I2', 'I3', 'I4',
  'J1', 'J2', 'J3', 'J4', 'J5', 'J6',
  'K1', 'K2', 'K3', 'K4', 'K5', 'K6',
] as const;

export function isScopeItemId(value: string): boolean {
  return (SCOPE_ITEM_IDS as readonly string[]).includes(value);
}
