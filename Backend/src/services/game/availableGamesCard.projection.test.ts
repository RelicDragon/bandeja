import assert from 'node:assert/strict';
import {
  FIND_CARD_FORBIDDEN_GAME_KEYS,
  FIND_CARD_FORBIDDEN_USER_KEYS,
  FIND_CARD_GAME_SELECT,
  FIND_CARD_PARTICIPANT_STATUSES,
  FIND_CARD_USER_SELECT,
  assertAvailableGamesCardContract,
  collectAvailableGamesCardContractIssues,
  getAvailableGamesCardInclude,
  getAvailableGamesCardSelect,
} from './availableGamesCard.projection';
import {
  GAME_BROADCAST_STRIPPED_KEYS,
  GAME_DETAIL_ENTITLED_GAME_KEYS,
  GAME_DETAIL_GAME_SCALAR_SELECT,
  GAME_DETAIL_VIEWER_SCOPED_KEYS,
  GAME_PAYMENT_HINT_SELECT,
  GAME_DETAIL_GUEST_USER_SELECT,
  assertGameDetailGuestContract,
  collectGameDetailGuestContractIssues,
  getGameDetailSelect,
  getGameListSelect,
  isEntitledToGamePaymentHint,
  projectGameForBroadcast,
} from './gameDetail.projection';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function run() {
  const select = getAvailableGamesCardSelect({ viewerUserId: 'viewer-1' });
  const include = getAvailableGamesCardInclude();

  assert.equal(FIND_CARD_GAME_SELECT.id, true);
  assert.equal('description' in FIND_CARD_GAME_SELECT, false);
  assert.equal('mediaUrls' in FIND_CARD_GAME_SELECT, false);
  assert.equal('metadata' in FIND_CARD_GAME_SELECT, false);
  assert.ok(select.id === true && select.startTime === true && select.cityId === true);
  assert.equal(
    'integrationConfig' in ((select.club as { select: object }).select as object),
    false,
    'club must omit integrationConfig',
  );
  assert.equal(
    'telegramGroupId' in ((select.city as { select: object }).select as object),
    false,
    'city must omit telegramGroupId',
  );
  assert.equal(
    'resultsArtifactJob' in select,
    false,
    'select must omit resultsArtifactJob',
  );
  assert.equal(
    'outcomes' in select,
    false,
    'card select omits outcomes (attached only for FINAL)',
  );
  assert.ok(
    (select.participants as { select: { user: { select: unknown } } }).select.user.select ===
      FIND_CARD_USER_SELECT,
    'participants use Find card user select',
  );
  assert.deepEqual([...FIND_CARD_PARTICIPANT_STATUSES], ['PLAYING', 'IN_QUEUE', 'INVITED']);
  assert.equal(
    'inviteMessage' in ((select.participants as { select: object }).select as object),
    false,
    'Find card participants omit inviteMessage',
  );
  // PRD 359 — seats-left and "2nd in line" are computed on the client from the
  // card roster, so both columns must survive the slim select.
  const participantSelect = (select.participants as { select: Record<string, unknown> }).select;
  assert.equal(participantSelect.status, true, 'Find card participants carry status');
  assert.equal(
    participantSelect.joinedAt,
    true,
    'Find card participants carry joinedAt — the queue has no other ordering',
  );
  assert.equal(
    'bio' in FIND_CARD_USER_SELECT,
    false,
    'Find card user omit bio',
  );
  assert.ok(
    FIND_CARD_USER_SELECT.sportProfiles?.select?.level === true,
    'Find card still selects level for projection',
  );
  assert.ok(
    FIND_CARD_USER_SELECT.sportProfiles?.select?.approvedLevel === true,
    'Find card selects approvedLevel for sport confirmation projection',
  );
  assert.ok(
    include.outcomes?.select?.userId === true &&
      include.outcomes?.select?.position === true &&
      !('pointsEarned' in (include.outcomes?.select as object)),
    'deprecated include still documents slim positioned outcomes',
  );

  const validCard = {
    id: 'g1',
    sport: 'PADEL',
    city: { id: 'c1', name: 'Belgrade', country: 'RS', timezone: 'Europe/Belgrade' },
    club: { id: 'cl1', name: 'Club', city: { timezone: 'Europe/Belgrade' } },
    participants: [
      {
        userId: 'u1',
        role: 'OWNER',
        status: 'PLAYING',
        joinedAt: '2026-09-20T10:00:00.000Z',
        user: {
          id: 'u1',
          firstName: 'A',
          lastName: 'B',
          avatar: null,
          gender: 'MALE',
          level: 3.5,
          isPremium: false,
          isTrainer: false,
        },
      },
    ],
  };

  assert.deepEqual(collectAvailableGamesCardContractIssues([validCard]), []);
  assertAvailableGamesCardContract([validCard]);

  // PRD 359 — dropping either column from the select is a silent card
  // regression, so the contract check fails loudly instead.
  const noJoinedAt = {
    ...validCard,
    participants: [
      Object.fromEntries(
        Object.entries(validCard.participants[0]).filter(([key]) => key !== 'joinedAt'),
      ),
    ],
  };
  assert.ok(
    collectAvailableGamesCardContractIssues([noJoinedAt]).some((i) => i.path.endsWith('.joinedAt')),
    'a participant without joinedAt cannot be ordered in the queue',
  );
  const noStatus = {
    ...validCard,
    participants: [{ ...validCard.participants[0], status: undefined }],
  };
  assert.ok(
    collectAvailableGamesCardContractIssues([noStatus]).some((i) => i.path.endsWith('.status')),
    'a participant without status cannot be counted against the seats',
  );

  const fatUser = {
    ...validCard,
    participants: [
      {
        ...validCard.participants[0],
        user: {
          ...validCard.participants[0].user,
          bio: 'x',
          sportProfiles: [{ sport: 'PADEL', level: 3.5 }],
        },
      },
    ],
  };
  const fatIssues = collectAvailableGamesCardContractIssues([fatUser]);
  assert.ok(fatIssues.some((i) => i.path.includes('bio')));
  assert.ok(fatIssues.some((i) => i.path.includes('sportProfiles')));

  const fatClub = {
    ...validCard,
    club: { ...validCard.club, integrationConfig: { token: 'x' }, integrationType: 'PLAYTOMIC' },
  };
  const clubIssues = collectAvailableGamesCardContractIssues([fatClub]);
  assert.ok(clubIssues.some((i) => i.path.includes('integrationConfig')));
  assert.ok(clubIssues.some((i) => i.path.includes('integrationType')));

  const withTelegram = {
    ...validCard,
    city: { ...validCard.city, telegramGroupId: 'tg' },
  };
  assert.ok(
    collectAvailableGamesCardContractIssues([withTelegram]).some((i) =>
      i.path.includes('telegramGroupId'),
    ),
  );

  assert.ok(FIND_CARD_FORBIDDEN_USER_KEYS.includes('bio'));
  assert.ok(FIND_CARD_FORBIDDEN_GAME_KEYS.includes('description'));

  const fatGame = { ...validCard, description: 'long', mediaUrls: ['a'] };
  assert.ok(
    collectAvailableGamesCardContractIssues([fatGame]).some((i) => i.path.includes('description')),
  );

  const fatOutcomes = {
    ...validCard,
    resultsStatus: 'FINAL',
    outcomes: [{ userId: 'u1', position: 1, pointsEarned: 3, user: { id: 'u1', bio: 'x' } }],
  };
  assert.ok(
    collectAvailableGamesCardContractIssues([fatOutcomes]).some((i) =>
      i.path.includes('outcomes') && i.reason.includes('user'),
    ),
    'Find card outcomes must not include user trees',
  );

  console.log('availableGamesCard.projection.test.ts: ok');
}

