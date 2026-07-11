import { createHash } from 'crypto';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { GameReadService } from '../game/read.service';
import { UserTeamService } from '../userTeam.service';

export interface MyTabDataOptions {
  includeStories?: boolean;
  includeBooktime?: boolean;
  pastGamesLimit?: number;
}

export interface MyTabDataInput {
  userId: string;
  userCityId?: string;
  options?: MyTabDataOptions;
}

export interface MyTabDataOutput {
  games: any[];
  invites: any[];
  teams: any[];
  memberships: any[] | null;
  unreadCounts: Record<string, number>;
  storiesCount?: number | null;
  booktimeConnected?: boolean | null;
  _meta?: {
    etag?: string;
    timestamp: string;
  };
}

/**
 * MyTabDataService - Aggregates all data needed for the My Tab in a single, optimized call.
 *
 * Key optimizations:
 * - Parallel execution of all queries using Promise.all
 * - Minimal field projection to reduce payload size
 * - Graceful degradation with Promise.allSettled
 * - Performance monitoring
 */
export class MyTabDataService {
  /**
   * Fetch all data needed for My Tab in a single, optimized call.
   * Uses parallel queries with minimal selects for maximum performance.
   */
  static async getMyTabData(input: MyTabDataInput): Promise<MyTabDataOutput> {
    const { userId, userCityId, options = {} } = input;

    // Performance monitoring
    const startTime = Date.now();

    try {
      // Keep the game/invite payload compatible with the existing My tab UI.
      // This preserves functionality while the aggregate endpoint removes
      // frontend round trips and adds conditional caching.
      const results = await Promise.allSettled([
        GameReadService.getMyGamesWithUnread(userId, userCityId),
        this.fetchUserTeams(userId),
        UserTeamService.getMyMemberships(userId),
        options.includeStories ? this.fetchStoriesCount(userId) : Promise.resolve(null),
        options.includeBooktime ? this.fetchBooktimeStatus(userId) : Promise.resolve(null),
      ]);

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        const failureReasons = failures.map(
          (f) => (f.status === 'rejected' ? f.reason.message : 'unknown')
        );
        console.warn('[MyTabDataService] Partial failure', {
          userId,
          failures: failureReasons,
        });

        const coreFailures = results.slice(0, 2).filter((r) => r.status === 'rejected');
        if (coreFailures.length > 0) {
          throw new ApiError(
            503,
            'Failed to fetch core my-tab data',
            true,
            { code: 'my_tab.core_failure', reasons: failureReasons.slice(0, 2) }
          );
        }
      }

      const gamesBundle =
        results[0].status === 'fulfilled'
          ? results[0].value
          : { games: [], invites: [], gamesUnreadCounts: {} };

      // Extract successful results
      const data: MyTabDataOutput = {
        games: gamesBundle.games,
        invites: gamesBundle.invites,
        teams: results[1].status === 'fulfilled' ? results[1].value : [],
        memberships: results[2].status === 'fulfilled' ? results[2].value : null,
        unreadCounts: gamesBundle.gamesUnreadCounts ?? {},
        storiesCount: results[3]?.status === 'fulfilled' ? results[3].value : null,
        booktimeConnected: results[4]?.status === 'fulfilled' ? results[4].value : null,
        _meta: {
          timestamp: new Date().toISOString(),
        },
      };

      // Performance logging
      const duration = Date.now() - startTime;
      console.info('[MyTabDataService] Success', {
        userId,
        duration: `${duration}ms`,
        gamesCount: data.games.length,
        invitesCount: data.invites.length,
        teamsCount: data.teams.length,
      });

      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[MyTabDataService] Error', {
        userId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }

  /**
   * Fetch user's teams with minimal projection.
   */
  private static async fetchUserTeams(userId: string): Promise<any[]> {
    return prisma.userTeam.findMany({
      where: {
        members: {
          some: {
            userId,
            status: 'ACCEPTED',
          },
        },
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        ownerId: true,
        size: true,
        createdAt: true,
        updatedAt: true,
        cutAngle: true,
        verbalStatus: true,
        originalAvatar: true,
        owner: {
          select: USER_SELECT_WITH_SPORT_PROFILES,
        },
        members: {
          select: {
            id: true,
            teamId: true,
            userId: true,
            status: true,
            isOwner: true,
            joinedAt: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: USER_SELECT_WITH_SPORT_PROFILES,
            },
          },
          where: {
            status: 'ACCEPTED',
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
      take: 10,
    });
  }

  /**
   * Fetch stories count (optional, for badge display).
   */
  private static async fetchStoriesCount(userId: string): Promise<number | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentCityId: true },
    });

    if (!user?.currentCityId) return 0;

    // Count stories from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const count = await prisma.$queryRaw<
      [{ count: bigint }]
    >`
      SELECT COUNT(*) as count
      FROM "UserStory" us
      INNER JOIN "UserStoryItem" ui ON ui."storyId" = us.id
      WHERE us."userId" != ${userId}
        AND us."expiresAt" > NOW()
        AND us."createdAt" >= ${oneDayAgo}
        AND EXISTS (
          SELECT 1 FROM "UserSportProfile" usp
          WHERE usp."userId" = ${userId}
            AND usp.sport = 'PADEL'
        )
    `;

    return Number(count[0]?.count ?? 0);
  }

  /**
   * Fetch booktime connection status (optional).
   */
  private static async fetchBooktimeStatus(userId: string): Promise<boolean> {
    const connections = await prisma.userClubBooktimeAuth.count({
      where: {
        userId,
        club: {
          isActive: true,
        },
      },
    });

    return connections > 0;
  }

  /**
   * Generate ETag for response caching.
   * Based on data hash for conditional requests.
   */
  static generateETag(data: MyTabDataOutput): string {
    const hash = createHash('sha256');

    // Hash only the fields that affect data freshness
    const gameKeys = data.games.map((g) => ({
      id: g.id,
      status: g.status,
      startTime: g.startTime,
      updatedAt: g.updatedAt,
      participants: (g.participants ?? []).map((p: any) => ({
        userId: p.userId,
        status: p.status,
        role: p.role,
      })),
    }));
    const inviteKeys = data.invites.map((i) => ({
      id: i.id,
      status: i.status,
      joinedAt: i.joinedAt,
      inviteExpiresAt: i.inviteExpiresAt,
      updatedAt: i.updatedAt,
    }));
    const teamKeys = data.teams.map((t) => ({
      id: t.id,
      updatedAt: t.updatedAt,
      members: (t.members ?? []).map((m: any) => ({
        userId: m.userId,
        status: m.status,
        updatedAt: m.updatedAt,
      })),
    }));
    const membershipKeys =
      data.memberships === null
        ? null
        : data.memberships.map((m) => ({
            id: m.id,
            teamId: m.teamId,
            status: m.status,
            updatedAt: m.updatedAt,
          }));
    const unreadKeys = Object.entries(data.unreadCounts).sort(([a], [b]) => a.localeCompare(b));

    hash.update(
      JSON.stringify({
        games: gameKeys,
        invites: inviteKeys,
        teams: teamKeys,
        memberships: membershipKeys,
        unread: unreadKeys,
        storiesCount: data.storiesCount ?? null,
        booktimeConnected: data.booktimeConnected ?? null,
      }),
    );
    return hash.digest('base64');
  }
}
