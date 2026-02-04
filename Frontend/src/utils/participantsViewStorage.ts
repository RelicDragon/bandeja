import { get, set } from 'idb-keyval';

const PARTICIPANTS_VIEW_KEY = 'padelpulse-participants-view';

export type ParticipantsViewMode = 'carousel' | 'list';

export const getParticipantsViewMode = async (): Promise<ParticipantsViewMode> => {
  const stored = await get<ParticipantsViewMode>(PARTICIPANTS_VIEW_KEY);
  return stored === 'list' ? 'list' : 'carousel';
};

export const setParticipantsViewMode = async (mode: ParticipantsViewMode): Promise<void> => {
  await set(PARTICIPANTS_VIEW_KEY, mode);
};
