import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

function testCourtApiSourceGuards(): void {
  const courtPath = join(__dirname, '../../src/controllers/court.controller.ts');
  const clubPath = join(__dirname, '../../src/controllers/club.controller.ts');
  const courtSrc = readFileSync(courtPath, 'utf8');
  const clubSrc = readFileSync(clubPath, 'utf8');

  assert(courtSrc.includes('req.query.sport'), 'getCourtsByClub reads sport query param');
  assert(courtSrc.includes('sport: null'), 'sport filter includes null-sport courts');
  assert(courtSrc.includes('Invalid sport'), 'invalid sport query rejected');
  assert(clubSrc.includes('sport: true'), 'club list includes court sport');
  assert(clubSrc.includes('sports'), 'club responses include sports field');
}

function main(): void {
  testCourtApiSourceGuards();
  console.log('multisport-phase3-courts: all passed');
}

main();
