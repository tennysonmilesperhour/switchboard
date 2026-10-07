'use client';

import type { ReactNode } from 'react';
import type { SceneId } from '@/lib/walkthroughs';
import { StartDoors, DescribePlan, Cascade, InviteLink, RoomFiling, HomeSignal } from './scenes/first-run';
import { ImportLink, CascadePreview, ResponseWindow, RsvpQuestion, AfterThePlan } from './scenes/plans';
import { DecideRatings, AvailabilityGrid, Consensus, PollCloses } from './scenes/deciding';
import { AddSomeone, Circles, Mutual, Radar, GiveSpace } from './scenes/people';
import { RoomPhotos, SplitBill, MemoryCapsule } from './scenes/rooms';
import { DiscoverIdeas, Zones, Moments, MapLayers } from './scenes/places';
import { SignalComposer, QuietHours, Sabbatical, Appearance } from './scenes/you';

/**
 * The staged screens the walkthroughs play. Every name, plan, and message is
 * made up; none of this reads or writes the reader's account.
 *
 * Each scene is laid out like the screen it stands for, in the app's own
 * tokens, so it follows whichever theme the reader has picked. Timings are in
 * milliseconds from the moment the step appears, and every scene settles in
 * under five seconds.
 */
export const TOUR_SCENES: Record<SceneId, () => ReactNode> = {
  'start-doors': StartDoors,
  'describe-plan': DescribePlan,
  cascade: Cascade,
  'invite-link': InviteLink,
  'room-filing': RoomFiling,
  'home-signal': HomeSignal,
  'import-link': ImportLink,
  'cascade-preview': CascadePreview,
  'response-window': ResponseWindow,
  'rsvp-question': RsvpQuestion,
  'after-the-plan': AfterThePlan,
  'decide-ratings': DecideRatings,
  'availability-grid': AvailabilityGrid,
  consensus: Consensus,
  'poll-closes': PollCloses,
  'add-someone': AddSomeone,
  circles: Circles,
  mutual: Mutual,
  radar: Radar,
  'give-space': GiveSpace,
  'room-photos': RoomPhotos,
  'split-bill': SplitBill,
  'memory-capsule': MemoryCapsule,
  'discover-ideas': DiscoverIdeas,
  zones: Zones,
  moments: Moments,
  'map-layers': MapLayers,
  'signal-composer': SignalComposer,
  'quiet-hours': QuietHours,
  sabbatical: Sabbatical,
  appearance: Appearance,
};
