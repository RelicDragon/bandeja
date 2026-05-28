/**
 * Watch competitive level badge — static QA (P6-D level display).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const watchRoot = join(repoRoot, 'Frontend/ios/App/BandejaWatch Watch App');
const backendSrc = join(repoRoot, 'Backend/src');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function readWatch(rel: string): string {
  return readFileSync(join(watchRoot, rel), 'utf8');
}

function testLevelColorAndProfileSports(): void {
  const color = readWatch('Models/WatchLevelColor.swift');
  assert(color.includes('enum WatchLevelColor'), 'WatchLevelColor exists');
  assert(color.includes('59, 130, 246'), 'WatchLevelColor uses FE blue stop');

  const profiles = readWatch('Models/WatchProfileSports.swift');
  assert(profiles.includes('formatLevelBadge(for user: WatchUser, sport: WatchSport)'), 'formatLevelBadge helper');
  assert(profiles.includes('isSportLevelAvailable(for user: WatchUser, sport: WatchSport)'), 'isSportLevelAvailable helper');
  assert(profiles.includes('struct WatchSportProfile'), 'WatchSportProfile model');
  console.log('ok: Watch level color + profile sports helpers');
}

function testWatchUserSportProfiles(): void {
  const game = readWatch('Models/WatchGame.swift');
  assert(game.includes('sportsEnabled'), 'WatchUser decodes sportsEnabled');
  assert(game.includes('sportProfiles'), 'WatchUser decodes sportProfiles');
  assert(game.includes('primarySport'), 'WatchUser decodes primarySport');
  console.log('ok: WatchUser multisport fields');
}

function testAvatarLevelBadge(): void {
  const avatar = readWatch('Views/WatchPlayerAvatarView.swift');
  assert(avatar.includes('levelSport: WatchSport?'), 'WatchPlayerAvatarView levelSport prop');
  assert(avatar.includes('WatchProfileSports.formatLevelBadge'), 'avatar uses formatLevelBadge');
  assert(avatar.includes('WatchLevelColor.color'), 'avatar uses level color');
  assert(avatar.includes('showLevel'), 'avatar showLevel toggle');
  console.log('ok: WatchPlayerAvatarView level badge');
}

function testCallSitesPassLevelSport(): void {
  const chip = readWatch('Views/GameDetail/ParticipantChipView.swift');
  assert(chip.includes('levelSport: WatchSport?'), 'ParticipantChipView levelSport');
  const column = readWatch('Views/Scoring/WatchScoringTeamColumn.swift');
  assert(column.includes('levelSport: WatchSport?'), 'WatchScoringTeamColumn levelSport');
  const detail = readWatch('Views/GameDetail/GameDetailView.swift');
  assert(detail.includes('levelSport: game.resolvedSport'), 'GameDetailView passes game sport');
  const classic = readWatch('Views/Scoring/ClassicScoringView.swift');
  assert(classic.includes('levelSport: vm.game?.resolvedSport'), 'ClassicScoringView passes game sport');
  console.log('ok: Watch call sites thread levelSport');
}

function testGameUserSelectIncludesSportsEnabled(): void {
  const constants = readFileSync(join(backendSrc, 'utils/constants.ts'), 'utf8');
  assert(
    constants.includes('export const USER_SELECT_WITH_SPORT_PROFILES') &&
      constants.includes('sportsEnabled: true') &&
      constants.match(/USER_SELECT_WITH_SPORT_PROFILES[\s\S]*?sportProfiles/),
    'USER_SELECT_WITH_SPORT_PROFILES includes sportsEnabled + sportProfiles',
  );

  const readService = readFileSync(join(backendSrc, 'services/game/read.service.ts'), 'utf8');
  assert(
    readService.includes('USER_SELECT_FIELDS_WITH_SPORT_PROFILES') &&
      !readService.includes('USER_SPORT_PROFILE_SELECT'),
    'game read uses shared USER_SELECT_FIELDS_WITH_SPORT_PROFILES',
  );

  for (const rel of [
    'services/game/participant.service.ts',
    'services/socket.service.ts',
    'services/invite.service.ts',
  ]) {
    const src = readFileSync(join(backendSrc, rel), 'utf8');
    assert(
      src.includes('USER_SELECT_FIELDS_WITH_SPORT_PROFILES') && !src.includes('USER_SPORT_PROFILE_SELECT'),
      `${rel} uses shared user select with sportsEnabled`,
    );
  }
  console.log('ok: game/socket/invite user select includes sportsEnabled');
}

testLevelColorAndProfileSports();
testWatchUserSportProfiles();
testAvatarLevelBadge();
testCallSitesPassLevelSport();
testGameUserSelectIncludesSportsEnabled();
console.log('watch-level-display: all passed');
