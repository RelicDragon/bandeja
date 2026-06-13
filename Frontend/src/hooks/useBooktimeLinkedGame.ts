import { useBooktimeLinkedGames } from './useBooktimeLinkedGames';

export function useBooktimeLinkedGame(externalBookingId: string | null | undefined, enabled = true) {
  const { linkedGames, loading, reload } = useBooktimeLinkedGames(externalBookingId, enabled);
  return { linkedGame: linkedGames[0] ?? null, linkedGames, loading, reload };
}
