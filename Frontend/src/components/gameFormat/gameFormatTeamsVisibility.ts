import { EntityType, Game } from '@/types';
import type { BasicUser } from '@/types';
import { playersPerMatchOf } from '@/utils/matchFormat';

export function gameFormatGenderVisible(entityType: EntityType): boolean {
  return (
    entityType === 'GAME' ||
    entityType === 'TOURNAMENT' ||
    entityType === 'LEAGUE' ||
    entityType === 'LEAGUE_SEASON'
  );
}

/** 1v1/2v2 + rotating/fixed pairs controls (participants setup / edit roster). */
export function entitySupportsPlayersPerMatchControls(entityType: EntityType): boolean {
  return entityType === 'GAME' || entityType === 'LEAGUE' || entityType === 'TOURNAMENT';
}

/** Participant setup is meaningful for every managed competition/session except open BAR lobbies. */
export function entitySupportsParticipantSetup(entityType: EntityType): boolean {
  return entityType !== 'BAR';
}

export function gameFormatFixedTeamsToggleVisible(entityType: EntityType, participantCount: number): boolean {
  return (
    participantCount >= 4 &&
    participantCount % 2 === 0 &&
    entityType !== 'TRAINING' &&
    entityType !== 'BAR'
  );
}

export function gameFormatTeamsFieldsVisible(entityType: EntityType, participantCount: number): boolean {
  return gameFormatGenderVisible(entityType) || gameFormatFixedTeamsToggleVisible(entityType, participantCount);
}

export function fixedTeamsManagementVisible(game: Game, user: BasicUser | null | undefined): boolean {
  if (!user) return false;
  if (game.resultsStatus !== 'NONE') return false;
  if (!game.hasFixedTeams) return false;
  if (playersPerMatchOf(game) !== 4) return false;
  if (!gameFormatFixedTeamsToggleVisible(game.entityType, game.maxParticipants)) return false;
  return true;
}
