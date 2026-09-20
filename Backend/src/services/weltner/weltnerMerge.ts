import type { Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

/** Called inside the account-merge transaction, before either user is changed. */
export async function mergeWeltnerAccounts(
  tx: Prisma.TransactionClient,
  survivorId: string,
  sourceId: string,
): Promise<void> {
  // The FK check for a new receipt/contact takes a user KEY SHARE lock. Locking
  // both users prevents an in-flight request from inserting source-owned evidence
  // between the transfer below and the source account's cascading deletion.
  await tx.$queryRaw`
    SELECT "id" FROM "User"
    WHERE "id" IN (${survivorId}, ${sourceId})
    ORDER BY "id" FOR UPDATE
  `;
  const receipts = await tx.weltnerBooking.findMany({
    where: { userId: { in: [survivorId, sourceId] } },
    select: {
      userId: true,
      clubId: true,
      courtId: true,
      date: true,
      startTime: true,
      durationMinutes: true,
    },
  });
  const slotKey = (row: (typeof receipts)[number]) =>
    JSON.stringify([row.clubId, row.courtId, row.date, row.startTime, row.durationMinutes]);
  const survivorSlots = new Set(receipts.filter((r) => r.userId === survivorId).map(slotKey));
  if (receipts.some((r) => r.userId === sourceId && survivorSlots.has(slotKey(r)))) {
    // Even REJECTED/UNKNOWN collisions retain evidence. Deleting one receipt or
    // selecting a winning state could orphan game links or permit another POST.
    throw new ApiError(409, 'Cannot merge accounts with conflicting Weltner booking receipts');
  }

  await tx.weltnerBooking.updateMany({
    where: { userId: sourceId },
    data: { userId: survivorId },
  });

  const contacts = await tx.userClubWeltnerAuth.findMany({ where: { userId: sourceId } });
  for (const contact of contacts) {
    // Keep the surviving player's explicit contact when both accounts connected
    // the same club. No booking receipt stores or depends on this contact's id.
    await tx.userClubWeltnerAuth.upsert({
      where: { userId_clubId: { userId: survivorId, clubId: contact.clubId } },
      create: { userId: survivorId, clubId: contact.clubId, phoneNumber: contact.phoneNumber },
      update: {},
    });
  }
  await tx.userClubWeltnerAuth.deleteMany({ where: { userId: sourceId } });
}
