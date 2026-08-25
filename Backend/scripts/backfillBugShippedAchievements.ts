import dotenv from 'dotenv';
dotenv.config();

import { BugStatus, ChatContextType } from '@prisma/client';
import prisma from '../src/config/database';
import { backfillBugShippedLadderForUser } from '../src/services/achievements/bugShippedGrant.service';

async function backfillWorkflowFlags() {
  const bugs = await prisma.bug.findMany({
    include: { groupChannel: { select: { id: true } } },
  });

  let flagsUpdated = 0;
  for (const bug of bugs) {
    const channelId = bug.groupChannel?.id;
    if (!channelId) continue;

    let inProgressReachedAt = bug.inProgressReachedAt;
    let testingStartedAt = bug.testingStartedAt;
    if (inProgressReachedAt && testingStartedAt) continue;

    const messages = await prisma.chatMessage.findMany({
      where: {
        chatContextType: ChatContextType.GROUP,
        contextId: channelId,
        content: { contains: 'BUG_STATUS_CHANGED' },
      },
      orderBy: { createdAt: 'asc' },
      select: { content: true, createdAt: true },
    });

    for (const msg of messages) {
      if (!inProgressReachedAt && msg.content.includes('"status":"in_progress"')) {
        inProgressReachedAt = msg.createdAt;
      }
      if (!testingStartedAt && msg.content.includes('"status":"test"')) {
        testingStartedAt = msg.createdAt;
      }
    }

    const patch: { inProgressReachedAt?: Date; testingStartedAt?: Date } = {};
    if (!bug.inProgressReachedAt && inProgressReachedAt) {
      patch.inProgressReachedAt = inProgressReachedAt;
    }
    if (!bug.testingStartedAt && testingStartedAt) {
      patch.testingStartedAt = testingStartedAt;
    }
    if (Object.keys(patch).length > 0) {
      await prisma.bug.update({ where: { id: bug.id }, data: patch });
      flagsUpdated++;
    }
  }

  console.log(`Workflow flags backfill: ${flagsUpdated} bug(s) updated.`);
}

async function grantEligible(apply: boolean) {
  const senderRows = await prisma.bug.findMany({
    where: {
      status: { in: [BugStatus.FINISHED, BugStatus.ARCHIVED] },
      bugType: { not: 'QUESTION' },
      OR: [{ inProgressReachedAt: { not: null } }, { testingStartedAt: { not: null } }],
    },
    select: { senderId: true },
    distinct: ['senderId'],
  });

  console.log(`Candidate senders: ${senderRows.length} (apply=${apply})`);
  if (!apply) return;

  let granted = 0;
  let usersTouched = 0;
  for (const { senderId } of senderRows) {
    const defs = await backfillBugShippedLadderForUser({ userId: senderId });
    if (defs.length === 0) continue;
    usersTouched += 1;
    granted += defs.length;
    console.log(`  ${senderId}: +${defs.map((d) => d.id).join(', ')}`);
  }
  console.log(`Granted ${granted} achievement(s) for ${usersTouched} user(s).`);
}

async function run() {
  const apply = process.argv.includes('--apply');
  await backfillWorkflowFlags();
  await grantEligible(apply);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
