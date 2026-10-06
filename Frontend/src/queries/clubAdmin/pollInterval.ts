import type { ClubScheduleResponseV2 } from '@shared/clubAdmin/contract';

export const SCHEDULE_POLL_MS = 15_000;
/** While the booking provider snapshot is still loading, look again sooner. */
export const SCHEDULE_POLL_SYNCING_MS = 5_000;

export function schedulePollInterval(data: ClubScheduleResponseV2 | undefined, paused: boolean): number | false {
  if (paused) return false;
  return data?.isLoadingExternalSlots ? SCHEDULE_POLL_SYNCING_MS : SCHEDULE_POLL_MS;
}
