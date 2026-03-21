export type PlayerInviteGenderFilter = 'ALL' | 'MALE' | 'FEMALE';

export interface PlayerInviteFilters {
  gender: PlayerInviteGenderFilter;
  levelRange: [number, number];
  socialRange: [number, number];
  minGamesTogether: number;
}

const LEVEL_MAX = 10;

export const defaultPlayerInviteFilters = (): PlayerInviteFilters => ({
  gender: 'ALL',
  levelRange: [0, LEVEL_MAX],
  socialRange: [0, LEVEL_MAX],
  minGamesTogether: 0,
});

export const PLAYER_INVITE_LEVEL_MAX = LEVEL_MAX;

export const PLAYER_INVITE_GAMES_TOGETHER_STEPS = [0, 1, 3, 5] as const;
