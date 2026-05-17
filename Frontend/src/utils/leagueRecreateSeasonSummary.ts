import type { TFunction } from 'i18next';

export type RecreateSeasonTableStats = {
  gamesDeleted: number;
  gamesMoved: number;
  roundsDeleted: number;
  roundsCreated: number;
  gamesCreated: number;
  gamesPreservedDueToChat: number;
  gamesPreservedFinal: number;
  gamesPreservedInProgress: number;
  gamesPreservedScheduled: number;
  roundsSkippedDueToRemainingGames: number;
  standingsGamesSynced: number;
};

export function formatRecreateSeasonTableSummary(
  t: TFunction,
  stats: RecreateSeasonTableStats
): string {
  const lines: string[] = [];

  if (stats.gamesDeleted > 0) {
    lines.push(
      t('gameDetails.recreateSummary.gamesDeleted', { count: stats.gamesDeleted })
    );
  }
  if (stats.gamesCreated > 0) {
    lines.push(
      t('gameDetails.recreateSummary.gamesCreated', { count: stats.gamesCreated })
    );
  }
  if (stats.gamesMoved > 0) {
    lines.push(t('gameDetails.recreateSummary.gamesMoved', { count: stats.gamesMoved }));
  }
  if (stats.roundsDeleted > 0) {
    lines.push(
      t('gameDetails.recreateSummary.roundsDeleted', { count: stats.roundsDeleted })
    );
  }
  if (stats.roundsCreated > 0) {
    lines.push(
      t('gameDetails.recreateSummary.roundsCreated', { count: stats.roundsCreated })
    );
  }
  if (stats.gamesPreservedDueToChat > 0) {
    lines.push(
      t('gameDetails.recreateSummary.gamesPreservedChat', {
        count: stats.gamesPreservedDueToChat,
      })
    );
  }
  if (stats.gamesPreservedFinal > 0) {
    lines.push(
      t('gameDetails.recreateSummary.gamesPreservedFinal', {
        count: stats.gamesPreservedFinal,
      })
    );
  }
  if (stats.gamesPreservedInProgress > 0) {
    lines.push(
      t('gameDetails.recreateSummary.gamesPreservedInProgress', {
        count: stats.gamesPreservedInProgress,
      })
    );
  }
  if (stats.gamesPreservedScheduled > 0) {
    lines.push(
      t('gameDetails.recreateSummary.gamesPreservedScheduled', {
        count: stats.gamesPreservedScheduled,
      })
    );
  }
  if (stats.roundsSkippedDueToRemainingGames > 0) {
    lines.push(
      t('gameDetails.recreateSummary.roundsSkipped', {
        count: stats.roundsSkippedDueToRemainingGames,
      })
    );
  }
  if (stats.standingsGamesSynced > 0) {
    lines.push(
      t('gameDetails.recreateSummary.standingsSynced', {
        count: stats.standingsGamesSynced,
      })
    );
  }

  if (lines.length === 0) {
    return t('gameDetails.recreateSeasonTableSuccess');
  }

  return lines.join('\n');
}
