import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Twilio signs the exact configured URL followed by every form field sorted
 * case-sensitively by name. Repeated values are unique and sorted, matching
 * Twilio's maintained Node helper.
 */
export function expectedTwilioSignature(
  authToken: string,
  url: string,
  form: URLSearchParams,
): string {
  const valuesByName = new Map<string, Set<string>>();
  for (const [name, value] of form.entries()) {
    const values = valuesByName.get(name) ?? new Set<string>();
    values.add(value);
    valuesByName.set(name, values);
  }

  let payload = url;
  for (const name of [...valuesByName.keys()].sort()) {
    for (const value of [...(valuesByName.get(name) ?? [])].sort()) {
      payload += `${name}${value}`;
    }
  }
  return createHmac('sha1', authToken).update(payload, 'utf8').digest('base64');
}

export function isValidTwilioSignature(input: {
  authToken: string;
  signature: string;
  url: string;
  form: URLSearchParams;
}): boolean {
  const expected = Buffer.from(
    expectedTwilioSignature(input.authToken, input.url, input.form),
    'utf8',
  );
  const received = Buffer.from(input.signature, 'utf8');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
