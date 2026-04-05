import { Prisma } from '@prisma/client';
import { compareChatReadCursorRows } from '../chat/chatReadCursor.service';

export type MergeTx = Prisma.TransactionClient;

export async function mergeDuplicateUserInteractions(tx: MergeTx) {
  const dups = await tx.$queryRaw<Array<{ fromUserId: string; toUserId: string }>>`
    SELECT "fromUserId", "toUserId"
    FROM "UserInteraction"
    GROUP BY "fromUserId", "toUserId"
    HAVING COUNT(*) > 1
  `;
  for (const g of dups) {
    const rows = await tx.userInteraction.findMany({
      where: { fromUserId: g.fromUserId, toUserId: g.toUserId },
      orderBy: { id: 'asc' },
    });
    if (rows.length < 2) continue;
    const keep = rows[0];
    let totalCount = 0;
    let maxLast = keep.lastInteractionAt;
    for (const r of rows) {
      totalCount += r.count;
      if (r.lastInteractionAt > maxLast) maxLast = r.lastInteractionAt;
    }
    await tx.userInteraction.update({
      where: { id: keep.id },
      data: { count: totalCount, lastInteractionAt: maxLast },
    });
    await tx.userInteraction.deleteMany({
      where: {
        fromUserId: g.fromUserId,
        toUserId: g.toUserId,
        id: { not: keep.id },
      },
    });
  }
}

async function remapUserInteractionsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const fromRows = await tx.userInteraction.findMany({
    where: { fromUserId: sourceId },
  });
  for (const row of fromRows) {
    const twin = await tx.userInteraction.findFirst({
      where: { fromUserId: survivorId, toUserId: row.toUserId },
    });
    if (twin) {
      const last =
        row.lastInteractionAt > twin.lastInteractionAt
          ? row.lastInteractionAt
          : twin.lastInteractionAt;
      await tx.userInteraction.update({
        where: { id: twin.id },
        data: { count: twin.count + row.count, lastInteractionAt: last },
      });
      await tx.userInteraction.delete({ where: { id: row.id } });
    } else {
      await tx.userInteraction.update({
        where: { id: row.id },
        data: { fromUserId: survivorId },
      });
    }
  }

  const toRows = await tx.userInteraction.findMany({
    where: { toUserId: sourceId },
  });
  for (const row of toRows) {
    const twin = await tx.userInteraction.findFirst({
      where: { fromUserId: row.fromUserId, toUserId: survivorId },
    });
    if (twin) {
      const last =
        row.lastInteractionAt > twin.lastInteractionAt
          ? row.lastInteractionAt
          : twin.lastInteractionAt;
      await tx.userInteraction.update({
        where: { id: twin.id },
        data: { count: twin.count + row.count, lastInteractionAt: last },
      });
      await tx.userInteraction.delete({ where: { id: row.id } });
    } else {
      await tx.userInteraction.update({
        where: { id: row.id },
        data: { toUserId: survivorId },
      });
    }
  }
}

