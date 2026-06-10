import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { isCapacitor } from './capacitor';
import { withNormalizedVideoMime } from './videoFileUtils';

export type VideoPickResult = { file: File };

const VIDEO_MIME = /^video\//i;
const CAPACITOR_PICK_POLL_MS = 100;
const CAPACITOR_PICK_MAX_ATTEMPTS = 150;

async function blobFromCapacitorPath(path: string, webPath?: string): Promise<Blob> {
  if (webPath) {
    const url = Capacitor.convertFileSrc(webPath);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to read video: ${res.statusText}`);
    return res.blob();
  }
  const clean = path.replace(/^file:\/\//, '');
  const data = await Filesystem.readFile({ path: clean });
  let base64 = data.data as string;
  if (base64.includes(',')) base64 = base64.split(',')[1]!;
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: 'video/mp4' });
}

function fileFromBlob(blob: Blob, name: string): File {
  const ext = name.includes('.') ? '' : '.mp4';
  return new File([blob], name.endsWith(ext) ? name : `${name}${ext}`, {
    type: blob.type && VIDEO_MIME.test(blob.type) ? blob.type : 'video/mp4',
  });
}

/** System video picker — works on web and Capacitor (iOS/Android) without broad storage permissions. */
export function pickVideo(): Promise<VideoPickResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';

    let resolved = false;
    let consumeStarted = false;
    let pollId: number | null = null;
    let webCancelTimer: number | null = null;

    const cleanup = () => {
      setTimeout(() => {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 100);
    };

    const stopCapacitorPoll = () => {
      if (pollId != null) {
        window.clearInterval(pollId);
        pollId = null;
      }
    };

    const stopWebCancelTimer = () => {
      if (webCancelTimer != null) {
        window.clearTimeout(webCancelTimer);
        webCancelTimer = null;
      }
    };

    const detachWindowListeners = () => {
      window.removeEventListener('focus', onFocus);
    };

    const finish = (file: File | null) => {
      if (resolved) return;
      resolved = true;
      stopCapacitorPoll();
      stopWebCancelTimer();
      detachWindowListeners();
      cleanup();
      resolve(file ? { file } : null);
    };

    const processPickedFile = async (raw: File) => {
      if (resolved || consumeStarted) return;
      consumeStarted = true;
      stopCapacitorPoll();
      stopWebCancelTimer();
      try {
        if (raw.size > 0 || !isCapacitor()) {
          finish(withNormalizedVideoMime(raw));
          return;
        }
        const anyFile = raw as File & { path?: string; webPath?: string };
        if (anyFile.path || anyFile.webPath) {
          const blob = await blobFromCapacitorPath(anyFile.path ?? anyFile.webPath!, anyFile.webPath);
          finish(withNormalizedVideoMime(fileFromBlob(blob, raw.name || 'video.mp4')));
          return;
        }
        finish(withNormalizedVideoMime(raw));
      } catch (e) {
        console.error('[pickVideo] failed to read file', e);
        finish(null);
      }
    };

    const startCapacitorPickPoll = () => {
      if (resolved || pollId != null) return;
      let attempts = 0;
      pollId = window.setInterval(() => {
        if (resolved) {
          stopCapacitorPoll();
          return;
        }
        const raw = input.files?.[0];
        if (raw) {
          void processPickedFile(raw);
          return;
        }
        attempts++;
        if (attempts >= CAPACITOR_PICK_MAX_ATTEMPTS) {
          stopCapacitorPoll();
          finish(null);
        }
      }, CAPACITOR_PICK_POLL_MS);
    };

    const scheduleWebPickerCancel = () => {
      if (resolved) return;
      stopWebCancelTimer();
      webCancelTimer = window.setTimeout(() => {
        webCancelTimer = null;
        if (!resolved && (!input.files || input.files.length === 0)) {
          finish(null);
        }
      }, 600);
    };

    const onFocus = () => {
      if (resolved) return;
      if (isCapacitor()) {
        startCapacitorPickPoll();
      } else {
        scheduleWebPickerCancel();
      }
    };

    input.onchange = async () => {
      const raw = input.files?.[0];
      if (!raw) {
        finish(null);
        return;
      }
      await processPickedFile(raw);
    };

    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    setTimeout(() => input.click(), 0);
  });
}
