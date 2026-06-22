import { addDays, endOfDay, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { t } from '../../utils/translations';
import { escapeMarkdown } from './utils';
import { buildGamesMessage } from './commands/games.command';
import { gameWithRoundsAndOutcomes } from '../game/gamePrismaIncludes';

export const PINNED_GAMES_LIST_THRESHOLD = 3;

export interface CityGamesStats {
  openGames: number;
  openSpots: number;
  startingToday: number;
  upcomingThisWeek: number;
  playedLast7Days: number;
  playersLast7Days: number;
}

interface OpenGameSnapshot {
  id: string;
  maxParticipants: number;
  participantsCount: number;
  startTime: Date;
}

function getCityDateBoundaries(timezone: string) {
  const zonedNow = toZonedTime(new Date(), timezone);
  const todayStart = fromZonedTime(startOfDay(zonedNow), timezone);
  const todayEnd = fromZonedTime(endOfDay(zonedNow), timezone);
  const weekEnd = fromZonedTime(endOfDay(addDays(zonedNow, 7)), timezone);
  const last7DaysStart = fromZonedTime(startOfDay(addDays(zonedNow, -7)), timezone);

  return { todayStart, todayEnd, weekEnd, last7DaysStart };
}

async function fetchOpenAnnouncedGames(cityId: string): Promise<OpenGameSnapshot[]> {
  const games = await prisma.game.findMany({
    where: {
      cityId,
      status: 'ANNOUNCED',
      isPublic: true,
    },
    select: {
      id: true,
      maxParticipants: true,
      startTime: true,
      participants: {
        where: { status: 'PLAYING' },
        select: { id: true },
      },
    },
    orderBy: { startTime: 'asc' },
  });

  return games
    .filter((game) => game.participants.length < game.maxParticipants)
    .map((game) => ({
      id: game.id,
      maxParticipants: game.maxParticipants,
      participantsCount: game.participants.length,
      startTime: game.startTime,
    }));
}

export async function getCityGamesStats(
  cityId: string,
  timezone: string,
  openGames: OpenGameSnapshot[],
): Promise<CityGamesStats> {
  const { todayStart, todayEnd, weekEnd, last7DaysStart } = getCityDateBoundaries(timezone);
  const now = new Date();

  const openGamesCount = openGames.length;
  const openSpots = openGames.reduce(
    (sum, game) => sum + (game.maxParticipants - game.participantsCount),
    0,
  );
  const startingToday = openGames.filter(
    (game) => game.startTime >= todayStart && game.startTime <= todayEnd,
  ).length;

  const publicCityGameWhere = {
    cityId,
    isPublic: true,
  };

  const [upcomingThisWeek, playedLast7Days, playersLast7Days] = await Promise.all([
    prisma.game.count({
      where: {
        ...publicCityGameWhere,
        status: 'ANNOUNCED',
        startTime: { gte: now, lte: weekEnd },
      },
    }),
    prisma.game.count({
      where: {
        ...publicCityGameWhere,
        status: 'FINISHED',
        finishedDate: { gte: last7DaysStart },
      },
    }),
    prisma.gameParticipant.findMany({
      where: {
        status: 'PLAYING',
        userId: { not: null },
        game: {
          ...publicCityGameWhere,
          status: 'FINISHED',
          finishedDate: { gte: last7DaysStart },
        },
      },
      distinct: ['userId'],
      select: { userId: true },
    }),
  ]);

  return {
    openGames: openGamesCount,
    openSpots,
    startingToday,
    upcomingThisWeek,
    playedLast7Days,
    playersLast7Days: playersLast7Days.length,
  };
}

function translate(lang: string, key: string, vars: Record<string, string> = {}): string {
  let text = t(key, lang);
  for (const [name, value] of Object.entries(vars)) {
    text = text.replace(`{{${name}}}`, value);
  }
  return text;
}

export function buildCityGamesStatsMessage(
  city: { name: string },
  stats: CityGamesStats,
  lang: string,
): string {
  const header = `*${escapeMarkdown(translate(lang, 'telegram.cityGamesOverview', { city: city.name }))}*\n\n`;
  const lines = [
    `🎾 ${escapeMarkdown(translate(lang, 'telegram.statsOpenGames', { count: String(stats.openGames) }))}`,
    `👥 ${escapeMarkdown(translate(lang, 'telegram.statsOpenSpots', { count: String(stats.openSpots) }))}`,
    `📅 ${escapeMarkdown(translate(lang, 'telegram.statsStartingToday', { count: String(stats.startingToday) }))}`,
    `🗓 ${escapeMarkdown(translate(lang, 'telegram.statsUpcomingWeek', { count: String(stats.upcomingThisWeek) }))}`,
    `✅ ${escapeMarkdown(translate(lang, 'telegram.statsPlayedLast7Days', { count: String(stats.playedLast7Days) }))}`,
    `🏃 ${escapeMarkdown(translate(lang, 'telegram.statsActivePlayers7d', { count: String(stats.playersLast7Days) }))}`,
  ];

  const browseLink = `🔗 [${escapeMarkdown(t('telegram.browseAllGames', lang))}](${config.frontendUrl}/find)\n`;
  const hint = `_${escapeMarkdown(t('telegram.statsUseGamesCommand', lang))}_`;

  return `${header}${lines.join('\n')}\n\n${browseLink}\n${hint}`;
}

export async function buildPinnedCityGamesMessage(
  city: { id: string; name: string },
  timezone: string,
  lang: string,
): Promise<string | null> {
  const openGames = await fetchOpenAnnouncedGames(city.id);

  if (openGames.length === 0) {
    return null;
  }

  if (openGames.length > PINNED_GAMES_LIST_THRESHOLD) {
    const stats = await getCityGamesStats(city.id, timezone, openGames);
    return buildCityGamesStatsMessage(city, stats, lang);
  }

  const games = await prisma.game.findMany({
    where: { id: { in: openGames.map((game) => game.id) } },
    include: gameWithRoundsAndOutcomes,
    orderBy: { startTime: 'asc' },
  });

  return buildGamesMessage(city, games, timezone, lang, 4096);
}
