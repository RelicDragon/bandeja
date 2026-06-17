import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isCapacitorMock,
  isAndroidMock,
  clipboardWriteMock,
  capacitorClipboardWriteMock,
  shareMock,
  filesystemWriteMock,
  filesystemGetUriMock,
} = vi.hoisted(() => ({
  isCapacitorMock: vi.fn(() => false),
  isAndroidMock: vi.fn(() => false),
  clipboardWriteMock: vi.fn(async () => undefined),
  capacitorClipboardWriteMock: vi.fn(async () => undefined),
  shareMock: vi.fn(async () => undefined),
  filesystemWriteMock: vi.fn(async () => undefined),
  filesystemGetUriMock: vi.fn(async () => ({ uri: 'file:///tmp/image.png' })),
}));

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: isCapacitorMock,
  isAndroid: isAndroidMock,
}));

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: {
    write: capacitorClipboardWriteMock,
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: shareMock,
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', ExternalStorage: 'EXTERNAL' },
  Filesystem: {
    writeFile: filesystemWriteMock,
    getUri: filesystemGetUriMock,
  },
}));

import { copyImageToClipboard } from './copyImageToClipboard';

describe('copyImageToClipboard', () => {
  const jpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const pngBlob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  const fetchMock = vi.fn();

  beforeEach(() => {
    isCapacitorMock.mockReturnValue(false);
    isAndroidMock.mockReturnValue(false);
    clipboardWriteMock.mockReset();
    capacitorClipboardWriteMock.mockReset();
    shareMock.mockReset();
    filesystemWriteMock.mockReset();
    filesystemGetUriMock.mockReset();
    fetchMock.mockReset();
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
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItem {
        types: string[];
        private readonly blobs: Record<string, Blob>;
        constructor(items: Record<string, Blob>) {
          this.blobs = items;
          this.types = Object.keys(items);
        }
        getType(type: string) {
          const blob = this.blobs[type];
          if (!blob) throw new Error('missing type');
          return Promise.resolve(blob);
        }
      },
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: clipboardWriteMock },
    });
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`unexpected tag: ${tag}`);
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (callback: BlobCallback) => {
            callback(pngBlob);
          },
        };
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
          this.result = 'data:image/png;base64,YWJj';
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

  it('writes image/png to the clipboard even when the source blob is jpeg', async () => {
    const outcome = await copyImageToClipboard('https://example.com/photo.jpg');

    expect(outcome).toBe('clipboard');
    expect(clipboardWriteMock).toHaveBeenCalledTimes(1);
    const [items] = clipboardWriteMock.mock.calls[0] as [ClipboardItem[]];
    expect(items[0].types).toEqual(['image/png']);
  });

  it('skips fetch when a blob is provided', async () => {
    const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
    await copyImageToClipboard('https://example.com/photo.jpg', { blob });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(clipboardWriteMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to share when clipboard write fails', async () => {
    clipboardWriteMock.mockRejectedValueOnce(new Error('denied'));
    const canShareMock = vi.fn(() => true);
    const shareNavigatorMock = vi.fn(async () => undefined);
    navigator.canShare = canShareMock;
    navigator.share = shareNavigatorMock;

    const outcome = await copyImageToClipboard('https://example.com/photo.jpg');

    expect(outcome).toBe('shared');
    expect(canShareMock).toHaveBeenCalled();
    expect(shareNavigatorMock).toHaveBeenCalledTimes(1);
    const [shareArgs] = shareNavigatorMock.mock.calls[0] as [{ files: File[] }];
    expect(shareArgs.files[0].type).toBe('image/png');
  });

  it('uses the displayed image when fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const img = {
      naturalWidth: 2,
      naturalHeight: 2,
    } as HTMLImageElement;

    const outcome = await copyImageToClipboard('https://example.com/photo.jpg', { img });

    expect(outcome).toBe('clipboard');
    expect(clipboardWriteMock).toHaveBeenCalledTimes(1);
  });

  it('uses capacitor clipboard on native', async () => {
    isCapacitorMock.mockReturnValue(true);
    const outcome = await copyImageToClipboard('https://example.com/photo.jpg');

    expect(outcome).toBe('clipboard');
    expect(capacitorClipboardWriteMock).toHaveBeenCalledTimes(1);
    expect(clipboardWriteMock).not.toHaveBeenCalled();
  });

  it('falls back to capacitor share when native clipboard fails', async () => {
    isCapacitorMock.mockReturnValue(true);
    capacitorClipboardWriteMock.mockRejectedValueOnce(new Error('clipboard failed'));

    const outcome = await copyImageToClipboard('https://example.com/photo.jpg');

    expect(outcome).toBe('shared');
    expect(shareMock).toHaveBeenCalledTimes(1);
  });
});
