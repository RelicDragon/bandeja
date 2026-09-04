// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adsApi } from '@/api/sponsorPlacements';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { useAdCalendarTags } from './useAdCalendarTags';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({ i18n: { language: 'en' } }),
  };
});

vi.mock('@/api/sponsorPlacements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/sponsorPlacements')>();
  return {
    ...actual,
    adsApi: {
      ...actual.adsApi,
      getCalendarTags: vi.fn(),
    },
  };
});

const getCalendarTags = vi.mocked(adsApi.getCalendarTags);

function viewer(id: string) {
  return {
    id,
    currentCityId: 'city-1',
    language: 'en',
    primarySport: 'PADEL',
  } as never;
}

function Harness() {
  const { getTagsForDay } = useAdCalendarTags();
  const previousTags = getTagsForDay('2026-09-04');
  const activeTags = getTagsForDay('2026-09-05');
  return (
    <>
      <span data-day="previous">{previousTags.map((tag) => tag.label).join(',')}</span>
      <span data-day="active">{activeTags.map((tag) => tag.label).join(',')}</span>
      <span data-day="active-colors">{activeTags.map((tag) => tag.color).join(',')}</span>
      <span data-day="active-messages">{activeTags.map((tag) => tag.message).join(',')}</span>
    </>
  );
}

describe('useAdCalendarTags', () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let queryClient: QueryClient;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
    getCalendarTags.mockReset();
    useNetworkStore.setState({ isOnline: true });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    queryClient.clear();
    container.remove();
  });

  function renderHarness() {
    act(() => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      );
    });
  }

  it('keeps date-only boundaries stable and isolates audience results by viewer', async () => {
    getCalendarTags
      .mockResolvedValueOnce({
        tags: [{
          campaignId: 'campaign-a',
          label: 'CAMP',
          color: '#7C3AED',
          message: 'English camp details',
          startsAt: '2026-09-05',
          endsAt: '2026-09-05',
        }],
      })
      .mockResolvedValueOnce({
        tags: [{
          campaignId: 'campaign-b',
          label: 'CRUISE',
          color: '#EA580C',
          message: 'Cruise details',
          startsAt: '2026-09-05',
          endsAt: '2026-09-05',
        }],
      });

    useAuthStore.setState({
      user: viewer('user-a'),
      token: 'token-a',
      isAuthenticated: true,
      isInitializing: false,
    });
    renderHarness();

    await vi.waitFor(() => {
      expect(container.querySelector('[data-day="active"]')?.textContent).toBe('CAMP');
    });
    expect(container.querySelector('[data-day="active-colors"]')?.textContent).toBe('#7C3AED');
    expect(container.querySelector('[data-day="active-messages"]')?.textContent).toBe('English camp details');
    expect(container.querySelector('[data-day="previous"]')?.textContent).toBe('');

    act(() => root?.unmount());
    root = createRoot(container);
    useAuthStore.setState({
      user: viewer('user-b'),
      token: 'token-b',
      isAuthenticated: true,
      isInitializing: false,
    });
    renderHarness();

    await vi.waitFor(() => {
      expect(container.querySelector('[data-day="active"]')?.textContent).toBe('CRUISE');
    });
    expect(container.querySelector('[data-day="active-colors"]')?.textContent).toBe('#EA580C');
    expect(container.querySelector('[data-day="active-messages"]')?.textContent).toBe('Cruise details');
    expect(getCalendarTags).toHaveBeenCalledTimes(2);
  });
});
