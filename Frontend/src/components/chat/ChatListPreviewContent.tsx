import { TFunction } from 'i18next';
import { BarChart2, Images, Mic, Video } from 'lucide-react';
import { formatSystemMessageForDisplay } from '@/utils/systemMessages';
import { formatVoiceDurationMmSs } from '@/utils/messagePreview';

type Props = { preview: string; t: TFunction };

export function ChatListGenericMediaRow({ t }: { t: TFunction }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Images className="w-4 h-4 shrink-0" aria-hidden />
      {t('chat.messages.media', '[Media]')}
    </span>
  );
}

export function ChatListVideoRow({
  t,
  durationMs,
  durationLabel,
}: {
  t: TFunction;
  durationMs?: number | null;
  /** Pre-formatted `m:ss` from `[TYPE:VIDEO]` preview strings. */
  durationLabel?: string;
}) {
  const dur =
    durationLabel ??
    (durationMs != null && durationMs > 0 ? formatVoiceDurationMmSs(durationMs) : '');
  return (
    <span className="inline-flex items-center gap-1">
      <Video className="w-4 h-4 shrink-0" aria-hidden />
      <span>
        {t('chat.videoMessage', { defaultValue: 'Video' })}
        {dur ? ` (${dur})` : ''}
      </span>
    </span>
  );
}

export function ChatListPreviewContent({ preview, t }: Props) {
  if (!preview) return null;

  if (preview === '[TYPE:MEDIA]') {
    return <ChatListGenericMediaRow t={t} />;
  }

  if (preview.startsWith('[TYPE:VOICE]')) {
    const dur = preview.slice(12);
    return (
      <span className="inline-flex items-center gap-1">
        <Mic className="w-4 h-4 shrink-0" aria-hidden />
        <span>
          {t('chat.voiceMessage', { defaultValue: 'Voice message' })}
          {dur ? ` (${dur})` : ''}
        </span>
      </span>
    );
  }

  if (preview.startsWith('[TYPE:VIDEO]')) {
    const dur = preview.slice(12);
    return <ChatListVideoRow t={t} durationLabel={dur || undefined} />;
  }

  if (preview.startsWith('[TYPE:POLL]')) {
    const question = preview.substring(11);
    return (
      <span className="inline-flex items-center gap-1">
        <BarChart2 className="w-4 h-4 shrink-0" aria-hidden />
        <span>
          {t('chat.poll.poll')}: {question}
        </span>
      </span>
    );
  }

  if (preview.startsWith('[TYPE:SYSTEM]')) {
    const jsonStr = preview.substring(13);
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.type && parsed.variables) {
        return <>{formatSystemMessageForDisplay(jsonStr, t)}</>;
      }
      if (parsed.type && parsed.text) {
        return <>{parsed.text}</>;
      }
    } catch {
      return <>{preview}</>;
    }
    return <>{preview}</>;
  }

  return <>{preview}</>;
}
