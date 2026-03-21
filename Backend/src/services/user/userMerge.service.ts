import {
  ChatContextType,
  ParticipantRole,
  Prisma,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { resolveDisplayNameData } from './userDisplayName.service';

type Tx = Prisma.TransactionClient;

const survivorSelect = {
  id: true,
  phone: true,
  email: true,
  telegramId: true,
  telegramUsername: true,
  appleSub: true,
  appleEmail: true,
  appleEmailVerified: true,
  googleId: true,
  googleEmail: true,
  googleEmailVerified: true,
  firstName: true,
  lastName: true,
  avatar: true,
  originalAvatar: true,
  passwordHash: true,
  isActive: true,
  level: true,
  socialLevel: true,
  reliability: true,
  totalPoints: true,
  gamesPlayed: true,
  gamesWon: true,
  wallet: true,
  currentCityId: true,
  lastUserIP: true,
  latitudeByIP: true,
  longitudeByIP: true,
  defaultCurrency: true,
  language: true,
  translateToLanguage: true,
  timeFormat: true,
  weekStart: true,
  preferredHandLeft: true,
  preferredHandRight: true,
  preferredCourtSideLeft: true,
  preferredCourtSideRight: true,
  verbalStatus: true,
  bio: true,
  isAdmin: true,
  isDeveloper: true,
  isTrainer: true,
  canCreateTournament: true,
  canCreateLeague: true,
  isPremium: true,
  gender: true,
  genderIsSet: true,
  nameIsSet: true,
  welcomeScreenPassed: true,
  approvedLevel: true,
  approvedById: true,
  approvedWhen: true,
  favoriteTrainerId: true,
  sendTelegramMessages: true,
  sendTelegramInvites: true,
  sendTelegramDirectMessages: true,
  sendTelegramReminders: true,
  sendTelegramWalletNotifications: true,
  sendPushMessages: true,
  sendPushInvites: true,
  sendPushDirectMessages: true,
  sendPushReminders: true,
  sendPushWalletNotifications: true,
  allowMessagesFromNonContacts: true,
  showOnlineStatus: true,
  appIcon: true,
  trainerRating: true,
  trainerReviewCount: true,
} as const;

type SurvivorRow = Prisma.UserGetPayload<{ select: typeof survivorSelect }>;

function nn<T>(a: T | null | undefined, b: T | null | undefined): T | null | undefined {
  return a != null && a !== '' ? a : b;
}

function roleRank(r: ParticipantRole): number {
  if (r === 'OWNER') return 3;
  if (r === 'ADMIN') return 2;
  return 1;
}

async function resolveOverlappingGameParticipants(
  tx: Tx,
  survivorId: string,
  sourceId: string,
) {
  const survRows = await tx.gameParticipant.findMany({
    where: { userId: survivorId },
    select: {
      id: true,
      gameId: true,
      role: true,
      status: true,
      stats: true,
      joinedAt: true,
      invitedByUserId: true,
      inviteMessage: true,
      inviteExpiresAt: true,
    },
  });
  const byGame = new Map(survRows.map((p) => [p.gameId, p]));
  const sourceRows = await tx.gameParticipant.findMany({
    where: { userId: sourceId },
    select: {
      id: true,
      gameId: true,
      role: true,
      status: true,
      stats: true,
      joinedAt: true,
      invitedByUserId: true,
      inviteMessage: true,
      inviteExpiresAt: true,
    },
  });
  for (const src of sourceRows) {
    const dup = byGame.get(src.gameId);
    if (!dup) continue;
    const rr = roleRank(dup.role);
    const sr = roleRank(src.role);
    if (sr > rr) {
      await tx.gameParticipant.update({
        where: { id: dup.id },
        data: {
          role: src.role,
          stats: (src.stats ?? dup.stats) as Prisma.InputJsonValue | undefined,
          status: src.status,
          invitedByUserId: nn(dup.invitedByUserId, src.invitedByUserId) ?? null,
          inviteMessage: nn(dup.inviteMessage, src.inviteMessage) ?? null,
          inviteExpiresAt: nn(dup.inviteExpiresAt, src.inviteExpiresAt) ?? null,
        },
      });
    } else if (sr === rr && src.stats != null && dup.stats == null) {
      await tx.gameParticipant.update({
        where: { id: dup.id },
        data: { stats: src.stats as Prisma.InputJsonValue },
      });
    }
    await tx.gameParticipant.delete({ where: { id: src.id } });
  }
}

async function mergeUserChats(tx: Tx, survivorId: string, sourceId: string) {
  const chats = await tx.userChat.findMany({
    where: { OR: [{ user1Id: sourceId }, { user2Id: sourceId }] },
  });

  for (const chat of chats) {
    const other = chat.user1Id === sourceId ? chat.user2Id : chat.user1Id;
    if (other === survivorId) {
      await tx.pinnedUserChat.deleteMany({ where: { userChatId: chat.id } });
      await tx.chatMessage.deleteMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
      });
      await tx.chatMute.deleteMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
      });
      await tx.chatTranslationPreference.deleteMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
      });
      await tx.chatDraft.deleteMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
      });
      await tx.pinnedMessage.deleteMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
      });
      await tx.userChat.delete({ where: { id: chat.id } });
      continue;
    }

    const [n1, n2] = [survivorId, other].sort();
    const target = await tx.userChat.findUnique({
      where: { user1Id_user2Id: { user1Id: n1, user2Id: n2 } },
    });

    if (target && target.id !== chat.id) {
      await tx.chatMessage.updateMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
        data: { contextId: target.id },
      });
      await tx.chatMute.updateMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
        data: { contextId: target.id },
      });
      await tx.chatTranslationPreference.updateMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
        data: { contextId: target.id },
      });
      await tx.chatDraft.updateMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
        data: { contextId: target.id },
      });
      await tx.pinnedMessage.updateMany({
        where: { chatContextType: ChatContextType.USER, contextId: chat.id },
        data: { contextId: target.id },
      });
      await tx.pinnedUserChat.deleteMany({ where: { userChatId: chat.id } });
      await tx.userChat.delete({ where: { id: chat.id } });

      const newer =
        target.updatedAt >= chat.updatedAt ? target : chat;
      await tx.userChat.update({
        where: { id: target.id },
        data: {
          lastMessagePreview: nn(target.lastMessagePreview, chat.lastMessagePreview) ?? newer.lastMessagePreview,
          user1allowed: target.user1allowed || chat.user1allowed,
          user2allowed: target.user2allowed || chat.user2allowed,
          updatedAt: newer.updatedAt,
        },
      });
    } else {
      await tx.userChat.update({
        where: { id: chat.id },
        data: { user1Id: n1, user2Id: n2 },
      });
    }
  }
}

