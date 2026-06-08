import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser, FormattedGameInfo } from '../notification-base';

const betResolvedInclude = {
  game: {
    include: {
      court: { include: { club: true } },
      club: true,
    },
  },
  creator: {
    select: {
      telegramId: true,
      language: true,
      currentCityId: true,
      primarySport: true,
    },
  },
  acceptedByUser: {
    select: {
      telegramId: true,
      language: true,
      currentCityId: true,
      primarySport: true,
    },
  },
} as const;

type BetForNotification = Prisma.BetGetPayload<{ include: typeof betResolvedInclude }>;

export interface BetResolvedContext {
  lang: string;
  gameId: string;
  title: string;
  bodyLines: string[];
  shortDayOfWeek: string;
  gameName: string;
  clubName?: string;
  gameInfo: FormattedGameInfo;
  game: NonNullable<BetForNotification['game']>;
  primarySport?: string | null;
  telegramId?: string | null;
  resolutionReason?: string | null;
  isWinner: boolean;
  totalCoinsWon?: number;
}

async function loadBetForNotification(betId: string) {
  return prisma.bet.findUnique({
    where: { id: betId },
    include: betResolvedInclude,
  });
}

export async function buildBetResolvedContext(
  betId: string,
  userId: string,
  isWinner: boolean,
  totalCoinsWon?: number,
): Promise<BetResolvedContext | null> {
  const bet = await loadBetForNotification(betId);
  if (!bet || !bet.game) {
    return null;
  }

  const user = userId === bet.creatorId ? bet.creator : bet.acceptedByUser;
  if (!user) {
    return null;
  }

  const lang = user.language || 'en';
  const gameInfo = await formatGameInfoForUser(bet.game, user.currentCityId, lang);
  const gameName = bet.game.name ? bet.game.name : t(`games.gameTypes.${bet.game.gameType}`, lang);
  const clubName = bet.game.court?.club?.name || bet.game.club?.name;

  const title = isWinner
    ? t('telegram.betWon', lang)
    : t('telegram.betLost', lang);

  const bodyLines: string[] = [];
  const firstLine = gameInfo.place ? `${gameName} - ${gameInfo.place}` : gameName;
  bodyLines.push(firstLine);
  bodyLines.push(`${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}`);

  if (isWinner && totalCoinsWon && totalCoinsWon > 0) {
    bodyLines.push(`💰 ${t('telegram.coinsWon', lang) || 'Coins won'}: ${totalCoinsWon}`);
  }

  if (bet.resolutionReason) {
    bodyLines.push(bet.resolutionReason);
  }

  return {
    lang,
    gameId: bet.gameId,
    title,
    bodyLines,
    shortDayOfWeek: gameInfo.shortDayOfWeek,
    gameName,
    clubName,
    gameInfo,
    game: bet.game,
    primarySport: user.primarySport,
    telegramId: user.telegramId,
    resolutionReason: bet.resolutionReason,
    isWinner,
    totalCoinsWon,
  };
}
