import { Sport } from '@prisma/client';
import { getSportConfig, resolvePlayersPerMatch, resolveSport } from '../../sport/sportRegistry';
import { resolveUserSportSnapshot } from '../user/userSportProfile.service';
import { t } from '../../utils/translations';

type SportProfileLevelInput = {
  sport: Sport | string;
  level: number;
  gamesPlayed?: number;
};

export type InviteSenderLevelInput = {
  sportProfiles?: SportProfileLevelInput[] | null;
  level?: number | null;
};

export interface GameNotificationContext {
  sport?: Sport | string | null;
  playersPerMatch?: number | null;
}

export function resolvePrimarySport(primarySport: Sport | string | null | undefined): Sport {
  return resolveSport(primarySport ?? Sport.PADEL);
}

export function shouldPrefixSport(
  gameSport: Sport | string | null | undefined,
  primarySport: Sport | string | null | undefined,
): boolean {
  return resolveSport(gameSport) !== resolvePrimarySport(primarySport);
}

export function formatSportLabel(sport: Sport | string, lang: string): string {
  const id = resolveSport(sport);
  const labelKey = getSportConfig(id).labelKey;
  const label = t(labelKey, lang);
  return label !== labelKey ? label : id;
}

/** Localized "{sport}:" fragment; empty when sport matches user primary. */
export function formatSportPrefix(
  gameSport: Sport | string,
  primarySport: Sport | string | null | undefined,
  lang: string,
): string {
  if (!shouldPrefixSport(gameSport, primarySport)) return '';
  const label = formatSportLabel(gameSport, lang);
  const template = t('notifications.sportNamePrefix', lang);
  if (template !== 'notifications.sportNamePrefix') {
    return template.replace('{sport}', label);
  }
  return `${label}:`;
}

export function withOptionalSportPrefix(
  text: string,
  gameSport: Sport | string | null | undefined,
  primarySport: Sport | string | null | undefined,
  lang: string,
): string {
  const prefix = formatSportPrefix(resolveSport(gameSport), primarySport, lang);
  if (!prefix) return text;
  return `${prefix} ${text}`;
}

/** Localized 1v1 / 2v2 when match size differs from the sport default. */
export function formatMatchFormatLabel(
  playersPerMatch: number | null | undefined,
  sport: Sport | string | null | undefined,
  lang: string,
): string | null {
  const sportId = resolveSport(sport ?? Sport.PADEL);
  const ppm =
    playersPerMatch === 2 || playersPerMatch === 4
      ? playersPerMatch
      : resolvePlayersPerMatch(sportId, playersPerMatch);
  if (getSportConfig(sportId).defaultPlayersPerMatch === ppm) return null;
  const key = ppm === 2 ? 'sport.match1v1' : 'sport.match2v2';
  const label = t(key, lang);
  return label !== key ? label : ppm === 2 ? '1v1' : '2v2';
}

export function collectTelegramGameScheduleExtras(
  game: GameNotificationContext,
  primarySport: Sport | string | null | undefined,
  lang: string,
): string[] {
  const extras: string[] = [];
  if (shouldPrefixSport(game.sport, primarySport)) {
    extras.push(formatSportLabel(resolveSport(game.sport), lang));
  }
  const matchLabel = formatMatchFormatLabel(game.playersPerMatch, game.sport, lang);
  if (matchLabel) extras.push(matchLabel);
  return extras;
}

export function appendTelegramGameScheduleExtras(
  line: string,
  game: GameNotificationContext,
  primarySport: Sport | string | null | undefined,
  lang: string,
  escapeFn: (text: string) => string = (text) => text,
): string {
  const extras = collectTelegramGameScheduleExtras(game, primarySport, lang);
  if (extras.length === 0) return line;
  return `${line} · ${extras.map(escapeFn).join(' · ')}`;
}

/** Sender level for invite push/Telegram: game sport level; dual padel · game when non-padel + rated padel. */
export function formatInviteSenderLevelLine(
  sender: InviteSenderLevelInput | null | undefined,
  gameSport: Sport | string | null | undefined,
  lang: string,
): string | null {
  if (!sender) return null;
  const sport = resolveSport(gameSport ?? Sport.PADEL);
  const levelUser = sender as Parameters<typeof resolveUserSportSnapshot>[0];
  const gameSnap = resolveUserSportSnapshot(levelUser, sport);
  const gameLevel = gameSnap.level.toFixed(1);

  if (sport === Sport.PADEL) {
    return gameLevel;
  }

  const padelSnap = resolveUserSportSnapshot(levelUser, Sport.PADEL);
  const padelRated =
    padelSnap.gamesPlayed > 0 ||
    (padelSnap.level > 1 && Math.abs(padelSnap.level - gameSnap.level) >= 0.05);

  if (padelRated) {
    const padelLabel = formatSportLabel(Sport.PADEL, lang);
    const gameLabel = formatSportLabel(sport, lang);
    return `${padelLabel} ${padelSnap.level.toFixed(1)} · ${gameLabel} ${gameLevel}`;
  }

  const gameLabel = formatSportLabel(sport, lang);
  return `${gameLabel} ${gameLevel}`;
}

export function formatInviteSenderNameWithLevel(
  sender: InviteSenderLevelInput | null | undefined,
  senderName: string,
  gameSport: Sport | string | null | undefined,
  lang: string,
): string {
  const levelLine = formatInviteSenderLevelLine(sender, gameSport, lang);
  if (!levelLine) return senderName;
  return `${senderName} (${levelLine})`;
}

export function buildGameReminderTitle(
  entityType: string | undefined,
  hoursBeforeStart: number,
  gameSport: Sport | string | null | undefined,
  primarySport: Sport | string | null | undefined,
  lang: string,
): string {
  const suffix = hoursBeforeStart === 24 ? '24h' : '2h';
  const entity = entityType || 'GAME';
  const titleKey = `telegram.gameReminder${suffix}.${entity}`;
  const fallbackKey = `telegram.gameReminder${suffix}`;
  const base = t(titleKey, lang) !== titleKey ? t(titleKey, lang) : t(fallbackKey, lang);
  return withOptionalSportPrefix(base, gameSport, primarySport, lang);
}
