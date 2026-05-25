import type { BracketSlotDto } from '@/api/leagues';
import type { Game } from '@/types';
import { isFullGame } from '@/utils/leagueBracketEnrich';

export type BracketScheduleListEntry = {
  game: Game;
  kind: 'PLAY_IN' | 'MAIN';
  roundIndex: number;
};

export function collectBracketScheduleGames(slots: BracketSlotDto[]): BracketScheduleListEntry[] {
  const seen = new Set<string>();
  const list: BracketScheduleListEntry[] = [];

  for (const slot of slots) {
    if (!slot.game || !isFullGame(slot.game) || seen.has(slot.game.id)) continue;
    if (slot.slotKind !== 'PLAY_IN' && slot.slotKind !== 'MAIN') continue;
    seen.add(slot.game.id);
    list.push({
      game: slot.game as Game,
      kind: slot.slotKind,
      roundIndex: slot.roundIndex,
    });
  }

  return sortBracketScheduleGames(list);
}

export function sortBracketScheduleGames(entries: BracketScheduleListEntry[]): BracketScheduleListEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'PLAY_IN' ? -1 : 1;
    if (a.kind === 'MAIN' && b.kind === 'MAIN' && a.roundIndex !== b.roundIndex) {
      return a.roundIndex - b.roundIndex;
    }
    return (a.game.startTime ?? '').localeCompare(b.game.startTime ?? '');
  });
}
