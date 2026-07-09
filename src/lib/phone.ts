const NON_DIGIT = /\D/g;

export function normalizePhoneNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(NON_DIGIT, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (trimmed.startsWith('+') && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function looksLikePhoneNumber(value: string | null | undefined): value is string {
  return normalizePhoneNumber(value) !== null;
}