/**
 * `GET /api/games/:id` — the whitelist projection and the `paymentHint`
 * entitlement.
 *
 * Would have failed before `gameDetail.projection.ts` existed: the endpoint ran
 * `include: gameWithRoundsAndOutcomes`, a **top-level include**, so every
 * `Game` scalar — PRD 348's `Game.paymentHint`, an IBAN or a Revolut handle —
 * was returned to a caller on `optionalAuth` with no token at all.
 */
function runGameDetail() {
  // 1. the scalar whitelist never carries the entitled column.
  for (const key of GAME_DETAIL_ENTITLED_GAME_KEYS) {
    assert.equal(
      key in GAME_DETAIL_GAME_SCALAR_SELECT,
      false,
      `${key} is never part of the base scalar whitelist`,
    );
  }
  assert.equal(GAME_DETAIL_GAME_SCALAR_SELECT.id, true);
  // Fields the detail screen genuinely reads must survive the switch to select.
  for (const key of [
    'description',
    'metadata',
    'maxParticipants',
    'allowDirectJoin',
    'resultsStatus',
    'priceType',
    'priceTotal',
    'priceCurrency',
    'costPayerId',
    'seriesId',
    'lastSeatOpenedAt',
    'autoFillFromQueue',
    'showOnLiveRail',
    'weatherAlertState',
    'mainPhotoId',
    'resultsArtifactsVersion',
    'deucesBeforeGoldenPoint',
  ] as const) {
    assert.equal(
      (GAME_DETAIL_GAME_SCALAR_SELECT as Record<string, unknown>)[key],
      true,
      `game detail must still select ${key}`,
    );
  }

  // 2. guest vs entitled select.
  const guest = getGameDetailSelect({ viewerIsAuthenticated: false });
  assert.equal('paymentHint' in guest, false, 'a guest select never names paymentHint');
  const guestClub = (guest.club as unknown as { select: Record<string, unknown> }).select;
  assert.equal('integrationConfig' in guestClub, false, 'guest club omits integrationConfig');
  assert.equal('ptMeta' in guestClub, false, 'guest club omits ptMeta');
  const guestCourtClub = (
    (guest.court as unknown as { select: Record<string, unknown> }).select.club as {
      select: Record<string, unknown>;
    }
  ).select;
  assert.equal(
    'integrationConfig' in guestCourtClub,
    false,
    'guest court.club omits integrationConfig',
  );
  assert.equal('bio' in GAME_DETAIL_GUEST_USER_SELECT, false, 'guest user omits bio');
  assert.equal(
    'weeklyAvailability' in GAME_DETAIL_GUEST_USER_SELECT,
    false,
    'guest user omits weeklyAvailability',
  );
  assert.equal(
    'socialLevel' in GAME_DETAIL_GUEST_USER_SELECT,
    false,
    'guest user omits socialLevel',
  );

  const entitled = getGameDetailSelect({ viewerIsAuthenticated: true });
  for (const key of GAME_DETAIL_ENTITLED_GAME_KEYS) {
    assert.equal(
      key in entitled,
      false,
      `even the signed-in select never names ${key} — it is a separate, authorised read`,
    );
  }
  assert.equal(GAME_PAYMENT_HINT_SELECT.paymentHint, true);
  assert.equal(GAME_PAYMENT_HINT_SELECT.paymentMethods, true);
  const memberClub = (entitled.club as unknown as { select: Record<string, unknown> }).select;
  assert.equal(
    memberClub.integrationConfig,
    true,
    'a signed-in viewer keeps the booking integration config the linked-bookings card parses',
  );

  // The parent is another Game row with its own paymentHint column.
  const parentSelect = (entitled.parent as unknown as { select: Record<string, unknown> }).select;
  for (const key of GAME_DETAIL_ENTITLED_GAME_KEYS) {
    assert.equal(
      key in parentSelect,
      false,
      `a parent league/tournament row never carries ${key}`,
    );
  }

  // 2b. `GET /api/games` is the same `optionalAuth` route shape.
  const list = getGameListSelect({ viewerIsAuthenticated: false });
  for (const key of GAME_DETAIL_ENTITLED_GAME_KEYS) {
    assert.equal(key in list, false, `the list never carries ${key}`);
  }
  assert.equal('rounds' in list, false, 'the list stays slim — no rounds');
  assert.equal('outcomes' in list, false, 'the list stays slim — no outcomes');
  assert.equal('gameCourts' in list, false, 'the list stays slim — no per-game courts');
  assert.equal(list.participants !== undefined, true, 'the list still carries the roster');
  assert.equal(list.court !== undefined, true, 'the list still carries the court');
  assert.equal(list.parent !== undefined, true, 'the list still carries the league parent');
  assert.equal(
    'integrationConfig' in
      ((list.club as unknown as { select: Record<string, unknown> }).select as object),
    false,
    'a guest list omits integrationConfig too',
  );

  // 3. the entitlement itself — roster, organizers, platform staff, nobody else.
  const roster = [{ userId: 'member-1' }, { userId: 'owner-1' }];
  assert.equal(isEntitledToGamePaymentHint(roster, { userId: undefined }), false);
  assert.equal(isEntitledToGamePaymentHint(roster, { userId: null }), false);
  assert.equal(isEntitledToGamePaymentHint(roster, { userId: 'stranger' }), false);
  assert.equal(isEntitledToGamePaymentHint(roster, { userId: 'member-1' }), true);
  assert.equal(
    isEntitledToGamePaymentHint(roster, { userId: 'stranger', isPlatformAdmin: true }),
    true,
  );
  assert.equal(isEntitledToGamePaymentHint([], { userId: 'stranger' }), false);

  // 4. the contract asserter catches a regression in any of the three places.
  const cleanPayload = {
    id: 'g1',
    club: { id: 'c1', name: 'Club' },
    court: { id: 'ct1', club: { id: 'c1', name: 'Club' } },
    participants: [{ userId: 'u1', user: { id: 'u1', firstName: 'A' } }],
    outcomes: [{ userId: 'u1', user: { id: 'u1', firstName: 'A' } }],
    parent: { id: 'p1' },
  };
  assert.deepEqual(collectGameDetailGuestContractIssues(cleanPayload), []);
  assertGameDetailGuestContract(cleanPayload);

  assert.deepEqual(
    collectGameDetailGuestContractIssues({
      ...cleanPayload,
      paymentHint: 'IBAN RS35 1234',
    }).map((i) => i.path),
    ['paymentHint'],
    'the leaked column is named exactly',
  );
  assert.ok(
    collectGameDetailGuestContractIssues({
      ...cleanPayload,
      club: { ...cleanPayload.club, integrationConfig: { companyId: 'x' } },
    }).some((i) => i.path === 'club.integrationConfig'),
  );
  assert.ok(
    collectGameDetailGuestContractIssues({
      ...cleanPayload,
      participants: [{ userId: 'u1', user: { id: 'u1', bio: 'secret' } }],
    }).some((i) => i.path.endsWith('.bio')),
  );
  assert.ok(
    collectGameDetailGuestContractIssues({
      ...cleanPayload,
      parent: { id: 'p1', paymentHint: 'Revolut @x' },
    }).some((i) => i.path === 'parent.paymentHint'),
  );
  assert.ok(
    collectGameDetailGuestContractIssues({
      ...cleanPayload,
      parent: { id: 'p1', paymentMethods: [{ method: 'BIZUM', handle: '+34600112233' }] },
    }).some((i) => i.path === 'parent.paymentMethods'),
  );
  // PRD 348 — the structured list is the same secret as the free-text hint
  // (a Bizum phone number, an IBAN, a Pix key) and is gated identically.
  assert.deepEqual([...GAME_DETAIL_ENTITLED_GAME_KEYS], ['paymentHint', 'paymentMethods']);

  console.log('gameDetail.projection contract: ok');
}

