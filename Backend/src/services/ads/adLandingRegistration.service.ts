import prisma from '../../config/database';
import { hashAdClickToken, verifyAdClickToken } from './ad.token.util';
import type { AdLandingRegistrationKey } from './adLandingRegistration.constants';
import type { AdLandingRegistrationCreateInput } from './adLandingRegistration.schemas';

export type SavedAdLandingRegistration = {
  id: string;
  userId: string | null;
  created: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Register either an authenticated ad recipient or a guest. Repeated token submits
 * update the same user row, while guest submissions preserve the provided contact.
 */
export async function saveAdLandingRegistration(
  landingKey: AdLandingRegistrationKey,
  input: AdLandingRegistrationCreateInput
): Promise<SavedAdLandingRegistration | null> {
  if (!('adToken' in input)) {
    const guestRow = await prisma.adLandingRegistration.create({
      data: {
        landingKey,
        guestName: input.guestName,
        guestContact: input.guestContact,
        note: input.note,
        locale: input.locale?.trim() || null,
      },
    });

    return {
      id: guestRow.id,
      userId: null,
      created: true,
      createdAt: guestRow.createdAt,
      updatedAt: guestRow.updatedAt,
    };
  }

  const rawToken = input.adToken.trim();
  const claims = await verifyAdClickToken(rawToken);
  if (!claims) return null;

  const where = {
    landingKey_userId: {
      landingKey,
      userId: claims.userId,
    },
  } as const;
  const existing = await prisma.adLandingRegistration.findUnique({
    where,
    select: { id: true },
  });

  const row = await prisma.adLandingRegistration.upsert({
    where,
    create: {
      landingKey,
      tokenHash: hashAdClickToken(rawToken),
      userId: claims.userId,
      campaignId: claims.campaignId,
      note: input.note,
      locale: input.locale?.trim() || null,
    },
    update: {
      tokenHash: hashAdClickToken(rawToken),
      campaignId: claims.campaignId,
      note: input.note,
      locale: input.locale?.trim() || null,
    },
  });

  return {
    id: row.id,
    userId: row.userId,
    created: !existing,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
