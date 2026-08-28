import assert from 'node:assert/strict';
import { resolveGameMentionParticipantsFromGame } from './gameMentionParticipants.service';

function row(userId: string, status = 'PLAYING', user?: { id: string; firstName: string }) {
  return { userId, status, role: 'PARTICIPANT' as const, user };
}

{
  const result = resolveGameMentionParticipantsFromGame({
    participants: [row('a', 'PLAYING', { id: 'a', firstName: 'A' })],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.isPlaying, true);
}

{
  const result = resolveGameMentionParticipantsFromGame({
    parentId: 'season',
    participants: [],
    parent: { participants: [row('season-user', 'PLAYING', { id: 'season-user', firstName: 'S' })] },
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.userId, 'season-user');
}

console.log('gameMentionParticipants.service.test.ts ok');
