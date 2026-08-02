import type { TFunction } from 'i18next';
import type { Game } from '@/types';
import { translateBracketRoundLabel } from '@/utils/bracketRoundDisplay.util';

export type LiveBroadcastContext = {
  title: string;
  details: string[];
};

function positiveRoundNumber(roundNumber: number | null | undefined): number | null {
  return typeof roundNumber === 'number' && Number.isFinite(roundNumber) && roundNumber > 0
    ? Math.floor(roundNumber)
    : null;
}

function localizedRoundNumber(roundNumber: number, t: TFunction): string {
  return t('gameResults.roundNumber', {
    number: roundNumber,
    defaultValue: `Round ${roundNumber}`,
  });
}

function mainBracketRoundLabel(game: Game): string | null {
  const bracketSize = game.leagueRound?.bracketSize;
  const entrantCount = game.leagueRound?.entrantCount;
  const roundIndex = game.bracketSlot?.roundIndex;
  if (
    typeof bracketSize !== 'number' ||
    bracketSize < 2 ||
    typeof roundIndex !== 'number' ||
    roundIndex < 0
  ) {
    return null;
  }

  const byeCount =
    typeof entrantCount === 'number' && entrantCount > 0 && entrantCount <= bracketSize
      ? bracketSize - entrantCount
      : 0;
  const playInTeams =
    typeof entrantCount === 'number' && entrantCount < bracketSize
      ? Math.max(0, entrantCount - byeCount)
      : 0;
  const mainBracketSize = playInTeams > 0 ? bracketSize / 2 : bracketSize;
  const teamsInRound = mainBracketSize / Math.pow(2, roundIndex);

  switch (teamsInRound) {
    case 2:
      return 'Final';
    case 4:
      return 'Semifinals';
    case 8:
      return 'Quarterfinals';
    case 16:
      return 'Round of 16';
    case 32:
      return 'Round of 32';
    default:
      return `Round ${roundIndex + 1}`;
  }
}

function localizedLeagueStage(game: Game, t: TFunction): string | null {
  if (game.leagueRound?.roundType !== 'PLAYOFF') {
    const orderIndex = game.leagueRound?.orderIndex;
    return typeof orderIndex === 'number' && Number.isFinite(orderIndex) && orderIndex >= 0
      ? `R${Math.floor(orderIndex) + 1}`
      : null;
  }

  const slot = game.bracketSlot;
  let rawLabel: string | null = null;
  switch (slot?.slotKind) {
    case 'PLAY_IN':
      rawLabel = 'Play-in';
      break;
    case 'BYE':
      rawLabel = 'Bye';
      break;
    case 'MAIN':
      rawLabel = mainBracketRoundLabel(game);
      break;
    case 'THIRD_PLACE':
      rawLabel = 'Third place';
      break;
    case 'CONSOLATION':
      rawLabel = `Consolation round ${(slot.roundIndex ?? 0) + 1}`;
      break;
    case 'LOSERS':
      rawLabel = `Losers round ${(slot.roundIndex ?? 0) + 1}`;
      break;
    case 'GRAND_FINAL':
      rawLabel = slot.roundIndex && slot.roundIndex > 0 ? 'Grand final reset' : 'Grand final';
      break;
  }

  return rawLabel
    ? translateBracketRoundLabel(rawLabel, t)
    : t('gameDetails.bracketSeasonPlayoff', { defaultValue: 'Playoffs' });
}

export function liveBroadcastContext(
  game: Game | null | undefined,
  matchRoundNumber: number | null | undefined,
  t: TFunction,
): LiveBroadcastContext | null {
  if (!game) return null;

  const roundNumber = positiveRoundNumber(matchRoundNumber);
  if (game.entityType === 'GAME' || game.entityType === 'TOURNAMENT') {
    const showRound =
      roundNumber !== null && (game.entityType === 'TOURNAMENT' || roundNumber > 1);
    const title =
      game.name?.trim() ||
      t(`games.entityTypes.${game.entityType}`, {
        defaultValue: game.entityType === 'GAME' ? 'Game' : 'Tournament',
      });
    return {
      title,
      details: showRound ? [localizedRoundNumber(roundNumber, t)] : [],
    };
  }

  if (game.entityType === 'LEAGUE') {
    const season = game.parent?.leagueSeason;
    const title =
      season?.league?.name?.trim() ||
      game.name?.trim() ||
      t('games.entityTypes.LEAGUE', { defaultValue: 'League' });
    const details = [
      season?.game?.name?.trim(),
      game.leagueGroup?.name?.trim(),
      localizedLeagueStage(game, t),
    ].filter((part): part is string => Boolean(part));
    return { title, details };
  }

  return null;
}

export function liveBroadcastContextLabel(
  game: Game | null | undefined,
  matchRoundNumber: number | null | undefined,
  t: TFunction,
): string {
  const context = liveBroadcastContext(game, matchRoundNumber, t);
  if (!context) return '';
  return [context.title, ...context.details].join(' · ');
}
