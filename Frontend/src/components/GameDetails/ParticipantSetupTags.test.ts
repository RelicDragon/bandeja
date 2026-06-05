import { describe, expect, it, vi } from 'vitest';
import { Sports } from '@shared/sport';
import { buildParticipantSetupTags } from './buildParticipantSetupTags';
import type { Game } from '@/types';

const t = (key: string) => key;

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    sport: Sports.PADEL,
    maxParticipants: 4,
    playersPerMatch: 4,
    hasFixedTeams: false,
    genderTeams: 'ANY',
    ...overrides,
  } as Game;
}

describe('buildParticipantSetupTags', () => {
  it('shows fixed pairs when enabled', () => {
    const tags = buildParticipantSetupTags(
      baseGame({ hasFixedTeams: true }),
      t,
      { canEdit: true, onEditMaxParticipants: vi.fn() },
    );
    expect(tags.map((x) => x.key)).toContain('fixed');
    expect(tags.find((x) => x.key === 'fixed')?.onClick).toBeDefined();
  });

  it('omits fixed pairs tag when cannot edit', () => {
    const tags = buildParticipantSetupTags(baseGame({ hasFixedTeams: true }), t);
    expect(tags.find((x) => x.key === 'fixed')?.onClick).toBeUndefined();
  });

  it('shows gender when not ANY', () => {
    const tags = buildParticipantSetupTags(baseGame({ genderTeams: 'MIX_PAIRS' }), t);
    expect(tags).toEqual([{ key: 'gender', label: 'createGame.genderTeams.mixPairs' }]);
  });

  it('shows 1v1 when padel game uses singles match format', () => {
    const tags = buildParticipantSetupTags(baseGame({ playersPerMatch: 2, maxParticipants: 4 }), t);
    expect(tags).toEqual([{ key: 'format', label: 'sport.match1v1' }]);
  });

  it('shows 2v2 when tennis game uses doubles match format', () => {
    const tags = buildParticipantSetupTags(
      baseGame({ sport: Sports.TENNIS, playersPerMatch: 4, maxParticipants: 4 }),
      t,
    );
    expect(tags).toEqual([{ key: 'format', label: 'sport.match2v2' }]);
  });

  it('hides match format tag when sport default is selected', () => {
    expect(buildParticipantSetupTags(baseGame(), t)).toEqual([]);
  });
});