async function preDeleteConflicts(tx: Tx, survivorId: string, sourceId: string) {
  await resolveOverlappingGameParticipants(tx, survivorId, sourceId);

  const survOutcomes = await tx.gameOutcome.findMany({
    where: { userId: survivorId },
    select: { gameId: true },
  });
  const survGameIdsFromOutcomes = survOutcomes.map((r) => r.gameId);
  if (survGameIdsFromOutcomes.length) {
    await tx.gameOutcome.deleteMany({
      where: { userId: sourceId, gameId: { in: survGameIdsFromOutcomes } },
    });
  }

  const survRoundIds = (
    await tx.roundOutcome.findMany({
      where: { userId: survivorId },
      select: { roundId: true },
    })
  ).map((r) => r.roundId);
  if (survRoundIds.length) {
    await tx.roundOutcome.deleteMany({
      where: { userId: sourceId, roundId: { in: survRoundIds } },
    });
  }

  const survTeamIds = (
    await tx.teamPlayer.findMany({
      where: { userId: survivorId },
      select: { teamId: true },
    })
  ).map((r) => r.teamId);
  if (survTeamIds.length) {
    await tx.teamPlayer.deleteMany({
      where: { userId: sourceId, teamId: { in: survTeamIds } },
    });
  }

  const survGtIds = (
    await tx.gameTeamPlayer.findMany({
      where: { userId: survivorId },
      select: { gameTeamId: true },
    })
  ).map((r) => r.gameTeamId);
  if (survGtIds.length) {
    await tx.gameTeamPlayer.deleteMany({
      where: { userId: sourceId, gameTeamId: { in: survGtIds } },
    });
  }

  const survOptionIds = (
    await tx.pollVote.findMany({
      where: { userId: survivorId },
      select: { optionId: true },
    })
  ).map((r) => r.optionId);
  if (survOptionIds.length) {
    await tx.pollVote.deleteMany({
      where: { userId: sourceId, optionId: { in: survOptionIds } },
    });
  }

  const survMsgIds = (
    await tx.messageReaction.findMany({
      where: { userId: survivorId },
      select: { messageId: true },
    })
  ).map((r) => r.messageId);
  if (survMsgIds.length) {
    await tx.messageReaction.deleteMany({
      where: { userId: sourceId, messageId: { in: survMsgIds } },
    });
  }

  const survReadMsgIds = (
    await tx.messageReadReceipt.findMany({
      where: { userId: survivorId },
      select: { messageId: true },
    })
  ).map((r) => r.messageId);
  if (survReadMsgIds.length) {
    await tx.messageReadReceipt.deleteMany({
      where: { userId: sourceId, messageId: { in: survReadMsgIds } },
    });
  }

  const survGcIds = (
    await tx.groupChannelParticipant.findMany({
      where: { userId: survivorId },
      select: { groupChannelId: true },
    })
  ).map((r) => r.groupChannelId);
  if (survGcIds.length) {
    await tx.groupChannelParticipant.deleteMany({
      where: { userId: sourceId, groupChannelId: { in: survGcIds } },
    });
  }

  const survBetIds = (
    await tx.betParticipant.findMany({
      where: { userId: survivorId },
      select: { betId: true },
    })
  ).map((r) => r.betId);
  if (survBetIds.length) {
    await tx.betParticipant.deleteMany({
      where: { userId: sourceId, betId: { in: survBetIds } },
    });
  }

  const survNoteGames = (
    await tx.userGameNote.findMany({
      where: { userId: survivorId },
      select: { gameId: true },
    })
  ).map((r) => r.gameId);
  if (survNoteGames.length) {
    await tx.userGameNote.deleteMany({
      where: { userId: sourceId, gameId: { in: survNoteGames } },
    });
  }

  await tx.$executeRaw`
    DELETE FROM "TrainerReview" tr
    WHERE tr."reviewerId" = ${sourceId}
    AND EXISTS (
      SELECT 1 FROM "TrainerReview" tr2
      WHERE tr2."reviewerId" = ${survivorId}
      AND tr2."trainerId" = tr."trainerId"
      AND tr2."gameId" = tr."gameId"
    )
  `;
  await tx.$executeRaw`
    DELETE FROM "TrainerReview" tr
    WHERE tr."trainerId" = ${sourceId}
    AND EXISTS (
      SELECT 1 FROM "TrainerReview" tr2
      WHERE tr2."trainerId" = ${survivorId}
      AND tr2."reviewerId" = tr."reviewerId"
      AND tr2."gameId" = tr."gameId"
    )
  `;

  const survTokens = (
    await tx.pushToken.findMany({
      where: { userId: survivorId },
      select: { token: true },
    })
  ).map((r) => r.token);
  if (survTokens.length) {
    await tx.pushToken.deleteMany({
      where: { userId: sourceId, token: { in: survTokens } },
    });
  }

  const survCh = (
    await tx.notificationPreference.findMany({
      where: { userId: survivorId },
      select: { channelType: true },
    })
  ).map((r) => r.channelType);
  if (survCh.length) {
    await tx.notificationPreference.deleteMany({
      where: { userId: sourceId, channelType: { in: survCh } },
    });
  }

  const survReportMsg = (
    await tx.messageReport.findMany({
      where: { reporterId: survivorId },
      select: { messageId: true },
    })
  ).map((r) => r.messageId);
  if (survReportMsg.length) {
    await tx.messageReport.deleteMany({
      where: { reporterId: sourceId, messageId: { in: survReportMsg } },
    });
  }

  const survClubIds = (
    await tx.userFavoriteClub.findMany({
      where: { userId: survivorId },
      select: { clubId: true },
    })
  ).map((r) => r.clubId);
  if (survClubIds.length) {
    await tx.userFavoriteClub.deleteMany({
      where: { userId: sourceId, clubId: { in: survClubIds } },
    });
  }

  const survBugIds = (
    await tx.bugParticipant.findMany({
      where: { userId: survivorId },
      select: { bugId: true },
    })
  ).map((r) => r.bugId);
  if (survBugIds.length) {
    await tx.bugParticipant.deleteMany({
      where: { userId: sourceId, bugId: { in: survBugIds } },
    });
  }

  const survPinnedChats = (
    await tx.pinnedUserChat.findMany({
      where: { userId: survivorId },
      select: { userChatId: true },
    })
  ).map((r) => r.userChatId);
  if (survPinnedChats.length) {
    await tx.pinnedUserChat.deleteMany({
      where: { userId: sourceId, userChatId: { in: survPinnedChats } },
    });
  }

  const survPinnedGc = (
    await tx.pinnedGroupChannel.findMany({
      where: { userId: survivorId },
      select: { groupChannelId: true },
    })
  ).map((r) => r.groupChannelId);
  if (survPinnedGc.length) {
    await tx.pinnedGroupChannel.deleteMany({
      where: { userId: sourceId, groupChannelId: { in: survPinnedGc } },
    });
  }

  const survLtIds = (
    await tx.leagueTeamPlayer.findMany({
      where: { userId: survivorId },
      select: { leagueTeamId: true },
    })
  ).map((r) => r.leagueTeamId);
  if (survLtIds.length) {
    await tx.leagueTeamPlayer.deleteMany({
      where: { userId: sourceId, leagueTeamId: { in: survLtIds } },
    });
  }

  const survMutes = await tx.chatMute.findMany({
    where: { userId: survivorId },
    select: { chatContextType: true, contextId: true },
  });
  for (const m of survMutes) {
    await tx.chatMute.deleteMany({
      where: {
        userId: sourceId,
        chatContextType: m.chatContextType,
        contextId: m.contextId,
      },
    });
  }

  const survTprefs = await tx.chatTranslationPreference.findMany({
    where: { userId: survivorId },
    select: { chatContextType: true, contextId: true },
  });
  for (const m of survTprefs) {
    await tx.chatTranslationPreference.deleteMany({
      where: {
        userId: sourceId,
        chatContextType: m.chatContextType,
        contextId: m.contextId,
      },
    });
  }

  const survDrafts = await tx.chatDraft.findMany({
    where: { userId: survivorId },
    select: { chatContextType: true, contextId: true, chatType: true },
  });
  for (const m of survDrafts) {
    await tx.chatDraft.deleteMany({
      where: {
        userId: sourceId,
        chatContextType: m.chatContextType,
        contextId: m.contextId,
        chatType: m.chatType,
      },
    });
  }
}

