/**
 * P-W3-WATCH — static audit: Watch sport → rally UI (table tennis minimum).
 * No XCTest on device; greps Swift sources for registry + view wiring.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const watchRoot = join(__dirname, '../../../Frontend/ios/App/BandejaWatch Watch App');
const feRegistryPath = join(__dirname, '../../../Frontend/src/liveScoring/registry.ts');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function readWatch(rel: string): string {
  return readFileSync(join(watchRoot, rel), 'utf8');
}

function testWebTableTennisBoardMapping(): void {
  const src = readFileSync(feRegistryPath, 'utf8');
  assert(src.includes("'table-tennis-board'"), 'FE registry defines table-tennis-board uiId');
  assert(
    src.includes('[Sports.TABLE_TENNIS]: \'table-tennis-board\''),
    'TABLE_TENNIS maps to table-tennis-board',
  );
  console.log('ok: FE liveScoring registry table-tennis-board');
}

function testWatchRegistryAndViews(): void {
  const registry = readWatch('Models/WatchLiveScoringRegistry.swift');
  assert(registry.includes('case tableTennisBoard'), 'WatchLiveScoringUiId.tableTennisBoard');
  assert(registry.includes('case rallyPointsBoard'), 'WatchLiveScoringUiId.rallyPointsBoard');
  assert(registry.includes('.tableTennis'), 'registry branches on table tennis sport');
  assert(registry.includes('usesRallySetScoring'), 'registry uses rally flag');

  const sport = readWatch('Models/WatchSport.swift');
  assert(sport.includes('case tableTennis = "TABLE_TENNIS"'), 'WatchSport.tableTennis');
  assert(sport.includes('case .tableTennis'), 'usesRallySetScoring includes tableTennis');

  const vm = readWatch('ViewModels/MatchScoringViewModel.swift');
  assert(vm.includes('var liveScoringUiId'), 'MatchScoringViewModel.liveScoringUiId');
  assert(vm.includes('WatchCopy.tableTennisScoring'), 'TT scoring title copy');

  const rules = readWatch('Models/WatchScoringRules.swift');
  assert(rules.includes('rallyBestOf'), 'WatchScoringRulebook rally presets');
  assert(rules.includes('bestOf3_11'), 'BEST_OF_3_11 preset skeleton');

  assert(
    readWatch('Views/Scoring/TableTennisScoringView.swift').includes('struct TableTennisScoringView'),
    'TableTennisScoringView exists',
  );
  assert(
    readWatch('Views/Scoring/TableTennisCourtStrip.swift').includes('struct TableTennisCourtStrip'),
    'TableTennisCourtStrip exists',
  );

  const experience = readWatch('Views/Scoring/MatchScoringExperience.swift');
  assert(experience.includes('TableTennisScoringView'), 'MatchScoringExperience wires TT view');
  assert(experience.includes('ClassicScoringView'), 'classic path preserved');
  assert(experience.includes('RallyPointsScoringView'), 'rally points scoring view wired');

  const serveRouter = readWatch('Views/Scoring/WatchServeCourtView.swift');
  assert(serveRouter.includes('TableTennisCourtStrip'), 'court router includes TT glyph');

  const engine = readWatch('Services/ServeGuideEngine.swift');
  assert(engine.includes('case .tableTennis:'), 'TT serve rotation in ServeGuideEngine');
  assert(engine.includes('case .pickleball:'), 'pickleball serve overrides');
  assert(engine.includes('case .squash:'), 'squash serve overrides');

  const sportRules = readWatch('Services/ServeGuideSportRules.swift');
  assert(sportRules.includes('pickleballChangeEnds'), 'pickleball change-ends helper');
  assert(sportRules.includes('squashChangeEnds'), 'squash change-ends helper');

  assert(readWatch('Views/Scoring/BadmintonCourtStrip.swift').includes('BadmintonCourtStrip'), 'BadmintonCourtStrip');
  assert(readWatch('Views/Scoring/PickleballCourtStrip.swift').includes('PickleballCourtStrip'), 'PickleballCourtStrip');
  assert(readWatch('Views/Scoring/WatchServeCourtView.swift').includes('WatchServeCourtView'), 'court router');

  const vmSrc = readWatch('ViewModels/MatchScoringViewModel.swift');
  assert(vmSrc.includes('game?.usesRallySetScoring == true'), 'all rally sports use points-cap serve guide');

  const strip = readWatch('Views/Scoring/ServeCoachStrip.swift');
  assert(strip.includes('next.skipped = true'), 'long-press syncs serveGuideSkipped');
  assert(!strip.includes('hiddenForMatch'), 'hiddenForMatch removed from strip');
  assert(engine.includes('finalizeSnapshot'), 'tennis motion token prefix');
  assert(readWatch('Views/Scoring/WatchPickleballCoachButtons.swift').includes('WatchPickleballCoachButtons'), 'pickleball coach');
  assert(strip.includes('WatchChangeEndsSideTag'), 'change-ends keeps court visible');
  assert(strip.includes('WatchServeCourtView.coachCourt'), 'unified court router');

  console.log('ok: Watch P-W3-WATCH symbols (registry, views, serve)');
}

function main(): void {
  testWebTableTennisBoardMapping();
  testWatchRegistryAndViews();
  console.log('multisport-post-wave2-watch: all passed (P-W3-WATCH)');
}

main();
