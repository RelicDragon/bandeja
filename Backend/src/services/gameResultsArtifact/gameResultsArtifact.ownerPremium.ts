import { ParticipantRole } from '@prisma/client';
import prisma from '../../config/database';
import { getMaxArtifactPhotoGenerations } from './gameResultsArtifact.photoLimit';

type GameWithOwnerParticipant = {
  participants?: Array<{ role?: string; user?: { isPremium?: boolean } | null }> | null;
};

export function getOwnerIsPremiumFromGame(game: GameWithOwnerParticipant): boolean {
  const owner = game.participants?.find((p) => p.role === ParticipantRole.OWNER);
  return owner?.user?.isPremium === true;
}

export async function resolvePhotoGenerationsMaxForGame(gameId: string): Promise<number> {
  const owner = await prisma.gameParticipant.findFirst({
    where: { gameId, role: ParticipantRole.OWNER },
    select: { user: { select: { isPremium: true } } },
  });
  return getMaxArtifactPhotoGenerations(owner?.user?.isPremium === true);
}
