import type { BasicUser } from '@/types';

export interface ArchivedGameChatSubtitleParams {
  archivedFallbackLabel: string;
  cancelledLabel: string;
  cancelledByLabel: string;
  formattedCancelledAt?: string | null;
  cancelledByUser?: BasicUser | null;
}

export function getArchivedGameChatCancellerName(cancelledByUser?: BasicUser | null): string | null {
  const name = [cancelledByUser?.firstName, cancelledByUser?.lastName]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .trim();
  return name || null;
}

export function buildArchivedGameChatSubtitle({
  archivedFallbackLabel,
  cancelledLabel,
  cancelledByLabel,
  formattedCancelledAt,
  cancelledByUser,
}: ArchivedGameChatSubtitleParams): string {
  const cancelledByName = getArchivedGameChatCancellerName(cancelledByUser);

  if (formattedCancelledAt && cancelledByName) {
    return `${cancelledLabel} · ${formattedCancelledAt} · ${cancelledByLabel} ${cancelledByName}`;
  }

  if (formattedCancelledAt) {
    return `${cancelledLabel} · ${formattedCancelledAt}`;
  }

  return archivedFallbackLabel;
}
