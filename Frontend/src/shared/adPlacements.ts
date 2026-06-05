export const AD_PLACEMENTS = {
  HOME_HERO: 'home_hero',
  FIND_TOP: 'find_top',
  LEADERBOARD_BANNER: 'leaderboard_banner',
} as const;

export type AdPlacementKey = (typeof AD_PLACEMENTS)[keyof typeof AD_PLACEMENTS];

export const AD_PLACEMENT_KEYS = Object.values(AD_PLACEMENTS);
