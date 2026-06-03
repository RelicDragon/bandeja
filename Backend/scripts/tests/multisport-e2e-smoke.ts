import assert from 'node:assert/strict';
import { EntityType, MatchGenerationType, Sport } from '@prisma/client';
import { getOfficiatingLevelForGame } from '../../src/sport/sportRegistryCasual';
import { getSportConfig } from '../../src/sport/sportRegistry';
import { MATCH_GENERATION_TO_ROTATION, isRotationFormatAllowed } from '../../src/sport/rotationFormats';
import { assertClubSportsCoverCourtSports, assertCourtSportInClub, parseClubSportsInput } from '../../src/shared/clubSports';
import { TIMED_CUSTOM_CREATE_BY_SPORT, timedCustomCreateAllowed } from '../../src/shared/timedCustomPresets';
import { resolveMatchGenerationType } from '../../src/utils/game/resolveMatchGenerationType';
import { validateScoringPreset } from '../../src/utils/validators/gameFormat';
import { validateGameForSport } from '../../src/utils/validators/validateGameForSport';

const SPORTS: Sport[] = [
  Sport.PADEL,
  Sport.TENNIS,
  Sport.PICKLEBALL,
  Sport.BADMINTON,
  Sport.TABLE_TENNIS,
  Sport.SQUASH,
];

function validateCreateDtoLikeCreateService(params: {
  sport: Sport;
  gameType: string;
  matchGenerationType: MatchGenerationType;
  playersPerMatch: number;
  scoringPreset: string;
  maxParticipants?: number;
  minParticipants?: number;
}): void {
  const gameType = params.gameType;
  const scoringPreset = validateScoringPreset(gameType, params.scoringPreset);
  const resolvedMatchGenerationType = resolveMatchGenerationType({
    resultsRoundGenV2: true,
    matchGenerationType: params.matchGenerationType,
    maxParticipants: params.maxParticipants ?? 4,
    playersPerMatch: params.playersPerMatch,
  });
  validateGameForSport({
    sport: params.sport,
    entityType: EntityType.GAME,
    gameType,
    matchGenerationType: resolvedMatchGenerationType,
    maxParticipants: params.maxParticipants ?? 4,
    minParticipants: params.minParticipants ?? 2,
    playersPerMatch: params.playersPerMatch,
    scoringPreset,
  });
}

function testPerSportMatchAndSocialValidation(): void {
  for (const sport of SPORTS) {
    const config = getSportConfig(sport);

    assert.ok(config.ratingModel, `rating model exists for ${sport}`);
    assert.equal(config.ratingModel.id, 'bandeja_elo_v1', `rating model id for ${sport}`);

    const defaultMatchMeta =
      config.presetMeta.find((m) => m.defaultFor === 'match') ?? config.presetMeta.find((m) => m.tier === 'match');
    assert.ok(defaultMatchMeta, `default match preset exists for ${sport}`);
    assert.ok(
      config.allowedScoringPresets.includes(defaultMatchMeta!.preset),
      `default match preset allowed for ${sport}`,
    );

    validateGameForSport({
      sport,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      matchGenerationType: MatchGenerationType.AUTOMATIC,
      playersPerMatch: config.defaultPlayersPerMatch,
      maxParticipants: 4,
      minParticipants: 2,
      scoringPreset: defaultMatchMeta!.preset,
    });

    validateCreateDtoLikeCreateService({
      sport,
      gameType: 'CLASSIC',
      matchGenerationType: MatchGenerationType.AUTOMATIC,
      playersPerMatch: config.defaultPlayersPerMatch,
      scoringPreset: defaultMatchMeta!.preset,
    });

    assert.equal(
      getOfficiatingLevelForGame(sport, defaultMatchMeta!.preset, {}),
      'strict',
      `match template officiating strict for ${sport}`,
    );

    const socialMeta =
      config.presetMeta.find((m) => m.defaultFor === 'social') ?? config.presetMeta.find((m) => m.tier === 'social');
    if (!socialMeta) continue;

    const rotKey = MATCH_GENERATION_TO_ROTATION.RANDOM;
    const socialAllowed =
      rotKey != null && isRotationFormatAllowed(config.rotationFormats, rotKey, 4);
    if (!socialAllowed) continue;

    assert.ok(
      config.allowedScoringPresets.includes(socialMeta.preset),
      `default social preset allowed for ${sport}`,
    );

    validateGameForSport({
      sport,
      entityType: EntityType.GAME,
      gameType: 'AMERICANO',
      matchGenerationType: MatchGenerationType.RANDOM,
      playersPerMatch: 4,
      maxParticipants: 8,
      minParticipants: 4,
      scoringPreset: socialMeta.preset,
    });
  }
}

function testPresetMetaConsistency(): void {
  for (const sport of SPORTS) {
    const config = getSportConfig(sport);
    for (const presetMeta of config.presetMeta) {
      assert.ok(
        config.allowedScoringPresets.includes(presetMeta.preset),
        `${sport} presetMeta ${presetMeta.preset} is in allowedScoringPresets`,
      );
    }
  }
}

function testTimedPresetAllowlist(): void {
  for (const sport of SPORTS) {
    const config = getSportConfig(sport);
    const policy = TIMED_CUSTOM_CREATE_BY_SPORT[sport];
    const timedInRegistry = config.allowedScoringPresets.includes('TIMED');
    assert.equal(timedInRegistry, policy.timed, `TIMED registry policy matches for ${sport}`);
    assert.equal(timedCustomCreateAllowed(sport, 'TIMED'), policy.timed, `TIMED create policy matches for ${sport}`);

    if (policy.timed) {
      validateGameForSport({
        sport,
        gameType: 'CLASSIC',
        matchGenerationType: MatchGenerationType.AUTOMATIC,
        playersPerMatch: config.defaultPlayersPerMatch,
        scoringPreset: 'TIMED',
      });
    } else {
      assert.throws(
        () =>
          validateGameForSport({
            sport,
            gameType: 'CLASSIC',
            matchGenerationType: MatchGenerationType.AUTOMATIC,
            playersPerMatch: config.defaultPlayersPerMatch,
            scoringPreset: 'TIMED',
          }),
        /not allowed/,
        `TIMED rejected for ${sport}`,
      );
    }
  }
}

function testClubSportsValidation(): void {
  assert.deepEqual(
    parseClubSportsInput(['TABLE_TENNIS', 'PADEL', 'PADEL', 'TENNIS']),
    [Sport.PADEL, Sport.TENNIS, Sport.TABLE_TENNIS],
  );
  assert.throws(() => parseClubSportsInput([]), /at least one sport/);
  assert.throws(() => parseClubSportsInput(['PADEL', 'UNKNOWN']), /Invalid sport/);

  assert.doesNotThrow(() => assertCourtSportInClub([Sport.PADEL, Sport.TENNIS], Sport.PADEL));
  assert.throws(
    () => assertCourtSportInClub([Sport.PADEL], Sport.BADMINTON),
    /not enabled/,
  );

  assert.doesNotThrow(() =>
    assertClubSportsCoverCourtSports([Sport.PADEL, Sport.TENNIS], [Sport.PADEL, null, Sport.TENNIS]),
  );
  assert.throws(
    () => assertClubSportsCoverCourtSports([Sport.PADEL], [Sport.TENNIS]),
    /not enabled/,
  );
}

function main(): void {
  testPerSportMatchAndSocialValidation();
  testPresetMetaConsistency();
  testTimedPresetAllowlist();
  testClubSportsValidation();
  console.log('multisport-e2e-smoke: passed');
}

main();
