import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerActionTypesMock = vi.fn(async () => undefined);
const isIOSMock = vi.fn(() => true);

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    registerActionTypes: registerActionTypesMock,
  },
}));

vi.mock('@/utils/capacitor', () => ({
  isIOS: isIOSMock,
}));

vi.mock('@/i18n/config', () => ({
  default: { t: (key: string) => key },
}));

type RegisteredAction = {
  id: string;
  title: string;
  foreground?: boolean;
  input?: boolean;
};
type RegisteredType = { id: string; actions: RegisteredAction[] };

async function registeredTypes(): Promise<RegisteredType[]> {
  const { registerPushNotificationActionTypes } = await import(
    './registerPushNotificationActionTypes'
  );
  await registerPushNotificationActionTypes();
  const call = registerActionTypesMock.mock.calls.at(-1) as unknown as [
    { types: RegisteredType[] },
  ];
  return call[0].types;
}

describe('registerPushNotificationActionTypes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isIOSMock.mockReturnValue(true);
  });

  it('registers nothing off iOS', async () => {
    isIOSMock.mockReturnValue(false);
    const { registerPushNotificationActionTypes } = await import(
      './registerPushNotificationActionTypes'
    );
    await registerPushNotificationActionTypes();
    expect(registerActionTypesMock).not.toHaveBeenCalled();
  });

  it('registers the attendance answers under the GAME_REMINDER category', async () => {
    const reminder = (await registeredTypes()).find((type) => type.id === 'GAME_REMINDER');

    // The ids are the backend's signed `action` values — see
    // `game-reminder-push.notification.ts`. Drift here means no buttons.
    expect(reminder?.actions.map((action) => action.id)).toEqual(['confirm', 'unsure']);
  });

  it('keeps both answers in the shade, never opening the app', async () => {
    const reminder = (await registeredTypes()).find((type) => type.id === 'GAME_REMINDER');

    for (const action of reminder?.actions ?? []) {
      expect(action.foreground).toBeFalsy();
      expect(action.input).toBeFalsy();
    }
  });

  it('labels the answers from the attendance copy, not a hardcoded string', async () => {
    const reminder = (await registeredTypes()).find((type) => type.id === 'GAME_REMINDER');

    expect(reminder?.actions.map((action) => action.title)).toEqual([
      'attendance.confirm',
      'attendance.unsure',
    ]);
  });

  it('leaves the existing categories registered in the same call', async () => {
    const ids = (await registeredTypes()).map((type) => type.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'INVITE',
        'TEAM_INVITE',
        'CHAT_REPLY',
        'FOLLOWED_USER_PLAY_INTENT',
        'GAME_REMINDER',
      ]),
    );
  });
});
