/**
 * The game's courts and their bookings, provided by `GameCourtsProvider` to
 * Game info (the courts inside its "where" row) and the Edit dialog's "When
 * and where" tab.
 */
import { createContext, useContext } from 'react';
import type { CourtsCardProps } from '@/features/court-reservations/CourtsCard';
import type { SchedulePlanner } from '@/components/GameDetails/schedule/schedulePlanner';

/** What Game info and the "When and where" tab read. */
export type GameCourtsValue = {
  /** The courts block inside Game info (`null`: not shown — no court slots, or a player and no club). */
  card: Omit<CourtsCardProps, 'embedded'> | null;
  /** Organizers at a club: linked bookings, the reschedule planner and its runner. */
  planner: SchedulePlanner | null;
  /** Organizers at a club: open a court's sheet. */
  openSlot: ((slotKey: string) => void) | null;
};

export const EMPTY_GAME_COURTS: GameCourtsValue = { card: null, planner: null, openSlot: null };
export const GameCourtsContext = createContext<GameCourtsValue>(EMPTY_GAME_COURTS);

export function useGameCourts(): GameCourtsValue {
  return useContext(GameCourtsContext);
}
