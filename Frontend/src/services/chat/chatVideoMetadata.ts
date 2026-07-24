export type ChatVideoFileMeta = {
  durationMs: number;
  width: number;
  height: number;
};

const DEFAULT_METADATA_TIMEOUT_MS = 5_000;

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

async function loadVideoMetadataInner(
  file: File,
  signal: AbortSignal
): Promise<ChatVideoFileMeta> {
  if (signal.aborted) throw abortError();

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      video.onloadedmetadata = null;
      video.onerror = null;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });

    video.onloadedmetadata = () => {
      const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      cleanup();
      resolve({ durationMs, width, height });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('video_probe_failed'));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    video.src = url;
    video.load();
  });
}

/** Probe duration/dimensions with abortable hard timeout (iOS blob MP4s can hang forever). */
export async function loadChatVideoMetadata(
  file: File,
  timeoutMs = DEFAULT_METADATA_TIMEOUT_MS
): Promise<ChatVideoFileMeta> {
  const ac = new AbortController();
  const tid = globalThis.setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await loadVideoMetadataInner(file, ac.signal);
  } catch (e) {
    if (ac.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
      throw new Error('video_probe_timeout');
    }
    throw e;
  } finally {
    globalThis.clearTimeout(tid);
    if (!ac.signal.aborted) ac.abort();
  }
}
