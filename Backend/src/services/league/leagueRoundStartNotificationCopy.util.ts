import { t } from '../../utils/translations';

export function isBracketRoundStartGame(game: {
  leagueRound?: { playoffFormat?: string | null } | null;
}): boolean {
  return game.leagueRound?.playoffFormat === 'BRACKET';
}

export function leagueRoundStartNotificationTitleKey(game: {
  leagueRound?: { playoffFormat?: string | null } | null;
}): 'telegram.leagueBracketRoundStartReceived' | 'telegram.leagueRoundStartReceived' {
  return isBracketRoundStartGame(game)
    ? 'telegram.leagueBracketRoundStartReceived'
    : 'telegram.leagueRoundStartReceived';
}

export function leagueRoundStartViewButtonKey(game: {
  leagueRound?: { playoffFormat?: string | null } | null;
}): 'telegram.viewBracket' | 'telegram.viewGame' {
  return isBracketRoundStartGame(game) ? 'telegram.viewBracket' : 'telegram.viewGame';
}

export function leagueRoundStartNotificationBodyPrefix(
  game: {
    leagueSeason?: { league?: { name?: string } | null } | null;
    leagueRound?: { orderIndex?: number; playoffFormat?: string | null } | null;
  },
  lang: string
): string {
  const { leagueLine, roundLine } = leagueRoundStartNotificationLines(game, lang);
  if (isBracketRoundStartGame(game)) {
    return `${leagueLine} · ${roundLine}`;
  }
  return `${leagueLine} - ${roundLine}`;
}

export function leagueRoundStartNotificationLines(
  game: {
    leagueSeason?: { league?: { name?: string } | null } | null;
    leagueRound?: { orderIndex?: number; playoffFormat?: string | null } | null;
  },
  lang: string
): { leagueLine: string; roundLine: string } {
  const leagueLine = game.leagueSeason?.league?.name || 'League';
  const roundNumber =
    game.leagueRound?.orderIndex !== undefined ? game.leagueRound.orderIndex + 1 : 1;
  if (isBracketRoundStartGame(game)) {
    return {
      leagueLine,
      roundLine: `${t('telegram.bracketPlayoff', lang)} · ${t('telegram.round', lang)} ${roundNumber}`,
    };
  }
  return {
    leagueLine,
    roundLine: `${t('telegram.round', lang)} ${roundNumber}`,
  };
}