async function clearSourceUniquesForTransfer(tx: Tx, survivor: SurvivorRow, source: SurvivorRow) {
  const clear: Prisma.UserUpdateInput = {};
  if (!survivor.phone && source.phone) clear.phone = null;
  if (!survivor.email && source.email) clear.email = null;
  if (!survivor.telegramId && source.telegramId) clear.telegramId = null;
  if (!survivor.appleSub && source.appleSub) clear.appleSub = null;
  if (!survivor.googleId && source.googleId) clear.googleId = null;
  if (Object.keys(clear).length) {
    await tx.user.update({ where: { id: source.id }, data: clear });
  }
}

function buildMergedUserData(survivor: SurvivorRow, source: SurvivorRow): Prisma.UserUncheckedUpdateInput {
  const pickStr = (a: string | null | undefined, b: string | null | undefined) =>
    nn(a, b) ?? null;
  const pickUnique = (a: string | null | undefined, b: string | null | undefined) => {
    if (a != null && a !== '') return a;
    if (b != null && b !== '') return b;
    return null;
  };

  const nameResolved = resolveDisplayNameData(
    pickStr(survivor.firstName, source.firstName),
    pickStr(survivor.lastName, source.lastName)
  );

  const sr = survivor.trainerReviewCount || 0;
  const sc = source.trainerReviewCount || 0;
  const trc = sr + sc;
  let trainerRating: number | null;
  if (trc > 0) {
    trainerRating =
      ((survivor.trainerRating ?? 0) * sr + (source.trainerRating ?? 0) * sc) / trc;
  } else {
    trainerRating = nn(survivor.trainerRating, source.trainerRating) ?? null;
  }

  return {
    phone: pickUnique(survivor.phone, source.phone),
    email: pickUnique(survivor.email, source.email),
    telegramId: pickUnique(survivor.telegramId, source.telegramId),
    telegramUsername: pickStr(survivor.telegramUsername, source.telegramUsername),
    appleSub: pickUnique(survivor.appleSub, source.appleSub),
    appleEmail: pickStr(survivor.appleEmail, source.appleEmail),
    appleEmailVerified: survivor.appleEmailVerified || source.appleEmailVerified,
    googleId: pickUnique(survivor.googleId, source.googleId),
    googleEmail: pickStr(survivor.googleEmail, source.googleEmail),
    googleEmailVerified: survivor.googleEmailVerified || source.googleEmailVerified,
    firstName: nameResolved.firstName ?? null,
    lastName: nameResolved.lastName ?? null,
    avatar: pickStr(survivor.avatar, source.avatar),
    originalAvatar: pickStr(survivor.originalAvatar, source.originalAvatar),
    passwordHash: nn(survivor.passwordHash, source.passwordHash) ?? null,
    isActive: survivor.isActive || source.isActive,
    level: Math.max(survivor.level, source.level),
    socialLevel: Math.max(survivor.socialLevel, source.socialLevel),
    reliability: Math.max(survivor.reliability, source.reliability),
    wallet: survivor.wallet + source.wallet,
    currentCityId: nn(survivor.currentCityId, source.currentCityId) ?? null,
    lastUserIP: nn(survivor.lastUserIP, source.lastUserIP) ?? null,
    latitudeByIP: nn(survivor.latitudeByIP, source.latitudeByIP) ?? null,
    longitudeByIP: nn(survivor.longitudeByIP, source.longitudeByIP) ?? null,
    defaultCurrency: nn(survivor.defaultCurrency, source.defaultCurrency) || 'EUR',
    language: pickStr(survivor.language, source.language),
    translateToLanguage: pickStr(survivor.translateToLanguage, source.translateToLanguage),
    timeFormat: nn(survivor.timeFormat, source.timeFormat) || 'auto',
    weekStart: nn(survivor.weekStart, source.weekStart) || 'auto',
    preferredHandLeft: survivor.preferredHandLeft || source.preferredHandLeft,
    preferredHandRight: survivor.preferredHandRight || source.preferredHandRight,
    preferredCourtSideLeft: survivor.preferredCourtSideLeft || source.preferredCourtSideLeft,
    preferredCourtSideRight: survivor.preferredCourtSideRight || source.preferredCourtSideRight,
    verbalStatus: pickStr(survivor.verbalStatus, source.verbalStatus),
    bio: pickStr(survivor.bio, source.bio),
    isDeveloper: survivor.isDeveloper || source.isDeveloper,
    isTrainer: survivor.isTrainer || source.isTrainer,
    canCreateTournament: survivor.canCreateTournament || source.canCreateTournament,
    canCreateLeague: survivor.canCreateLeague || source.canCreateLeague,
    isPremium: survivor.isPremium || source.isPremium,
    gender: survivor.gender !== 'PREFER_NOT_TO_SAY' ? survivor.gender : source.gender,
    genderIsSet: survivor.genderIsSet || source.genderIsSet,
    nameIsSet: nameResolved.nameIsSet,
    welcomeScreenPassed: survivor.welcomeScreenPassed || source.welcomeScreenPassed,
    approvedLevel: survivor.approvedLevel || source.approvedLevel,
    approvedWhen:
      survivor.approvedWhen && source.approvedWhen
        ? survivor.approvedWhen > source.approvedWhen
          ? survivor.approvedWhen
          : source.approvedWhen
        : nn(survivor.approvedWhen, source.approvedWhen) ?? null,
    sendTelegramMessages: survivor.sendTelegramMessages || source.sendTelegramMessages,
    sendTelegramInvites: survivor.sendTelegramInvites || source.sendTelegramInvites,
    sendTelegramDirectMessages:
      survivor.sendTelegramDirectMessages || source.sendTelegramDirectMessages,
    sendTelegramReminders: survivor.sendTelegramReminders || source.sendTelegramReminders,
    sendTelegramWalletNotifications:
      survivor.sendTelegramWalletNotifications || source.sendTelegramWalletNotifications,
    sendPushMessages: survivor.sendPushMessages || source.sendPushMessages,
    sendPushInvites: survivor.sendPushInvites || source.sendPushInvites,
    sendPushDirectMessages: survivor.sendPushDirectMessages || source.sendPushDirectMessages,
    sendPushReminders: survivor.sendPushReminders || source.sendPushReminders,
    sendPushWalletNotifications:
      survivor.sendPushWalletNotifications || source.sendPushWalletNotifications,
    allowMessagesFromNonContacts:
      survivor.allowMessagesFromNonContacts || source.allowMessagesFromNonContacts,
    showOnlineStatus: survivor.showOnlineStatus || source.showOnlineStatus,
    appIcon: pickStr(survivor.appIcon, source.appIcon),
    trainerRating,
    trainerReviewCount: trc,
  };
}

