import { describe, expect, it } from 'vitest';
import { isOverlapConfirmRequired, overlapConfirmBody } from './gameSlotOverlapConfirm';

function axiosError(status: number, data: unknown) {
  return {
    isAxiosError: true,
    response: { status, data },
  };
}

describe('isOverlapConfirmRequired', () => {
  it('matches 409 with requiresOverlapConfirm', () => {
    expect(
      isOverlapConfirmRequired(
        axiosError(409, { requiresOverlapConfirm: true, overlappingGames: [{ id: 'g1' }] }),
      ),
    ).toBe(true);
  });

  it('ignores other failures', () => {
    expect(isOverlapConfirmRequired(axiosError(409, { message: 'conflict' }))).toBe(false);
    expect(isOverlapConfirmRequired(axiosError(400, { requiresOverlapConfirm: true }))).toBe(false);
    expect(isOverlapConfirmRequired(new Error('nope'))).toBe(false);
  });
});

describe('overlapConfirmBody', () => {
  it('sends the flag only when confirmed', () => {
    expect(overlapConfirmBody(true)).toEqual({ confirmOverlap: true });
    expect(overlapConfirmBody(false)).toEqual({});
  });
});
