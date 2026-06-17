type TranslateFn = (key: string, options?: { defaultValue?: string; name?: string }) => string;

export function resolveFindEmptyMessage({
  gameFilterVal,
  trainingFilterVal,
  tournamentFilterVal,
  leaguesFilterVal,
  favoriteTrainerName,
  t,
}: {
  gameFilterVal: boolean;
  trainingFilterVal: boolean;
  tournamentFilterVal: boolean;
  leaguesFilterVal: boolean;
  favoriteTrainerName?: string | null;
  t: TranslateFn;
}): string {
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

  return t('games.noGamesFound', { defaultValue: 'No games found' });
}

export function formatTrainerDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || null;
}
