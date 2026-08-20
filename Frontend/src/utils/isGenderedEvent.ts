export type GenderedEventLike = {
  genderTeams?: string | null;
  entityType?: string | null;
};

export function isGenderedEvent(game: GenderedEventLike | null | undefined): boolean {
  if (!game) return false;
  if (game.entityType === 'BAR') return false;
  const gt = game.genderTeams ?? 'ANY';
  return gt === 'MEN' || gt === 'WOMEN' || gt === 'MIX_PAIRS';
}
