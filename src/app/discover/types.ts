// Shapes the Explore page hands its client panes.

export interface DiscoveryPerson {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  tagline: string | null;
  location: string | null;
  pronouns: string | null;
  categories: string[];
  contexts: string[];
  shared_interests: string[];
  shared_down_to: string[];
  mutual_friend_count: number;
}

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
