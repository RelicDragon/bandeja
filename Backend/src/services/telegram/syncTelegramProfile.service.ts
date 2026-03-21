import prisma from '../../config/database';
import { needsDisplayNamePersist, resolveDisplayNameData } from '../user/userDisplayName.service';

export type TelegramFrom = {
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export async function syncTelegramProfileFromUpdate(
  telegramId: string,
  from: TelegramFrom
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { id: true, telegramUsername: true, firstName: true, lastName: true, nameIsSet: true },
  });
  if (!user) return;

  const username = from.username ?? null;
  const firstName = from.first_name ?? null;
  const lastName = from.last_name ?? null;

  const mergedFirst =
    firstName != null && (!(user.firstName?.trim()) || user.nameIsSet === false)
      ? firstName
      : user.firstName;
  const mergedLast =
    lastName != null && (!(user.lastName?.trim()) || user.nameIsSet === false)
      ? lastName
      : user.lastName;

  const resolved = resolveDisplayNameData(
    mergedFirst?.trim() ? mergedFirst : undefined,
    mergedLast?.trim() ? mergedLast : undefined
  );

  const updateData: {
    telegramUsername?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    nameIsSet?: boolean;
  } = {};

  if (username !== user.telegramUsername) {
    updateData.telegramUsername = username;
  }

  if (needsDisplayNamePersist(user, resolved)) {
    updateData.firstName = resolved.firstName ?? null;
    updateData.lastName = resolved.lastName ?? null;
    updateData.nameIsSet = resolved.nameIsSet;
  }

  if (Object.keys(updateData).length === 0) return;

  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });
}
