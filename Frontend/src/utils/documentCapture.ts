import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { isCapacitor } from './capacitor';

export type DocumentPickResult = { file: File };

export const CHAT_DOCUMENT_ACCEPT =
  '.pdf,.txt,.doc,.docx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const CHAT_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const MAX_CHAT_DOCUMENT_BYTES = 32 * 1024 * 1024;

const CAPACITOR_PICK_POLL_MS = 100;
const CAPACITOR_PICK_MAX_ATTEMPTS = 150;

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function mimeFromChatDocumentName(
  name: string,
  fallback = 'application/octet-stream'
): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? fallback;
}

export function isValidChatDocument(file: File): boolean {
  if (!file || file.size <= 0 || file.size > MAX_CHAT_DOCUMENT_BYTES) return false;
  if (CHAT_DOCUMENT_MIME_TYPES.has(file.type)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext in EXT_MIME;
}

export function chatDocumentRejectReason(file: File): 'too_large' | 'invalid_type' | null {
  if (!file || file.size <= 0) return 'invalid_type';
  if (file.size > MAX_CHAT_DOCUMENT_BYTES) return 'too_large';
  if (isValidChatDocument(file)) return null;
  return 'invalid_type';
}

async function blobFromCapacitorPath(path: string, webPath?: string): Promise<Blob> {
  if (webPath) {
    const url = Capacitor.convertFileSrc(webPath);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to read document: ${res.statusText}`);
    return res.blob();
  }

  // content:// and other non-file schemes: convert + fetch (Filesystem.readFile needs real paths).
  if (path.includes('://') && !path.startsWith('file://')) {
    const url = Capacitor.convertFileSrc(path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to read document: ${res.statusText}`);
    return res.blob();
  }

  try {
    const clean = path.replace(/^file:\/\//, '');
    const data = await Filesystem.readFile({ path: clean });
    let base64 = data.data as string;
    if (base64.includes(',')) base64 = base64.split(',')[1]!;
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr]);
  } catch (fsErr) {
    // Fallback: convertFileSrc + fetch (matches photoCapture robustness).
    const url = Capacitor.convertFileSrc(path);
    const res = await fetch(url);
    if (!res.ok) throw fsErr instanceof Error ? fsErr : new Error('Failed to read document');
    return res.blob();
  }
}

function fileFromBlob(blob: Blob, name: string): File {
  const type =
    blob.type && CHAT_DOCUMENT_MIME_TYPES.has(blob.type)
      ? blob.type
      : mimeFromChatDocumentName(name);
  return new File([blob], name || 'document', { type });
}

/** System document picker — works on web and Capacitor (iOS/Android). */
export function pickDocument(): Promise<DocumentPickResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = CHAT_DOCUMENT_ACCEPT;
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
          if (raw.size <= 0) {
            finish(null);
            return;
          }
          finish(fileFromBlob(raw, raw.name || 'document'));
          return;
        }
        const anyFile = raw as File & { path?: string; webPath?: string };
        if (anyFile.path || anyFile.webPath) {
          const blob = await blobFromCapacitorPath(anyFile.path ?? anyFile.webPath!, anyFile.webPath);
          if (blob.size <= 0) {
            finish(null);
            return;
          }
          finish(fileFromBlob(blob, raw.name || 'document'));
          return;
        }
        finish(null);
      } catch (e) {
        console.error('[pickDocument] failed to read file', e);
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
