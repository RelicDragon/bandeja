import { PlayIntentStatus, type EntityType, type GenderTeam, type Sport } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '../../config/database';
import { PlayIntentService } from '../playIntent/playIntent.service';
import { intentMatchesGame, timeStringToMinutes } from '../playIntent/playIntentCriteria';
import { intentWindowIsReachable } from '../playIntent/playIntentFreshness';

/**
 * PRD 347 — users whose OPEN play intent fits *this one* game.
 *
 * This is deliberately the same scoring the radar/notify path uses
 * (`PlayIntentMatchService.onPublicGameCreated`): same `intentMatchesGame`
 * predicate, same reachability window, same "already playing that day" filter.
 * The PRD is explicit that `GAME_MATCHES_INTENT` semantics must not change, so
 * nothing here writes to intents — it only reads and scores.
 */
export interface IntentScorableGame {
  id: string;
  cityId: string;
  clubId: string | null;
  sport: Sport;
  entityType: EntityType;
  startTime: Date;
  minLevel: number | null;
  maxLevel: number | null;
  genderTeams: GenderTeam | null;
  city?: { timezone: string } | null;
}

export async function listIntentUserIdsForGame(
  game: IntentScorableGame,
  now: Date,
  status: PlayIntentStatus = PlayIntentStatus.OPEN,
): Promise<string[]> {
  if (!game.clubId) return [];

  const timezone = game.city?.timezone || 'UTC';
  const dateKey = formatInTimeZone(game.startTime, timezone, 'yyyy-MM-dd');
  const startMinutes = timeStringToMinutes(
    formatInTimeZone(game.startTime, timezone, 'HH:mm'),
  );

  const intents = await prisma.playIntent.findMany({
    where: {
      cityId: game.cityId,
      sport: game.sport,
      entityType: game.entityType,
      status,
      expiresAt: { gt: now },
    },
    include: {
      user: {
        select: {
          id: true,
          gender: true,
          sportProfiles: { select: { sport: true, level: true } },
        },
      },
    },
  });
  if (intents.length === 0) return [];

  // Deferred import: `playIntentMatch.service` sits at the centre of a very
  // wide import graph, and this module is loaded from `participant.service`.
  // `participant.service` already reaches it this way for the same reason.
  const { PlayIntentMatchService } = await import('../playIntent/playIntentMatch.service');
  const busy = await PlayIntentMatchService.usersBusyPlaying(
    intents.map((intent) => intent.userId),
    [dateKey],
    game.cityId,
  );

  const matched: string[] = [];
  for (const intent of intents) {
    if (busy.has(intent.userId)) continue;
    if (!intentWindowIsReachable(intent, timezone, now)) continue;
    const criteria = PlayIntentService.toCriteria({ ...intent, sport: intent.sport });
    const fits = intentMatchesGame(
      criteria,
      {
        entityType: game.entityType,
        dateKey,
        clubId: game.clubId,
        startTime: game.startTime,
        startTimeMinutes: startMinutes,
        minLevel: game.minLevel,
        maxLevel: game.maxLevel,
        genderTeams: game.genderTeams,
      },
      now,
    );
    if (fits) matched.push(intent.userId);
  }
  return matched;
}
