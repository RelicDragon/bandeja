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

run();
