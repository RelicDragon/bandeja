import { describe, expect, it } from 'vitest';
import { formatSystemMessageForDisplay, SystemMessageType } from './systemMessages';

/** Missing keys → the renderer's English fallbacks (the court-reservation vocabulary). */
const fallbackT = (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? '';

const message = (bookingStatus: string) =>
  JSON.stringify({ type: SystemMessageType.GAME_BOOKING_STATUS_CHANGED, variables: { bookingStatus } });

describe('GAME_BOOKING_STATUS_CHANGED — legacy enum in the reservation vocabulary', () => {
  it.each([
    ['NONE', 'Court reservation: Planned'],
    ['MANUAL', 'Court reservation: Reserved'],
    ['EXTERNAL_PARTIAL', 'Court reservation: Partly reserved'],
    ['EXTERNAL_FULL', 'Court reservation: All courts reserved'],
  ])('%s → %s', (status, expected) => {
    expect(formatSystemMessageForDisplay(message(status), fallbackT, 'GAME')).toBe(expected);
  });

  it('passes an unknown value through unchanged', () => {
    expect(formatSystemMessageForDisplay(message('SOMETHING_NEW'), fallbackT, 'GAME')).toBe(
      'Court reservation: SOMETHING_NEW',
    );
  });
});
