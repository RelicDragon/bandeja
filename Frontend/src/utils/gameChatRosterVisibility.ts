import {
  isInviteOnlyChatViewerStatus,
  isRosterLifecycleSystemPreview,
  shouldHideRosterLifecycleSystemMessage,
} from '@shared/systemMessages/rosterLifecycle';

export function shouldHideRosterLifecycleForGameViewer(
  participantStatus: string | null | undefined,
  message: { senderId?: string | null; content?: string | null }
): boolean {
  return shouldHideRosterLifecycleSystemMessage({
    participantStatus,
    senderId: message.senderId,
    content: message.content,
  });
}

export function shouldHideRosterPreviewForGameViewer(
  participantStatus: string | null | undefined,
  preview: string | null | undefined
): boolean {
  return isInviteOnlyChatViewerStatus(participantStatus) && isRosterLifecycleSystemPreview(preview);
}

export function viewerParticipantStatus<T extends { userId: string; status: string }>(
  participants: T[] | undefined,
  userId: string | undefined
): string | undefined {
  if (!userId) return undefined;
  return participants?.find((participant) => participant.userId === userId)?.status;
}
