import { countActiveFindEntityChips } from '@/utils/findEntityTypeChips';
import type { QuickShortcutKind } from './findQuickShortcuts';

type TranslateFn = (key: string, options?: { defaultValue?: string; name?: string }) => string;

const QUICK_SHORTCUT_EMPTY_DEFAULTS: Record<QuickShortcutKind, string> = {
  tomorrow: 'No games tomorrow',
  weekend: 'No games this weekend',
};

/** PRD 358 — the generic empty title under an active shortcut names the day instead. */
export function resolveQuickShortcutEmptyTitle(kind: QuickShortcutKind, t: TranslateFn): string {
  return t(`games.quickShortcuts.empty.${kind}`, { defaultValue: QUICK_SHORTCUT_EMPTY_DEFAULTS[kind] });
}

export function resolveFindEmptyMessage({
  gameFilterVal,
  trainingFilterVal,
  tournamentFilterVal,
  leaguesFilterVal,
  eventsFilterVal,
  favoriteTrainerName,
  quickShortcut,
  t,
}: {
  gameFilterVal: boolean;
  trainingFilterVal: boolean;
  tournamentFilterVal: boolean;
  leaguesFilterVal: boolean;
  eventsFilterVal: boolean;
  favoriteTrainerName?: string | null;
  /** Active Find shortcut; replaces only the generic "No games found" title. */
  quickShortcut?: QuickShortcutKind | null;
  t: TranslateFn;
}): string {
  const genericTitle = () =>
    quickShortcut
      ? resolveQuickShortcutEmptyTitle(quickShortcut, t)
      : t('games.noGamesFound', { defaultValue: 'No games found' });

  const activeChips = countActiveFindEntityChips({
    gameFilter: gameFilterVal,
    trainingFilter: trainingFilterVal,
    tournamentFilter: tournamentFilterVal,
    leaguesFilter: leaguesFilterVal,
    eventsFilter: eventsFilterVal,
  });

  if (activeChips !== 1) {
    return genericTitle();
  }

  if (gameFilterVal) {
    return genericTitle();
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

  return genericTitle();
}

export function formatTrainerDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || null;
}
