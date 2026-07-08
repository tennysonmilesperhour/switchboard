export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const USERNAME_EMAIL_DOMAIN = 'users.switchboard.local';

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '');
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function usernameToAuthEmail(value: string): string {
  const username = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Invalid username');
  }
  return `${username}@${USERNAME_EMAIL_DOMAIN}`;
}
