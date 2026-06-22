import {
  PINNED_GAMES_LIST_THRESHOLD,
  buildCityGamesStatsMessage,
  type CityGamesStats,
} from './cityGamesStats.service';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const sampleStats: CityGamesStats = {
  openGames: 12,
  openSpots: 28,
  startingToday: 3,
  upcomingThisWeek: 18,
  playedLast7Days: 24,
  playersLast7Days: 156,
};

assert(PINNED_GAMES_LIST_THRESHOLD === 3, 'pinned list threshold');

const message = buildCityGamesStatsMessage({ name: 'Belgrade' }, sampleStats, 'en');
assert(message.includes('Belgrade — Games'), 'city header');
assert(message.includes('Games with open spots: 12'), 'open games');
assert(message.includes('Open spots: 28'), 'open spots');
assert(message.includes('Starting today: 3'), 'starting today');
assert(message.includes('Upcoming this week: 18'), 'upcoming week');
assert(message.includes('Played in last 7 days: 24'), 'played last 7 days');
assert(message.includes('Active players (7d): 156'), 'active players');
assert(message.includes('/find'), 'find link');
assert(message.includes('/games'), 'games link');

console.log('cityGamesStats.service.test.ts: ok');
