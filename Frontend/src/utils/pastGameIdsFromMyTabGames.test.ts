import { describe, expect, it } from 'vitest';
import { pastGameIdsFromMyTabGames } from './pastGameIdsFromMyTabGames';

describe('pastGameIdsFromMyTabGames', () => {
  it('returns finished and archived game ids only', () => {
    expect(
      pastGameIdsFromMyTabGames([
        { id: 'a', status: 'ANNOUNCED' },
        { id: 'b', status: 'FINISHED' },
        { id: 'c', status: 'ARCHIVED' },
      ]),
    ).toEqual(['b', 'c']);
  });
});
