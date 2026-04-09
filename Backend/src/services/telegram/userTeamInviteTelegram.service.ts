import { UserTeamService } from '../userTeam.service';
import { ApiError } from '../../utils/ApiError';

export interface TeamInviteTelegramResult {
  success: boolean;
  message: string;
}

export async function acceptUserTeamInviteFromTelegram(teamId: string, userId: string): Promise<TeamInviteTelegramResult> {
  try {
    await UserTeamService.acceptInvite(teamId, userId);
    return { success: true, message: 'telegram.teamInviteAccepted' };
  } catch (e) {
    if (e instanceof ApiError) {
      return { success: false, message: e.message };
    }
    return { success: false, message: 'telegram.teamInviteActionError' };
  }
}

export async function declineUserTeamInviteFromTelegram(teamId: string, userId: string): Promise<TeamInviteTelegramResult> {
  try {
    await UserTeamService.declineInvite(teamId, userId);
    return { success: true, message: 'telegram.teamInviteDeclined' };
  } catch (e) {
    if (e instanceof ApiError) {
      return { success: false, message: e.message };
    }
    return { success: false, message: 'telegram.teamInviteActionError' };
  }
}
