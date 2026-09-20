import { format, startOfDay } from 'date-fns';
import type { TFunction } from 'i18next';
import type { Game } from '@/types';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { getClubTimezone, getDateLabelInClubTz } from '@/utils/gameTimeDisplay';
import { formatDate } from '@/utils/dateFormat';
import { sortDayGroupGames } from '@/features/spot-opened/spotOpenedWindow';

export interface GamesDateGroup {
  dateStr: string;
  label: string;
  games: Game[];
}

export function groupGamesByDate(
  gameList: Game[],
  displaySettings: ReturnType<typeof resolveDisplaySettings>,
  t: TFunction,
): GamesDateGroup[] {
  const map = new Map<string, Game[]>();
  for (const g of gameList) {
    const key = format(startOfDay(new Date(g.startTime)), 'yyyy-MM-dd');
    const arr = map.get(key) || [];
    arr.push(g);
    map.set(key, arr);
  }
  const result: GamesDateGroup[] = [];
  const now = Date.now();
  for (const [dateStr, rawGames] of map) {
    rawGames.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    // PRD 347 — cards with a live "Spot opened" pill lead their day group.
    // Stable, so the start-time order above survives inside each band.
    const dateGames = sortDayGroupGames(rawGames, now);
    const sample = dateGames[0];
    const clubTz = getClubTimezone(sample);
    const label = clubTz
      ? getDateLabelInClubTz(sample.startTime, clubTz, displaySettings, t)
      : `${formatDate(sample.startTime, 'EEEE').slice(0, 3)}, ${formatDate(sample.startTime, 'd MMM')}`;
    result.push({ dateStr, label, games: dateGames });
  }
  result.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  return result;
}
