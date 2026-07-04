/**
 * Profile taxonomy — the vocabulary a person uses to describe themselves.
 *
 * Two distinct dimensions, deliberately kept separate because the product
 * treats them differently:
 *   • `INTEREST_CATEGORIES` — passive interests & hobbies ("who I am").
 *     Grouped into themed categories so a long list stays browsable.
 *   • `DOWN_TO_GROUP` — activities someone is up for doing with others
 *     ("what I'll actually show up for"). This mirrors the activity
 *     vocabulary already used by signals, Mutual mode, and Moments.
 *
 * Both are stored on `profiles` as `text[]` (interests / down_to). The labels
 * here ARE the stored values, so edit them with care — renaming a label
 * orphans anyone who previously selected it.
 */

export interface InterestGroup {
  label: string;
  emoji: string;
  options: string[];
}

export const INTEREST_CATEGORIES: InterestGroup[] = [
  {
    label: 'Food & Drink',
    emoji: '🍽️',
    options: [
      'Coffee', 'Brunch', 'Cooking', 'Baking', 'Wine', 'Craft beer',
      'Cocktails', 'Foodie adventures', 'Farmers markets', 'Vegetarian',
      'Vegan', 'BBQ', 'Tea', 'Trying new restaurants',
    ],
  },
  {
    label: 'Outdoors & Adventure',
    emoji: '🏞️',
    options: [
      'Hiking', 'Camping', 'Backpacking', 'Cycling', 'Trail running',
      'Rock climbing', 'Kayaking', 'Skiing', 'Snowboarding', 'Surfing',
      'Fishing', 'Stargazing', 'Birdwatching',
    ],
  },
  {
    label: 'Arts & Culture',
    emoji: '🎨',
    options: [
      'Painting', 'Drawing', 'Photography', 'Pottery', 'Museums',
      'Theater', 'Film', 'Poetry', 'Design', 'Crafts', 'Calligraphy',
      'Fashion',
    ],
  },
  {
    label: 'Music',
    emoji: '🎵',
    options: [
      'Live music', 'Concerts', 'Playing an instrument', 'Singing',
      'DJing', 'Vinyl', 'Songwriting', 'Music festivals', 'Choir',
    ],
  },
  {
    label: 'Sports & Fitness',
    emoji: '🏋️',
    options: [
      'Yoga', 'Pilates', 'Weightlifting', 'Running', 'Basketball',
      'Soccer', 'Tennis', 'Pickleball', 'Golf', 'Swimming',
      'Martial arts', 'Dance', 'Bouldering', 'Bowling',
    ],
  },
  {
    label: 'Games & Tech',
    emoji: '🎲',
    options: [
      'Board games', 'Video games', 'Tabletop RPGs', 'Chess', 'Trivia',
      'Puzzles', 'Coding', 'Gadgets', 'AI', 'Esports', 'Escape rooms',
    ],
  },
  {
    label: 'Mind & Learning',
    emoji: '📚',
    options: [
      'Reading', 'Writing', 'Book clubs', 'Languages', 'History',
      'Science', 'Philosophy', 'Podcasts', 'Public speaking',
      'Investing', 'Astronomy',
    ],
  },
  {
    label: 'Social & Nightlife',
    emoji: '🌆',
    options: [
      'Dinner parties', 'Bar hopping', 'Karaoke', 'Comedy shows',
      'Dancing', 'Trivia nights', 'Meetups', 'Networking', 'Festivals',
    ],
  },
  {
    label: 'Home & Craft',
    emoji: '🛋️',
    options: [
      'DIY', 'Woodworking', 'Knitting', 'Sewing', 'Home decor',
      'Houseplants', 'Gardening', 'Collecting', 'Candle making',
    ],
  },
  {
    label: 'Travel & Exploration',
    emoji: '✈️',
    options: [
      'Road trips', 'City breaks', 'Camping trips', 'Local exploring',
      'Backpacking abroad', 'Beaches', 'National parks', 'Culture trips',
    ],
  },
  {
    label: 'Wellness & Mindfulness',
    emoji: '🧘',
    options: [
      'Meditation', 'Journaling', 'Nature walks', 'Breathwork',
      'Spirituality', 'Cold plunges', 'Saunas',
    ],
  },
  {
    label: 'Community & Causes',
    emoji: '🤝',
    options: [
      'Volunteering', 'Activism', 'Mentoring', 'Animal welfare',
      'Environment', 'Faith community', 'Local politics',
    ],
  },
];

/**
 * "I'm usually down to…" — lighter-weight than interests; these are concrete
 * plans someone would say yes to. Kept aligned with ACTIVITY_PRESETS in
 * lib/types so the profile speaks the same language as the rest of the app.
 */
export const DOWN_TO_GROUP: InterestGroup = {
  label: 'Down to do',
  emoji: '✨',
  options: [
    'Coffee', 'Lunch', 'Dinner', 'Drinks', 'Walk or hike', 'Workout',
    'Co-working', 'Movie night', 'Live music', 'Games', 'Just hang out',
    'Bike ride', 'Explore the city', 'Grab a call', 'Study session',
  ],
};

/** The full set of interest option strings — handy for validation/search. */
export const ALL_INTEREST_OPTIONS: string[] = INTEREST_CATEGORIES.flatMap(
  (group) => group.options,
);
