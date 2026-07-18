import { describe, it, expect } from 'vitest';
import { parseVCards } from './vcard-parse';

describe('parseVCards', () => {
  it('parses a single vCard 3.0 with name, email, and phone', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Ada Lovelace',
      'N:Lovelace;Ada;;;',
      'EMAIL;TYPE=INTERNET:ada@example.com',
      'TEL;TYPE=CELL:+1 555 0100',
      'END:VCARD',
    ].join('\r\n');

    expect(parseVCards(vcf)).toEqual([
      { name: 'Ada Lovelace', emails: ['ada@example.com'], phones: ['+1 555 0100'] },
    ]);
  });

  it('parses multiple cards from one file', () => {
    const vcf = [
      'BEGIN:VCARD\nVERSION:3.0\nFN:First Person\nEMAIL:one@example.com\nEND:VCARD',
      'BEGIN:VCARD\nVERSION:3.0\nFN:Second Person\nTEL:555-0101\nEND:VCARD',
    ].join('\n');

    const cards = parseVCards(vcf);
    expect(cards).toHaveLength(2);
    expect(cards[0].name).toBe('First Person');
    expect(cards[1].name).toBe('Second Person');
    expect(cards[1].phones).toEqual(['555-0101']);
  });

  it('collects multiple emails and phones on one card', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Grace Hopper',
      'EMAIL;TYPE=HOME:grace.home@example.com',
      'EMAIL;TYPE=WORK:grace.work@example.com',
      'TEL;TYPE=CELL:555-0102',
      'TEL;TYPE=WORK:555-0103',
      'END:VCARD',
    ].join('\n');

    const [card] = parseVCards(vcf);
    expect(card.emails).toEqual(['grace.home@example.com', 'grace.work@example.com']);
    expect(card.phones).toEqual(['555-0102', '555-0103']);
  });

  it('falls back to the structured N field when FN is absent', () => {
    const vcf = 'BEGIN:VCARD\nVERSION:3.0\nN:Turing;Alan;M;;\nEMAIL:alan@example.com\nEND:VCARD';
    const [card] = parseVCards(vcf);
    expect(card.name).toBe('Alan M Turing');
  });

  it('strips Apple item-group prefixes on properties', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Katherine Johnson',
      'item1.EMAIL;type=INTERNET:kj@example.com',
      'item2.TEL;type=CELL:555-0104',
      'END:VCARD',
    ].join('\n');

    const [card] = parseVCards(vcf);
    expect(card.emails).toEqual(['kj@example.com']);
    expect(card.phones).toEqual(['555-0104']);
  });

  it('unfolds continuation lines', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Very Long',
      ' Name Here',
      'EMAIL:long@example.com',
      'END:VCARD',
    ].join('\r\n');

    const [card] = parseVCards(vcf);
    expect(card.name).toBe('Very LongName Here');
  });

  it('strips tel: and mailto: URI prefixes (vCard 4.0)', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:Margaret Hamilton',
      'EMAIL:mailto:mh@example.com',
      'TEL;VALUE=uri:tel:+15550105',
      'END:VCARD',
    ].join('\n');

    const [card] = parseVCards(vcf);
    expect(card.emails).toEqual(['mh@example.com']);
    expect(card.phones).toEqual(['+15550105']);
  });

  it('unescapes RFC 6350 escape sequences in names', () => {
    const vcf = 'BEGIN:VCARD\nVERSION:3.0\nFN:Doe\\, Jane\nEMAIL:jane@example.com\nEND:VCARD';
    const [card] = parseVCards(vcf);
    expect(card.name).toBe('Doe, Jane');
  });

  it('drops cards with nothing to match on', () => {
    const vcf = 'BEGIN:VCARD\nVERSION:3.0\nNOTE:just a note\nEND:VCARD';
    expect(parseVCards(vcf)).toEqual([]);
  });

  it('tolerates a leading BOM and bare LF endings', () => {
    const vcf = '\uFEFFBEGIN:VCARD\nVERSION:3.0\nFN:BOM Person\nTEL:555-0106\nEND:VCARD';
    const [card] = parseVCards(vcf);
    expect(card.name).toBe('BOM Person');
    expect(card.phones).toEqual(['555-0106']);
  });

  it('returns an empty array for non-vCard input', () => {
    expect(parseVCards('this is not a vcard')).toEqual([]);
    expect(parseVCards('')).toEqual([]);
  });

  it('keeps a card that has only a phone (invitable by text)', () => {
    const vcf = 'BEGIN:VCARD\nVERSION:3.0\nTEL:555-0107\nEND:VCARD';
    expect(parseVCards(vcf)).toEqual([
      { name: '', emails: [], phones: ['555-0107'] },
    ]);
  });
});
