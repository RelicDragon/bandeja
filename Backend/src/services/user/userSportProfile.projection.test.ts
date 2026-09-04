import assert from 'node:assert/strict';
import { Sport } from '@prisma/client';
import {
  projectUserByPrimarySport,
  projectUserForSportContext,
} from './userSportProfile.service';

function run() {
  const user = {
    id: 'u1',
    firstName: 'Ann',
    lastName: 'Bee',
    primarySport: Sport.TABLE_TENNIS,
    sportsEnabled: [Sport.TABLE_TENNIS, Sport.PADEL],
    sportProfiles: [
      { sport: Sport.PADEL, level: 2.7, reliability: 50, gamesPlayed: 3, gamesWon: 1 },
      { sport: Sport.TABLE_TENNIS, level: 3.5, reliability: 60, gamesPlayed: 5, gamesWon: 2 },
    ],
  } as never;

  // Default projection stays slim: primary-sport summary, no per-sport profiles.
  const slim = projectUserByPrimarySport(user) as Record<string, unknown> & {
    sportProfiles?: unknown;
  };
  assert.equal(slim.level, 3.5);
  assert.equal(slim.sportProfiles, undefined);

  // Chat surfaces keep profiles so clients can badge the viewer's sport.
  const kept = projectUserByPrimarySport(user, { keepSportProfiles: true }) as {
    level: number;
    sportProfiles: Array<{ sport: Sport; level: number }>;
    sportsEnabled: Sport[];
  };
  assert.equal(kept.level, 3.5, 'top-level level stays the subject primary projection');
  assert.equal(kept.sportProfiles.length, 2);
  const padel = kept.sportProfiles.find((p) => p.sport === Sport.PADEL)!;
  assert.equal(padel.level, 2.7);
  assert.deepEqual(kept.sportsEnabled, [Sport.TABLE_TENNIS, Sport.PADEL]);

  // Same option for context-sport projection (poll voters, game rosters).
  const keptForSport = projectUserForSportContext(user, Sport.PADEL, {
    keepSportProfiles: true,
  }) as { level: number; sportProfiles: unknown[] };
  assert.equal(keptForSport.level, 2.7);
  assert.equal(keptForSport.sportProfiles.length, 2);

  console.log('userSportProfile.projection.test.ts: all assertions passed');
}

run();
