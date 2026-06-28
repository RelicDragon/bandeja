import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { InviteService } from '../invite.service';
import { ReadReceiptService } from '../chat/readReceipt.service';
import { projectUserForSportContext } from '../user/userSportProfile.service';

export interface MyTabDataOptions {
  includeStories?: boolean;
  includeBooktime?: boolean;
  pastGamesLimit?: number;
}

export interface MyTabDataInput {
  userId: string;
  options?: MyTabDataOptions;
}

export interface MyTabDataOutput {
  games: any[];
  invites: any[];
  teams: any[];
  unreadCounts: Record<string, number>;
  storiesCount?: number | null;
  booktimeConnected?: boolean | null;
  _meta?: {
    etag?: string;
    timestamp: string;
  };
}

// Minimal game type for list view
interface MinimalGame {
  id: string;
  status: string;
  startTime: Date;
  endTime: Date;
  sport: string;
  gameType: string;
  entityType: string;
  clubId: string | null;
  courtId: string | null;
  club: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
  court: {
    id: string;
    name: string;
  } | null;
  participants: Array<{
    userId: string;
    status: string;
    user: {
      id: string;
      name: string;
      avatar: string | null;
    };
  }>;
  _count?: {
    messages?: number;
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
    const { userId, options = {} } = input;

    // Performance monitoring
    const startTime = Date.now();

    try {
      // Execute all queries in parallel
      const results = await Promise.allSettled([
        this.fetchCoreGames(userId),
        this.fetchPendingInvites(userId),
        this.fetchUserTeams(userId),
        this.fetchUnreadCounts(userId, options),
        // Optional: Include only if requested
        options.includeStories ? this.fetchStoriesCount(userId) : Promise.resolve(null),
        options.includeBooktime ? this.fetchBooktimeStatus(userId) : Promise.resolve(null),
      ]);

      // Check for failures
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        const failureReasons = failures.map(
          (f) => (f.status === 'rejected' ? f.reason.message : 'unknown')
        );
        console.warn('[MyTabDataService] Partial failure', {
          userId,
          failures: failureReasons,
        });

        // If core queries failed (first 4), throw error
        const coreFailures = results.slice(0, 4).filter((r) => r.status === 'rejected');
        if (coreFailures.length > 0) {
          throw new ApiError(
            500,
            'Failed to fetch core my-tab data',
            true,
            { code: 'my_tab.core_failure', reasons: failureReasons.slice(0, 4) }
          );
        }
      }

      // Extract successful results
      const data: MyTabDataOutput = {
        games: results[0].status === 'fulfilled' ? results[0].value : [],
        invites: results[1].status === 'fulfilled' ? results[1].value : [],
        teams: results[2].status === 'fulfilled' ? results[2].value : [],
        unreadCounts: results[3].status === 'fulfilled' ? results[3].value : {},
        storiesCount: results[4]?.status === 'fulfilled' ? results[4].value : null,
        booktimeConnected: results[5]?.status === 'fulfilled' ? results[5].value : null,
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
   * Fetch user's upcoming games with minimal projection.
   * Only returns fields needed for the list view to reduce payload size.
   */
  private static async fetchCoreGames(userId: string): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const gamesRaw = await prisma.game.findMany({
      where: {
        participants: {
          some: {
            userId,
            status: { in: ['PLAYING', 'INVITED'] },
          },
        },
        OR: [
          { status: { not: 'ARCHIVED' } },
          {
            status: 'ARCHIVED',
            startTime: { gte: today },
          },
        ],
      },
      select: {
        // Core game fields
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        sport: true,
        gameType: true,
        entityType: true,
        clubId: true,
        courtId: true,

        // Minimal club data
        club: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },

        // Minimal court data
        court: {
          select: {
            id: true,
            name: true,
          },
        },

        // Participants: Only essential fields
        participants: {
          select: {
            userId: true,
            status: true,
            role: true,
            user: {
              select: USER_SELECT_WITH_SPORT_PROFILES,
            },
          },
          where: {
            status: { in: ['PLAYING', 'INVITED', 'IN_QUEUE'] },
          },
        },
      },
      orderBy: { startTime: 'asc' },
      take: 50, // Reasonable limit for upcoming games
    });

    // Apply sport context projection
    return gamesRaw.map((game) => {
      const sport = game.sport;
      return {
        ...game,
        participants: game.participants.map((p) => ({
          ...p,
          user: projectUserForSportContext(p.user, sport),
        })),
      };
    });
  }

  /**
   * Fetch pending invites for user with minimal projection.
   */
  private static async fetchPendingInvites(userId: string): Promise<any[]> {
    const participants = await prisma.gameParticipant.findMany({
      where: { userId, status: 'INVITED' },
      select: {
        id: true,
        userId: true,
        gameId: true,
        status: true,
        joinedAt: true,
        inviteExpiresAt: true,
        invitedByUser: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        game: {
          select: {
            id: true,
            name: true,
            gameType: true,
            startTime: true,
            endTime: true,
            sport: true,
            status: true,
            club: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
            court: {
              select: {
                id: true,
                name: true,
              },
            },
            participants: {
              select: {
                userId: true,
                status: true,
                user: {
                  select: USER_SELECT_WITH_SPORT_PROFILES,
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 20,
    });

    const now = new Date();
    const filtered = participants.filter(
      (p) => !p.inviteExpiresAt || new Date(p.inviteExpiresAt) > now
    );

    return filtered.map((p) => {
      const sport = p.game.sport;
      return {
        ...p,
        game: {
          ...p.game,
          participants: p.game.participants.map((participant: any) => ({
            ...participant,
            user: projectUserForSportContext(participant.user, sport),
          })),
        },
        invitedByUser: p.invitedByUser ? projectUserForSportContext(p.invitedByUser, sport) : null,
      };
    });
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
        members: {
          select: {
            id: true,
            userId: true,
            status: true,
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
   * Fetch unread message counts per game.
   * Uses the existing ReadReceiptService for consistency.
   */
  private static async fetchUnreadCounts(
    userId: string,
    options: MyTabDataOptions
  ): Promise<Record<string, number>> {
    // First, fetch the games to get their IDs and participant info
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const games = await prisma.game.findMany({
      where: {
        participants: {
          some: {
            userId,
            status: { in: ['PLAYING', 'INVITED'] },
          },
        },
        OR: [
          { status: { not: 'ARCHIVED' } },
          {
            status: 'ARCHIVED',
            startTime: { gte: today },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        participants: {
          select: {
            status: true,
            role: true,
          },
          where: {
            userId,
          },
        },
      },
      take: 50,
    });

    if (games.length === 0) return {};

    return ReadReceiptService.getGamesUnreadCountsFromGames(
      games.map((g) => ({
        id: g.id,
        status: g.status,
        participants: g.participants,
      })),
      userId
    );
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
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');

    // Hash only the fields that affect data freshness
    const gameKeys = data.games.map((g) => `${g.id}:${g.status}:${g.startTime}`);
    const inviteKeys = data.invites.map((i) => `${i.id}:${i.status}:${i.joinedAt}`);
    const teamKeys = data.teams.map((t) => `${t.id}`);

    hash.update(JSON.stringify({ games: gameKeys, invites: inviteKeys, teams: teamKeys }));
    return hash.digest('base64');
  }
}
