import { InviteService, InviteActionResult } from '../invite.service';

export async function acceptInviteFromTelegram(
  inviteId: string,
  userId: string
): Promise<InviteActionResult> {
  const result = await InviteService.acceptInvite(inviteId, userId, true, false);
  
  if (result.success) {
    return {
      success: true,
      // A full game queues the invitee instead of seating them.
      message: result.message === 'games.addedToJoinQueue' ? 'telegram.inviteQueued' : 'telegram.inviteAccepted',
    };
  }
  
  return result;
}

export async function declineInviteFromTelegram(
  inviteId: string,
  userId: string,
  declineMessage?: string
): Promise<InviteActionResult> {
  const result = await InviteService.declineInvite(
    inviteId,
    userId,
    false,
    declineMessage
  );

  if (result.success) {
    return {
      success: true,
      message: 'telegram.inviteDeclined',
    };
  }

  return result;
}

