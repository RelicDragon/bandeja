import { describe, expect, it } from 'vitest';
import { pickNextGame } from './pickNextGame';

describe('pickNextGame', () => {
  const ref = new Date('2026-07-14T12:00:00.000Z');

  it('picks earliest upcoming non-terminal game', () => {
    const next = pickNextGame(
      [
        {
          id: 'later',
          startTime: '2026-07-14T18:00:00.000Z',
          status: 'ANNOUNCED',
        },
        {
          id: 'sooner',
          startTime: '2026-07-14T15:00:00.000Z',
          status: 'ANNOUNCED',
        },
        {
          id: 'finished',
          startTime: '2026-07-14T14:00:00.000Z',
          status: 'FINISHED',
        },
      ],
      ref,
    );
    expect(next?.id).toBe('sooner');
  });

  it('includes games that started within the last hour', () => {
    const next = pickNextGame(
      [
        {
          id: 'in-progress',
          startTime: '2026-07-14T11:30:00.000Z',
          status: 'STARTED',
        },
      ],
      ref,
    );
    expect(next?.id).toBe('in-progress');
  });

  it('excludes games older than one hour and archived', () => {
    expect(
      pickNextGame(
        [
          {
            id: 'old',
            startTime: '2026-07-14T10:00:00.000Z',
            status: 'ANNOUNCED',
          },
          {
            id: 'archived',
            startTime: '2026-07-14T16:00:00.000Z',
            status: 'ARCHIVED',
          },
        ],
        ref,
      ),
    ).toBeUndefined();
  });

  it('skips invalid startTime values', () => {
    expect(
      pickNextGame(
        [
          { id: 'bad', startTime: 'not-a-date', status: 'ANNOUNCED' },
          {
            id: 'ok',
            startTime: '2026-07-14T16:00:00.000Z',
            status: 'ANNOUNCED',
          },
        ],
        ref,
      )?.id,
    ).toBe('ok');
  });
});
