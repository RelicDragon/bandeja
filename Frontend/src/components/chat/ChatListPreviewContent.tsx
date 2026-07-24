import { TFunction } from 'i18next';
import { BarChart2, FileText, Images, Mic, Video } from 'lucide-react';
import { formatSystemMessageForDisplay } from '@/utils/systemMessages';
import { formatVoiceDurationMmSs } from '@/utils/messagePreview';
import { ChatListPreviewText } from './ChatListPreviewText';

type Props = { preview: string; t: TFunction; entityType?: string | null };

export function ChatListGenericMediaRow({ t }: { t: TFunction }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Images className="w-4 h-4 shrink-0" aria-hidden />
      {t('chat.messages.media', '[Media]')}
    </span>
  );
}

export function ChatListGifRow({ t }: { t: TFunction }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Images className="w-4 h-4 shrink-0" aria-hidden />
      {t('chat.giphy.attach', { defaultValue: 'GIF' })}
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

export function ChatListStickerRow({
  t,
  emoji,
}: {
  t: TFunction;
  emoji?: string | null;
}) {
  const e = emoji?.trim();
  return (
    <span className="inline-flex items-center gap-1">
      {e ? <span aria-hidden>{e}</span> : null}
      <span>{t('chat.stickerMessage', { defaultValue: 'Sticker' })}</span>
    </span>
  );
}

export function ChatListDocumentRow({
  t,
  fileName,
}: {
  t: TFunction;
  fileName?: string | null;
}) {
  const name = fileName?.trim();
  const label = t('chat.documentMessage', { defaultValue: 'File' });
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <FileText className="w-4 h-4 shrink-0" aria-hidden />
      <span className="truncate">{name ? `${label}: ${name}` : label}</span>
    </span>
  );
}

export function ChatListPreviewContent({ preview, t, entityType }: Props) {
  if (!preview) return null;

  if (preview === '[TYPE:MEDIA]') {
    return <ChatListGenericMediaRow t={t} />;
  }

  if (preview === '[TYPE:GIF]') {
    return <ChatListGifRow t={t} />;
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

  if (preview.startsWith('[TYPE:DOCUMENT]')) {
    const name = preview.slice('[TYPE:DOCUMENT]'.length).trim();
    const label = t('chat.documentMessage', { defaultValue: 'File' });
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        <FileText className="w-4 h-4 shrink-0" aria-hidden />
        <span className="truncate">{name ? `${label}: ${name}` : label}</span>
      </span>
    );
  }

  if (preview.startsWith('[TYPE:STICKER]')) {
    const emoji = preview.slice('[TYPE:STICKER]'.length).trim();
    return <ChatListStickerRow t={t} emoji={emoji || null} />;
  }

  if (preview.startsWith('[TYPE:STORY_REPLY]')) {
    const text = preview.slice('[TYPE:STORY_REPLY]'.length);
    const label = t('chat.storyReply.toYourStory', { defaultValue: 'Replied to your story' });
    return (
      <span>
        {text && text !== '…' ? `${label}: ${text}` : label}
      </span>
    );
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
        return <>{formatSystemMessageForDisplay(jsonStr, t, entityType)}</>;
      }
      if (parsed.type && parsed.text) {
        return <>{parsed.text}</>;
      }
    } catch {
      return <>{preview}</>;
    }
    return <>{preview}</>;
  }

  return <ChatListPreviewText text={preview} />;
}
