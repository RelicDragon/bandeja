import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  distinctLeagueGroupIdsForUser,
  userPlaysInMultipleLeagueGroups,
} from './leagueScheduleUserGroups';

function gameWithGroup(
  id: string,
  groupId: string | undefined,
  userId: string,
): Game {
  return {
    id,
    leagueGroupId: groupId,
    leagueGroup: groupId ? { id: groupId, name: `Group ${groupId}`, color: '#111' } : undefined,
    participants: [{ userId }],
  } as Game;
}

describe('leagueScheduleUserGroups', () => {
  it('detects multiple groups for user', () => {
    const games = [
      gameWithGroup('1', 'gA', 'u1'),
      gameWithGroup('2', 'gB', 'u1'),
      gameWithGroup('3', 'gA', 'u1'),
    ];
    expect(distinctLeagueGroupIdsForUser(games, 'u1').sort()).toEqual(['gA', 'gB']);
    expect(userPlaysInMultipleLeagueGroups(games, 'u1')).toBe(true);
  });

  it('single group → false', () => {
    const games = [gameWithGroup('1', 'gA', 'u1'), gameWithGroup('2', 'gA', 'u1')];
    expect(userPlaysInMultipleLeagueGroups(games, 'u1')).toBe(false);
  });

  it('ignores other users and games without group', () => {
    const games = [
      gameWithGroup('1', 'gA', 'u1'),
      gameWithGroup('2', 'gB', 'u2'),
      gameWithGroup('3', undefined, 'u1'),
    ];
    expect(userPlaysInMultipleLeagueGroups(games, 'u1')).toBe(false);
  });
});
