import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('./axios', () => ({ default: { get: (...args: unknown[]) => get(...args) } }));

async function loadResultsApi() {
  vi.resetModules();
  return (await import('./results')).resultsApi;
}

describe('resultsApi.getGameResultsBatched', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('sends calls made together as one /results/games request', async () => {
    get.mockResolvedValue({
      data: { success: true, data: { g1: { data: { rounds: [1] } }, g2: { error: { status: 404 } } } },
    });
    const resultsApi = await loadResultsApi();

    const [first, second, again] = await Promise.allSettled([
      resultsApi.getGameResultsBatched('g1'),
      resultsApi.getGameResultsBatched('g2'),
      resultsApi.getGameResultsBatched('g1'),
    ]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/results/games', { params: { ids: 'g1,g2' } });
    expect(first).toEqual({ status: 'fulfilled', value: { success: true, data: { rounds: [1] } } });
    expect(again).toEqual(first);
    expect(second.status).toBe('rejected');
  });

  it('falls back to per-game requests when the server has no batch route', async () => {
    get.mockImplementation((url: string) =>
      url === '/results/games'
        ? Promise.reject({ response: { status: 404 } })
        : Promise.resolve({ data: { success: true, data: { url } } }),
    );
    const resultsApi = await loadResultsApi();

    await expect(resultsApi.getGameResultsBatched('g1')).resolves.toEqual({
      success: true,
      data: { url: '/results/game/g1' },
    });
    await expect(resultsApi.getGameResultsBatched('g2')).resolves.toEqual({
      success: true,
      data: { url: '/results/game/g2' },
    });
    expect(get.mock.calls.map(([url]) => url)).toEqual(['/results/games', '/results/game/g1', '/results/game/g2']);
  });
});
