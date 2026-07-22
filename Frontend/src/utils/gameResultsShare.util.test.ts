// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GamePhoto } from '@/api/gamePhotos';
import type { Game } from '@/types';

const html2canvasMock = vi.fn();
const writeFileMock = vi.fn();
const getUriMock = vi.fn();
const shareMock = vi.fn();
const isCapacitorMock = vi.fn(() => false);

vi.mock('html2canvas', () => ({
  default: (...args: unknown[]) => html2canvasMock(...args),
}));

vi.mock('@capacitor/share', () => ({
  Share: { share: (...args: unknown[]) => shareMock(...args) },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    writeFile: (...args: unknown[]) => writeFileMock(...args),
    getUri: (...args: unknown[]) => getUriMock(...args),
  },
}));

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: () => isCapacitorMock(),
}));

import {
  canShowGameResultsShareCard,
  isShareDismissal,
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

describe('isShareDismissal', () => {
  it('treats AbortError and cancel/dismiss messages as dismissals', () => {
    expect(isShareDismissal({ name: 'AbortError' })).toBe(true);
    expect(isShareDismissal({ message: 'Share canceled' })).toBe(true);
    expect(isShareDismissal({ message: 'User dismissed share sheet' })).toBe(true);
    expect(isShareDismissal({ message: 'Failed to export image' })).toBe(false);
  });
});

describe('shareGameResultsCard', () => {
  beforeEach(() => {
    html2canvasMock.mockReset();
    writeFileMock.mockReset();
    getUriMock.mockReset();
    shareMock.mockReset();
    isCapacitorMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mockExportCanvas() {
    const blob = new Blob(['png'], { type: 'image/png' });
    html2canvasMock.mockResolvedValue({
      toBlob: (cb: (b: Blob | null) => void) => cb(blob),
    });
    return blob;
  }

  it('shares exported PNG when file sharing is supported', async () => {
    const cardElement = document.createElement('div');
    const share = vi.fn().mockResolvedValue(undefined);

    mockExportCanvas();
    vi.stubGlobal('window', {
      ...window,
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

  it('downloads PNG on desktop when Web Share is unavailable', async () => {
    const cardElement = document.createElement('div');
    mockExportCanvas();

    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        Object.defineProperty(node, 'click', { value: click });
      }
      return node;
    });
    const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    vi.stubGlobal('navigator', {
      canShare: undefined,
      share: undefined,
    });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:game-results'),
      revokeObjectURL: vi.fn(),
    });

    await shareGameResultsCard({
      cardElement,
      summaryText: 'Great session',
      gameTitle: 'Friday match',
    });

    expect(click).toHaveBeenCalledOnce();
    expect(shareMock).not.toHaveBeenCalled();

    appendChild.mockRestore();
    removeChild.mockRestore();
  });

  it('writes PNG to filesystem and shares URI on Capacitor', async () => {
    const cardElement = document.createElement('div');
    mockExportCanvas();
    isCapacitorMock.mockReturnValue(true);
    writeFileMock.mockResolvedValue(undefined);
    getUriMock.mockResolvedValue({ uri: 'file:///cache/game-results.png' });
    shareMock.mockResolvedValue(undefined);

    vi.stubGlobal('navigator', {
      canShare: vi.fn().mockReturnValue(false),
      share: undefined,
    });

    await shareGameResultsCard({
      cardElement,
      summaryText: 'Great session',
      gameTitle: 'Friday match',
    });

    expect(writeFileMock).toHaveBeenCalledOnce();
    expect(getUriMock).toHaveBeenCalledOnce();
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'file:///cache/game-results.png' })
    );
  });

  it('inlines fetched photo data URLs before html2canvas', async () => {
    const cardElement = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'https://cdn.example/photo.jpg';
    cardElement.appendChild(img);

    const dataUrl = 'data:image/png;base64,aaa';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['img'], { type: 'image/png' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('FileReader', class {
      result: string | ArrayBuffer | null = dataUrl;
      onloadend: null | (() => void) = null;
      onerror: null | (() => void) = null;
      readAsDataURL() {
        queueMicrotask(() => this.onloadend?.());
      }
    });

    let onclone: ((doc: Document, cloned: HTMLElement) => void) | undefined;
    html2canvasMock.mockImplementation(async (_el: HTMLElement, opts: { onclone?: typeof onclone }) => {
      onclone = opts.onclone;
      return {
        toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
      };
    });

    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      canShare: vi.fn().mockReturnValue(true),
      share,
    });

    await shareGameResultsCard({ cardElement, gameTitle: 'Match' });

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/photo.jpg', {
      mode: 'cors',
      credentials: 'omit',
    });

    const cloned = document.createElement('div');
    const clonedImg = document.createElement('img');
    clonedImg.setAttribute('crossorigin', 'anonymous');
    clonedImg.src = 'https://cdn.example/photo.jpg';
    cloned.appendChild(clonedImg);
    onclone?.(document, cloned);
    expect(clonedImg.getAttribute('crossorigin')).toBeNull();
    expect(clonedImg.src).toBe(dataUrl);
  });

  it('removes unresolved images in the html2canvas clone', async () => {
    const cardElement = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'https://cdn.example/blocked.jpg';
    cardElement.appendChild(img);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS')));

    let onclone: ((doc: Document, cloned: HTMLElement) => void) | undefined;
    html2canvasMock.mockImplementation(async (_el: HTMLElement, opts: { onclone?: typeof onclone }) => {
      onclone = opts.onclone;
      return {
        toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
      };
    });

    const click = vi.fn();
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        Object.defineProperty(node, 'click', { value: click });
      }
      return node;
    });
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    vi.stubGlobal('navigator', { canShare: undefined, share: undefined });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:game-results'),
      revokeObjectURL: vi.fn(),
    });

    await shareGameResultsCard({ cardElement, gameTitle: 'Match' });

    const cloned = document.createElement('div');
    const clonedImg = document.createElement('img');
    cloned.appendChild(clonedImg);
    onclone?.(document, cloned);
    expect(cloned.querySelector('img')).toBeNull();
    expect(click).toHaveBeenCalledOnce();
  });
});
