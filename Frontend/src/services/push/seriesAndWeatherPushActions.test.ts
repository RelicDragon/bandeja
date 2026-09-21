import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PRD 345 / 357 — the two shade-action handlers added after the attendance pair.
 *
 * Both post a signed token and neither opens the app, so the things worth
 * pinning are: the right token is picked for the tapped action, a push without
 * one is refused rather than posted blind, and a failed post is swallowed so a
 * missed tap never surfaces an error the player has to act on.
 */

const postMock = vi.fn(async () => ({ data: {} }));
const scheduleMock = vi.fn(async () => undefined);
const invalidateQueriesMock = vi.fn();
const isNativePlatformMock = vi.fn(() => true);

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatformMock() },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { schedule: scheduleMock },
}));

vi.mock('@/i18n/config', () => ({
  default: { t: (key: string) => key },
}));

vi.mock('@/api/axios', () => ({
  default: { post: postMock },
}));

vi.mock('@/queries/queryClient', () => ({
  queryClient: { invalidateQueries: invalidateQueriesMock },
}));

const seriesPrompt = {
  type: 'GAME_SERIES_NEXT_PROMPT',
  data: {
    gameId: 'next-game',
    seriesId: 'series-1',
    acceptActionToken: 'accept-token',
    declineActionToken: 'decline-token',
  },
};

const weatherAlert = {
  type: 'GAME_WEATHER_ALERT',
  data: { gameId: 'game-1', weatherKeepActionToken: 'keep-token' },
};

describe('answerSeriesFromPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isNativePlatformMock.mockReturnValue(true);
    postMock.mockResolvedValue({ data: {} });
  });

  it('posts the accept token and acknowledges in the shade', async () => {
    const { answerSeriesFromPush } = await import('./answerSeriesFromPush');
    const handled = await answerSeriesFromPush('accept', seriesPrompt);

    expect(handled).toBe(true);
    expect(postMock).toHaveBeenCalledWith('/push/invite-action', {
      actionToken: 'accept-token',
    });
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    // Both the prompt state and the series page are now stale.
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(2);
  });

  it('posts the decline token for the other button', async () => {
    const { answerSeriesFromPush } = await import('./answerSeriesFromPush');
    await answerSeriesFromPush('decline', seriesPrompt);

    expect(postMock).toHaveBeenCalledWith('/push/invite-action', {
      actionToken: 'decline-token',
    });
  });

  it('refuses a push of another type even when the action id matches', async () => {
    const { answerSeriesFromPush, resolveSeriesActionToken } = await import(
      './answerSeriesFromPush'
    );
    // `accept` / `decline` are shared with the invite pair — only `type` tells
    // them apart, so a mis-dispatch must not post the invite's token here.
    const invite = { type: 'INVITE', data: { acceptActionToken: 'invite-token' } };

    expect(resolveSeriesActionToken('accept', invite)).toBeNull();
    expect(await answerSeriesFromPush('accept', invite)).toBe(false);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('refuses a prompt with no signed token', async () => {
    const { answerSeriesFromPush } = await import('./answerSeriesFromPush');
    const unsigned = { type: 'GAME_SERIES_NEXT_PROMPT', data: { gameId: 'g' } };

    expect(await answerSeriesFromPush('accept', unsigned)).toBe(false);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('swallows a failed post and does not acknowledge', async () => {
    postMock.mockRejectedValueOnce(new Error('offline'));
    const { answerSeriesFromPush } = await import('./answerSeriesFromPush');

    expect(await answerSeriesFromPush('accept', seriesPrompt)).toBe(false);
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});

describe('keepWeatherPlanFromPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isNativePlatformMock.mockReturnValue(true);
    postMock.mockResolvedValue({ data: {} });
  });

  it('posts the keep token and refreshes the banner', async () => {
    const { keepWeatherPlanFromPush } = await import('./keepWeatherPlanFromPush');
    const handled = await keepWeatherPlanFromPush('keep', weatherAlert);

    expect(handled).toBe(true);
    expect(postMock).toHaveBeenCalledWith('/push/invite-action', { actionToken: 'keep-token' });
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(1);
  });

  it('ignores the two foreground actions — they open the app instead', async () => {
    const { keepWeatherPlanFromPush, resolveWeatherKeepToken } = await import(
      './keepWeatherPlanFromPush'
    );

    expect(resolveWeatherKeepToken('moveIndoor', weatherAlert)).toBeNull();
    expect(resolveWeatherKeepToken('forecast', weatherAlert)).toBeNull();
    expect(await keepWeatherPlanFromPush('moveIndoor', weatherAlert)).toBe(false);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('refuses the participant variant, which signs no token', async () => {
    const { keepWeatherPlanFromPush } = await import('./keepWeatherPlanFromPush');
    const participant = { type: 'GAME_WEATHER_ALERT', data: { gameId: 'game-1' } };

    expect(await keepWeatherPlanFromPush('keep', participant)).toBe(false);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('does not schedule an acknowledgement off-device', async () => {
    isNativePlatformMock.mockReturnValue(false);
    const { keepWeatherPlanFromPush } = await import('./keepWeatherPlanFromPush');

    expect(await keepWeatherPlanFromPush('keep', weatherAlert)).toBe(true);
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});
