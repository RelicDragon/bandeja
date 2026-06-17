import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GamePhoto } from '@/api/gamePhotos';
import type { Game } from '@/types';

const html2canvasMock = vi.fn();

vi.mock('html2canvas', () => ({
  default: (...args: unknown[]) => html2canvasMock(...args),
}));

vi.mock('@capacitor/share', () => ({
  Share: { share: vi.fn() },
}));

import {
  canShowGameResultsShareCard,
  resolveGameResultsSharePhotoUrl,
  shareGameResultsCard,
} from './gameResultsShare.util';

const photo: GamePhoto = {
  id: 'photo-1',
  gameId: 'game-1',
  thumbnailUrl: '/thumb.jpg',
  originalUrl: '/original.jpg',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const gameWithPhoto: Pick<Game, 'mainPhotoId' | 'mainPhoto'> = {
  mainPhotoId: 'photo-1',
  mainPhoto: {
    id: 'photo-1',
    thumbnailUrl: '/thumb.jpg',
    originalUrl: '/original.jpg',
  },
};

const gameWithoutPhoto: Pick<Game, 'mainPhotoId' | 'mainPhoto'> = {
  mainPhotoId: null,
  mainPhoto: null,
};

describe('resolveGameResultsSharePhotoUrl', () => {
  it('returns null when no photos exist', () => {
    expect(resolveGameResultsSharePhotoUrl(gameWithoutPhoto)).toBeNull();
    expect(resolveGameResultsSharePhotoUrl(gameWithoutPhoto, [])).toBeNull();
  });

  it('resolves from loaded store photos', () => {
    expect(resolveGameResultsSharePhotoUrl(gameWithPhoto, [photo])).toBe('/original.jpg');
  });

  it('falls back to game.mainPhoto when store is empty', () => {
    expect(resolveGameResultsSharePhotoUrl(gameWithPhoto, [])).toBe('/original.jpg');
  });
});

describe('canShowGameResultsShareCard', () => {
  it('is false without a resolvable photo URL', () => {
    expect(canShowGameResultsShareCard(gameWithoutPhoto)).toBe(false);
  });

  it('is true when a photo URL is available', () => {
    expect(canShowGameResultsShareCard(gameWithPhoto, [photo])).toBe(true);
  });
});

describe('shareGameResultsCard', () => {
  beforeEach(() => {
    html2canvasMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shares exported PNG when file sharing is supported', async () => {
    const cardElement = { tagName: 'DIV' } as HTMLElement;
    const blob = new Blob(['png'], { type: 'image/png' });
    const share = vi.fn().mockResolvedValue(undefined);

    html2canvasMock.mockResolvedValue({
      toBlob: (cb: (b: Blob | null) => void) => cb(blob),
    });
    vi.stubGlobal('window', {
      devicePixelRatio: 1,
      location: { href: 'https://example.com/games/1' },
    });
    vi.stubGlobal('navigator', {
      canShare: vi.fn().mockReturnValue(true),
      share,
    });

    await shareGameResultsCard({
      cardElement,
      summaryText: 'Great session',
      gameTitle: 'Friday match',
    });

    expect(html2canvasMock).toHaveBeenCalledWith(cardElement, expect.any(Object));
    expect(share).toHaveBeenCalledOnce();
    const payload = share.mock.calls[0]?.[0] as { files?: File[]; text?: string };
    expect(payload.files?.[0]?.type).toBe('image/png');
    expect(payload.text).toContain('Friday match');
    expect(payload.text).toContain('Great session');
  });
});
