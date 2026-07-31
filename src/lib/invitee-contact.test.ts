import { describe, expect, it } from 'vitest';
import {
  appInviteMessage,
  classifyContact,
  looksLikeContactString,
  mailtoHref,
  messageActionLabel,
  messageHref,
  planInviteMessage,
  smsHref,
  telHref,
} from './invitee-contact';

describe('classifyContact', () => {
  it('reads a phone number into E.164 while keeping what the host typed', () => {
    expect(classifyContact('(555) 123-4567')).toEqual({
      kind: 'phone',
      value: '+15551234567',
      display: '(555) 123-4567',
    });
  });

  it('reads an email address', () => {
    expect(classifyContact('  Ada@Example.com ')).toEqual({
      kind: 'email',
      value: 'Ada@Example.com',
      display: 'Ada@Example.com',
    });
  });

  it('has nothing to offer for a name-only or unusable contact', () => {
    expect(classifyContact(null)).toBeNull();
    expect(classifyContact('   ')).toBeNull();
    expect(classifyContact('Ada Lovelace')).toBeNull();
    // Too short to dial and not an address: better to say "no way to reach
    // them" than to open the messages app on a number that cannot receive.
    expect(classifyContact('555-1212')).toBeNull();
  });
});

describe('looksLikeContactString', () => {
  it('spots a guest whose stored name is really their contact', () => {
    expect(looksLikeContactString('ada@example.com')).toBe(true);
    expect(looksLikeContactString('+1 555 123 4567')).toBe(true);
  });

  it('leaves real names alone', () => {
    expect(looksLikeContactString('Ada Lovelace')).toBe(false);
    expect(looksLikeContactString('')).toBe(false);
    expect(looksLikeContactString(null)).toBe(false);
  });
});

describe('contact hrefs', () => {
  const phone = classifyContact('(555) 123-4567')!;
  const email = classifyContact('ada@example.com')!;
  const message = { subject: 'Sub ject & more', body: 'Line one\nLine two ?&=' };

  it('texts a phone and mails an address', () => {
    expect(messageHref(phone, message)).toBe(smsHref(phone, message));
    expect(messageHref(email, message)).toBe(mailtoHref(email, message));
    expect(messageActionLabel(phone)).toBe('Text');
    expect(messageActionLabel(email)).toBe('Email');
  });

  it('offers tel: only for a phone', () => {
    expect(telHref(phone)).toBe('tel:+15551234567');
    expect(telHref(email)).toBeNull();
  });

  it('refuses the channel that does not fit the contact', () => {
    expect(smsHref(email, message)).toBeNull();
    expect(mailtoHref(phone, message)).toBeNull();
  });

  it('uses the ?&body= form so the prefilled text survives on iOS and Android', () => {
    expect(smsHref(phone, message)).toBe(
      'sms:+15551234567?&body=Line%20one%0ALine%20two%20%3F%26%3D',
    );
  });

  it('encodes every user-controlled part of a mailto so it cannot forge headers', () => {
    const injected = {
      subject: 'Hi',
      // A title carrying what would otherwise become extra mail headers.
      body: 'Plan\n&bcc=victim@example.com&subject=Spoofed',
    };
    const href = mailtoHref(email, injected)!;
    expect(href.startsWith('mailto:ada%40example.com?subject=Hi&body=')).toBe(true);
    // Exactly one subject and one body parameter: the injected ones are encoded
    // into the body value rather than parsed as fields of their own.
    const url = new URL(href);
    const params = new URLSearchParams(url.search);
    expect([...params.keys()]).toEqual(['subject', 'body']);
    expect(params.get('body')).toBe(injected.body);
    expect(params.get('bcc')).toBeNull();
  });

  it('cannot be handed an address that carries its own query', () => {
    // The guard is classifyContact, and it is why the href builders can
    // interpolate `value` without escaping it. An address with a `?` is not a
    // valid email, so it never reaches them at all...
    expect(classifyContact('ada@example.com?bcc=victim@example.com')).toBeNull();
    // ...and a number is rebuilt from its digits, so anything a host pasted
    // after it is dropped rather than carried into the sms: URL.
    const smuggled = classifyContact('+1555123456&body=x')!;
    expect(smuggled.value).toMatch(/^\+\d+$/);
    expect(smsHref(smuggled, message)).not.toContain('&body=x');
  });
});

describe('message copy', () => {
  it('leads with the plan, then the link', () => {
    const message = planInviteMessage({
      eventTitle: 'Taco Night',
      when: 'Fri, Aug 8 · 7:00 PM',
      where: 'La Esquina',
      hostName: 'Mara',
      inviteUrl: 'https://switchboardsocial.me/rsvp/abc',
    });
    expect(message.subject).toBe('You’re invited: Taco Night');
    expect(message.body).toContain('Taco Night');
    expect(message.body).toContain('Fri, Aug 8 · 7:00 PM · La Esquina');
    expect(message.body).toContain('Mara is hosting.');
    expect(message.body).toContain('https://switchboardsocial.me/rsvp/abc');
  });

  it('still reads as an invitation with no time, place, host, or link', () => {
    const message = planInviteMessage({ eventTitle: 'Taco Night', inviteUrl: null });
    expect(message.body).toBe('You’re invited: Taco Night');
    expect(message.body).not.toContain('undefined');
    expect(message.body).not.toContain('null');
  });

  it('sends the app link, and carries the invitation along when there is one', () => {
    const bare = appInviteMessage({ appUrl: 'https://switchboardsocial.me' });
    expect(bare.subject).toBe('Join me on Switchboard');
    expect(bare.body).toContain('https://switchboardsocial.me');
    expect(bare.body).not.toContain('Your invitation');

    const withPlan = appInviteMessage({
      appUrl: 'https://switchboardsocial.me',
      eventTitle: 'Taco Night',
      inviteUrl: 'https://switchboardsocial.me/rsvp/abc',
    });
    expect(withPlan.body).toContain('Your invitation to Taco Night: https://switchboardsocial.me/rsvp/abc');
  });
});
