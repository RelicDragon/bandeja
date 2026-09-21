// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDeepLink } from './useDeepLink';
import { APP_ATTRIBUTION_COOKIE, readStoredAttribution } from '@/utils/appAttribution';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  navigate: vi.fn(),
  navigateWithTracking: vi.fn(),
  launch: vi.fn(),
  remove: vi.fn(),
  listener: null as ((event: { url: string }) => void) | null,
}));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: { read: mocks.read } }));
vi.mock('@capacitor/app', () => ({ App: {
  getLaunchUrl: mocks.launch,
  addListener: vi.fn(async (_event: string, listener: (event: { url: string }) => void) => {
    mocks.listener = listener;
    return { remove: mocks.remove };
  }),
} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/utils/navigation', () => ({ navigateWithTracking: mocks.navigateWithTracking }));
vi.mock('@/utils/capacitor', () => ({ isCapacitor: () => true }));
vi.mock('@/api/apiBaseUrl', () => ({ getApiAxiosBaseURL: () => '/api' }));
vi.mock('@/api/httpClient', () => ({ api: { post: vi.fn() } }));
vi.mock('@/services/chat/chatOpenEntry', () => ({ bumpChatFreshOpenNonce: vi.fn() }));
vi.mock('@/deepLinks', () => ({ resolveFindDeepLinkTarget: vi.fn(), deepLinkActionPath: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  useDeepLink();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}));
  mocks.listener = null;
  localStorage.clear();
  document.cookie = `${APP_ATTRIBUTION_COOKIE}=; Max-Age=0; Path=/`;
  mocks.read.mockResolvedValue({ value: 'bandeja-aid:Clipboard1234' });
});

afterEach(() => { vi.unstubAllGlobals(); });

it.each(['cold', 'warm'])('captures %s launch URL attribution and navigates without clipboard access', async (launch) => {
  const search = '?aid=FirstTouch123&utm_source=qr&ref=BNDJ-7K2Q';
  const url = `https://bandeja.me/link-to-app${search}`;
  mocks.launch.mockResolvedValue(launch === 'cold' ? { url } : {});
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<Probe />); });
    if (launch === 'warm') {
      expect(mocks.listener).not.toBeNull();
      await act(async () => { mocks.listener?.({ url }); });
    }
    expect(mocks.read).not.toHaveBeenCalled();
    expect(readStoredAttribution()).toMatchObject({ aid: 'FirstTouch123', utmSource: 'qr', ref: 'BNDJ7K2Q' });
    expect(mocks.navigateWithTracking).toHaveBeenCalledWith(mocks.navigate, `/login${search}`, { replace: true });
  } finally {
    await act(async () => { root.unmount(); });
  }
  expect(mocks.remove).toHaveBeenCalledOnce();
});
