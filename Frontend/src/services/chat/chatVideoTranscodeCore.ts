import {
  MAX_VIDEO_BYTES_AFTER_ENCODE,
  MAX_VIDEO_DURATION_MS,
  MAX_VIDEO_HEIGHT,
  MAX_VIDEO_WIDTH,
  TARGET_VIDEO_BITRATE,
} from '@/constants/chatVideo';

export type TranscodeProgressFn = (progress: number) => void;

export type ChatVideoTranscodeMeta = {
  durationMs: number;
  width: number;
  height: number;
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

/** H.264/AAC MP4 via Mediabunny (MOV/HEVC, oversize, trim). */
export async function transcodeChatVideoToMp4Core(
  file: File,
  tempId: string,
  meta: ChatVideoTranscodeMeta,
  onProgress?: TranscodeProgressFn
): Promise<File> {
  const {
    Input,
    Output,
    Conversion,
    BlobSource,
    BufferTarget,
    Mp4OutputFormat,
    ALL_FORMATS,
    getFirstEncodableVideoCodec,
    getFirstEncodableAudioCodec,
  } = await import('mediabunny');

  const videoCodec = await getFirstEncodableVideoCodec(['avc'], {
    width: MAX_VIDEO_WIDTH,
    height: MAX_VIDEO_HEIGHT,
  });
  if (!videoCodec) {
    throw new Error('video_transcode_unavailable');
  }

  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });

  const { width, height } = fitWithinMax(meta.width, meta.height);
  const trimEndSec = meta.durationMs / 1000;
  const maxSec = MAX_VIDEO_DURATION_MS / 1000;

  const audioCodec = await getFirstEncodableAudioCodec(['aac']);

  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    trim: trimEndSec > maxSec ? { start: 0, end: maxSec } : undefined,
    video: {
      codec: videoCodec,
      bitrate: TARGET_VIDEO_BITRATE,
      width,
      height,
      fit: 'contain',
      frameRate: 30,
      forceTranscode: true,
    },
    audio: audioCodec
      ? { codec: audioCodec, bitrate: 128_000, forceTranscode: true }
      : { discard: true },
  });

  if (!conversion.isValid) {
    throw new Error('video_transcode_failed');
  }

  if (onProgress) {
    conversion.onProgress = (p) => onProgress(p);
  }

  await conversion.execute();

  const buf = target.buffer;
  if (!buf || buf.byteLength === 0) {
    throw new Error('video_transcode_failed');
  }
  if (buf.byteLength > MAX_VIDEO_BYTES_AFTER_ENCODE) {
    throw new Error('video_too_large');
  }

  const blob = new Blob([buf], { type: 'video/mp4' });
  return new File([blob], `chat-video-${tempId}.mp4`, { type: 'video/mp4' });
}
