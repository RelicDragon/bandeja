import { describe, expect, it } from 'vitest';
import {
  formatArchivedOutboxFeedback,
  getArchivedOutboxDropCount,
} from './archivedOutboxFeedback';

describe('archivedOutboxFeedback', () => {
  it('matches only archived removal events for the active thread', () => {
    expect(
      getArchivedOutboxDropCount(
        {
          contextType: 'GAME',
          contextId: 'game-1',
          tempIds: ['opt-1', 'opt-2'],
          reason: 'threadArchived',
          archiveReason: 'game_cancelled',
        },
        'GAME',
        'game-1'
      )
    ).toBe(2);

    expect(
      getArchivedOutboxDropCount(
        {
          contextType: 'GAME',
          contextId: 'game-1',
          tempIds: ['opt-1'],
        },
        'GAME',
        'game-1'
      )
    ).toBe(0);

    expect(
      getArchivedOutboxDropCount(
        {
          contextType: 'GAME',
          contextId: 'game-2',
          tempIds: ['opt-1'],
          reason: 'threadArchived',
          archiveReason: 'game_cancelled',
        },
        'GAME',
        'game-1'
      )
    ).toBe(0);
  });

  it('formats singular and plural archived feedback', () => {
    const t = ((_: string, opts?: { count?: number; defaultValue?: string }) =>
      opts?.defaultValue?.replace('{{count}}', String(opts.count ?? 0)) ?? '') as never;

    expect(formatArchivedOutboxFeedback(t, 1)).toBe(
      'A message was not sent because this game was cancelled and chat is now read-only.'
    );
    expect(formatArchivedOutboxFeedback(t, 3)).toBe(
      '3 messages were not sent because this game was cancelled and chat is now read-only.'
    );
  });
});
