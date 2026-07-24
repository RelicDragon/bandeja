import {
  MAX_VIDEO_BYTES_AFTER_ENCODE,
  MAX_VIDEO_DURATION_MS,
  MAX_VIDEO_HEIGHT,
  MAX_VIDEO_WIDTH,
  SEND_VIDEO_TRANSCODE_PHASE_MS,
} from '@/constants/chatVideo';
import { withTimeout } from '@/services/chat/chatVideoAsyncTimeout';
import { loadChatVideoMetadata } from '@/services/chat/chatVideoMetadata';
import { captureChatVideoPosterBlob } from '@/services/chat/chatVideoPoster';
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

function fitWithinMax(width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: MAX_VIDEO_WIDTH, height: MAX_VIDEO_HEIGHT };
  }
  if (width <= MAX_VIDEO_WIDTH && height <= MAX_VIDEO_HEIGHT) {
    return { width, height };
  }
  const scale = Math.min(MAX_VIDEO_WIDTH / width, MAX_VIDEO_HEIGHT / height);
  return {
    width: Math.max(2, Math.round(width * scale)),
    height: Math.max(2, Math.round(height * scale)),
  };
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

/** Output duration after client encode/trim — no HTMLVideo re-probe required. */
export function resolveEncodedChatVideoDurationMs(params: {
  sourceDurationMs: number;
  wasTranscoded: boolean;
  wantsTrim: boolean;
  trimmedDurationMs: number;
}): number {
  const { sourceDurationMs, wasTranscoded, wantsTrim, trimmedDurationMs } = params;
  if (wantsTrim && trimmedDurationMs > 0) {
    return effectiveChatVideoDurationMs(trimmedDurationMs, wasTranscoded);
  }
  return effectiveChatVideoDurationMs(sourceDurationMs, wasTranscoded);
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
  const sourceMeta = await loadChatVideoMetadata(rawFile);
  if (sourceMeta.durationMs < 500) {
    throw new Error('video_too_short');
  }

  const trim = options?.trim;
  const trimStartMs = Math.max(0, trim?.startMs ?? 0);
  const trimEndMs =
    trim && trim.endMs > trimStartMs ? Math.min(trim.endMs, sourceMeta.durationMs) : sourceMeta.durationMs;
  const trimmedDurationMs = Math.max(0, trimEndMs - trimStartMs);
  const wantsTrim = trim != null && (trimStartMs > 0 || trimEndMs < sourceMeta.durationMs);
  const needsTranscode = shouldTranscodeChatVideo(rawFile, sourceMeta) || wantsTrim;

  // Poster from *source* in parallel with encode — gallery MOV/HEVC plays on iOS; re-encoded blob MP4 often hangs.
  const posterPromise = captureChatVideoPosterBlob(rawFile);

  let videoFile = rawFile;
  let width = sourceMeta.width;
  let height = sourceMeta.height;

  try {
    if (needsTranscode) {
      if (!isWebCodecsVideoTranscodeAvailable()) {
        throw new Error('video_transcode_unavailable');
      }
      const fitted = fitWithinMax(sourceMeta.width, sourceMeta.height);
      width = fitted.width;
      height = fitted.height;
      // Only pass trim when the user/story actually clips — a always-on trim object
      // forced main-thread encode and skipped the worker on every chat send.
      const encodeTrim = wantsTrim
        ? { startSec: trimStartMs / 1000, endSec: trimEndMs / 1000 }
        : undefined;
      videoFile = await withTimeout(
        transcodeChatVideoToMp4(
          rawFile,
          tempId,
          sourceMeta,
          options?.onTranscodeProgress,
          encodeTrim
        ),
        SEND_VIDEO_TRANSCODE_PHASE_MS,
        'video_transcode_failed'
      );
    }

    const durationMs = resolveEncodedChatVideoDurationMs({
      sourceDurationMs: sourceMeta.durationMs,
      wasTranscoded: needsTranscode,
      wantsTrim,
      trimmedDurationMs,
    });
    if (durationMs < 500) {
      throw new Error('video_too_short');
    }
    if (!needsTranscode && durationMs > MAX_VIDEO_DURATION_MS) {
      throw new Error('video_too_long');
    }
    if (videoFile.size > MAX_VIDEO_BYTES_AFTER_ENCODE) {
      throw new Error('video_too_large');
    }

    const base = `chat-video-${tempId}`;
    if (videoFile.name !== `${base}.mp4`) {
      videoFile = new File([videoFile], `${base}.mp4`, { type: 'video/mp4' });
    }

    const posterBlob = await posterPromise;
    return {
      videoFile,
      posterBlob,
      durationMs,
      width,
      height,
      transcodeMs: Date.now() - startedAt,
    };
  } catch (e) {
    // Ensure poster work finishes (always resolves) so it can't outlive this call as an orphan.
    await posterPromise.catch(() => undefined);
    throw e;
  }
}
