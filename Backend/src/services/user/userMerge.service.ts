import {
  ChatContextType,
  ParticipantRole,
  Prisma,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { resolveDisplayNameData } from './userDisplayName.service';
import {
  mergeDuplicateUserInteractions,
  remapAllUserScopedCompositeRows,
} from './userMergeRemaps';

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
  cityIsSet: true,
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
    cityIsSet: survivor.cityIsSet || source.cityIsSet,
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

        await remapAllUserScopedCompositeRows(tx, survivorId, sourceId);

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
