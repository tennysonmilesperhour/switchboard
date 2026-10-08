'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { BlockReportButtons } from '@/components/profile/BlockReportButtons';
import { TrustLabel } from '@/components/profile/FactList';
import { discoveryContextChoice } from '@/lib/discovery-context';
import { FIT_LABEL, itemKey } from '@/lib/discovery-lanes';
import { BAND_LABEL, type DistanceBand } from '@/lib/nearby-plans';
import type { DiscoveryPerson } from './types';

/** Items a card showed, as the keys weights are stored under. */
export function sharedKeys(person: DiscoveryPerson): string[] {
  return [
    ...person.shared_interests.map((label) => itemKey('interest', label)),
    ...person.shared_down_to.map((label) => itemKey('down_to', label)),
  ];
}

export function PersonCard({
  person,
  band,
  myContexts,
  chosen,
  onChoose,
}: {
  person: DiscoveryPerson;
  band: DistanceBand | null;
  myContexts: string[];
  chosen: string | undefined;
  onChoose: (context: string) => void;
}) {
  const { options, defaultContext } = discoveryContextChoice(person, myContexts);
  const profileHref = `/u/${encodeURIComponent(person.handle)}?from=/discover`;
  const shared = [...person.shared_interests, ...person.shared_down_to].slice(0, 4);
  return (
    <Card lifted className="space-y-3">
      <div className="flex items-start gap-3">
        <Avatar name={person.display_name} seed={person.id} src={person.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <Link
            href={profileHref}
            className="block truncate font-display text-xl hover:text-terracotta-deep"
          >
            {person.display_name}
          </Link>
          <p className="truncate text-xs text-ink-faint">
            @{person.handle}
            {person.location ? ` · ${person.location}` : ''}
            {person.pronouns ? ` · ${person.pronouns}` : ''}
          </p>
        </div>
        {person.mutual_friend_count > 0 && (
          <span className="shrink-0 rounded-pill bg-cream px-2 py-1 text-xs font-bold text-ink-soft">
            {person.mutual_friend_count} mutual
          </span>
        )}
      </div>
      {person.tagline && (
        <p className="text-sm leading-relaxed text-ink-soft">{person.tagline}</p>
      )}
      {person.blurb && (
        <p className="text-sm italic leading-relaxed text-ink-soft">{person.blurb}</p>
      )}
      {person.shared_facts.length > 0 && (
        <ul className="space-y-1">
          {person.shared_facts.map((fact) => (
            <li
              key={`${fact.kind}:${fact.label}`}
              className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft"
            >
              <span>
                Also at <strong>{fact.label}</strong>
              </span>
              <TrustLabel tier={fact.tier} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        {band && (
          <span className="rounded-pill bg-cream px-2 py-1 text-xs text-ink-soft">
            {BAND_LABEL[band]}
          </span>
        )}
        {person.categories
          .filter((category) => category !== 'geography')
          .map((category) => (
            <span key={category} className="rounded-pill bg-cream px-2 py-1 text-xs text-ink-soft">
              {category}
            </span>
          ))}
      </div>
      {shared.length > 0 && (
        <p className="text-xs text-ink-faint">Shared: {shared.join(', ')}</p>
      )}
      <p className="text-xs font-semibold text-ink-faint">{FIT_LABEL[person.fit]}</p>
      <div className="space-y-1">
        <label className="text-xs font-bold text-ink-soft" htmlFor={`ctx-${person.id}`}>
          Connect over
        </label>
        <select
          id={`ctx-${person.id}`}
          value={chosen || defaultContext}
          onChange={(event) => onChoose(event.target.value)}
          className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
        >
          {options.length > 0 ? (
            options.map((context) => (
              <option key={context} value={context}>
                {context}
              </option>
            ))
          ) : (
            <option value="Connect">Connect</option>
          )}
        </select>
      </div>
      <div className="border-t border-line pt-1.5">
        <BlockReportButtons targetId={person.id} name={person.display_name} />
      </div>
    </Card>
  );
}
