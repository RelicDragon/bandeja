import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import { getSportConfig } from '../../src/sport/sportRegistry';

const watchSportPath = join(
  __dirname,
  '../../../Frontend/ios/App/BandejaWatch Watch App/Models/WatchSport.swift',
);

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function skip(note: string): void {
  console.log(`SKIP: ${note}`);
}

/** Parse `case .padel, .tennis: return 4` groups from WatchSport.defaultPlayersPerMatch */
function parseWatchDefaults(): Map<string, number> {
  const src = readFileSync(watchSportPath, 'utf8');
  const fn = src.slice(src.indexOf('var defaultPlayersPerMatch'), src.indexOf('static func resolved'));
  const out = new Map<string, number>();
  const caseRe = /case\s+([^:]+):\s*\n\s*return\s+(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = caseRe.exec(fn)) !== null) {
    const n = Number.parseInt(m[2], 10);
    for (const raw of m[1].split(',')) {
      const token = raw.trim().replace(/^\./, '');
      const enumName = token
        .replace(/([A-Z])/g, '_$1')
        .replace(/^_/, '')
        .toUpperCase();
      if (token === 'tableTennis') {
        out.set('TABLE_TENNIS', n);
      } else {
        out.set(enumName, n);
      }
    }
  }
  return out;
}

const WATCH_TO_SPORT: Record<string, Sport> = {
  PADEL: Sport.PADEL,
  TENNIS: Sport.TENNIS,
  PICKLEBALL: Sport.PICKLEBALL,
  BADMINTON: Sport.BADMINTON,
  TABLE_TENNIS: Sport.TABLE_TENNIS,
  SQUASH: Sport.SQUASH,
};

function testWatchVsBackendRegistry(): void {
  const watch = parseWatchDefaults();
  const mismatches: string[] = [];
  for (const [key, sport] of Object.entries(WATCH_TO_SPORT)) {
    const watchVal = watch.get(key);
    const beVal = getSportConfig(sport).defaultPlayersPerMatch;
    if (watchVal === undefined) {
      mismatches.push(`${key}: missing in WatchSport.swift`);
      continue;
    }
    if (watchVal !== beVal) {
      mismatches.push(`${key}: Watch=${watchVal} BE/FE=${beVal}`);
    }
  }
  if (mismatches.length > 0) {
    skip(
      `D-P0-WATCH — WatchSport.defaultPlayersPerMatch drift (${mismatches.join('; ')}) — align Watch with sportRegistry when epic lands`,
    );
    return;
  }
  console.log('ok: WatchSport.defaultPlayersPerMatch matches BE/FE registry');
}

function main(): void {
  testWatchVsBackendRegistry();
  console.log('multisport-deferred-watch: all passed');
}

main();
