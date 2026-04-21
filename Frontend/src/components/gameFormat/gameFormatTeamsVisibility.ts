import { EntityType } from '@/types';

export function gameFormatGenderVisible(entityType: EntityType): boolean {
  return (
    entityType === 'GAME' ||
    entityType === 'TOURNAMENT' ||
    entityType === 'LEAGUE' ||
    entityType === 'LEAGUE_SEASON'
  );
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
