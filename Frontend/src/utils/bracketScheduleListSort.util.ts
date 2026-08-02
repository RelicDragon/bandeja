import type { BracketSlotDto, BracketSlotKind } from '@/api/leagues';
import type { Game } from '@/types';
import { isFullGame } from '@/utils/leagueBracketEnrich';

type BracketScheduleBase = {
  kind: Exclude<BracketSlotKind, 'BYE'>;
  roundIndex: number;
  roundLabel: string | null;
  slot: BracketSlotDto;
  startTime: string;
};

export type BracketScheduleListEntry =
  | (BracketScheduleBase & { entryType: 'GAME'; game: Game })
  | (BracketScheduleBase & { entryType: 'PLANNED'; game: null });

export function collectBracketScheduleGames(slots: BracketSlotDto[]): BracketScheduleListEntry[] {
  const seen = new Set<string>();
  const list: BracketScheduleListEntry[] = [];

  for (const slot of slots) {
    if (slot.slotKind === 'BYE') continue;
    if (slot.game && isFullGame(slot.game)) {
      if (seen.has(slot.game.id)) continue;
      seen.add(slot.game.id);
      list.push({
        entryType: 'GAME',
        game: slot.game as Game,
        slot,
        startTime: (slot.game as Game).startTime,
        kind: slot.slotKind,
        roundIndex: slot.roundIndex,
        roundLabel: slot.roundLabel?.trim() ?? null,
      });
      continue;
    }
    if (slot.schedule) {
      list.push({
        entryType: 'PLANNED',
        game: null,
        slot,
        startTime: slot.schedule.startTime,
        kind: slot.slotKind,
        roundIndex: slot.roundIndex,
        roundLabel: slot.roundLabel?.trim() ?? null,
      });
    }
  }

  return sortBracketScheduleGames(list);
}

export function sortBracketScheduleGames(entries: BracketScheduleListEntry[]): BracketScheduleListEntry[] {
  return [...entries].sort((a, b) => {
    const time = a.startTime.localeCompare(b.startTime);
    if (time !== 0) return time;
    if (a.kind !== b.kind) return a.kind === 'PLAY_IN' ? -1 : b.kind === 'PLAY_IN' ? 1 : 0;
    if (a.kind === 'MAIN' && b.kind === 'MAIN' && a.roundIndex !== b.roundIndex) {
      return a.roundIndex - b.roundIndex;
    }
    return a.slot.matchIndex - b.slot.matchIndex;
  });
}
