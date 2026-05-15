import {
  transcodeChatVideoToMp4Core,
  type ChatVideoTranscodeMeta,
} from './chatVideoTranscodeCore';

type TranscodeMsg = {
  type: 'TRANSCODE';
  id: number;
  buffer: ArrayBuffer;
  fileName: string;
  mimeType: string;
  tempId: string;
  meta: ChatVideoTranscodeMeta;
};

type ProgressMsg = { type: 'PROGRESS'; id: number; progress: number };

type DoneMsg = { type: 'DONE'; id: number; buffer: ArrayBuffer; fileName: string };

type ErrorMsg = { type: 'ERROR'; id: number; message: string };

self.onmessage = async (e: MessageEvent<TranscodeMsg>) => {
  const d = e.data;
  if (d?.type !== 'TRANSCODE') return;
  const { id, buffer, fileName, mimeType, tempId, meta } = d;
  try {
    const file = new File([buffer], fileName, { type: mimeType || 'video/mp4' });
    const out = await transcodeChatVideoToMp4Core(file, tempId, meta, (progress) => {
      const msg: ProgressMsg = { type: 'PROGRESS', id, progress };
      self.postMessage(msg);
    });
    const outBuf = await out.arrayBuffer();
    const done: DoneMsg = { type: 'DONE', id, buffer: outBuf, fileName: out.name };
    self.postMessage(done, { transfer: [outBuf] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'video_transcode_failed';
    const msg: ErrorMsg = { type: 'ERROR', id, message };
    self.postMessage(msg);
  }
};

export {};
