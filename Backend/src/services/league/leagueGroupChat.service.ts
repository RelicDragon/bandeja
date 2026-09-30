import { ChatContextType, ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { SystemMessageService } from '../chat/systemMessage.service';

/** Group chats are created only once a season has at least this many groups. */
export const LEAGUE_GROUP_CHAT_MIN_GROUPS = 2;

/** Above this many joins/leaves in one reconcile (bulk regrouping), skip per-user system messages. */
const MAX_ANNOUNCED_CHANGES = 6;

const SEASON_ADMIN_STATUSES = ['PLAYING', 'NON_PLAYING', 'IN_QUEUE'] as const;

type ChatRole = 'OWNER' | 'ADMIN' | 'PARTICIPANT';

export interface LeagueGroupChatMemberInput {
  groupId: string;
  participants: Array<{
    userId: string | null;
    leagueTeam: { players: Array<{ userId: string }> } | null;
  }>;
  seasonAdmins: Array<{ userId: string; role: ParticipantRole }>;
}

/** Players currently in the group (solo users + fixed-team players) plus every season owner/admin. */
export function buildLeagueGroupChatMembers(input: LeagueGroupChatMemberInput): Map<string, ChatRole> {
  const members = new Map<string, ChatRole>();
  for (const p of input.participants) {
    if (p.userId) members.set(p.userId, 'PARTICIPANT');
    for (const player of p.leagueTeam?.players ?? []) members.set(player.userId, 'PARTICIPANT');
  }
  for (const admin of input.seasonAdmins) {
    if (admin.role === ParticipantRole.OWNER) members.set(admin.userId, 'OWNER');
    else if (admin.role === ParticipantRole.ADMIN && members.get(admin.userId) !== 'OWNER') {
      members.set(admin.userId, 'ADMIN');
    }
  }
  return members;
}

export function leagueGroupChatName(seasonName: string | null | undefined, groupName: string): string {
  const season = seasonName?.trim();
  return season ? `${season} · ${groupName}` : groupName;
}

export function assertNotLeagueGroupChat(groupChannel: { leagueGroupId: string | null }): void {
  if (groupChannel.leagueGroupId) {
    throw new ApiError(403, 'League group chat members are managed by the league');
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

async function announce(groupChannelId: string, userIds: string[], type: SystemMessageType) {
  if (userIds.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { firstName: true, lastName: true },
  });
  for (const u of users) {
    await SystemMessageService.createSystemMessageWithEmit(
      groupChannelId,
      { type, variables: { userName: getUserDisplayName(u.firstName, u.lastName) } },
      undefined,
      ChatContextType.GROUP
    );
  }
}

export class LeagueGroupChatService {
  /**
   * Idempotent: makes every group chat of the season match the current groups, players and admins.
   * No-op for ids that are not league seasons. New chats only when the season has 2+ groups;
   * chats that already exist keep syncing even if the season later drops to one group.
   */
  static async reconcileSeason(leagueSeasonId: string, opts: { announce?: boolean } = {}) {
    const season = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      select: {
        game: {
          select: {
            name: true,
            avatar: true,
            originalAvatar: true,
            participants: {
              where: {
                role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] },
                status: { in: [...SEASON_ADMIN_STATUSES] },
              },
              select: { userId: true, role: true },
            },
          },
        },
        groups: {
          select: {
            id: true,
            name: true,
            groupChannel: {
              select: {
                id: true,
                name: true,
                avatar: true,
                originalAvatar: true,
                participants: { select: { userId: true, role: true } },
              },
            },
            participants: {
              where: { withdrawnAt: null },
              select: {
                userId: true,
                leagueTeam: { select: { players: { select: { userId: true } } } },
              },
            },
          },
        },
      },
    });
    if (!season) return;

    const canCreate = season.groups.length >= LEAGUE_GROUP_CHAT_MIN_GROUPS;
    const seasonAdmins = season.game?.participants ?? [];

    for (const group of season.groups) {
      if (!group.groupChannel && !canCreate) continue;

      const name = leagueGroupChatName(season.game?.name, group.name);
      const avatar = season.game?.avatar ?? null;
      const originalAvatar = season.game?.originalAvatar ?? null;
      const desired = buildLeagueGroupChatMembers({
        groupId: group.id,
        participants: group.participants,
        seasonAdmins,
      });

      let channel = group.groupChannel;
      const isNew = !channel;
      if (!channel) {
        try {
          const created = await prisma.groupChannel.create({
            data: {
              name,
              avatar,
              originalAvatar,
              isChannel: false,
              isPublic: false,
              leagueGroupId: group.id,
              participantsCount: 0,
            },
          });
          channel = { ...created, participants: [] };
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          const existing = await prisma.groupChannel.findUnique({
            where: { leagueGroupId: group.id },
            select: {
              id: true,
              name: true,
              avatar: true,
              originalAvatar: true,
              participants: { select: { userId: true, role: true } },
            },
          });
          if (!existing) throw err;
          channel = existing;
        }
      }

      const channelId = channel.id;
      const current = new Map(channel.participants.map((p) => [p.userId, p.role as ChatRole]));
      const toAdd = [...desired].filter(([userId]) => !current.has(userId));
      const toRemove = [...current.keys()].filter((userId) => !desired.has(userId));
      const toRole = [...desired].filter(([userId, role]) => current.has(userId) && current.get(userId) !== role);
      const metaChanged =
        channel.name !== name || channel.avatar !== avatar || channel.originalAvatar !== originalAvatar;

      if (toAdd.length === 0 && toRemove.length === 0 && toRole.length === 0 && !metaChanged && !isNew) {
        continue;
      }

      await prisma.$transaction(async (tx) => {
        if (toRemove.length > 0) {
          await tx.groupChannelParticipant.deleteMany({
            where: { groupChannelId: channelId, userId: { in: toRemove } },
          });
          await tx.pinnedGroupChannel.deleteMany({
            where: { groupChannelId: channelId, userId: { in: toRemove } },
          });
        }
        if (toAdd.length > 0) {
          await tx.groupChannelParticipant.createMany({
            data: toAdd.map(([userId, role]) => ({ groupChannelId: channelId, userId, role })),
            skipDuplicates: true,
          });
        }
        for (const [userId, role] of toRole) {
          await tx.groupChannelParticipant.update({
            where: { groupChannelId_userId: { groupChannelId: channelId, userId } },
            data: { role },
          });
        }
        const participantsCount = await tx.groupChannelParticipant.count({
          where: { groupChannelId: channelId },
        });
        await tx.groupChannel.update({
          where: { id: channelId },
          data: { name, avatar, originalAvatar, participantsCount },
        });
      });

      const joined = toAdd.filter(([, role]) => role === 'PARTICIPANT').map(([userId]) => userId);
      if (opts.announce !== false && !isNew && joined.length + toRemove.length <= MAX_ANNOUNCED_CHANGES) {
        try {
          await announce(channelId, toRemove, SystemMessageType.USER_LEFT_CHAT);
          await announce(channelId, joined, SystemMessageType.USER_JOINED_CHAT);
        } catch (err) {
          console.error('[leagueGroupChat] system message failed', { channelId, err });
        }
      }
    }
  }

  /** Group id → chat id for the season's group chats the viewer belongs to. */
  static async getViewerGroupChats(leagueSeasonId: string, userId: string) {
    const rows = await prisma.groupChannel.findMany({
      where: {
        leagueGroup: { leagueSeasonId },
        participants: { some: { userId } },
      },
      select: { id: true, leagueGroupId: true },
    });
    return rows
      .filter((r): r is { id: string; leagueGroupId: string } => r.leagueGroupId != null)
      .map((r) => ({ leagueGroupId: r.leagueGroupId, groupChannelId: r.id }));
  }
}