async function recomputeGameStats(tx: Tx, userId: string) {
  const [gp, goAgg, wins] = await Promise.all([
    tx.gameParticipant.count({ where: { userId } }),
    tx.gameOutcome.aggregate({
      where: { userId },
      _sum: { pointsEarned: true },
    }),
    tx.gameOutcome.count({ where: { userId, isWinner: true } }),
  ]);
  await tx.user.update({
    where: { id: userId },
    data: {
      gamesPlayed: gp,
      gamesWon: wins,
      totalPoints: goAgg._sum.pointsEarned ?? 0,
    },
  });
}

async function mergeDuplicateUserInteractions(tx: Tx) {
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

async function dedupePairTables(tx: Tx, survivorId: string) {
  await tx.userFavoriteUser.deleteMany({
    where: { userId: survivorId, favoriteUserId: survivorId },
  });
  await tx.$executeRaw`
    DELETE FROM "UserFavoriteUser" a
    USING "UserFavoriteUser" b
    WHERE a.id > b.id AND a."userId" = b."userId" AND a."favoriteUserId" = b."favoriteUserId"
  `;

  await tx.blockedUser.deleteMany({
    where: { userId: survivorId, blockedUserId: survivorId },
  });
  await tx.$executeRaw`
    DELETE FROM "BlockedUser" a
    USING "BlockedUser" b
    WHERE a.id > b.id AND a."userId" = b."userId" AND a."blockedUserId" = b."blockedUserId"
  `;

  await tx.userInteraction.deleteMany({
    where: { fromUserId: survivorId, toUserId: survivorId },
  });
  await mergeDuplicateUserInteractions(tx);
}

async function dedupeLeagueParticipants(tx: Tx, survivorId: string) {
  const rows = await tx.leagueParticipant.findMany({
    where: { userId: survivorId, participantType: 'USER' },
    orderBy: { createdAt: 'asc' },
  });
  const seen = new Map<string, string>();
  for (const r of rows) {
    const key = `${r.leagueId}\0${r.leagueSeasonId}`;
    const keepId = seen.get(key);
    if (!keepId) {
      seen.set(key, r.id);
      continue;
    }
    const keep = await tx.leagueParticipant.findUnique({ where: { id: keepId } });
    if (!keep) continue;
    await tx.leagueParticipant.update({
      where: { id: keepId },
      data: {
        points: keep.points + r.points,
        wins: keep.wins + r.wins,
        ties: keep.ties + r.ties,
        losses: keep.losses + r.losses,
        scoreDelta: keep.scoreDelta + r.scoreDelta,
      },
    });
    await tx.leagueParticipant.delete({ where: { id: r.id } });
  }
}

async function mergeLundaProfiles(tx: Tx, survivorId: string, sourceId: string) {
  const [a, b] = await Promise.all([
    tx.lundaProfile.findUnique({ where: { userId: survivorId } }),
    tx.lundaProfile.findUnique({ where: { userId: sourceId } }),
  ]);
  if (a && b) {
    await tx.lundaProfile.update({
      where: { userId: survivorId },
      data: {
        metadata: { merged: true, a: a.metadata, b: b.metadata } as Prisma.InputJsonValue,
        cookie: a.cookie ?? b.cookie,
      },
    });
    await tx.lundaProfile.delete({ where: { userId: sourceId } });
  } else if (!a && b) {
    await tx.lundaProfile.create({
      data: {
        userId: survivorId,
        cookie: b.cookie,
        metadata: b.metadata as Prisma.InputJsonValue,
      },
    });
    await tx.lundaProfile.delete({ where: { userId: sourceId } });
  }
}

export class UserMergeService {
  static async mergeUsers(survivorId: string, sourceId: string) {
    if (survivorId === sourceId) {
      throw new ApiError(400, 'Cannot merge user into itself');
    }

    const [survivor, source] = await Promise.all([
      prisma.user.findUnique({ where: { id: survivorId }, select: survivorSelect }),
      prisma.user.findUnique({ where: { id: sourceId }, select: survivorSelect }),
    ]);

    if (!survivor || !source) {
      throw new ApiError(404, 'User not found');
    }
    if (survivor.isAdmin || source.isAdmin) {
      throw new ApiError(403, 'Cannot merge admin users');
    }

    await prisma.$transaction(
      async (tx) => {
        await mergeUserChats(tx, survivorId, sourceId);
        await preDeleteConflicts(tx, survivorId, sourceId);
        await clearSourceUniquesForTransfer(tx, survivor, source);

        const merged = buildMergedUserData(survivor, source);
        let favoriteTrainerId = nn(survivor.favoriteTrainerId, source.favoriteTrainerId) ?? null;
        if (favoriteTrainerId === survivorId) favoriteTrainerId = null;
        let approvedById = nn(survivor.approvedById, source.approvedById) ?? null;
        if (approvedById === survivorId || approvedById === sourceId) approvedById = null;

        await tx.user.update({
          where: { id: survivorId },
          data: {
            ...merged,
            favoriteTrainerId,
            approvedById,
          },
        });

        await tx.user.updateMany({
          where: { approvedById: sourceId },
          data: { approvedById: survivorId },
        });
        await tx.user.updateMany({
          where: { favoriteTrainerId: sourceId },
          data: { favoriteTrainerId: survivorId },
        });

        await tx.gameParticipant.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.gameParticipant.updateMany({
          where: { invitedByUserId: sourceId },
          data: { invitedByUserId: survivorId },
        });

        await tx.gameOutcome.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.roundOutcome.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.teamPlayer.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.gameTeamPlayer.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.pollVote.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.messageReaction.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.messageReadReceipt.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.groupChannelParticipant.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.betParticipant.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.userGameNote.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.trainerReview.updateMany({
          where: { reviewerId: sourceId },
          data: { reviewerId: survivorId },
        });
        await tx.trainerReview.updateMany({
          where: { trainerId: sourceId },
          data: { trainerId: survivorId },
        });
        await tx.pushToken.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.notificationPreference.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.messageReport.updateMany({
          where: { reporterId: sourceId },
          data: { reporterId: survivorId },
        });
        await tx.userFavoriteClub.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.bugParticipant.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.pinnedUserChat.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.pinnedGroupChannel.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.leagueTeamPlayer.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.chatMute.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.chatTranslationPreference.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.chatDraft.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.levelChangeEvent.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.leagueParticipant.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.gameSubscription.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });
        await tx.groupChannelInvite.updateMany({
          where: { senderId: sourceId },
          data: { senderId: survivorId },
        });
        await tx.groupChannelInvite.updateMany({
          where: { receiverId: sourceId },
          data: { receiverId: survivorId },
        });

        await tx.userFavoriteUser.updateMany({
          where: { favoriteUserId: sourceId },
          data: { favoriteUserId: survivorId },
        });
        await tx.userFavoriteUser.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });

        await tx.blockedUser.updateMany({
          where: { blockedUserId: sourceId },
          data: { blockedUserId: survivorId },
        });
        await tx.blockedUser.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });

        await tx.userInteraction.updateMany({
          where: { fromUserId: sourceId },
          data: { fromUserId: survivorId },
        });
        await tx.userInteraction.updateMany({
          where: { toUserId: sourceId },
          data: { toUserId: survivorId },
        });

        await tx.chatMessage.updateMany({
          where: { senderId: sourceId },
          data: { senderId: survivorId },
        });
        await tx.pinnedMessage.updateMany({
          where: { pinnedById: sourceId },
          data: { pinnedById: survivorId },
        });
        await tx.messageTranslation.updateMany({
          where: { createdBy: sourceId },
          data: { createdBy: survivorId },
        });

        await tx.bug.updateMany({
          where: { senderId: sourceId },
          data: { senderId: survivorId },
        });
        await tx.game.updateMany({
          where: { trainerId: sourceId },
          data: { trainerId: survivorId },
        });
        await tx.groupChannel.updateMany({
          where: { buyerId: sourceId },
          data: { buyerId: survivorId },
        });
        await tx.marketItem.updateMany({
          where: { sellerId: sourceId },
          data: { sellerId: survivorId },
        });
        await tx.marketItem.updateMany({
          where: { winnerId: sourceId },
          data: { winnerId: survivorId },
        });
        await tx.marketItemBid.updateMany({
          where: { bidderId: sourceId },
          data: { bidderId: survivorId },
        });

        await tx.bet.updateMany({
          where: { creatorId: sourceId },
          data: { creatorId: survivorId },
        });
        await tx.bet.updateMany({
          where: { acceptedBy: sourceId },
          data: { acceptedBy: survivorId },
        });
        await tx.bet.updateMany({
          where: { winnerId: sourceId },
          data: { winnerId: survivorId },
        });

        await tx.transaction.updateMany({
          where: { fromUserId: sourceId },
          data: { fromUserId: survivorId },
        });
        await tx.transaction.updateMany({
          where: { toUserId: sourceId },
          data: { toUserId: survivorId },
        });

        await tx.$executeRaw`
          UPDATE "CancelledGame" SET "cancelledByUserId" = ${survivorId}
          WHERE "cancelledByUserId" = ${sourceId}
        `;

        await tx.llmUsageLog.updateMany({
          where: { userId: sourceId },
          data: { userId: survivorId },
        });

        await tx.$executeRaw`
          UPDATE "ChatMessage"
          SET "mentionIds" = array_replace(COALESCE("mentionIds", ARRAY[]::text[]), ${sourceId}, ${survivorId})
          WHERE ${sourceId} = ANY(COALESCE("mentionIds", ARRAY[]::text[]))
        `;

        await dedupePairTables(tx, survivorId);
        await dedupeLeagueParticipants(tx, survivorId);
        await mergeLundaProfiles(tx, survivorId, sourceId);

        await recomputeGameStats(tx, survivorId);

        await tx.user.update({
          where: { id: survivorId },
          data: {
            favoriteTrainerId:
              favoriteTrainerId === survivorId ? null : favoriteTrainerId,
            approvedById:
              approvedById === survivorId || approvedById === sourceId
                ? null
                : approvedById,
          },
        });

        await tx.user.delete({ where: { id: sourceId } });
      },
      { timeout: 120_000, maxWait: 60_000 },
    );

    return { survivorId, sourceIdMerged: sourceId };
  }
}
