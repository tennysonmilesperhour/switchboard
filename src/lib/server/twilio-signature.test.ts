import { describe, expect, test } from 'vitest';
import { expectedTwilioSignature, isValidTwilioSignature } from './twilio-signature';

describe('Twilio request signatures', () => {
  test('matches Twilio\'s published form-encoded request vector', () => {
    const form = new URLSearchParams({
      Digits: '1234',
      To: '+18005551212',
      From: '+14158675310',
      Caller: '+14158675310',
      CallSid: 'CA1234567890ABCDE',
    });
    const url = 'https://example.com/myapp.php?foo=1&bar=2';

    expect(expectedTwilioSignature('12345', url, form)).toBe(
      'L/OH5YylLD5NRKLltdqwSvS0BnU=',
    );
    expect(isValidTwilioSignature({
      authToken: '12345',
      signature: 'L/OH5YylLD5NRKLltdqwSvS0BnU=',
      url,
      form,
    })).toBe(true);
  });

  test('rejects a changed field and handles repeated values deterministically', () => {
    const form = new URLSearchParams();
    form.append('MediaUrl', 'b');
    form.append('MediaUrl', 'a');
    form.append('MediaUrl', 'a');
    const signature = expectedTwilioSignature('secret', 'https://example.com/inbound', form);

    form.set('Body', 'tampered');
    expect(isValidTwilioSignature({
      authToken: 'secret',
      signature,
      url: 'https://example.com/inbound',
      form,
    })).toBe(false);
  });
});
