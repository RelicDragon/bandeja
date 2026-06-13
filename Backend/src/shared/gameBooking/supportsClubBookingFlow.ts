export type ClubBookingEntityType =
  | 'GAME'
  | 'TRAINING'
  | 'TOURNAMENT'
  | 'LEAGUE'
  | 'LEAGUE_SEASON'
  | 'BAR'
  | string;

export type ClubBookingFlowMode = 'create' | 'edit';

const CREATE_FLOW_TYPES = new Set<ClubBookingEntityType>(['GAME', 'TRAINING', 'TOURNAMENT']);
const EDIT_FLOW_TYPES = new Set<ClubBookingEntityType>(['GAME', 'TRAINING', 'TOURNAMENT', 'LEAGUE']);

export function supportsClubBookingFlow(
  entityType: ClubBookingEntityType,
  mode: ClubBookingFlowMode = 'create',
): boolean {
  if (mode === 'edit') {
    return EDIT_FLOW_TYPES.has(entityType);
  }
  return CREATE_FLOW_TYPES.has(entityType);
}
