import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isNoviceModeActive } from '@shared/novice';
import { noviceApi } from '@/api/novice';
import { useAuthStore } from '@/store/authStore';
import { markNoviceMilestoneSeen, refreshNoviceState, unlockAllNovice } from './useNovice';

vi.mock('@/store/authStore', async () => {
  const { create } = await import('zustand');
  type State = {
    user: Record<string, unknown> | null;
    isAuthenticated: boolean;
    token: string | null;
    updateUser: (user: Record<string, unknown>) => void;
  };
  const useAuthStore = create<State>((set) => ({
    user: null,
    isAuthenticated: true,
    token: 't',
    updateUser: (user) => set({ user }),
  }));
  return { useAuthStore };
});
vi.mock('@/api/novice', () => ({
  noviceApi: { get: vi.fn(), unlockAll: vi.fn(), markMilestoneSeen: vi.fn() },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
vi.mock('@/utils/capacitor', () => ({ isCapacitor: () => false }));

const newcomer = {
  id: 'u1',
  noviceRank: 0,
  noviceCountedGames: 0,
  noviceMilestoneSeenRank: 0,
  noviceUnlockedAllAt: null as string | null,
};
const user = () => useAuthStore.getState().user as typeof newcomer;

beforeEach(() => {
  vi.mocked(noviceApi.unlockAll).mockReset();
  vi.mocked(noviceApi.markMilestoneSeen).mockReset();
  vi.mocked(noviceApi.get).mockReset();
  useAuthStore.setState({ user: { ...newcomer } });
});

describe('unlockAllNovice', () => {
  it('unlocks the shell before the server answers, then stores the server state', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(noviceApi.unlockAll).mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    const pending = unlockAllNovice();
    expect(isNoviceModeActive(user())).toBe(false);
    resolve({ ...newcomer, noviceUnlockedAllAt: '2026-10-05T10:00:00.000Z' });
    await pending;
    expect(user().noviceUnlockedAllAt).toBe('2026-10-05T10:00:00.000Z');
  });

  it('rolls back and rethrows when the request fails', async () => {
    vi.mocked(noviceApi.unlockAll).mockRejectedValue(new Error('offline'));
    await expect(unlockAllNovice()).rejects.toThrow('offline');
    expect(user().noviceUnlockedAllAt).toBeNull();
    expect(isNoviceModeActive(user())).toBe(true);
  });
});

describe('markNoviceMilestoneSeen', () => {
  it('never acknowledges above the stored rank', async () => {
    useAuthStore.setState({ user: { ...newcomer, noviceRank: 2, noviceCountedGames: 2 } });
    vi.mocked(noviceApi.markMilestoneSeen).mockReturnValue(new Promise(() => {}) as never);
    void markNoviceMilestoneSeen(5);
    expect(user().noviceMilestoneSeenRank).toBe(2);
  });
});

describe('refreshNoviceState', () => {
  it('merges a rank-up recorded while the app was away', async () => {
    vi.mocked(noviceApi.get).mockResolvedValue({
      noviceRank: 1,
      noviceCountedGames: 1,
      noviceMilestoneSeenRank: 0,
      noviceUnlockedAllAt: null,
    });
    await refreshNoviceState();
    expect(user()).toMatchObject({ id: 'u1', noviceRank: 1, noviceCountedGames: 1 });
  });
});
