import { describe, expect, it } from 'vitest';
import { buildArchivedGameChatSubtitle } from './archivedGameChatSubtitle';

describe('archivedGameChatSubtitle', () => {
  const labels = {
    archivedFallbackLabel: 'This game was cancelled. Chat is read-only.',
    cancelledLabel: 'Cancelled',
    cancelledByLabel: 'Cancelled by',
  };

  it('shows cancellation time and canceller when both are available', () => {
    expect(
      buildArchivedGameChatSubtitle({
        ...labels,
        formattedCancelledAt: 'Jul 4, 2026, 9:28 AM',
        cancelledByUser: {
          id: 'u1',
          firstName: 'Alex',
          lastName: 'Stone',
        } as import('@/types').BasicUser,
      })
    ).toBe('Cancelled · Jul 4, 2026, 9:28 AM · Cancelled by Alex Stone');
  });

  it('falls back to cancellation time when canceller name is unavailable', () => {
    expect(
      buildArchivedGameChatSubtitle({
        ...labels,
        formattedCancelledAt: 'Jul 4, 2026, 9:28 AM',
        cancelledByUser: {
          id: 'u1',
          firstName: '   ',
          lastName: '',
        } as import('@/types').BasicUser,
      })
    ).toBe('Cancelled · Jul 4, 2026, 9:28 AM');
  });

  it('falls back to the archived banner when time is unavailable', () => {
    expect(buildArchivedGameChatSubtitle(labels)).toBe(
      'This game was cancelled. Chat is read-only.'
    );
  });
});
