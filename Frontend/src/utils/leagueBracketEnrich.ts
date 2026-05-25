import type { BracketPlayoffGroupDto, BracketSlotDto } from '@/api/leagues';
import type { Game } from '@/types';

export function isFullGame(g: BracketSlotDto['game']): g is Game {
  return !!g && 'fixedTeams' in g;
}

export function enrichBracketGroups(
  groups: BracketPlayoffGroupDto[],
  roundGames: Game[]
): BracketPlayoffGroupDto[] {
  const byId = new Map(roundGames.map((g) => [g.id, g]));
  return groups.map((group) => ({
    ...group,
    slots: group.slots.map((slot) => {
      if (!slot.gameId) return slot;
      if (isFullGame(slot.game)) return slot;
      const full = byId.get(slot.gameId);
      return full ? { ...slot, game: full } : slot;
    }),
  }));
}
