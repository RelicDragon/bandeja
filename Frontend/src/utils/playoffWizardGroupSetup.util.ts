export type GroupSetupStatus = 'incomplete' | 'ready';

export function getGroupSetupStatus(params: {
  selectedCount: number;
  minParticipants: number;
  maxParticipants?: number;
}): GroupSetupStatus {
  const { selectedCount, minParticipants, maxParticipants } = params;
  if (selectedCount < minParticipants) return 'incomplete';
  if (maxParticipants !== undefined && selectedCount > maxParticipants) return 'incomplete';
  return 'ready';
}
