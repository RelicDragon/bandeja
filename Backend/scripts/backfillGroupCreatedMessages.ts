import dotenv from 'dotenv';
dotenv.config();

import { ChatContextType, ChatType, ParticipantRole } from '@prisma/client';
import prisma from '../src/config/database';
import { SystemMessageService } from '../src/services/chat/systemMessage.service';
import { SystemMessageType, getUserDisplayName } from '../src/utils/systemMessages';

/**
 * User-created groups/channels that have never had a message get a GROUP_CREATED system
 * message dated to the group's createdAt. Group updatedAt is restored so list order is unchanged.
 * Dry run by default; pass --apply to write.
 */
async function backfill() {
  const apply = process.argv.includes('--apply');

  const groups = await prisma.groupChannel.findMany({
    where: {
      bugId: null,
      marketItemId: null,
      leagueGroupId: null,
      isCityGroup: false,
      gameSeries: { none: {} },
    },
    select: { id: true, name: true, isChannel: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  });

  let created = 0;
  let errors = 0;
  for (const g of groups) {
    const hasMessage = await prisma.chatMessage.findFirst({
      where: { chatContextType: ChatContextType.GROUP, contextId: g.id },
      select: { id: true },
    });
    if (hasMessage) continue;

    const owner = await prisma.groupChannelParticipant.findFirst({
      where: { groupChannelId: g.id, role: ParticipantRole.OWNER },
      select: { user: { select: { firstName: true, lastName: true } } },
    });
    const userName = getUserDisplayName(owner?.user.firstName, owner?.user.lastName);
    console.log(`${apply ? 'Backfill' : 'Would backfill'} ${g.id} "${g.name}"${g.isChannel ? ' (channel)' : ''} @ ${g.createdAt.toISOString()} by ${userName}`);
    if (!apply) {
      created++;
      continue;
    }
    try {
      await SystemMessageService.createSystemMessage(
        g.id,
        { type: SystemMessageType.GROUP_CREATED, variables: { userName } },
        ChatType.PUBLIC,
        ChatContextType.GROUP,
        { createdAt: g.createdAt }
      );
      await prisma.$executeRaw`UPDATE "GroupChannel" SET "updatedAt" = ${g.updatedAt} WHERE id = ${g.id}`;
      created++;
    } catch (e) {
      errors++;
      console.error(`Error for ${g.id}:`, e);
    }
  }

  console.log(`Done${apply ? '' : ' (dry run)'}. ${apply ? 'Created' : 'Would create'}: ${created}, errors: ${errors}.`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
