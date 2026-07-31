import { describe, expect, it } from 'vitest';
import type { BracketPlayoffGroupDto, BracketRoundConfigDto } from './leagues';

describe('league bracket API contracts', () => {
  it('matches the serialized cross-group bracket config shape', () => {
    const config = {
      scope: 'CROSS_GROUP',
      equalTopK: 2,
      unequalK: true,
      teamsPerGroup: [
        { leagueGroupId: 'group-a', k: 2 },
        { leagueGroupId: 'group-b', k: 1 },
      ],
      includedGroupIds: ['group-a', 'group-b'],
      includeThirdPlace: true,
      includeConsolationBracket: false,
      includeDoubleElimination: true,
      customByeSeedRanks: [1],
    } satisfies BracketRoundConfigDto;

    expect(config.teamsPerGroup[1]).toEqual({ leagueGroupId: 'group-b', k: 1 });
  });

  it('includes all serialized podium and phase flags on group responses', () => {
    const group = {
      leagueGroupId: 'group-a',
      entrantCount: 8,
      bracketSize: 8,
      byeCount: 0,
      playInGameCount: 0,
      includeThirdPlace: true,
      includeConsolationBracket: false,
      includeDoubleElimination: true,
      championParticipantId: 'champion',
      finalistParticipantId: 'finalist',
      thirdPlaceParticipantId: 'third',
      slots: [],
    } satisfies BracketPlayoffGroupDto;

    expect(group).toMatchObject({
      includeThirdPlace: true,
      finalistParticipantId: 'finalist',
      thirdPlaceParticipantId: 'third',
    });
  });
});
