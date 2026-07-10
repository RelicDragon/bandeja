import { EntityType } from '@prisma/client';
import { ApiError } from '../ApiError';
import {
  validateMaxParticipants,
  validateTrainingMaxParticipants,
} from '../validators/validateGameForSport';

export type UserMaxParticipantsActor = {
  canCreateTournament: boolean;
  maxParticipantsInGame: number;
};

const GAME_MAX_PARTICIPANTS = 4;
const TOURNAMENT_STANDARD_CAP = 12;
const LEAGUE_DEFAULT_CAP = 12;

export function maxParticipantsLimitForActor(
  jwtIsAdmin: boolean,
  actor: UserMaxParticipantsActor | null,
  entityType: EntityType,
): number {
  if (entityType === EntityType.GAME) return GAME_MAX_PARTICIPANTS;
  if (jwtIsAdmin || actor?.canCreateTournament) return Number.POSITIVE_INFINITY;
  if (entityType === EntityType.TOURNAMENT) return TOURNAMENT_STANDARD_CAP;
  if (!actor) return LEAGUE_DEFAULT_CAP;
  const n = actor.maxParticipantsInGame;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 2) return LEAGUE_DEFAULT_CAP;
  return Math.min(999, Math.floor(n));
}

export function assertMaxParticipantsWithinUserCap(params: {
  jwtIsAdmin: boolean;
  actor: UserMaxParticipantsActor | null;
  maxParticipants: number;
  entityType: EntityType;
}): void {
  if (params.entityType === EntityType.BAR) return;
  if (params.entityType === EntityType.TRAINING) {
    validateTrainingMaxParticipants(params.maxParticipants);
    return;
  }
  if (params.entityType === EntityType.GAME && params.maxParticipants !== 2 && params.maxParticipants !== 4) {
    throw new ApiError(400, 'Games must have exactly 2 or 4 participants');
  }
  const limit = maxParticipantsLimitForActor(params.jwtIsAdmin, params.actor, params.entityType);
  validateMaxParticipants(params.maxParticipants, limit);
}
