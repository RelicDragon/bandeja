import { describe, expect, it } from 'vitest';
import { gameInfoDateTimeNeedsWrap } from './gameInfoDateTimeLayout';

describe('gameInfoDateTimeNeedsWrap', () => {
  it('wraps time when date and time do not fit beside action buttons on mobile', () => {
    expect(
      gameInfoDateTimeNeedsWrap(360, 'Sunday', '21 June 2026', '19:00 – 20:00'),
    ).toBe(true);
  });

  it('keeps date and time on one row when there is enough width', () => {
    expect(
      gameInfoDateTimeNeedsWrap(520, 'Sunday', '21 June 2026', '19:00 – 20:00'),
    ).toBe(false);
  });
});
