import assert from 'node:assert/strict';
import {
  FIND_CARD_FORBIDDEN_USER_KEYS,
  FIND_CARD_USER_SELECT,
  assertAvailableGamesCardContract,
  collectAvailableGamesCardContractIssues,
  getAvailableGamesCardInclude,
} from './availableGamesCard.projection';

function run() {
  const include = getAvailableGamesCardInclude();

  assert.equal(
    'integrationConfig' in (include.club.select as object),
    false,
    'club must omit integrationConfig',
  );
  assert.equal(
    'telegramGroupId' in (include.city.select as object),
    false,
    'city must omit telegramGroupId',
  );
  assert.equal(
    'resultsArtifactJob' in include,
    false,
    'include must omit resultsArtifactJob',
  );
  assert.ok(
    include.participants.select.user.select === FIND_CARD_USER_SELECT,
    'participants use Find card user select',
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

  console.log('availableGamesCard.projection.test.ts: ok');
}

run();
