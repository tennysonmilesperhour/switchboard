import type { ContactCandidate } from '@/lib/actions/connections';

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
