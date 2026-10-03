/** Speech models want 16 kHz mono; that is ~32 KB per second as PCM16 WAV. */
export const VOICE_WAV_SAMPLE_RATE = 16_000;

/** Box-filter downsample (averages each output sample's input span): enough for speech. */
export function downsample(input: Float32Array, inputRate: number, outputRate = VOICE_WAV_SAMPLE_RATE): Float32Array {
  if (inputRate === outputRate) return input;
  if (inputRate < outputRate) throw new Error('upsampling is not supported');
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

export function concatFrames(frames: readonly Float32Array[]): Float32Array {
  const total = frames.reduce((n, f) => n + f.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

/** Mono PCM16 WAV bytes. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Captured frames at the context rate → a 16 kHz WAV blob for `/voice/transcriptions`. */
export function framesToWavBlob(frames: readonly Float32Array[], inputRate: number): { blob: Blob; durationMs: number } {
  const pcm = downsample(concatFrames(frames), inputRate);
  return {
    blob: new Blob([encodeWav(pcm, VOICE_WAV_SAMPLE_RATE)], { type: 'audio/wav' }),
    durationMs: Math.round((pcm.length / VOICE_WAV_SAMPLE_RATE) * 1000),
  };
}
