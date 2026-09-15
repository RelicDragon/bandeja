import { countActiveFindEntityChips } from '@/utils/findEntityTypeChips';

type TranslateFn = (key: string, options?: { defaultValue?: string; name?: string }) => string;

export function resolveFindEmptyMessage({
  gameFilterVal,
  trainingFilterVal,
  tournamentFilterVal,
  leaguesFilterVal,
  eventsFilterVal,
  favoriteTrainerName,
  t,
}: {
  gameFilterVal: boolean;
  trainingFilterVal: boolean;
  tournamentFilterVal: boolean;
  leaguesFilterVal: boolean;
  eventsFilterVal: boolean;
  favoriteTrainerName?: string | null;
  t: TranslateFn;
}): string {
  const activeChips = countActiveFindEntityChips({
    gameFilter: gameFilterVal,
    trainingFilter: trainingFilterVal,
    tournamentFilter: tournamentFilterVal,
    leaguesFilter: leaguesFilterVal,
    eventsFilter: eventsFilterVal,
  });

  if (activeChips !== 1) {
    return t('games.noGamesFound', { defaultValue: 'No games found' });
  }

  if (gameFilterVal) {
    return t('games.noGamesFound', { defaultValue: 'No games found' });
  }

  if (trainingFilterVal) {
    if (favoriteTrainerName) {
      return t('trainers.noTrainingsByTrainer', {
        name: favoriteTrainerName,
        defaultValue: `No trainings by ${favoriteTrainerName}`,
      });
    }
    return t('games.noTrainingFound', { defaultValue: 'No training found' });
  }

  if (tournamentFilterVal) {
    return t('games.noTournamentFound', { defaultValue: 'No tournament found' });
  }

  if (leaguesFilterVal) {
    return t('games.noLeaguesFound', { defaultValue: 'No leagues found' });
  }

  if (eventsFilterVal) {
    return t('games.noEventsFound', { defaultValue: 'No events found' });
  }

  return t('games.noGamesFound', { defaultValue: 'No games found' });
}

export function formatTrainerDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || null;
}
