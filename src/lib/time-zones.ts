/**
 * The Settings time zone picker's options: a readable city with its current
 * GMT offset ("Kolkata (GMT+5:30)"), sorted by offset then name. Values stay
 * IANA ids, because that is what the profile stores and what quiet hours, the
 * daily summary and text messages read.
 *
 * Browsers list some zones under names IANA has since retired (ICU still calls
 * Kolkata "Asia/Calcutta"). Those are shown once, under today's name, and a
 * saved value or device zone spelled the old way still selects its option.
 */

/** Retired IANA spellings that runtimes still list, and the current name. */
export const LEGACY_ZONE_NAMES: Readonly<Record<string, string>> = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};

export function canonicalZone(zone: string): string {
  return LEGACY_ZONE_NAMES[zone] ?? zone;
}

/** Minutes ahead of GMT in `zone` at `at`; 0 when the zone is unknown. */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  let name = '';
  try {
    name =
      new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return 0;
  }
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
}

/** "GMT+5:30", "GMT-8", "GMT+0". */
export function formatGmtOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `GMT${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** "Kolkata", "Center, North Dakota", "UTC". */
export function zoneCity(zone: string): string {
  const parts = canonicalZone(zone).split('/');
  const city = parts[parts.length - 1].replaceAll('_', ' ');
  return parts.length > 2 ? `${city}, ${parts[parts.length - 2].replaceAll('_', ' ')}` : city;
}

export interface TimeZoneOption {
  value: string;
  label: string;
}

/**
 * One option per zone. `keep` lists ids that must be offered exactly as
 * spelled (the saved value first, then the device's zone), so a select whose
 * value is a retired spelling still shows it selected.
 */
export function timeZoneOptions(
  zones: readonly string[],
  keep: readonly (string | null | undefined)[],
  at: Date = new Date(),
): TimeZoneOption[] {
  const spelling = new Map<string, string>();
  for (const zone of keep) {
    if (!zone) continue;
    const canonical = canonicalZone(zone);
    if (!spelling.has(canonical)) spelling.set(canonical, zone);
  }
  for (const zone of zones) {
    const canonical = canonicalZone(zone);
    if (!spelling.has(canonical)) spelling.set(canonical, canonical);
  }
  return [...spelling.values()]
    .map((value) => {
      const offset = zoneOffsetMinutes(value, at);
      const city = zoneCity(value);
      return { value, offset, city, label: `${city} (${formatGmtOffset(offset)})` };
    })
    .sort((a, b) => a.offset - b.offset || a.city.localeCompare(b.city, 'en'))
    .map(({ value, label }) => ({ value, label }));
}
