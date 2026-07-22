import prisma from '../../config/database';

/**
 * Who may start LLM generation/translation for an outcome explanation.
 * Read of existing ready text is allowed more loosely by callers.
 */
export async function canRequestRatingExplanationLlm(
  gameId: string,
  outcomeUserId: string,
  requesterId: string | undefined,
): Promise<boolean> {
  if (!requesterId) return false;
  if (requesterId === outcomeUserId) return true;

  const viewer = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { isAdmin: true },
  });
  if (viewer?.isAdmin) return true;

  const participant = await prisma.gameParticipant.findFirst({
    where: { gameId, userId: requesterId },
    select: { id: true },
  });
  return Boolean(participant);
}
