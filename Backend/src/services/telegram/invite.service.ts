import { InviteService, InviteActionResult } from '../invite.service';

export async function acceptInviteFromTelegram(
  inviteId: string,
  userId: string
): Promise<InviteActionResult> {
  const result = await InviteService.acceptInvite(inviteId, userId, true, false);
  
  if (result.success) {
    return {
      success: true,
      message: 'telegram.inviteAccepted',
    };
  }
  
  return result;
}

export async function declineInviteFromTelegram(
  inviteId: string,
  userId: string
): Promise<InviteActionResult> {
  const result = await InviteService.declineInvite(inviteId, userId, false);
  
  if (result.success) {
    return {
      success: true,
      message: 'telegram.inviteDeclined',
    };
  }
  
  return result;
}

