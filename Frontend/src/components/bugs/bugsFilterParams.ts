import type { BugsFilterState } from '@/components/GameDetails/gameDetailsChromeStore';
import type { BugStatus } from '@/types';

export const ALL_BUG_STATUSES: BugStatus[] = [
  'CREATED',
  'CONFIRMED',
  'IN_PROGRESS',
  'TEST',
  'FINISHED',
  'ARCHIVED',
];

export const ADMIN_DEFAULT_BUG_STATUSES: BugStatus[] = [
  'CREATED',
  'CONFIRMED',
  'IN_PROGRESS',
  'TEST',
];

export function getDefaultBugsFilter(isAdmin: boolean): BugsFilterState {
  if (isAdmin) {
    return { statuses: [...ADMIN_DEFAULT_BUG_STATUSES], type: null, createdByMe: false };
  }
  return { statuses: [...ALL_BUG_STATUSES], type: null, createdByMe: true };
}

let bugsFilterDefaultsAppliedForUserId: string | null = null;

export function shouldApplyBugsFilterDefaultsForUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (bugsFilterDefaultsAppliedForUserId === userId) return false;
  bugsFilterDefaultsAppliedForUserId = userId;
  return true;
}

export function resetBugsFilterDefaultsForTests() {
  bugsFilterDefaultsAppliedForUserId = null;
}

export function buildBugsApiFilterParams(bf: BugsFilterState) {
  if (bf.statuses.length === 0 && !bf.type && !bf.createdByMe) return undefined;
  return {
    status: bf.statuses.length > 0 ? bf.statuses.join(',') : null,
    type: bf.type,
    createdByMe: bf.createdByMe,
  };
}
