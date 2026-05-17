import { USER_SELECT_FIELDS } from './constants';

export const GAME_INVITE_OUTCOME_INCLUDE = {
  user: { select: USER_SELECT_FIELDS },
  invitedByUser: { select: USER_SELECT_FIELDS },
} as const;
