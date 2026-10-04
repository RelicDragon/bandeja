import { EntityType } from '@prisma/client';

/**
 * Entity types that have an attendance question at all. EVENT RSVPs are out of
 * scope. Kept dependency-free so the game-update path can import it without
 * pulling in the attendance service's import-time registrations.
 */
export const ATTENDANCE_ENTITY_TYPES: readonly EntityType[] = [
  EntityType.GAME,
  EntityType.TOURNAMENT,
  EntityType.TRAINING,
  EntityType.LEAGUE,
  EntityType.BAR,
];

export function supportsAttendance(entityType: EntityType | string): boolean {
  return (ATTENDANCE_ENTITY_TYPES as readonly string[]).includes(entityType);
}
