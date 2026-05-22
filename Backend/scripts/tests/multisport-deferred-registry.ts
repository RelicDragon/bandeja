import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import { getSportConfig, SPORT_REGISTRY } from '../../src/sport/sportRegistry';

const repoRoot = join(__dirname, '../../..');
const feRegistryPath = join(repoRoot, 'Frontend/src/sport/sportRegistry.ts');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function feRegistryEntryIndex(registryBody: string, sport: string): number {
  const bracketKey = `[Sports.${sport}]:`;
  const bracketIdx = registryBody.indexOf(bracketKey);
  if (bracketIdx >= 0) return bracketIdx;
  return registryBody.indexOf(`${sport}:`);
}

function parseFeDefaultPlayersPerMatch(): Record<string, number> {
  const src = readFileSync(feRegistryPath, 'utf8');
  const registryBody = src.slice(src.indexOf('export const SPORT_REGISTRY'));
  const rallyHelper = registryBody.match(
    /function rallySportConfig[\s\S]*?defaultPlayersPerMatch:\s*(\d+)/,
  );
  const rallyDefault = rallyHelper ? Number.parseInt(rallyHelper[1], 10) : 2;
  const out: Record<string, number> = {};
  for (const sport of Object.keys(SPORT_REGISTRY)) {
    const keyIdx = feRegistryEntryIndex(registryBody, sport);
    if (keyIdx < 0) {
      console.error(`FAIL: FE registry missing ${sport}`);
      process.exit(1);
    }
    const block = registryBody.slice(keyIdx, keyIdx + 700);
    const inline = block.match(/defaultPlayersPerMatch:\s*(\d+)/);
    if (inline) {
      out[sport] = Number.parseInt(inline[1], 10);
    } else if (block.includes('rallySportConfig')) {
      out[sport] = rallyDefault;
    } else {
      console.error(`FAIL: could not parse FE defaultPlayersPerMatch for ${sport}`);
      process.exit(1);
    }
  }
  return out;
}

function testBeFeDefaultPlayersPerMatch(): void {
  const fe = parseFeDefaultPlayersPerMatch();
  for (const sport of Object.values(Sport)) {
    const be = getSportConfig(sport).defaultPlayersPerMatch;
    const feVal = fe[sport];
    assert(feVal === be, `${sport} defaultPlayersPerMatch BE=${be} FE=${feVal}`);
  }
  console.log('ok: BE/FE defaultPlayersPerMatch parity (6 sports)');
}

function testContractDefaults(): void {
  assert(getSportConfig(Sport.PADEL).defaultPlayersPerMatch === 4, 'padel default 4');
  for (const sport of [
    Sport.TENNIS,
    Sport.PICKLEBALL,
    Sport.BADMINTON,
    Sport.TABLE_TENNIS,
    Sport.SQUASH,
  ] as Sport[]) {
    assert(
      getSportConfig(sport).defaultPlayersPerMatch === 2,
      `${sport} default match size 2 (deferred watch must match when D-P0-WATCH lands)`,
    );
  }
  console.log('ok: registry match-size contract');
}

function main(): void {
  testBeFeDefaultPlayersPerMatch();
  testContractDefaults();
  console.log('multisport-deferred-registry: all passed');
}

main();
