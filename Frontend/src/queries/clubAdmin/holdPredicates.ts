import type { HoldDeleteScope, ScheduleHoldSlot } from '@shared/clubAdmin/contract';

export interface DeleteHoldVars {
  holdId: string;
  scope: HoldDeleteScope;
  /** Needed for `following`: removes later occurrences of the series from cached days too. */
  seriesId?: string | null;
  startTime?: string;
}

export function holdDeletePredicate(vars: DeleteHoldVars): (h: ScheduleHoldSlot) => boolean {
  const from = vars.startTime ? Date.parse(vars.startTime) : Number.NaN;
  return (h) => {
    if (h.holdId === vars.holdId) return true;
    if (vars.scope !== 'following' || !vars.seriesId || h.seriesId !== vars.seriesId) return false;
    return Number.isNaN(from) || Date.parse(h.startTime) >= from;
  };
}
