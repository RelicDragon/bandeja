import { raceAbort } from '@/services/chat/chatVideoAsyncTimeout';

const POSTER_CAPTURE_TIMEOUT_MS = 3_000;

/** Minimal valid 1×1 JPEG — no canvas dependency (fallback / jsdom). */
const FALLBACK_JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xff, 0xc4, 0x00, 0x14,
  0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x37, 0xff, 0xd9,
]);

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/** Solid JPEG used when HTMLVideoElement frame capture fails/hangs (common on iOS WKWebView). */
export function createFallbackChatVideoPosterBlob(): Blob {
  return new Blob([FALLBACK_JPEG_BYTES], { type: 'image/jpeg' });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  const encode = new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('poster_blob_failed'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.85
    );
  });
  return raceAbort(encode, signal);
}

function drawVideoFrameToBlob(video: HTMLVideoElement, signal: AbortSignal): Promise<Blob> {
  if (signal.aborted) return Promise.reject(abortError());
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return Promise.reject(new Error('poster_frame_unavailable'));
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 512 / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('poster_canvas_failed'));
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToJpegBlob(canvas, signal);
}

function loadVideoData(video: HTMLVideoElement, url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const onAbort = () => {
      detach();
      reject(abortError());
    };
    const onLoaded = () => {
      detach();
      resolve();
    };
    const onError = () => {
      detach();
      reject(new Error('poster_capture_failed'));
    };
    const detach = () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };

    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    video.src = url;
    video.load();
  });
}

/** One abortable seek — never play() (play can hang forever on WKWebView). */
function seekVideo(video: HTMLVideoElement, seekTo: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    if (Math.abs(video.currentTime - seekTo) <= 0.001) {
      resolve();
      return;
    }

    const onAbort = () => {
      detach();
      reject(abortError());
    };
    const onSeeked = () => {
      detach();
      resolve();
    };
    const detach = () => {
      video.removeEventListener('seeked', onSeeked);
      signal.removeEventListener('abort', onAbort);
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      video.currentTime = seekTo;
    } catch {
      detach();
      reject(new Error('poster_seek_failed'));
    }
  });
}

/**
 * Capture a JPEG poster from a local video File.
 * Prefer the *source* file (gallery MOV/HEVC), not re-encoded blob MP4 — iOS often hangs on the latter.
 *
 * Guarantees: respects AbortSignal at every await; no unbounded play()/RVFC waits;
 * always settles via outer timeout + fallback.
 */
async function captureChatVideoPosterBlobInner(
  file: File,
  signal: AbortSignal
): Promise<Blob> {
  if (signal.aborted) throw abortError();

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');

  const cleanup = () => {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  };

  try {
    await loadVideoData(video, url, signal);

    // Seek even when dimensions are known — loadeddata alone can still be a blank frame on iOS.
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const seekTo = Math.min(0.25, Math.max(0.001, duration * 0.05));
    try {
      await seekVideo(video, seekTo, signal);
    } catch (e) {
      if (isAbortError(e)) throw e;
      if (!video.videoWidth || !video.videoHeight) throw e;
      // Dimensions known after failed seek — draw current frame rather than failing the send.
    }

    return await drawVideoFrameToBlob(video, signal);
  } finally {
    cleanup();
  }
}

/** Always settles: real frame, or fallback JPEG within timeoutMs. */
export async function captureChatVideoPosterBlob(
  file: File,
  timeoutMs = POSTER_CAPTURE_TIMEOUT_MS
): Promise<Blob> {
  const ac = new AbortController();
  const tid = globalThis.setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await captureChatVideoPosterBlobInner(file, ac.signal);
  } catch {
    return createFallbackChatVideoPosterBlob();
  } finally {
    globalThis.clearTimeout(tid);
    if (!ac.signal.aborted) ac.abort();
  }
}
