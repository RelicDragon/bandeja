import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Download, Loader2 } from 'lucide-react';
import type { ChatMessage } from '@/api/chat';
import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import toast from 'react-hot-toast';
import { isAndroid, isCapacitor } from '@/utils/capacitor';

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10_485_760 ? 1 : 0)} MB`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

type Props = {
  message: ChatMessage;
  isOwnMessage: boolean;
  isChannel?: boolean;
  isSending?: boolean;
};

export const ChatDocumentBubble: React.FC<Props> = ({
  message,
  isOwnMessage,
  isChannel,
  isSending = false,
}) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const name = message.documentFileName?.trim() || t('chat.documentMessage', { defaultValue: 'File' });
  const sizeLabel = formatBytes(message.documentSize);
  const rawUrl = message.mediaUrls?.[0];
  const url = rawUrl ? resolveChatMediaUrl(rawUrl) : null;
  const isPendingLocal = !url || url.startsWith('blob:');
  const canOpen = !!url && !isPendingLocal && !isSending && !busy;
  const onLight = isChannel || !isOwnMessage;

  const handleOpen = async () => {
    if (!canOpen || !url) return;
    setBusy(true);
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();

      if (isCapacitor()) {
        const base64 = await blobToBase64(blob);
        const stem = name.replace(/[^\w.\- ()]/g, '_').slice(0, 100) || 'document';
        const safeName = `${Date.now()}-${stem}`;
        const directory = isAndroid() ? Directory.ExternalStorage : Directory.Data;
        await Filesystem.writeFile({
          path: safeName,
          data: base64,
          directory,
        });
        const { uri } = await Filesystem.getUri({ path: safeName, directory });
        await Share.share({ title: name, url: uri, dialogTitle: name });
        return;
      }

      // Same-origin blob URL so download works on cross-origin CDN (incl. Mobile Safari).
      triggerBlobDownload(blob, name);
    } catch (e) {
      console.error('[ChatDocumentBubble] open failed', e);
      toast.error(t('chat.documentOpenFailed', { defaultValue: 'Could not open file' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleOpen()}
      disabled={!canOpen}
      className={`flex w-full max-w-[280px] items-center gap-3 px-3 py-2.5 text-left transition-colors ${
        onLight
          ? 'hover:bg-black/5 dark:hover:bg-white/5'
          : 'hover:bg-white/10'
      } disabled:opacity-60 disabled:hover:bg-transparent`}
      data-testid="chat-document-bubble"
      aria-busy={isSending || busy || undefined}
    >
      <span
        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
          onLight
            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
            : 'bg-white/20 text-white'
        }`}
      >
        {isSending || busy ? <Loader2 size={22} className="animate-spin" /> : <FileText size={22} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-snug">{name}</span>
        {sizeLabel ? (
          <span
            className={`mt-0.5 block text-xs ${
              onLight ? 'text-gray-500 dark:text-gray-400' : 'text-blue-100'
            }`}
          >
            {sizeLabel}
          </span>
        ) : null}
      </span>
      <Download
        size={18}
        className={`flex-shrink-0 ${onLight ? 'text-gray-400 dark:text-gray-500' : 'text-blue-100'}`}
      />
    </button>
  );
};
