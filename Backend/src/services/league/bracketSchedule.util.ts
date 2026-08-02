import { BracketSlotKind } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import type { BracketPlan } from './bracketStructure';

export interface BracketSlotSchedulePayload {
  leagueGroupId?: string | null;
  slotKey: string;
  clubId: string;
  courtId: string;
  startTime: string;
  endTime: string;
}

export interface NormalizedBracketSlotSchedule
  extends Omit<BracketSlotSchedulePayload, 'startTime' | 'endTime'> {
  leagueGroupId: string | null;
  startTime: Date;
  endTime: Date;
}

export interface BracketSchedulePlanTree {
  leagueGroupId: string | null;
  plan: BracketPlan;
}

export const isSchedulableBracketSlotKind = (kind: BracketSlotKind): boolean =>
  kind !== BracketSlotKind.BYE;

export function bracketScheduleKey(leagueGroupId: string | null | undefined, slotKey: string): string {
  return `${leagueGroupId ?? '__cross_group__'}\0${slotKey}`;
}

/**
 * Validates the complete published bracket schedule against the exact server-side
 * bracket topology. Keeping this pure makes preview/create use the same contract.
 */
export function normalizeBracketSchedules(
  schedules: BracketSlotSchedulePayload[] | undefined,
  trees: BracketSchedulePlanTree[]
): Map<string, NormalizedBracketSlotSchedule> {
  const result = new Map<string, NormalizedBracketSlotSchedule>();
  if (!schedules?.length) return result;

  const planned = new Map<string, { tree: BracketSchedulePlanTree; slotKey: string }>();
  for (const tree of trees) {
    for (const slot of tree.plan.slots) {
      if (!isSchedulableBracketSlotKind(slot.slotKind)) continue;
      planned.set(bracketScheduleKey(tree.leagueGroupId, slot.slotKey), {
        tree,
        slotKey: slot.slotKey,
      });
    }
  }

  for (const raw of schedules) {
    const leagueGroupId = raw.leagueGroupId ?? null;
    const key = bracketScheduleKey(leagueGroupId, raw.slotKey);
    if (!planned.has(key)) {
      throw new ApiError(400, `Schedule references an unknown bracket fixture: ${raw.slotKey}`);
    }
    if (result.has(key)) {
      throw new ApiError(400, `Duplicate bracket schedule fixture: ${raw.slotKey}`);
    }
    if (!raw.clubId?.trim() || !raw.courtId?.trim()) {
      throw new ApiError(400, 'Every scheduled bracket fixture requires a club and court');
    }
    const startTime = new Date(raw.startTime);
    const endTime = new Date(raw.endTime);
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime())) {
      throw new ApiError(400, `Invalid date/time for bracket fixture ${raw.slotKey}`);
    }
    const durationMs = endTime.getTime() - startTime.getTime();
    if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
      throw new ApiError(400, `Invalid duration for bracket fixture ${raw.slotKey}`);
    }
    result.set(key, {
      ...raw,
      leagueGroupId,
      clubId: raw.clubId.trim(),
      courtId: raw.courtId.trim(),
      startTime,
      endTime,
    });
  }

  if (result.size !== planned.size) {
    const missing = [...planned.keys()].filter((key) => !result.has(key));
    const first = missing[0]?.split('\0')[1] ?? 'unknown';
    throw new ApiError(
      400,
      `Published bracket schedules must include every playable fixture (missing ${first})`
    );
  }

  const byCourt = new Map<string, NormalizedBracketSlotSchedule[]>();
  for (const schedule of result.values()) {
    const rows = byCourt.get(schedule.courtId) ?? [];
    rows.push(schedule);
    byCourt.set(schedule.courtId, rows);
  }
  for (const rows of byCourt.values()) {
    rows.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i]!.startTime < rows[i - 1]!.endTime) {
        throw new ApiError(400, 'Two bracket fixtures cannot overlap on the same court');
      }
    }
  }

  for (const tree of trees) {
    const plannedByKey = new Map(tree.plan.slots.map((slot) => [slot.slotKey, slot]));
    for (const slot of tree.plan.slots) {
      if (!isSchedulableBracketSlotKind(slot.slotKind)) continue;
      const schedule = result.get(bracketScheduleKey(tree.leagueGroupId, slot.slotKey));
      if (!schedule) continue;
      for (const feederKey of [slot.feederSlotAKey, slot.feederSlotBKey]) {
        if (!feederKey) continue;
        const feeder = plannedByKey.get(feederKey);
        if (!feeder || !isSchedulableBracketSlotKind(feeder.slotKind)) continue;
        const feederSchedule = result.get(bracketScheduleKey(tree.leagueGroupId, feederKey));
        if (feederSchedule && schedule.startTime < feederSchedule.endTime) {
          throw new ApiError(
            400,
            `${slot.slotKey} cannot start before feeder ${feederKey} finishes`
          );
        }
      }
    }
  }

  return result;
}
