import { PlayoffFormat } from '@prisma/client';

export function shouldSendBracketGameAssignedNotification(
  game: {
    timeIsSet?: boolean | null;
    leagueRound?: { playoffFormat?: PlayoffFormat | string | null } | null;
  } | null
): boolean {
  if (!game?.timeIsSet) return false;
  return game.leagueRound?.playoffFormat === PlayoffFormat.BRACKET;
}
