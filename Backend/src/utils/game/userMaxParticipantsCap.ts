import { EntityType } from '@prisma/client';
import { ApiError } from '../ApiError';

export type UserMaxParticipantsActor = {
  canCreateTournament: boolean;
  maxParticipantsInGame: number;
};

export function maxParticipantsLimitForActor(
  jwtIsAdmin: boolean,
  actor: UserMaxParticipantsActor | null
): number {
  if (jwtIsAdmin) return Number.POSITIVE_INFINITY;
  if (!actor) return 12;
  if (actor.canCreateTournament) return Number.POSITIVE_INFINITY;
  const n = actor.maxParticipantsInGame;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 2) return 12;
  return Math.min(999, Math.floor(n));
}

export function assertMaxParticipantsWithinUserCap(params: {
  jwtIsAdmin: boolean;
  actor: UserMaxParticipantsActor | null;
  maxParticipants: number;
  entityType: EntityType;
}): void {
  if (params.entityType === EntityType.BAR) return;
  const limit = maxParticipantsLimitForActor(params.jwtIsAdmin, params.actor);
  if (params.maxParticipants <= limit) return;
  const cap = Number.isFinite(limit) ? String(Math.floor(limit)) : '';
  throw new ApiError(403, cap ? `You cannot set more than ${cap} participants` : 'You cannot set that many participants');
}
