import prisma from '../../config/database';

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
    select: { id: true, telegramUsername: true, firstName: true, lastName: true },
  });
  if (!user) return;

  const updateData: { telegramUsername?: string | null; firstName?: string | null; lastName?: string | null } = {};
  const username = from.username ?? null;
  const firstName = from.first_name ?? null;
  const lastName = from.last_name ?? null;
  if (username !== user.telegramUsername) updateData.telegramUsername = username;
  if (firstName !== user.firstName) updateData.firstName = firstName;
  if (lastName !== user.lastName) updateData.lastName = lastName;
  if (Object.keys(updateData).length === 0) return;

  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });
}
