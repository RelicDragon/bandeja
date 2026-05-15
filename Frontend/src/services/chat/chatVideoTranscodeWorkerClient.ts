import {
  transcodeChatVideoToMp4Core,
  type ChatVideoTranscodeMeta,
  type TranscodeProgressFn,
} from './chatVideoTranscodeCore';

type Pending = {
  resolve: (file: File) => void;
  reject: (err: Error) => void;
  onProgress?: TranscodeProgressFn;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function rejectAllPending(reason: unknown): void {
  const err = reason instanceof Error ? reason : new Error('video_transcode_failed');
  for (const [, p] of pending) {
    p.reject(err);
  }
  pending.clear();
}

function createWorker(): Worker {
  return new Worker(new URL('./chatVideoTranscode.worker.ts', import.meta.url), { type: 'module' });
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    const w = createWorker();
    w.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as {
        type?: string;
        id?: number;
        progress?: number;
        buffer?: ArrayBuffer;
        fileName?: string;
        message?: string;
      };
      if (msg.id == null) return;
      const rec = pending.get(msg.id);
      if (!rec) return;

      if (msg.type === 'PROGRESS' && typeof msg.progress === 'number') {
        rec.onProgress?.(msg.progress);
        return;
      }

      if (msg.type === 'DONE' && msg.buffer) {
        pending.delete(msg.id);
        const name = msg.fileName || 'chat-video.mp4';
        rec.resolve(new File([msg.buffer], name, { type: 'video/mp4' }));
        return;
      }

      if (msg.type === 'ERROR') {
        pending.delete(msg.id);
        rec.reject(new Error(msg.message || 'video_transcode_failed'));
      }
    };
    w.onerror = (e) => {
      rejectAllPending(e.error ?? e.message);
      worker = null;
    };
    worker = w;
    return w;
  } catch {
    return null;
  }
}

export async function transcodeChatVideoToMp4InWorker(
  file: File,
  tempId: string,
  meta: ChatVideoTranscodeMeta,
  onProgress?: TranscodeProgressFn
): Promise<File> {
  const w = getWorker();
  if (!w) {
    return transcodeChatVideoToMp4Core(file, tempId, meta, onProgress);
  }

  const buffer = await file.arrayBuffer();
  const id = nextId++;

  return new Promise<File>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    try {
      w.postMessage(
        {
          type: 'TRANSCODE',
          id,
          buffer,
          fileName: file.name,
          mimeType: file.type,
          tempId,
          meta,
        },
        [buffer]
      );
    } catch (e) {
      pending.delete(id);
      void transcodeChatVideoToMp4Core(file, tempId, meta, onProgress).then(resolve).catch(reject);
    }
  });
}
