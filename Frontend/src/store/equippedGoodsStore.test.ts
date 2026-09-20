import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ shopEnabled: true }));
const api = vi.hoisted(() => ({
  getEquippedForUsers: vi.fn(),
}));

vi.mock('@/config/featureFlags', () => ({ isShopEnabled: () => flags.shopEnabled }));
vi.mock('@/api/shop', () => ({ shopApi: api }));

import { selectEquippedFor, useEquippedGoodsStore } from './equippedGoodsStore';

const frame = { goodsId: 'g1', assetKey: 'frame-neon', name: 'Neon Frame' };
const nameColor = { goodsId: 'g2', assetKey: 'name-violet', name: 'Violet' };

function read(userId: string) {
  return selectEquippedFor(userId)(useEquippedGoodsStore.getState());
}

beforeEach(() => {
  vi.useFakeTimers();
  flags.shopEnabled = true;
  api.getEquippedForUsers.mockReset();
  api.getEquippedForUsers.mockResolvedValue({});
  useEquippedGoodsStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('equipped goods lookup', () => {
  it('batches every id raised in the same tick into one request', async () => {
    api.getEquippedForUsers.mockResolvedValue({
      a: { frame, nameColor: null },
      b: { frame: null, nameColor },
    });

    const { request } = useEquippedGoodsStore.getState();
    request(['a']);
    request(['b']);
    await vi.advanceTimersByTimeAsync(100);

    expect(api.getEquippedForUsers).toHaveBeenCalledTimes(1);
    expect(api.getEquippedForUsers).toHaveBeenCalledWith(['a', 'b']);
    expect(read('a').frame?.assetKey).toBe('frame-neon');
    expect(read('b').nameColor?.assetKey).toBe('name-violet');
  });

  it('never asks for the same user twice', async () => {
    const { request } = useEquippedGoodsStore.getState();
    request(['a']);
    await vi.advanceTimersByTimeAsync(100);
    request(['a']);
    await vi.advanceTimersByTimeAsync(100);
    expect(api.getEquippedForUsers).toHaveBeenCalledTimes(1);
  });

  it('ignores empty and missing ids', async () => {
    const { request } = useEquippedGoodsStore.getState();
    request([null, undefined, '']);
    await vi.advanceTimersByTimeAsync(100);
    expect(api.getEquippedForUsers).not.toHaveBeenCalled();
  });

  it('returns an empty projection for an unknown user instead of undefined', () => {
    expect(read('nobody')).toEqual({ frame: null, nameColor: null });
    expect(selectEquippedFor(null)(useEquippedGoodsStore.getState())).toEqual({
      frame: null,
      nameColor: null,
    });
  });

  it('issues no request at all when the shop flag is off', async () => {
    flags.shopEnabled = false;
    useEquippedGoodsStore.getState().request(['a']);
    await vi.advanceTimersByTimeAsync(100);
    expect(api.getEquippedForUsers).not.toHaveBeenCalled();
  });

  it('swallows a failed lookup and allows a later retry', async () => {
    api.getEquippedForUsers.mockRejectedValueOnce(new Error('offline'));
    const { request } = useEquippedGoodsStore.getState();
    request(['a']);
    await vi.advanceTimersByTimeAsync(100);
    expect(read('a')).toEqual({ frame: null, nameColor: null });

    api.getEquippedForUsers.mockResolvedValue({ a: { frame, nameColor: null } });
    useEquippedGoodsStore.getState().request(['a']);
    await vi.advanceTimersByTimeAsync(100);
    expect(read('a').frame?.assetKey).toBe('frame-neon');
  });

  it('applies the viewer own equipment immediately, without the chat accent', () => {
    useEquippedGoodsStore.getState().applyOwn('me', {
      frame,
      nameColor,
      chatAccent: { goodsId: 'g3', assetKey: 'accent-neon', name: 'Neon Chat' },
    });
    expect(read('me')).toEqual({ frame, nameColor });
  });

  it('forgets everything on reset, so a new account starts clean', async () => {
    api.getEquippedForUsers.mockResolvedValue({ a: { frame, nameColor: null } });
    useEquippedGoodsStore.getState().request(['a']);
    await vi.advanceTimersByTimeAsync(100);
    useEquippedGoodsStore.getState().reset();
    expect(read('a')).toEqual({ frame: null, nameColor: null });
  });
});
