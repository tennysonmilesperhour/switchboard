import type { ContactCandidate } from '@/lib/actions/connections';
import { parseVCards } from '@/lib/vcard-parse';

interface ContactPickerContact {
  name?: string[];
  email?: string[];
  tel?: string[];
}

interface ContactPickerNavigator extends Navigator {
  contacts?: {
    select(
      properties: Array<'name' | 'email' | 'tel'>,
      options?: { multiple?: boolean },
    ): Promise<ContactPickerContact[]>;
  };
}

export function canPickContacts(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as ContactPickerNavigator).contacts);
}

export async function pickContacts(): Promise<ContactCandidate[]> {
  const contactNavigator = navigator as ContactPickerNavigator;
  if (!contactNavigator.contacts) {
    throw new Error('Contact access is not available in this browser.');
  }
  const contacts = await contactNavigator.contacts.select(
    ['name', 'email', 'tel'],
    { multiple: true },
  );
  return contacts.map((contact) => ({
    name: contact.name?.[0] ?? '',
    emails: contact.email ?? [],
    phones: contact.tel ?? [],
  }));
}

/**
 * Desktop fallback for browsers without the Contact Picker API: read a
 * user-selected vCard (.vcf) file and parse it into the same
 * `ContactCandidate` shape `pickContacts` returns. Works in every browser.
 */
export async function readVCardFile(file: File): Promise<ContactCandidate[]> {
  const text = await file.text();
  return parseVCards(text);
}
