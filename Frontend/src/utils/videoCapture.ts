import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { isCapacitor } from './capacitor';

export type VideoPickResult = { file: File };

const VIDEO_MIME = /^video\//i;

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

    const cleanup = () => {
      setTimeout(() => {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 100);
    };

    const finish = (file: File | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      window.removeEventListener('focus', onFocus);
      resolve(file ? { file } : null);
    };

    const onFocus = () => {
      setTimeout(() => {
        if (!resolved && (!input.files || input.files.length === 0)) {
          finish(null);
        }
      }, 400);
    };

    input.onchange = async () => {
      const raw = input.files?.[0];
      if (!raw) {
        finish(null);
        return;
      }
      try {
        if (raw.size > 0 || !isCapacitor()) {
          finish(raw);
          return;
        }
        const anyFile = raw as File & { path?: string };
        if (anyFile.path) {
          const blob = await blobFromCapacitorPath(anyFile.path);
          finish(fileFromBlob(blob, raw.name || 'video.mp4'));
          return;
        }
        finish(raw);
      } catch (e) {
        console.error('[pickVideo] failed to read file', e);
        finish(null);
      }
    };

    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    setTimeout(() => input.click(), 0);
  });
}
