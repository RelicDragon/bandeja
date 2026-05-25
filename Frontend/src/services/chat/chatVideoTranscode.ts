import {
  MAX_VIDEO_BYTES_AFTER_ENCODE,
  MAX_VIDEO_DURATION_MS,
  MAX_VIDEO_HEIGHT,
  MAX_VIDEO_WIDTH,
} from '@/constants/chatVideo';
import { compressChatOutboxImageBlob } from '@/services/chat/chatOutboxImageCompress';
import { transcodeChatVideoToMp4, type TranscodeProgressFn } from '@/services/chat/chatVideoTranscodeMediabunny';

export type ChatVideoTranscodeResult = {
  videoFile: File;
  posterBlob: Blob;
  durationMs: number;
  width: number;
  height: number;
  transcodeMs: number;
};

export type VideoTrimRangeMs = {
  startMs: number;
  endMs: number;
};

export type PrepareChatVideoOptions = {
  onTranscodeProgress?: TranscodeProgressFn;
  trim?: VideoTrimRangeMs;
};

function loadVideoMetadata(file: File): Promise<{ durationMs: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };
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
    video.src = url;
  });
}

async function capturePosterBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };
    const draw = () => {
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 360;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 512 / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        reject(new Error('poster_canvas_failed'));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        async (blob) => {
          cleanup();
          if (!blob) {
            reject(new Error('poster_blob_failed'));
            return;
          }
          resolve(await compressChatOutboxImageBlob(blob));
        },
        'image/jpeg',
        0.85
      );
    };
    video.onloadeddata = () => {
      const seekTo = Math.min(0.5, Math.max(0, (video.duration || 1) * 0.1));
      video.currentTime = seekTo;
    };
    video.onseeked = () => draw();
    video.onerror = () => {
      cleanup();
      reject(new Error('poster_capture_failed'));
    };
    video.src = url;
  });
}

function isLikelyMp4(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  const n = file.name.toLowerCase();
  return t === 'video/mp4' || t === 'video/x-m4v' || n.endsWith('.mp4') || n.endsWith('.m4v');
}

/** Duration stored on the message after client encode (trimmed files may report long metadata). */
export function effectiveChatVideoDurationMs(durationMs: number, wasTranscoded: boolean): number {
  return wasTranscoded ? Math.min(durationMs, MAX_VIDEO_DURATION_MS) : durationMs;
}

/** Whether client-side Mediabunny transcode is required before upload. */
export function shouldTranscodeChatVideo(
  file: File,
  meta: { durationMs: number; width: number; height: number }
): boolean {
  if (!isLikelyMp4(file)) return true;
  if (meta.durationMs > MAX_VIDEO_DURATION_MS) return true;
  if (meta.width > MAX_VIDEO_WIDTH || meta.height > MAX_VIDEO_HEIGHT) return true;
  if (file.size > MAX_VIDEO_BYTES_AFTER_ENCODE) return true;
  return false;
}

export function isWebCodecsVideoTranscodeAvailable(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
}

export async function prepareChatVideoForSend(
  rawFile: File,
  tempId: string,
  options?: PrepareChatVideoOptions
): Promise<ChatVideoTranscodeResult> {
  const startedAt = Date.now();
  let meta = await loadVideoMetadata(rawFile);
  if (meta.durationMs < 500) {
    throw new Error('video_too_short');
  }

  const trim = options?.trim;
  const trimStartMs = Math.max(0, trim?.startMs ?? 0);
  const trimEndMs =
    trim && trim.endMs > trimStartMs ? Math.min(trim.endMs, meta.durationMs) : meta.durationMs;
  const trimmedDurationMs = Math.max(0, trimEndMs - trimStartMs);
  const wantsTrim = trim != null && (trimStartMs > 0 || trimEndMs < meta.durationMs);

  let videoFile = rawFile;
  let wasTranscoded = false;

  if (shouldTranscodeChatVideo(rawFile, meta) || wantsTrim) {
    if (!isWebCodecsVideoTranscodeAvailable()) {
      throw new Error('video_transcode_unavailable');
    }
    wasTranscoded = true;
    videoFile = await transcodeChatVideoToMp4(rawFile, tempId, meta, options?.onTranscodeProgress, {
      startSec: trimStartMs / 1000,
      endSec: trimEndMs / 1000,
    });
    meta = await loadVideoMetadata(videoFile);
    if (wantsTrim && trimmedDurationMs > 0) {
      meta = { ...meta, durationMs: trimmedDurationMs };
    }
  }

  const durationMs = effectiveChatVideoDurationMs(meta.durationMs, wasTranscoded);
  if (durationMs < 500) {
    throw new Error('video_too_short');
  }
  if (!wasTranscoded && durationMs > MAX_VIDEO_DURATION_MS) {
    throw new Error('video_too_long');
  }
  meta = { ...meta, durationMs };
  if (videoFile.size > MAX_VIDEO_BYTES_AFTER_ENCODE) {
    throw new Error('video_too_large');
  }

  const base = `chat-video-${tempId}`;
  if (videoFile.name !== `${base}.mp4`) {
    videoFile = new File([videoFile], `${base}.mp4`, { type: 'video/mp4' });
  }

  const posterBlob = await capturePosterBlob(videoFile);
  return {
    videoFile,
    posterBlob,
    durationMs,
    width: meta.width,
    height: meta.height,
    transcodeMs: Date.now() - startedAt,
  };
}
