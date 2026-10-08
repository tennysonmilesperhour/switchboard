// Shapes the Explore page hands its client panes.

export type { DiscoveryPerson } from '@/lib/discovery-people';

export interface DiscoveryMatch {
  id: string;
  otherId: string;
  otherName: string;
  activity: string;
  roomId: string | null;
  createdAt: string;
}

/** The reader's own open "Interested" mark on someone, by their profile id. */
export interface DiscoveryInterest {
  id: string;
  activity: string;
}
