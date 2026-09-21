// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { APP_ATTRIBUTION_COOKIE, readStoredAttribution } from './appAttribution';

const mocks = vi.hoisted(() => ({ read: vi.fn(), post: vi.fn() }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: { read: mocks.read } }));
vi.mock('@/utils/capacitor', () => ({ isCapacitor: () => true }));
vi.mock('@/api/apiBaseUrl', () => ({ getApiAxiosBaseURL: () => '/api' }));
vi.mock('@/api/httpClient', () => ({ api: { post: mocks.post } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  document.cookie = `${APP_ATTRIBUTION_COOKIE}=; Max-Age=0; Path=/`;
  mocks.read.mockResolvedValue({ value: 'bandeja-aid:Clipboard1234' });
  mocks.post.mockResolvedValue({});
});

it('never reads the clipboard on native startup or a cold relaunch', async () => {
  for (let launch = 0; launch < 2; launch += 1) {
    vi.resetModules();
    const { bootstrapAppAttribution } = await import('./appAttributionBootstrap');
    expect(await bootstrapAppAttribution({ pathname: '/', search: '' })).toBeNull();
  }
  expect(mocks.read).not.toHaveBeenCalled();
});

it('keeps URL attribution, first-touch persistence and auth reporting without clipboard access', async () => {
  const { bootstrapAppAttribution, reportStoredAttributionIfAuthed } = await import('./appAttributionBootstrap');
  await bootstrapAppAttribution({
    pathname: '/login',
    search: '?aid=FirstTouch123&utm_source=qr&ref=BNDJ-7K2Q',
  });
  await bootstrapAppAttribution({
    pathname: '/',
    search: '?aid=LaterTouch123&utm_source=other',
  });
  expect(readStoredAttribution()).toMatchObject({ aid: 'FirstTouch123', utmSource: 'qr', ref: 'BNDJ7K2Q' });
  await reportStoredAttributionIfAuthed('test-token');
  expect(mocks.post).toHaveBeenCalledWith('/auth/attribution', { attribution: readStoredAttribution() });
  expect(mocks.read).not.toHaveBeenCalled();
});
