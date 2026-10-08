import prisma from '../../config/database';
import { publicMemberTheme } from '../user/publicMemberTheme';
import type { MonthlyRecapPayload } from './recap.types';

/**
 * Overlays the owner's current public member theme on a stored recap payload
 * (docs/domains/premium-appearance.md, "Share cards"). The stored row stays
 * theme-free; this runs on read and before share images are rendered.
 */
export async function withOwnerShowcaseTheme(
  userId: string,
  payload: MonthlyRecapPayload,
): Promise<MonthlyRecapPayload> {
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPremium: true, showPremiumStatus: true, mainTheme: true },
  });
  return { ...payload, owner: { ...payload.owner, memberTheme: publicMemberTheme(owner) } };
}