async function remapUserFavoriteUserForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const asFavorite = await tx.userFavoriteUser.findMany({
    where: { favoriteUserId: sourceId },
  });
  for (const row of asFavorite) {
    const twin = await tx.userFavoriteUser.findFirst({
      where: { userId: row.userId, favoriteUserId: survivorId },
    });
    if (twin) {
      await tx.userFavoriteUser.delete({ where: { id: row.id } });
    } else {
      await tx.userFavoriteUser.update({
        where: { id: row.id },
        data: { favoriteUserId: survivorId },
      });
    }
  }

  const asUser = await tx.userFavoriteUser.findMany({
    where: { userId: sourceId },
  });
  for (const row of asUser) {
    const twin = await tx.userFavoriteUser.findFirst({
      where: { userId: survivorId, favoriteUserId: row.favoriteUserId },
    });
    if (twin) {
      await tx.userFavoriteUser.delete({ where: { id: row.id } });
    } else {
      await tx.userFavoriteUser.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapBlockedUserForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const blockedSide = await tx.blockedUser.findMany({
    where: { blockedUserId: sourceId },
  });
  for (const row of blockedSide) {
    const twin = await tx.blockedUser.findFirst({
      where: { userId: row.userId, blockedUserId: survivorId },
    });
    if (twin) {
      await tx.blockedUser.delete({ where: { id: row.id } });
    } else {
      await tx.blockedUser.update({
        where: { id: row.id },
        data: { blockedUserId: survivorId },
      });
    }
  }

  const blockerSide = await tx.blockedUser.findMany({
    where: { userId: sourceId },
  });
  for (const row of blockerSide) {
    const twin = await tx.blockedUser.findFirst({
      where: { userId: survivorId, blockedUserId: row.blockedUserId },
    });
    if (twin) {
      await tx.blockedUser.delete({ where: { id: row.id } });
    } else {
      await tx.blockedUser.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapGameOutcomesForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.gameOutcome.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.gameOutcome.findFirst({
      where: { userId: survivorId, gameId: row.gameId },
    });
    if (twin) {
      await tx.gameOutcome.delete({ where: { id: row.id } });
    } else {
      await tx.gameOutcome.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapRoundOutcomesForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.roundOutcome.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.roundOutcome.findFirst({
      where: { userId: survivorId, roundId: row.roundId },
    });
    if (twin) {
      await tx.roundOutcome.delete({ where: { id: row.id } });
    } else {
      await tx.roundOutcome.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapTeamPlayersForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.teamPlayer.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.teamPlayer.findFirst({
      where: { userId: survivorId, teamId: row.teamId },
    });
    if (twin) {
      await tx.teamPlayer.delete({ where: { id: row.id } });
    } else {
      await tx.teamPlayer.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapGameTeamPlayersForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.gameTeamPlayer.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.gameTeamPlayer.findFirst({
      where: { userId: survivorId, gameTeamId: row.gameTeamId },
    });
    if (twin) {
      await tx.gameTeamPlayer.delete({ where: { id: row.id } });
    } else {
      await tx.gameTeamPlayer.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapPollVotesForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.pollVote.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.pollVote.findFirst({
      where: { userId: survivorId, optionId: row.optionId },
    });
    if (twin) {
      await tx.pollVote.delete({ where: { id: row.id } });
    } else {
      await tx.pollVote.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapMessageReactionsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.messageReaction.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.messageReaction.findFirst({
      where: { userId: survivorId, messageId: row.messageId },
    });
    if (twin) {
      await tx.messageReaction.delete({ where: { id: row.id } });
    } else {
      await tx.messageReaction.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapMessageReadReceiptsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.messageReadReceipt.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.messageReadReceipt.findFirst({
      where: { userId: survivorId, messageId: row.messageId },
    });
    if (twin) {
      const readAt =
        row.readAt > twin.readAt ? row.readAt : twin.readAt;
      await tx.messageReadReceipt.update({
        where: { id: twin.id },
        data: { readAt },
      });
      await tx.messageReadReceipt.delete({ where: { id: row.id } });
    } else {
      await tx.messageReadReceipt.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapGroupChannelParticipantsForMerge(
  tx: MergeTx,
  survivorId: string,
  sourceId: string,
) {
  const rows = await tx.groupChannelParticipant.findMany({
    where: { userId: sourceId },
  });
  for (const row of rows) {
    const twin = await tx.groupChannelParticipant.findFirst({
      where: { userId: survivorId, groupChannelId: row.groupChannelId },
    });
    if (twin) {
      await tx.groupChannelParticipant.delete({ where: { id: row.id } });
    } else {
      await tx.groupChannelParticipant.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapBetParticipantsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.betParticipant.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.betParticipant.findFirst({
      where: { userId: survivorId, betId: row.betId },
    });
    if (twin) {
      await tx.betParticipant.delete({ where: { id: row.id } });
    } else {
      await tx.betParticipant.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapUserGameNotesForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.userGameNote.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.userGameNote.findFirst({
      where: { userId: survivorId, gameId: row.gameId },
    });
    if (twin) {
      const merged = [twin.content, row.content].filter(Boolean).join('\n---\n');
      await tx.userGameNote.update({
        where: { id: twin.id },
        data: { content: merged },
      });
      await tx.userGameNote.delete({ where: { id: row.id } });
    } else {
      await tx.userGameNote.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapPushTokensForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.pushToken.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.pushToken.findFirst({
      where: { userId: survivorId, token: row.token },
    });
    if (twin) {
      await tx.pushToken.delete({ where: { id: row.id } });
    } else {
      await tx.pushToken.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapNotificationPreferencesForMerge(
  tx: MergeTx,
  survivorId: string,
  sourceId: string,
) {
  const rows = await tx.notificationPreference.findMany({
    where: { userId: sourceId },
  });
  for (const row of rows) {
    const twin = await tx.notificationPreference.findFirst({
      where: { userId: survivorId, channelType: row.channelType },
    });
    if (twin) {
      await tx.notificationPreference.delete({ where: { id: row.id } });
    } else {
      await tx.notificationPreference.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapMessageReportsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.messageReport.findMany({ where: { reporterId: sourceId } });
  for (const row of rows) {
    const twin = await tx.messageReport.findFirst({
      where: { reporterId: survivorId, messageId: row.messageId },
    });
    if (twin) {
      await tx.messageReport.delete({ where: { id: row.id } });
    } else {
      await tx.messageReport.update({
        where: { id: row.id },
        data: { reporterId: survivorId },
      });
    }
  }
}

async function remapUserFavoriteClubsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.userFavoriteClub.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.userFavoriteClub.findFirst({
      where: { userId: survivorId, clubId: row.clubId },
    });
    if (twin) {
      await tx.userFavoriteClub.delete({ where: { id: row.id } });
    } else {
      await tx.userFavoriteClub.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapBugParticipantsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.bugParticipant.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.bugParticipant.findFirst({
      where: { userId: survivorId, bugId: row.bugId },
    });
    if (twin) {
      await tx.bugParticipant.delete({ where: { id: row.id } });
    } else {
      await tx.bugParticipant.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapPinnedUserChatsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.pinnedUserChat.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.pinnedUserChat.findFirst({
      where: { userId: survivorId, userChatId: row.userChatId },
    });
    if (twin) {
      await tx.pinnedUserChat.delete({ where: { id: row.id } });
    } else {
      await tx.pinnedUserChat.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapPinnedGroupChannelsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.pinnedGroupChannel.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.pinnedGroupChannel.findFirst({
      where: { userId: survivorId, groupChannelId: row.groupChannelId },
    });
    if (twin) {
      await tx.pinnedGroupChannel.delete({ where: { id: row.id } });
    } else {
      await tx.pinnedGroupChannel.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapLeagueTeamPlayersForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.leagueTeamPlayer.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.leagueTeamPlayer.findFirst({
      where: { userId: survivorId, leagueTeamId: row.leagueTeamId },
    });
    if (twin) {
      await tx.leagueTeamPlayer.delete({ where: { id: row.id } });
    } else {
      await tx.leagueTeamPlayer.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapChatMutesForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.chatMute.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.chatMute.findFirst({
      where: {
        userId: survivorId,
        chatContextType: row.chatContextType,
        contextId: row.contextId,
      },
    });
    if (twin) {
      await tx.chatMute.delete({ where: { id: row.id } });
    } else {
      await tx.chatMute.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapChatTranslationPreferencesForMerge(
  tx: MergeTx,
  survivorId: string,
  sourceId: string,
) {
  const rows = await tx.chatTranslationPreference.findMany({
    where: { userId: sourceId },
  });
  for (const row of rows) {
    const twin = await tx.chatTranslationPreference.findFirst({
      where: {
        userId: survivorId,
        chatContextType: row.chatContextType,
        contextId: row.contextId,
      },
    });
    if (twin) {
      await tx.chatTranslationPreference.delete({ where: { id: row.id } });
    } else {
      await tx.chatTranslationPreference.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapChatReadCursorsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.chatReadCursor.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.chatReadCursor.findFirst({
      where: {
        userId: survivorId,
        chatContextType: row.chatContextType,
        contextId: row.contextId,
        chatType: row.chatType,
      },
    });
    if (twin) {
      if (compareChatReadCursorRows(twin, row) >= 0) {
        await tx.chatReadCursor.delete({ where: { id: row.id } });
      } else {
        await tx.chatReadCursor.update({
          where: { id: twin.id },
          data: {
            readMaxServerSyncSeq: row.readMaxServerSyncSeq,
            readMaxCreatedAt: row.readMaxCreatedAt,
            readMaxMessageId: row.readMaxMessageId,
          },
        });
        await tx.chatReadCursor.delete({ where: { id: row.id } });
      }
    } else {
      await tx.chatReadCursor.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapChatDraftsForMerge(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.chatDraft.findMany({ where: { userId: sourceId } });
  for (const row of rows) {
    const twin = await tx.chatDraft.findFirst({
      where: {
        userId: survivorId,
        chatContextType: row.chatContextType,
        contextId: row.contextId,
        chatType: row.chatType,
      },
    });
    if (twin) {
      const merged =
        [twin.content, row.content].filter((c) => c != null && String(c).trim() !== '').join('\n') ||
        null;
      const mentionIds = Array.from(
        new Set([...(twin.mentionIds ?? []), ...(row.mentionIds ?? [])]),
      );
      await tx.chatDraft.update({
        where: { id: twin.id },
        data: { content: merged, mentionIds },
      });
      await tx.chatDraft.delete({ where: { id: row.id } });
    } else {
      await tx.chatDraft.update({
        where: { id: row.id },
        data: { userId: survivorId },
      });
    }
  }
}

async function remapTrainerReviewsReviewer(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.trainerReview.findMany({ where: { reviewerId: sourceId } });
  for (const row of rows) {
    const twin = await tx.trainerReview.findFirst({
      where: {
        reviewerId: survivorId,
        trainerId: row.trainerId,
        gameId: row.gameId,
      },
    });
    if (twin) {
      await tx.trainerReview.delete({ where: { id: row.id } });
    } else {
      await tx.trainerReview.update({
        where: { id: row.id },
        data: { reviewerId: survivorId },
      });
    }
  }
}

async function remapTrainerReviewsTrainer(tx: MergeTx, survivorId: string, sourceId: string) {
  const rows = await tx.trainerReview.findMany({ where: { trainerId: sourceId } });
  for (const row of rows) {
    const twin = await tx.trainerReview.findFirst({
      where: {
        trainerId: survivorId,
        reviewerId: row.reviewerId,
        gameId: row.gameId,
      },
    });
    if (twin) {
      await tx.trainerReview.delete({ where: { id: row.id } });
    } else {
      await tx.trainerReview.update({
        where: { id: row.id },
        data: { trainerId: survivorId },
      });
    }
  }
}

export async function remapAllUserScopedCompositeRows(
  tx: MergeTx,
  survivorId: string,
  sourceId: string,
) {
  await remapGameOutcomesForMerge(tx, survivorId, sourceId);
  await remapRoundOutcomesForMerge(tx, survivorId, sourceId);
  await remapTeamPlayersForMerge(tx, survivorId, sourceId);
  await remapGameTeamPlayersForMerge(tx, survivorId, sourceId);
  await remapPollVotesForMerge(tx, survivorId, sourceId);
  await remapMessageReactionsForMerge(tx, survivorId, sourceId);
  await remapMessageReadReceiptsForMerge(tx, survivorId, sourceId);
  await remapGroupChannelParticipantsForMerge(tx, survivorId, sourceId);
  await remapBetParticipantsForMerge(tx, survivorId, sourceId);
  await remapUserGameNotesForMerge(tx, survivorId, sourceId);
  await remapPushTokensForMerge(tx, survivorId, sourceId);
  await remapNotificationPreferencesForMerge(tx, survivorId, sourceId);
  await remapMessageReportsForMerge(tx, survivorId, sourceId);
  await remapUserFavoriteClubsForMerge(tx, survivorId, sourceId);
  await remapBugParticipantsForMerge(tx, survivorId, sourceId);
  await remapPinnedUserChatsForMerge(tx, survivorId, sourceId);
  await remapPinnedGroupChannelsForMerge(tx, survivorId, sourceId);
  await remapLeagueTeamPlayersForMerge(tx, survivorId, sourceId);
  await remapChatMutesForMerge(tx, survivorId, sourceId);
  await remapChatTranslationPreferencesForMerge(tx, survivorId, sourceId);
  await remapChatDraftsForMerge(tx, survivorId, sourceId);
  await remapChatReadCursorsForMerge(tx, survivorId, sourceId);
  await remapTrainerReviewsReviewer(tx, survivorId, sourceId);
  await remapTrainerReviewsTrainer(tx, survivorId, sourceId);
  await remapUserFavoriteUserForMerge(tx, survivorId, sourceId);
  await remapBlockedUserForMerge(tx, survivorId, sourceId);
  await remapUserInteractionsForMerge(tx, survivorId, sourceId);
}
