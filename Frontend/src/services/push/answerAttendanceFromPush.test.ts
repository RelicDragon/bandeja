import { beforeEach, describe, expect, it, vi } from 'vitest';

const answerFromPushTokenMock = vi.fn(async () => undefined);
const scheduleMock = vi.fn(async () => undefined);
const invalidateQueriesMock = vi.fn();
const isNativePlatformMock = vi.fn(() => true);

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatformMock(),
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { schedule: scheduleMock },
}));

vi.mock('@/i18n/config', () => ({
  default: { t: (key: string) => key },
}));

vi.mock('@/api/attendance', () => ({
  attendanceApi: { answerFromPushToken: answerFromPushTokenMock },
}));

vi.mock('@/queries/queryClient', () => ({
  queryClient: { invalidateQueries: invalidateQueriesMock },
}));

const reminder = {
  type: 'GAME_REMINDER',
  data: {
    gameId: 'game-1',
    attendanceActionToken: 'confirm-token',
    attendanceUnsureActionToken: 'unsure-token',
  },
};

async function load() {
  return import('./answerAttendanceFromPush');
}

describe('answerAttendanceFromPush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isNativePlatformMock.mockReturnValue(true);
    answerFromPushTokenMock.mockResolvedValue(undefined);
  });

  it('posts the token that matches the tapped action', async () => {
    const { answerAttendanceFromPush } = await load();

    await answerAttendanceFromPush('confirm', reminder);
    expect(answerFromPushTokenMock).toHaveBeenCalledWith('confirm-token');

    await answerAttendanceFromPush('unsure', reminder);
    expect(answerFromPushTokenMock).toHaveBeenLastCalledWith('unsure-token');
  });

  it('acknowledges each answer with its own copy', async () => {
    const { answerAttendanceFromPush, attendanceAcknowledgementKey } = await load();

    await answerAttendanceFromPush('confirm', reminder);
    expect(scheduleMock.mock.calls[0][0].notifications[0].title).toBe(
      'attendance.confirmedToast',
    );

    await answerAttendanceFromPush('unsure', reminder);
    expect(scheduleMock.mock.calls[1][0].notifications[0].title).toBe('attendance.unsureToast');

    expect(attendanceAcknowledgementKey('unsure')).toBe('attendance.unsureToast');
  });

  it('refreshes the game so an open details view catches up', async () => {
    const { answerAttendanceFromPush } = await load();

    await answerAttendanceFromPush('confirm', reminder);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['attendance', 'game', 'game-1'],
    });
  });

  it('ignores a push that carries no token, and any other action', async () => {
    const { answerAttendanceFromPush, resolveAttendanceActionToken } = await load();

    expect(await answerAttendanceFromPush('confirm', { type: 'GAME_REMINDER', data: {} })).toBe(
      false,
    );
    expect(await answerAttendanceFromPush('accept', reminder)).toBe(false);
    expect(
      await answerAttendanceFromPush('confirm', { ...reminder, type: 'GAME_CHAT' }),
    ).toBe(false);

    expect(answerFromPushTokenMock).not.toHaveBeenCalled();
    expect(resolveAttendanceActionToken('confirm', { type: 'GAME_REMINDER' })).toBeNull();
  });

  it('stays silent when the answer does not land — there is no deadline to miss', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    answerFromPushTokenMock.mockRejectedValueOnce(new Error('offline'));
    const { answerAttendanceFromPush } = await load();

    expect(await answerAttendanceFromPush('confirm', reminder)).toBe(false);

    expect(scheduleMock).not.toHaveBeenCalled();
    expect(invalidateQueriesMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not schedule a local notification on the web', async () => {
    isNativePlatformMock.mockReturnValue(false);
    const { answerAttendanceFromPush } = await load();

    expect(await answerAttendanceFromPush('confirm', reminder)).toBe(true);
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});
