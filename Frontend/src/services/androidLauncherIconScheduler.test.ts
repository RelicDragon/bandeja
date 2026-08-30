import { beforeEach, describe, expect, it, vi } from 'vitest';

const changeAndroidLauncherIconMock = vi.fn(async () => undefined);
let appStateListener: ((state: { isActive: boolean }) => void) | undefined;

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (_event: string, listener: typeof appStateListener) => {
      appStateListener = listener;
      return { remove: vi.fn() };
    }),
  },
}));

vi.mock('@/services/androidLauncherIconBridge', () => ({
  changeAndroidLauncherIcon: changeAndroidLauncherIconMock,
}));

describe('Android launcher icon scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    appStateListener = undefined;
  });

  it('applies a queued alias switch only after a genuine background transition', async () => {
    const scheduler = await import('@/services/androidLauncherIconScheduler');
    await scheduler.scheduleAndroidLauncherIconChange({
      name: 'tennis',
      disable: ['tiger'],
    });

    expect(changeAndroidLauncherIconMock).not.toHaveBeenCalled();

    const release = scheduler.blockAndroidLauncherIconChangesForNativeUi();
    appStateListener?.({ isActive: false });
    await Promise.resolve();
    expect(changeAndroidLauncherIconMock).not.toHaveBeenCalled();

    release();
    appStateListener?.({ isActive: true });
    await Promise.resolve();
    expect(changeAndroidLauncherIconMock).not.toHaveBeenCalled();

    appStateListener?.({ isActive: false });
    await vi.waitFor(() => expect(changeAndroidLauncherIconMock).toHaveBeenCalledTimes(1));
  });

  it('coalesces foreground changes so only the latest alias is applied', async () => {
    const scheduler = await import('@/services/androidLauncherIconScheduler');
    await scheduler.scheduleAndroidLauncherIconChange({ name: 'tennis', disable: ['tiger'] });
    await scheduler.scheduleAndroidLauncherIconChange({ name: 'squash', disable: ['tiger'] });

    appStateListener?.({ isActive: false });
    await vi.waitFor(() => expect(changeAndroidLauncherIconMock).toHaveBeenCalledTimes(1));
    expect(changeAndroidLauncherIconMock).toHaveBeenCalledWith({
      name: 'squash',
      disable: ['tiger'],
    });
  });
});
