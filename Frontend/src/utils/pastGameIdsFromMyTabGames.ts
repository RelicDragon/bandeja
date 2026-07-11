export function pastGameIdsFromMyTabGames(
  games: Array<{ id: string; status?: string }> | undefined,
): string[] {
  return (games ?? [])
    .filter((g) => g.status === 'FINISHED' || g.status === 'ARCHIVED')
    .map((g) => g.id);
}
