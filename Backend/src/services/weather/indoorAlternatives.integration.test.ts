/**
 * PRD 357 — `GET /games/:id/indoor-alternatives`, proven against a real club.
 *
 * `indoorAlternativesRules.test.ts` covers the availability rule with fixtures.
 * What only the database answers is the query around it:
 *   · the club is resolved from the game's linked courts, not only `clubId`;
 *   · only **indoor, active** courts of the game's sport are offered;
 *   · a court already taken by another app game in the window is Busy;
 *   · `currentCourts` comes back in order, so the caller can swap exactly one
 *     outdoor court and keep the rest (`planIndoorCourtSwap`);
 *   · `outdoorCourtCount` / `totalCourtCount` drive "1 of 2 courts outdoor";
 *   · a club with no indoor court answers with an empty list, not an error.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced and removed.
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  ResultsStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { getIndoorAlternatives } from './indoorAlternatives.service';

process.env.E2E_TEST = '1';

const HOURS = 60 * 60 * 1000;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];
  const createdClubIds: string[] = [];
  const createdCourtIds: string[] = [];

  const city = await prisma.city.create({
    data: { name: `Indoor ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const makeCourt = async (clubId: string, name: string, isIndoor: boolean, isActive = true) => {
    const court = await prisma.court.create({
      data: { clubId, name: `${name} ${suffix}`, isIndoor, isActive, sport: Sport.PADEL },
    });
    createdCourtIds.push(court.id);
    return court;
  };

  try {
    const club = await prisma.club.create({
      data: {
        name: `Indoor club ${suffix}`,
        normalizedName: `indoor-club-${suffix}`,
        address: 'Test address',
        cityId: city.id,
        isActive: true,
      },
    });
    createdClubIds.push(club.id);

    const outdoorA = await makeCourt(club.id, 'Outdoor A', false);
    const outdoorB = await makeCourt(club.id, 'Outdoor B', false);
    const indoorFree = await makeCourt(club.id, 'Indoor free', true);
    const indoorBusy = await makeCourt(club.id, 'Indoor busy', true);
    const indoorRetired = await makeCourt(club.id, 'Indoor retired', true, false);

    const owner = await prisma.user.create({
      data: {
        phone: `qa-indoor-owner-${suffix}`,
        firstName: 'Owner',
        currentCityId: city.id,
        primarySport: Sport.PADEL,
      },
    });
    createdUserIds.push(owner.id);

    const startTime = new Date(Date.now() + 12 * HOURS);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);

    // The game under test: two courts, both outdoor. `clubId` is deliberately
    // left null so the club has to be resolved through the linked courts.
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime,
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 4,
        resultsStatus: ResultsStatus.NONE,
        courtId: outdoorA.id,
      },
    });
    createdGameIds.push(game.id);
    await prisma.gameParticipant.create({
      data: {
        gameId: game.id,
        userId: owner.id,
        role: ParticipantRole.OWNER,
        status: ParticipantStatus.PLAYING,
      },
    });
    await prisma.gameCourt.createMany({
      data: [
        { gameId: game.id, courtId: outdoorA.id, order: 0 },
        { gameId: game.id, courtId: outdoorB.id, order: 1 },
      ],
    });

    // Somebody else already has the busy indoor court for the same window.
    const blocker = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime,
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 4,
        resultsStatus: ResultsStatus.NONE,
        courtId: indoorBusy.id,
      },
    });
    createdGameIds.push(blocker.id);
    await prisma.gameCourt.create({
      data: { gameId: blocker.id, courtId: indoorBusy.id, order: 0 },
    });

    const result = await getIndoorAlternatives(game.id);

    assert.equal(result.clubId, club.id, 'the club is resolved through the linked courts');
    assert.equal(result.outdoorCourtCount, 2, 'both linked courts are counted as outdoor');
    assert.equal(result.totalCourtCount, 2, 'the total is the linked court count');
    assert.deepEqual(
      result.currentCourts.map((court) => court.id),
      [outdoorA.id, outdoorB.id],
      'current courts come back in link order, so one can be swapped in place',
    );
    assert.equal(
      result.hasLinkedBooking,
      false,
      'no external booking is linked, so no warning is raised',
    );

    const offered = new Map(result.courts.map((court) => [court.id, court]));
    assert.ok(offered.has(indoorFree.id), 'a free indoor court of the right sport is offered');
    assert.ok(
      offered.get(indoorFree.id)?.isFree,
      'the free court is marked free',
    );
    assert.ok(
      !offered.has(indoorRetired.id),
      'an inactive court is never offered',
    );
    assert.ok(
      !offered.has(outdoorA.id) && !offered.has(outdoorB.id),
      'outdoor courts are not alternatives to themselves',
    );
    if (offered.has(indoorBusy.id)) {
      assert.equal(
        offered.get(indoorBusy.id)?.isFree,
        false,
        'a court another game holds for the same window reads Busy',
      );
    }

    // -------------------------------------------------------------------
    // A club with no indoor court answers with an empty list, not an error.
    // -------------------------------------------------------------------
    const bareClub = await prisma.club.create({
      data: {
        name: `Outdoor only ${suffix}`,
        normalizedName: `outdoor-only-${suffix}`,
        address: 'Test address',
        cityId: city.id,
        isActive: true,
      },
    });
    createdClubIds.push(bareClub.id);
    const bareCourt = await makeCourt(bareClub.id, 'Only outdoor', false);
    const bareGame = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime,
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 4,
        resultsStatus: ResultsStatus.NONE,
        clubId: bareClub.id,
        courtId: bareCourt.id,
      },
    });
    createdGameIds.push(bareGame.id);

    const bareResult = await getIndoorAlternatives(bareGame.id);
    assert.deepEqual(bareResult.courts, [], 'no indoor courts means an empty list');
    assert.equal(bareResult.outdoorCourtCount, 1, 'the single outdoor court is still reported');

    // -------------------------------------------------------------------
    // A game with no fixed time cannot be offered a window.
    // -------------------------------------------------------------------
    await prisma.game.update({ where: { id: game.id }, data: { timeIsSet: false } });
    const noTime = await getIndoorAlternatives(game.id);
    assert.deepEqual(
      noTime.courts,
      [],
      'a game whose time is not set is never told a court is free',
    );

    console.log('indoorAlternatives.integration.test.ts: ok');
  } finally {
    await prisma.gameCourt
      .deleteMany({ where: { gameId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.chatMessage
      .deleteMany({ where: { gameId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.chatSyncEvent
      .deleteMany({ where: { contextId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.court.deleteMany({ where: { id: { in: createdCourtIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
    await prisma.club.deleteMany({ where: { id: { in: createdClubIds } } }).catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})();
