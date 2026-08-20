import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isOverlapConfirmRequired, overlapConfirmBody, runWithOverlapConfirm } from './gameSlotOverlapConfirm';
import { useGameSlotOverlapConfirmStore } from '@/store/gameSlotOverlapConfirmStore';

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

describe('runWithOverlapConfirm', () => {
  beforeEach(() => {
    useGameSlotOverlapConfirmStore.getState().settle(false);
  });

  it('returns the first success without asking', async () => {
    const action = vi.fn(async (confirmOverlap: boolean) => confirmOverlap);
    await expect(runWithOverlapConfirm(action)).resolves.toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('retries after confirm and no-ops on cancel', async () => {
    const overlap = axiosError(409, { requiresOverlapConfirm: true });
    const action = vi.fn(async (confirmOverlap: boolean) => {
      if (!confirmOverlap) throw overlap;
      return 'joined';
    });

    const pending = runWithOverlapConfirm(action);
    await vi.waitFor(() => {
      expect(useGameSlotOverlapConfirmStore.getState().open).toBe(true);
    });
    useGameSlotOverlapConfirmStore.getState().settle(false);
    await expect(pending).resolves.toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);

    const retry = runWithOverlapConfirm(action);
    await vi.waitFor(() => {
      expect(useGameSlotOverlapConfirmStore.getState().open).toBe(true);
    });
    useGameSlotOverlapConfirmStore.getState().settle(true);
    await expect(retry).resolves.toBe('joined');
    expect(action).toHaveBeenLastCalledWith(true);
  });
});
