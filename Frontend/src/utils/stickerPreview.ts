/** List / reply / pinned label for a STICKER message. */
export function formatStickerPreviewText(
  emoji: string | null | undefined,
  stickerLabel = 'Sticker'
): string {
  const e = typeof emoji === 'string' ? emoji.trim() : '';
  return e ? `${e} ${stickerLabel}` : stickerLabel;
}
