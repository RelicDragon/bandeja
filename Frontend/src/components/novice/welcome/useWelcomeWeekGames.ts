import { addDays, format, startOfDay } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';

/** Days ahead the Welcome page lists games / trainings for. */
export const WELCOME_GAMES_DAYS_AHEAD = 7;

export type WelcomeWeekGamesKind = 'noviceGames' | 'trainings';

const MAX_ROWS = 8;

function isJoinableUpcoming(game: Game, userId: string | undefined, now: number): boolean {
  if (game.status !== 'ANNOUNCED') return false;
  if (new Date(game.startTime).getTime() < now) return false;
  if (userId && game.participants?.some((p) => p.userId === userId)) return false;
  return true;
}

/**
 * The next week of joinable games for the Welcome page, in the viewer's city:
 * `noviceGames` → games tagged "Novices welcome" (Find's `noviceOnly`) with a
 * free slot; `trainings` → upcoming trainings (Find's training chip).
 */
export function useWelcomeWeekGames(kind: WelcomeWeekGamesKind, enabled = true) {
  const userId = useAuthStore((s) => s.user?.id);
  const cityId = useAuthStore((s) => s.user?.currentCity?.id ?? s.user?.currentCityId);
  const today = startOfDay(new Date());
  const startDate = format(today, 'yyyy-MM-dd');
  const endDate = format(addDays(today, WELCOME_GAMES_DAYS_AHEAD), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['novice', 'welcome', kind, userId ?? null, cityId ?? null, startDate],
    queryFn: async () => {
      const response = await gamesApi.getAvailableGames({
        startDate,
        endDate,
        mode: 'calendar',
        format: 'card',
        ...(kind === 'noviceGames'
          ? { entityTypes: 'GAME', noviceOnly: true, availableSlots: true }
          : { entityTypes: 'TRAINING' }),
      });
      const now = Date.now();
      return (response.data ?? [])
        .filter((game) => isJoinableUpcoming(game, userId, now))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, MAX_ROWS);
    },
    enabled: enabled && !!userId && !!cityId,
    staleTime: 60_000,
  });
}
