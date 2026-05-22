import { InviteService } from '../services/invite.service';
import { ParticipantMessageHelper } from '../services/game/participantMessageHelper';
import { GameService } from '../services/game/game.service';
import { ensureUserSportProfileForGame } from '../services/user/userSportProfile.service';

export async function performPostJoinOperations(
  gameId: string,
  userId: string
): Promise<void> {
  await ensureUserSportProfileForGame(userId, gameId);

  await Promise.all([
    InviteService.deleteInvitesForUserInGame(gameId, userId),
    ParticipantMessageHelper.sendJoinMessage(gameId, userId),
  ]);

  await GameService.updateGameReadiness(gameId);
  await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
}
