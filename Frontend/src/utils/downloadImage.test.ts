import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isCapacitorMock,
  shareMock,
  filesystemWriteMock,
  filesystemGetUriMock,
} = vi.hoisted(() => ({
  isCapacitorMock: vi.fn(() => false),
  shareMock: vi.fn(async () => undefined),
  filesystemWriteMock: vi.fn(async () => undefined),
  filesystemGetUriMock: vi.fn(async () => ({ uri: 'file:///tmp/image.jpg' })),
}));

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: isCapacitorMock,
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: shareMock,
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE', Data: 'DATA', ExternalStorage: 'EXTERNAL' },
  Filesystem: {
    writeFile: filesystemWriteMock,
    getUri: filesystemGetUriMock,
  },
}));

import { downloadImage } from './downloadImage';

describe('downloadImage', () => {
  const jpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const pngBlob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  const fetchMock = vi.fn();
  const anchorClickMock = vi.fn();
  let createdAnchor: HTMLAnchorElement | null = null;

  beforeEach(() => {
    isCapacitorMock.mockReturnValue(false);
    shareMock.mockReset();
    filesystemWriteMock.mockReset();
    filesystemGetUriMock.mockReset();
    fetchMock.mockReset();
    anchorClickMock.mockReset();
    createdAnchor = null;
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob([jpegBytes], { type: 'image/jpeg' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 1,
      height: 1,
      close: vi.fn(),
    })));
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
    });
    vi.stubGlobal('document', {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: vi.fn() }),
            toBlob: (callback: BlobCallback) => {
              callback(pngBlob);
            },
          };
        }
        if (tag === 'a') {
          const anchor = {
            href: '',
            download: '',
            rel: '',
            click: anchorClickMock,
          } as unknown as HTMLAnchorElement;
          createdAnchor = anchor;
          return anchor;
        }
        throw new Error(`unexpected tag: ${tag}`);
      },
    });
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1;
      naturalHeight = 1;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal('Image', MockImage);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      'FileReader',
      class MockFileReader {
        result: string | null = null;
        onloadend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL(_blob: Blob) {
          this.result = 'data:image/jpeg;base64,YWJj';
          this.onloadend?.();
        }
      },
    );
    navigator.canShare = undefined;
    navigator.share = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads via anchor on desktop web', async () => {
    const outcome = await downloadImage('https://example.com/photo.jpg');

    expect(outcome).toBe('downloaded');
    expect(anchorClickMock).toHaveBeenCalledTimes(1);
    expect(createdAnchor?.download.endsWith('.jpg')).toBe(true);
  });

  it('skips fetch when a blob is provided', async () => {
    const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
    await downloadImage('https://example.com/photo.jpg', { blob });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(anchorClickMock).toHaveBeenCalledTimes(1);
  });

  it('uses share on mobile web when available', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    const canShareMock = vi.fn(() => true);
    const shareNavigatorMock = vi.fn(async () => undefined);
    navigator.canShare = canShareMock;
    navigator.share = shareNavigatorMock;

    const outcome = await downloadImage('https://example.com/photo.jpg');

    expect(outcome).toBe('shared');
    expect(shareNavigatorMock).toHaveBeenCalledTimes(1);
    expect(anchorClickMock).not.toHaveBeenCalled();
  });

  it('uses the displayed image when fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const img = {
      naturalWidth: 2,
      naturalHeight: 2,
    } as HTMLImageElement;

    const outcome = await downloadImage('https://example.com/photo.jpg', { img });

    expect(outcome).toBe('downloaded');
    expect(anchorClickMock).toHaveBeenCalledTimes(1);
  });

  it('uses native share on capacitor when available', async () => {
    isCapacitorMock.mockReturnValue(true);
    const canShareMock = vi.fn(() => true);
    const shareNavigatorMock = vi.fn(async () => undefined);
    navigator.canShare = canShareMock;
    navigator.share = shareNavigatorMock;

    const outcome = await downloadImage('https://example.com/photo.jpg');

    expect(outcome).toBe('shared');
    expect(shareNavigatorMock).toHaveBeenCalledTimes(1);
    expect(shareMock).not.toHaveBeenCalled();
  });

  it('falls back to capacitor filesystem share when native share is unavailable', async () => {
    isCapacitorMock.mockReturnValue(true);

    const outcome = await downloadImage('https://example.com/photo.jpg');

    expect(outcome).toBe('shared');
    expect(filesystemWriteMock).toHaveBeenCalledTimes(1);
    expect(filesystemGetUriMock).toHaveBeenCalledTimes(1);
    expect(shareMock).toHaveBeenCalledTimes(1);
    const [writeArgs] = filesystemWriteMock.mock.calls[0] as [{ directory: string }];
    expect(writeArgs.directory).toBe('CACHE');
  });
});
