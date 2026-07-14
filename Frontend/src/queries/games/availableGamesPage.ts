import type { Game } from '@/types';
import type { FindStructuralApiParams } from '@/utils/findStructuralApiParams';
import type { FindDayIndexRow } from '@/utils/findDayIndexCounts';

export type AvailableGamesPageMeta = {
  take: number;
  bound: number;
  hasMore: boolean;
  nextCursor: string | null;
  truncated: boolean;
  dayIndex?: FindDayIndexRow[];
  dayIndexTruncated?: boolean;
};

export type AvailableGamesPage = {
  games: Game[];
  meta: AvailableGamesPageMeta;
};

export const EMPTY_AVAILABLE_META: AvailableGamesPageMeta = {
  take: 0,
  bound: 300,
  hasMore: false,
  nextCursor: null,
  truncated: false,
};

export function structuralToApiParams(structural?: FindStructuralApiParams) {
  if (!structural) return {};
  const params: Record<string, string | number | boolean> = {};
  if (structural.clubIds) params.clubIds = structural.clubIds;
  if (structural.entityTypes) params.entityTypes = structural.entityTypes;
  if (structural.hideBar) params.hideBar = true;
  if (structural.levelMin != null) params.levelMin = structural.levelMin;
  if (structural.levelMax != null) params.levelMax = structural.levelMax;
  if (structural.availableSlots) params.availableSlots = true;
  if (structural.mode) params.mode = structural.mode;
  return params;
}

export function mergeAvailableGamesPages(existing: Game[], incoming: Game[]): Game[] {
  if (existing.length === 0) return incoming;
  const seen = new Set(existing.map((g) => g.id));
  const appended = incoming.filter((g) => !seen.has(g.id));
  return appended.length === 0 ? existing : [...existing, ...appended];
}

export function parseAvailableGamesMeta(raw: unknown): AvailableGamesPageMeta {
  if (!raw || typeof raw !== 'object') return EMPTY_AVAILABLE_META;
  const m = raw as Record<string, unknown>;
  const dayIndex = Array.isArray(m.dayIndex) ? (m.dayIndex as FindDayIndexRow[]) : undefined;
  return {
    take: typeof m.take === 'number' ? m.take : 0,
    bound: typeof m.bound === 'number' ? m.bound : 300,
    hasMore: Boolean(m.hasMore),
    nextCursor: typeof m.nextCursor === 'string' ? m.nextCursor : null,
    truncated: Boolean(m.truncated ?? m.hasMore),
    dayIndex,
    dayIndexTruncated: Boolean(m.dayIndexTruncated),
  };
}
