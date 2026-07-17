import { resolveChatMediaUrl } from '@/components/audio/audioWaveformUtils';
import { useStickerAsset } from '@/hooks/useStickerAsset';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { resolveStickerDisplayUrl } from '@/utils/resolveStickerDisplayUrl';
import type { ReplyToPreviewSource } from '@/utils/replyPreviewContent';
import { getReplyPreviewMediaThumbUrl } from '@/utils/replyPreviewContent';

type Props = {
  replyTo: ReplyToPreviewSource;
};

function StickerThumb({ stickerId }: { stickerId: string }) {
  const reduceMotion = usePrefersReducedMotion();
  const hydrated = useStickerAsset(stickerId);
  const url = resolveStickerDisplayUrl({
    staticUrl: hydrated.staticUrl,
    animatedUrl: hydrated.animatedUrl,
    reduceMotion,
  });
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      className="h-9 w-9 shrink-0 rounded object-contain bg-transparent"
      draggable={false}
    />
  );
}

export function ReplyPreviewThumb({ replyTo }: Props) {
  if (replyTo.messageType === 'STICKER' || replyTo.stickerId) {
    if (!replyTo.stickerId) return null;
    return <StickerThumb stickerId={replyTo.stickerId} />;
  }

  const mediaUrl = getReplyPreviewMediaThumbUrl(replyTo);
  if (!mediaUrl) return null;
  const src = resolveChatMediaUrl(mediaUrl);
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      className="h-9 w-9 shrink-0 rounded object-cover bg-gray-200 dark:bg-gray-600"
      draggable={false}
    />
  );
}
