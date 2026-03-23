export type PlayerInviteGenderFilter = 'ALL' | 'MALE' | 'FEMALE';

export interface PlayerInviteFilters {
  gender: PlayerInviteGenderFilter;
  levelRange: [number, number];
  socialRange: [number, number];
  minGamesTogether: number;
}

export const PLAYER_INVITE_RATING_MAX = 7;

export const defaultPlayerInviteFilters = (maxSocialLevel: number): PlayerInviteFilters => ({
  gender: 'ALL',
  levelRange: [0, PLAYER_INVITE_RATING_MAX],
  socialRange: [0, Math.max(maxSocialLevel, 1)],
  minGamesTogether: 0,
});

export const PLAYER_INVITE_GAMES_TOGETHER_STEPS = [0, 1, 3, 5] as const;
