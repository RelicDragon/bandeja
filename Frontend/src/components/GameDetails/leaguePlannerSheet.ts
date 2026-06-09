import type { LeaguePlannerPayload } from '@/api/leagues';

/** Grid renders `deferredPlanner`; sheet must use the same snapshot when `planner` is cleared mid-refetch. */
export function plannerForSheet(
  planner: LeaguePlannerPayload | null,
  deferredPlanner: LeaguePlannerPayload | null,
): LeaguePlannerPayload | null {
  return planner ?? deferredPlanner;
}
