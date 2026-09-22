import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

const network = vi.hoisted(() => ({ isOnline: true }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/utils/networkStatus', () => ({
  useNetworkStore: (select: (state: typeof network) => boolean) => select(network),
}));

const props = { serverProblem: true, showMessage: true, onToggle: vi.fn(), onSync: vi.fn(), isSyncing: false };

describe('results sync warning', () => {
  it('describes unsynced changes while the device is online', () => {
    network.isOnline = true;
    const html = renderToStaticMarkup(<OfflineBanner {...props} />);
    expect(html).toContain('gameResults.unsyncedChangesTitle');
    expect(html).toContain('errors.syncRequired');
    expect(html).not.toContain('offline.noInternetConnection');
  });

  it('shows the offline guidance when the device reports no connection', () => {
    network.isOnline = false;
    const html = renderToStaticMarkup(<OfflineBanner {...props} />);
    expect(html).toContain('offline.noInternetConnection');
    expect(html).toContain('offline.offlineEditingMessage');
  });

  it('hides the banner once sync succeeds', () => {
    expect(renderToStaticMarkup(<OfflineBanner {...props} serverProblem={false} />)).toBe('');
  });
});
