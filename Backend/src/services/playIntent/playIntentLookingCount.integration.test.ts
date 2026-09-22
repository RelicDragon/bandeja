/**
 * PRD 363 — `PlayIntentLookingCountService` against a real database.
 *
 * Seeds one throw-away city (UTC) and a handful of users, then checks the
 * count: distinct users, viewer excluded, seated players excluded, the
 * two-day window after 18:00 city time, `null` while the flag is off, and a
 * cache hit inside the 60 s window. The flag row is restored afterwards so
 * the dev database is left as it was found.
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameStatus,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  PlayIntentStatus,
  PlayIntentTimeOfDay,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import {
  PLATFORM_SETTING_KEYS,
  PlatformSettingService,
} from '../platformSetting.service';
import { PlayIntentLookingCountService } from './playIntentLookingCount.service';

const FLAG_KEY = PLATFORM_SETTING_KEYS.FIND_LOOKING_COUNT_ENABLED;

function dayKeyUtc(date: Date, offsetDays = 0): string {
  const shifted = new Date(date.getTime() + offsetDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const previousFlag = await prisma.platformSetting.findUnique({
    where: { key: FLAG_KEY },
    select: { value: true },
  });

  const city = await prisma.city.create({
    data: { name: `LookingCount ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const makeUser = (label: string) =>
    prisma.user.create({
      data: {
        phone: `qa-looking-count-${label}-${suffix}`,
        firstName: label,
        currentCityId: city.id,
        sportsEnabled: [Sport.PADEL],
        sportProfiles: { create: { sport: Sport.PADEL, level: 3 } },
      },
      select: { id: true },
    });

  const [viewer, alice, bob, carol, dave, erin] = await Promise.all([
    makeUser('viewer'),
    makeUser('alice'),
    makeUser('bob'),
    makeUser('carol'),
    makeUser('dave'),
    makeUser('erin'),
  ]);
  const userIds = [viewer.id, alice.id, bob.id, carol.id, dave.id, erin.id];

  // A fixed "now" at 10:00 UTC: one-day window today.
  const morning = new Date();
  morning.setUTCHours(10, 0, 0, 0);
  const today = dayKeyUtc(morning);
  const tomorrow = dayKeyUtc(morning, 1);
  const expiresAt = new Date(morning.getTime() + 3 * 86_400_000);

  const makeIntent = (
    userId: string,
    dateKeys: string[],
    status: PlayIntentStatus = PlayIntentStatus.OPEN,
    entityType: EntityType = EntityType.GAME,
  ) =>
    prisma.playIntent.create({
      data: {
        userId,
        cityId: city.id,
        sport: Sport.PADEL,
        entityType,
        dateKeys,
        timeOfDay: PlayIntentTimeOfDay.ANYTIME,
        timeOfDays: [PlayIntentTimeOfDay.ANYTIME],
        status,
        expiresAt,
      },
      select: { id: true },
    });

  let game: { id: string } | null = null;

  try {
    await PlatformSettingService.setSetting(FLAG_KEY, 'true');
    PlatformSettingService.invalidateSettingsCache();
    PlayIntentLookingCountService.clearLocalCacheForTests();

    // viewer: OPEN today (must not count itself)
    await makeIntent(viewer.id, [today]);
    // alice: OPEN today — counts
    await makeIntent(alice.id, [today]);
    // bob: MATCHED today — counts (still looking until seated)
    await makeIntent(bob.id, [today], PlayIntentStatus.MATCHED);
    // carol: OPEN today but PLAYING in a game today — busy, excluded
    await makeIntent(carol.id, [today]);
    // dave: OPEN tomorrow only — outside the one-day window
    await makeIntent(dave.id, [tomorrow]);
    // erin: CANCELLED today — never counts
    await makeIntent(erin.id, [today], PlayIntentStatus.CANCELLED);

    const gameStart = new Date(morning.getTime() + 8 * 3_600_000);
    game = await prisma.game.create({
      data: {
        name: `LookingCount ${suffix}`,
        sport: Sport.PADEL,
        entityType: EntityType.GAME,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime: gameStart,
        endTime: new Date(gameStart.getTime() + 90 * 60_000),
        status: GameStatus.ANNOUNCED,
        maxParticipants: 4,
        participants: {
          create: {
            userId: carol.id,
            role: ParticipantRole.OWNER,
            status: ParticipantStatus.PLAYING,
          },
        },
      },
      select: { id: true },
    });

    const result = await PlayIntentLookingCountService.getForViewer(
      viewer.id,
      city.id,
      Sport.PADEL,
      morning,
    );
    assert.deepEqual(result.dayKeys, [today], 'one-day window before 18:00');
    assert.equal(result.count, 2, 'alice + bob; viewer, busy carol, tomorrow dave, cancelled erin excluded');

    // The viewer is subtracted per request: another viewer sees three.
    const asAlice = await PlayIntentLookingCountService.getForViewer(
      alice.id,
      city.id,
      Sport.PADEL,
      morning,
    );
    assert.equal(asAlice.count, 2, 'alice does not count herself but sees viewer + bob');

    // Cache hit: a change inside the 60 s window is not visible yet… (one
    // live intent per user and city, so dave's intent is widened, not doubled)
    await prisma.playIntent.updateMany({
      where: { userId: dave.id, cityId: city.id },
      data: { dateKeys: [today, tomorrow] },
    });
    const cached = await PlayIntentLookingCountService.getForViewer(
      viewer.id,
      city.id,
      Sport.PADEL,
      morning,
    );
    assert.equal(cached.count, 2, 'served from the 60 s cache');
    // …and is once the cache is dropped.
    PlayIntentLookingCountService.clearLocalCacheForTests();
    const fresh = await PlayIntentLookingCountService.getForViewer(
      viewer.id,
      city.id,
      Sport.PADEL,
      morning,
    );
    assert.equal(fresh.count, 3, 'dave now has a today intent');

    // After 18:00 city time the window spans today + tomorrow; dave's
    // tomorrow-only intent counted already, so the number holds at three and
    // the window is what changes.
    const evening = new Date(morning);
    evening.setUTCHours(19, 0, 0, 0);
    PlayIntentLookingCountService.clearLocalCacheForTests();
    const late = await PlayIntentLookingCountService.getForViewer(
      viewer.id,
      city.id,
      Sport.PADEL,
      evening,
    );
    assert.deepEqual(late.dayKeys, [today, tomorrow], 'two-day window after 18:00');
    assert.equal(late.count, 3);

    // Another sport is another scope.
    const tennis = await PlayIntentLookingCountService.getForViewer(
      viewer.id,
      city.id,
      Sport.TENNIS,
      morning,
    );
    assert.equal(tennis.count, 0);

    // Flag off → null, window still reported.
    await PlatformSettingService.setSetting(FLAG_KEY, 'false');
    PlatformSettingService.invalidateSettingsCache();
    const off = await PlayIntentLookingCountService.getForViewer(
      viewer.id,
      city.id,
      Sport.PADEL,
      morning,
    );
    assert.equal(off.count, null, 'flag off hides the number');
    assert.deepEqual(off.dayKeys, [today]);

    // No row at all → on by default.
    await prisma.platformSetting.deleteMany({ where: { key: FLAG_KEY } });
    PlatformSettingService.invalidateSettingsCache();
    PlayIntentLookingCountService.clearLocalCacheForTests();
    const unset = await PlayIntentLookingCountService.getForViewer(
      viewer.id,
      city.id,
      Sport.PADEL,
      morning,
    );
    assert.equal(unset.count, 3, 'unset flag counts: the feature is on by default');
  } finally {
    if (previousFlag) {
      await PlatformSettingService.setSetting(FLAG_KEY, previousFlag.value);
    } else {
      await prisma.platformSetting.deleteMany({ where: { key: FLAG_KEY } });
    }
    PlatformSettingService.invalidateSettingsCache();
    PlayIntentLookingCountService.clearLocalCacheForTests();

    if (game) {
      await prisma.gameParticipant.deleteMany({ where: { gameId: game.id } });
      await prisma.game.delete({ where: { id: game.id } }).catch(() => undefined);
    }
    await prisma.playIntent
      .deleteMany({ where: { userId: { in: userIds } } })
      .catch(() => undefined);
    await prisma.userSportProfile
      .deleteMany({ where: { userId: { in: userIds } } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    await prisma.city.delete({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }

  console.log('playIntentLookingCount.integration.test.ts: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
