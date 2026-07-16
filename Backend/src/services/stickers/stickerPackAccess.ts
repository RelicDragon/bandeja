export function isStickerPackVisibleToUser(
  pack: { isOfficial: boolean; ownerUserId: string | null },
  userId: string | undefined
): boolean {
  if (pack.isOfficial && !pack.ownerUserId) return true;
  if (userId && pack.ownerUserId === userId) return true;
  return false;
}

export function isPersonalStickerSendableBy(
  pack: { isOfficial: boolean; ownerUserId: string | null; isActive: boolean },
  senderUserId: string
): boolean {
  if (!pack.isActive) return false;
  if (pack.ownerUserId && pack.ownerUserId !== senderUserId) return false;
  if (!pack.isOfficial && pack.ownerUserId !== senderUserId) return false;
  return true;
}
