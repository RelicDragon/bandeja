import { describe, expect, it, vi } from 'vitest';
import {
  createGameOrBookingErrorMessage,
  resolveCreateGameFailureToastKey,
} from './createGameFailureToast';

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

describe('resolveCreateGameFailureToastKey', () => {
  it('maps play-intent gameMismatch with a dimension', () => {
    expect(
      resolveCreateGameFailureToastKey({
        response: {
          data: { code: 'playIntent.gameMismatch', reason: 'level' },
        },
      }),
    ).toBe('playIntent.gameMismatch_level');
  });

  it('maps play-intent gameMismatch without a dimension', () => {
    expect(
      resolveCreateGameFailureToastKey({
        response: { data: { code: 'playIntent.gameMismatch' } },
      }),
    ).toBe('playIntent.gameMismatch');
  });

  it('maps other play-intent codes', () => {
    expect(
      resolveCreateGameFailureToastKey({
        response: { data: { code: 'playIntent.proposalUnavailable' } },
      }),
    ).toBe('playIntent.proposalUnavailable');
  });

  it('returns empty for generic API failures', () => {
    expect(
      resolveCreateGameFailureToastKey({
        response: { data: { message: 'Club not found' } },
      }),
    ).toBe('');
  });
});

describe('createGameOrBookingErrorMessage', () => {
  const t = ((key: string) => key) as Parameters<typeof createGameOrBookingErrorMessage>[1];
  const bookingMessage = vi.fn(() => 'booking-fallback');

  it('prefers a play-intent mismatch toast key', () => {
    expect(
      createGameOrBookingErrorMessage(
        { response: { data: { code: 'playIntent.gameMismatch', reason: 'time' } } },
        t,
        'booking.fallback',
        bookingMessage,
      ),
    ).toBe('playIntent.gameMismatch_time');
    expect(bookingMessage).not.toHaveBeenCalled();
  });
});
