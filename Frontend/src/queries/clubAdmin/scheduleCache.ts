/**
 * Optimistic edits of cached schedule days. Pure slot-list transforms + a snapshot/restore pair
 * so a failed mutation puts every touched day back exactly as it was.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ClubScheduleResponseV2, ScheduleHoldSlot, ScheduleSlotV2 } from '@shared/clubAdmin/contract';
import { clubAdminKeys } from './keys';

/** A hold that exists only in the cache until the server confirms it. */
export type OptimisticHoldSlot = ScheduleHoldSlot & { optimistic?: true };

export const OPTIMISTIC_HOLD_PREFIX = 'optimistic:';

export function isOptimisticSlot(slot: ScheduleSlotV2): boolean {
  return slot.type === 'hold' && slot.holdId.startsWith(OPTIMISTIC_HOLD_PREFIX);
}

export function withSlots(
  data: ClubScheduleResponseV2,
  slots: ScheduleSlotV2[]
): ClubScheduleResponseV2 {
  return { ...data, slots };
}

export function insertSlot(data: ClubScheduleResponseV2, slot: ScheduleSlotV2): ClubScheduleResponseV2 {
  return withSlots(data, [...data.slots, slot]);
}

export function removeHolds(
  data: ClubScheduleResponseV2,
  predicate: (slot: ScheduleHoldSlot) => boolean
): ClubScheduleResponseV2 {
  const next = data.slots.filter((s) => !(s.type === 'hold' && predicate(s)));
  return next.length === data.slots.length ? data : withSlots(data, next);
}

export function patchHold(
  data: ClubScheduleResponseV2,
  holdId: string,
  patch: Partial<ScheduleHoldSlot>
): ClubScheduleResponseV2 {
  let changed = false;
  const next = data.slots.map((s) => {
    if (s.type !== 'hold' || s.holdId !== holdId) return s;
    changed = true;
    return { ...s, ...patch, type: 'hold' as const, holdId };
  });
  return changed ? withSlots(data, next) : data;
}

export function findHold(data: ClubScheduleResponseV2 | undefined, holdId: string): ScheduleHoldSlot | null {
  const hit = data?.slots.find((s) => s.type === 'hold' && s.holdId === holdId);
  return hit && hit.type === 'hold' ? hit : null;
}

export function removeGame(data: ClubScheduleResponseV2, gameId: string): ClubScheduleResponseV2 {
  const next = data.slots.filter((s) => !((s.type === 'game' || s.type === 'game_court') && s.gameId === gameId));
  return next.length === data.slots.length ? data : withSlots(data, next);
}

export type ScheduleSnapshot = Array<[QueryKey, ClubScheduleResponseV2 | undefined]>;

/** Cancel in-flight fetches and snapshot every cached day of a club's schedule. */
export async function snapshotSchedule(qc: QueryClient, clubId: string): Promise<ScheduleSnapshot> {
  await qc.cancelQueries({ queryKey: clubAdminKeys.scheduleAll(clubId) });
  return qc.getQueriesData<ClubScheduleResponseV2>({ queryKey: clubAdminKeys.scheduleAll(clubId) });
}

export function restoreSchedule(qc: QueryClient, snapshot: ScheduleSnapshot | undefined): void {
  if (!snapshot) return;
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

/** Apply `fn` to every cached day of the club (only days that have data). */
export function updateScheduleDays(
  qc: QueryClient,
  clubId: string,
  fn: (data: ClubScheduleResponseV2, date: string) => ClubScheduleResponseV2
): void {
  for (const [key, data] of qc.getQueriesData<ClubScheduleResponseV2>({ queryKey: clubAdminKeys.scheduleAll(clubId) })) {
    if (!data) continue;
    const date = String(key[4] ?? '');
    const next = fn(data, date);
    if (next !== data) qc.setQueryData(key, next);
  }
}

/** Apply `fn` to one cached day, if it is cached. */
export function updateScheduleDay(
  qc: QueryClient,
  clubId: string,
  date: string,
  fn: (data: ClubScheduleResponseV2) => ClubScheduleResponseV2
): void {
  const key = clubAdminKeys.schedule(clubId, date);
  const data = qc.getQueryData<ClubScheduleResponseV2>(key);
  if (data) qc.setQueryData(key, fn(data));
}