/**
 * The socket `game-updated` payload.
 *
 * Fails on the pre-fix code: `SocketService.emitGameUpdate` broadcast whatever
 * game object its caller handed it — one projected for the **actor**. An
 * organizer saving an edit (`update.service.ts`) is entitled to
 * `Game.paymentHint`, so her IBAN went to every socket in `game-${id}`,
 * including a league-season player who is not on that fixture's roster and whom
 * `GET /api/games/:id` correctly refuses.
 *
 * The rule: one payload, many entitlements → project for the least-entitled
 * member of the room.
 */
function runBroadcastProjection() {
  assert.deepEqual(
    [...GAME_BROADCAST_STRIPPED_KEYS],
    ['paymentHint', 'paymentMethods', 'userNote', 'isClubFavorite'],
    'the broadcast strips both entitled columns and both viewer-scoped fields',
  );
  assert.deepEqual([...GAME_DETAIL_VIEWER_SCOPED_KEYS], ['userNote', 'isClubFavorite']);

  const entitledPayload = {
    id: 'g1',
    name: 'Friday doubles',
    priceType: 'FIXED',
    priceTotal: 40,
    priceCurrency: 'EUR',
    paymentHint: 'IPS Prenesi +381601112233',
    paymentMethods: [{ method: 'IPS_PRENESI', handle: '+381601112233' }],
    userNote: 'bring the pink balls',
    isClubFavorite: true,
    participants: [{ userId: 'u1' }],
  };

  const broadcast = projectGameForBroadcast(entitledPayload);
  assert.equal(
    'paymentHint' in broadcast,
    false,
    'a broadcast never carries the organizer payment handle',
  );
  assert.equal(
    'paymentMethods' in broadcast,
    false,
    'nor the structured list the handle now lives in',
  );
  assert.equal('userNote' in broadcast, false, 'a broadcast never carries the actor private note');
  assert.equal('isClubFavorite' in broadcast, false, 'nor the actor favourite flag');

  // Everything else survives byte for byte — the payload is still a full game.
  assert.equal(broadcast.id, 'g1');
  assert.equal(broadcast.name, 'Friday doubles');
  assert.equal(broadcast.priceType, 'FIXED');
  assert.equal(broadcast.priceTotal, 40);
  assert.equal(broadcast.priceCurrency, 'EUR');
  assert.deepEqual(broadcast.participants, [{ userId: 'u1' }]);
  assert.notEqual(broadcast, entitledPayload, 'the caller copy is not mutated');
  assert.equal(entitledPayload.paymentHint, 'IPS Prenesi +381601112233');
  assert.equal(entitledPayload.paymentMethods.length, 1);

  // A payload that never had the keys is unchanged.
  assert.deepEqual(projectGameForBroadcast({ id: 'g2', name: 'n' }), { id: 'g2', name: 'n' });

  // An explicit null is still a value, and still stripped: `paymentHint: null`
  // is exactly what wiped the organizer's IBAN once the client wrote it back.
  assert.equal('paymentHint' in projectGameForBroadcast({ id: 'g3', paymentHint: null }), false);

  // Both `game-updated` emits must use the projected copy, not the caller's.
  const socketSource = readFileSync(
    path.join(__dirname, '..', 'socket.service.ts'),
    'utf8',
  );
  const emitCount = socketSource.split("emit('game-updated'").length - 1;
  assert.equal(emitCount, 2, 'socket.service.ts has exactly the two known game-updated emits');
  assert.equal(
    socketSource.split('game: broadcastGame').length - 1,
    2,
    'both game-updated emits send the broadcast projection',
  );
  assert.equal(
    socketSource.includes('game: gameToEmit'),
    false,
    'the actor-projected object is never emitted directly',
  );
  assert.ok(
    socketSource.includes('const broadcastGame = projectGameForBroadcast(gameToEmit)'),
    'the projection is applied once, after the game is resolved',
  );

  console.log('game-updated broadcast projection: ok');
}

run();
runGameDetail();
runBroadcastProjection();
