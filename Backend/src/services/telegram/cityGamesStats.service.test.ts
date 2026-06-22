import { describe, expect, it } from 'vitest';
import {
  PINNED_GAMES_LIST_THRESHOLD,
  buildCityGamesStatsMessage,
  type CityGamesStats,
} from './cityGamesStats.service';

const sampleStats: CityGamesStats = {
  openGames: 12,
  openSpots: 28,
  startingToday: 3,
  upcomingThisWeek: 18,
  playedLast7Days: 24,
  playersLast7Days: 156,
};

describe('cityGamesStats', () => {
  it('uses stats overview when above pinned list threshold', () => {
    expect(PINNED_GAMES_LIST_THRESHOLD).toBe(3);
  });

  it('builds stats message with city name and counts', () => {
    const message = buildCityGamesStatsMessage({ name: 'Belgrade' }, sampleStats, 'en');

    expect(message).toContain('Belgrade — Games');
    expect(message).toContain('Games with open spots: 12');
    expect(message).toContain('Open spots: 28');
    expect(message).toContain('Starting today: 3');
    expect(message).toContain('Upcoming this week: 18');
    expect(message).toContain('Played in last 7 days: 24');
    expect(message).toContain('Active players (7d): 156');
    expect(message).toContain('/find');
    expect(message).toContain('/games');
  });
});
