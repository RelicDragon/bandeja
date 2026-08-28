// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  resolveGameMentionParticipants,
  resolveGroupMentionParticipants,
  nudgeMentionSuggestionQuery,
} from '@/utils/resolveMentionParticipants';
import type { Game } from '@/types';
import type { GroupChannel } from '@/api/chat';

function gp(userId: string, gameId = 'game-1') {
  return {
    id: `gp-${userId}`,
    userId,
    gameId,
    status: 'PLAYING' as const,
    role: 'PARTICIPANT' as const,
    user: { id: userId, firstName: userId, lastName: 'Test' },
  };
}

describe('resolveGameMentionParticipants', () => {
  it('prefers non-empty API list', () => {
    const game = { id: 'game-1', participants: [gp('embedded')] } as Game;
    expect(resolveGameMentionParticipants(game, [gp('api')])).toHaveLength(1);
    expect(resolveGameMentionParticipants(game, [gp('api')])[0]?.userId).toBe('api');
  });

  it('falls back to embedded participants when API is empty', () => {
    const game = { id: 'game-1', participants: [gp('embedded')] } as Game;
    expect(resolveGameMentionParticipants(game, [])).toHaveLength(1);
    expect(resolveGameMentionParticipants(game, null)[0]?.userId).toBe('embedded');
  });

  it('falls back to parent roster for league child games', () => {
    const game = {
      id: 'round-1',
      parentId: 'season-1',
      participants: [],
      parent: { id: 'season-1', participants: [gp('season-player', 'season-1')] },
    } as Game;
    expect(resolveGameMentionParticipants(game, [])).toHaveLength(1);
    expect(resolveGameMentionParticipants(game, [])[0]?.userId).toBe('season-player');
  });

  it('enriches API rows from embedded users', () => {
    const game = {
      id: 'game-1',
      participants: [gp('embedded')],
    } as Game;
    const apiRows = [
      {
        id: 'gp-api',
        userId: 'embedded',
        gameId: 'game-1',
        status: 'PLAYING' as const,
        role: 'PARTICIPANT' as const,
      },
    ];
    expect(resolveGameMentionParticipants(game, apiRows)[0]?.user?.id).toBe('embedded');
  });

  it('enriches API rows from parent when embedded is empty', () => {
    const game = {
      id: 'round-1',
      parentId: 'season-1',
      participants: [],
      parent: { id: 'season-1', participants: [gp('season-player', 'season-1')] },
    } as Game;
    const apiRows = [
      {
        id: 'gp-api',
        userId: 'season-player',
        gameId: 'round-1',
        status: 'PLAYING' as const,
        role: 'PARTICIPANT' as const,
      },
    ];
    expect(resolveGameMentionParticipants(game, apiRows)[0]?.user?.id).toBe('season-player');
  });
});

describe('resolveGroupMentionParticipants', () => {
  it('falls back to embedded group participants when API is empty', () => {
    const channel = {
      id: 'g1',
      participants: [{ id: 'p1', userId: 'u1', user: { id: 'u1', firstName: 'A', lastName: 'B' } }],
    } as GroupChannel;
    expect(resolveGroupMentionParticipants(channel, [])).toHaveLength(1);
  });
});

describe('nudgeMentionSuggestionQuery', () => {
  it('dispatches select when textarea is focused', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    let selectCount = 0;
    textarea.addEventListener('select', () => {
      selectCount += 1;
    });
    nudgeMentionSuggestionQuery(textarea);
    expect(selectCount).toBe(1);
    textarea.remove();
  });
});