/** Lets callers inside a DB transaction queue before commit; also coalesces bursts (results, bulk moves). */
const RECONCILE_DEBOUNCE_MS = 1500;

const timers = new Map<string, NodeJS.Timeout>();
const running = new Set<string>();
const dirty = new Set<string>();

async function runReconcile(leagueSeasonId: string) {
  if (running.has(leagueSeasonId)) {
    dirty.add(leagueSeasonId);
    return;
  }
  running.add(leagueSeasonId);
  try {
    do {
      dirty.delete(leagueSeasonId);
      await LeagueGroupChatService.reconcileSeason(leagueSeasonId);
    } while (dirty.has(leagueSeasonId));
  } catch (err) {
    console.error('[leagueGroupChat] reconcile failed', { leagueSeasonId, err });
  } finally {
    running.delete(leagueSeasonId);
  }
}

/**
 * Fire-and-forget, debounced reconcile after a league/roster mutation. Safe to call inside a
 * transaction; never throws into the caller.
 */
export function queueLeagueGroupChatReconcile(leagueSeasonId: string | null | undefined): void {
  if (!leagueSeasonId) return;
  const pending = timers.get(leagueSeasonId);
  if (pending) clearTimeout(pending);
  const timer = setTimeout(() => {
    timers.delete(leagueSeasonId);
    void runReconcile(leagueSeasonId);
  }, RECONCILE_DEBOUNCE_MS);
  timer.unref?.();
  timers.set(leagueSeasonId, timer);
}
