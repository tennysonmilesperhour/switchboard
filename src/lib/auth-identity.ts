export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const USERNAME_EMAIL_DOMAIN = 'users.switchboard.local';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '');
}

export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/^@(?!.*@)/, '');
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function isEmailIdentifier(value: string): boolean {
  return EMAIL_PATTERN.test(normalizeIdentifier(value));
}

export function usernameToAuthEmail(value: string): string {
  const username = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Invalid username');
  }
  return `${username}@${USERNAME_EMAIL_DOMAIN}`;
}

export function identifierToAuthEmail(value: string): string {
  const identifier = normalizeIdentifier(value);
  if (isEmailIdentifier(identifier)) return identifier;
  return usernameToAuthEmail(identifier);
}

export function emailToHandleCandidate(value: string): string {
  const localPart = normalizeIdentifier(value).split('@')[0] ?? '';
  const candidate = localPart
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

  if (candidate.length >= 3 && USERNAME_PATTERN.test(candidate)) return candidate;
  return `user_${candidate}`.replace(/_+$/g, '').slice(0, 24).padEnd(6, '0');
}
