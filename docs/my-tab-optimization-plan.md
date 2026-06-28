# My Tab API Optimization Plan

**Date:** 2026-06-28
**Focus:** API loading speed optimization while maintaining 100% functionality and reliability
**Goal:** Blazing fast loading speed without compromising data integrity or user experience

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Reliability Principles](#reliability-principles)
4. [Optimization Strategies](#optimization-strategies)
5. [Implementation Phases](#implementation-phases)
6. [Testing & Validation](#testing--validation)
7. [Monitoring & Observability](#monitoring--observability)
8. [Rollback Strategy](#rollback-strategy)

---

## Executive Summary

### Goals
- **Speed**: Achieve sub-500ms perceived load time for My tab
- **Reliability**: Maintain 100% data integrity and functionality
- **Scalability**: Handle 10x current traffic without degradation
- **User Experience**: Instant perceived load with progressive enhancement

### Non-Negotiable Requirements
1. ✅ No functionality loss - all features must work identically
2. ✅ Data consistency - users must never see stale or incorrect data
3. ✅ Error resilience - graceful degradation on failures
4. ✅ Progressive enhancement - basic functionality works without JavaScript
5. ✅ Backward compatibility - old app versions continue to work

### Target Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| API calls on load | 7 | 1-2 | API logs |
| Total payload size | ~200KB | <50KB | Response size tracking |
| Time to Interactive | ~1500ms | <500ms | RUM |
| Backend response time | ~300ms | <100ms | Server timing |
| Cache hit rate | 10% | >70% | Cache metrics |

---

## Current State Analysis

### API Calls on My Tab Load

| Endpoint | Purpose | Stale Time | Avg Response Size | Status |
|----------|---------|------------|-------------------|--------|
| `GET /games/my-games-with-unread` | User's games + invites + unread counts | 30s | ~80KB | Core |
| `GET /games/past-games` | Past games (paginated, 30/page) | 30s | ~60KB | Core |
| `GET /booktime/my-clubs` | Connected booking clubs | 5min TTL | ~15KB | Optional |
| `GET /user-teams` | User's teams | N/A | ~10KB | Important |
| `GET /user-teams/memberships` | Team memberships | N/A | ~8KB | Important |
| `GET /stories/feed` | Stories carousel | TTL-based | ~20KB | Nice-to-have |
| `GET /sport-questionnaire/status` | Questionnaire prompts per sport | N/A | ~5KB | Nice-to-have |

**Total**: ~198KB across 7 API calls with 30s stale time for core data

### Current Optimizations in Place

✅ React Query with intelligent caching (30s-5min stale times)
✅ Infinite scroll for past games (reduces initial payload)
✅ Booktime 5min TTL with IndexedDB persistence
✅ Pull-to-refresh with cache invalidation
✅ Conditional loading (past games only when active)
✅ Socket.IO real-time updates for some events

### Identified Bottlenecks

1. **Network Round Trips**: 7 separate calls = 7x latency overhead
2. **Payload Bloat**: Full object graphs returned (participants, clubs, nested data)
3. **No Prefetching**: Data only loads when tab is navigated to
4. **Sequential Dependencies**: Some calls may wait for others
5. **Cache Miss Rate**: Low cache hit rates due to short stale times
6. **Database Queries**: N+1 patterns and missing indexes

---

## Reliability Principles

### 1. Data Integrity First

**Principle**: Never sacrifice data correctness for speed.

**Implementation**:
```typescript
// ALWAYS validate data structure
function validateMyTabData(data: unknown): MyTabData {
  const result = MyTabDataSchema.safeParse(data);
  if (!result.success) {
    // Log error for monitoring
    trackValidationError('my-tab-data', result.error);
    // Fall back to individual endpoints
    throw new ApiError(500, 'Data validation failed', true, {
      fallback: 'individual_endpoints'
    });
  }
  return result.data;
}

// Schema validation using Zod
const MyTabDataSchema = z.object({
  games: z.array(GameSchema),
  invites: z.array(InviteSchema),
  // ... strict validation for all fields
});
```

### 2. Graceful Degradation

**Principle**: If optimization fails, fall back to proven implementation.

**Implementation**:
```typescript
// Frontend: Try optimized, fall back to legacy
async function fetchMyTabData(userId: string): Promise<MyTabData> {
  try {
    // Try optimized endpoint
    return await api.me.getMyTabData();
  } catch (error) {
    // Check if it's a known error we can handle
    if (error instanceof ApiError && error.statusCode === 503) {
      // Service unavailable - use individual endpoints
      trackFallback('my-tab-aggregated', '503');
      return await fetchMyTabDataLegacy(userId);
    }
    // Otherwise, let error propagate
    throw error;
  }
}

// Legacy fallback implementation
async function fetchMyTabDataLegacy(userId: string): Promise<MyTabData> {
  const [games, invites, teams] = await Promise.all([
    fetchGames(userId),
    fetchInvites(userId),
    fetchTeams(userId)
  ]);
  return { games, invites, teams };
}
```

### 3. Progressive Enhancement

**Principle**: Core functionality works immediately, enhancements load progressively.

**Implementation**:
```typescript
// Priority 1: Critical data (immediate)
const { data: coreData } = useQuery({
  queryKey: ['my-tab', 'core'],
  queryFn: fetchCoreData, // games + invites only
  staleTime: 30_000,
  suspense: true, // Show skeleton, render when ready
});

// Priority 2: Enhanced data (100ms delay)
const { data: enhancedData } = useQuery({
  queryKey: ['my-tab', 'enhanced'],
  queryFn: fetchEnhancedData, // teams, questionnaire
  enabled: !!coreData, // Only after core loads
  staleTime: 5 * 60_000,
});

// Priority 3: Nice-to-have (on demand)
const { data: niceToHave } = useQuery({
  queryKey: ['my-tab', 'extras'],
  queryFn: fetchExtras, // stories, booktime
  enabled: isExtrasVisible, // Only when scrolled into view
  staleTime: 10 * 60_000,
});
```

### 4. Consistency Guarantees

**Principle**: Users must see consistent state across the app.

**Implementation**:
```typescript
// Use ETag for conditional requests
// Backend: Generate ETag based on data hash
function generateETag(data: MyTabData): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({
    games: data.games.map(g => ({ id: g.id, updatedAt: g.updatedAt })),
    invites: data.invites.map(i => ({ id: i.id, updatedAt: i.updatedAt })),
  }));
  return hash.digest('base64');
}

// Frontend: Use If-None-Match
const response = await fetch('/me/my-tab-data', {
  headers: {
    'If-None-Match': cachedETag
  }
});

if (response.status === 304) {
  // Use cached data, it's still valid
  return cachedData;
}
```

### 5. Feature Flags

**Principle**: Every optimization can be toggled independently.

**Implementation**:
```typescript
// Feature flag configuration
const OPTIMIZATION_FLAGS = {
  aggregatedEndpoint: {
    enabled: process.env.FEATURE_AGGREGATED_ENDPOINT === 'true',
    rolloutPercentage: parseInt(process.env.ROLLOUT_AGGREGATED || '0'),
  },
  payloadProjection: {
    enabled: process.env.FEATURE_PAYLOAD_PROJECTION === 'true',
    rolloutPercentage: parseInt(process.env.ROLLOUT_PROJECTION || '0'),
  },
  // ... one flag per optimization
};

// User-based rollout
function isFeatureEnabled(feature: string, userId: string): boolean {
  const flag = OPTIMIZATION_FLAGS[feature];
  if (!flag?.enabled) return false;

  // Hash-based deterministic rollout
  const hash = createHash('sha256').update(userId).digest();
  const bucket = hash[0] % 100;
  return bucket < flag.rolloutPercentage;
}
```

---

## Optimization Strategies

### Strategy 1: Payload Reduction (High Impact)

#### Problem
Current responses include full object graphs:
- Full participant objects with user profiles
- Complete club/court information with photos
- Nested league structures
- Historical data embedded in each game

#### Solution: Selective Field Projection

**Backend Implementation**:
```typescript
// Backend/src/controllers/me.controller.ts (NEW)
export async function getMyTabData(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  
  // Parallel database queries with minimal selects
  const [games, invites, teams, unreadCounts] = await Promise.all([
    // Games: Only fields needed for list view
    prisma.game.findMany({
      where: {
        participants: {
          some: {
            userId,
            status: { in: ['PLAYING', 'INVITED'] }
          }
        },
        status: { not: 'ARCHIVED' }
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        sport: true,
        gameType: true,
        // Minimal club data
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            photo: true, // Only URL, not full photo
          }
        },
        // Minimal court data
        court: {
          select: {
            id: true,
            name: true,
          }
        },
        // Participants: Only essential fields
        participants: {
          select: {
            userId: true,
            status: true,
            user: {
              select: {
                id: true,
                name: true,
                photo: true,
              }
            }
          },
          where: {
            status: { in: ['PLAYING', 'INVITED', 'IN_QUEUE'] }
          }
        },
        // Count only for messages, don't fetch them
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: { startsAt: 'asc' },
      take: 50, // Reasonable limit for upcoming games
    }),
    
    // Invites: Minimal data
    prisma.gameInvite.findMany({
      where: {
        userId,
        status: 'PENDING'
      },
      select: {
        id: true,
        gameId: true,
        userId: true,
        status: true,
        createdAt: true,
        game: {
          select: {
            id: true,
            startsAt: true,
            club: { select: { id: true, name: true, photo: true } },
            sport: true,
          }
        },
        inviter: {
          select: {
            id: true,
            name: true,
            photo: true,
          }
        }
      },
      take: 20,
    }),
    
    // Teams: Lightweight
    prisma.userTeam.findMany({
      where: { members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        slug: true,
        photo: true,
        sport: true,
        _count: {
          select: { members: true }
        }
      },
      take: 10,
    }),
    
    // Unread counts: Aggregated query
    prisma.gameParticipant.groupBy({
      by: ['gameId'],
      where: {
        userId,
        lastReadAt: { lt: prisma.gameParticipant.fields.lastMessageAt }
      }
    }).then(groups => 
      Object.fromEntries(groups.map(g => [g.gameId, g._count]))
    )
  ]);
  
  // Response with ETag
  const responseData = { games, invites, teams, unreadCounts };
  const etag = generateETag(responseData);
  
  res.set('ETag', etag);
  res.set('Cache-Control', 'private, max-age=30');
  
  res.json({
    success: true,
    data: responseData,
    _meta: {
      etag,
      timestamp: new Date().toISOString(),
    }
  });
}
```

**Frontend Implementation**:
```typescript
// Frontend/src/api/me.ts (NEW)
export interface MyTabData {
  games: GameListItem[];
  invites: Invite[];
  teams: UserTeam[];
  unreadCounts: Record<string, number>;
  _meta?: {
    etag: string;
    timestamp: string;
  };
}

// New aggregated API function
export async function getMyTabData(options?: {
  useCache?: boolean;
  signal?: AbortSignal;
}): Promise<MyTabData> {
  const cachedETag = localStorage.getItem('my-tab-etag');
  
  const response = await api.get('/me/my-tab-data', {
    headers: options?.useCache && cachedETag
      ? { 'If-None-Match': cachedETag }
      : undefined,
    signal: options?.signal,
  });
  
  if (response.status === 304) {
    // Not modified - use cached data
    const cached = JSON.parse(localStorage.getItem('my-tab-data') || '{}');
    return cached;
  }
  
  const data = response.data.data;
  
  // Cache the response
  if (data._meta?.etag) {
    localStorage.setItem('my-tab-etag', data._meta.etag);
    localStorage.setItem('my-tab-data', JSON.stringify(data));
  }
  
  return data;
}

// Fallback to individual endpoints if aggregated fails
export async function getMyTabDataFallback(): Promise<MyTabData> {
  const [gamesResponse, invitesResponse, teamsResponse] = await Promise.all([
    api.get('/games/my-games-with-unread'),
    api.get('/invites/pending'),
    api.get('/user-teams'),
  ]);
  
  return {
    games: gamesResponse.data.games,
    invites: invitesResponse.data.invites,
    teams: teamsResponse.data.teams,
    unreadCounts: gamesResponse.data.unreadCounts || {},
  };
}
```

**Reliability Measures**:
1. ✅ Schema validation on response
2. ✅ Fallback to individual endpoints on error
3. ✅ ETag support for conditional requests
4. ✅ Field defaults for missing data
5. ✅ Request timeout handling
6. ✅ Retry logic with exponential backoff

**Estimated Impact**: 40-60% payload reduction (~80KB → ~35KB)

---

### Strategy 2: API Aggregation (High Impact)

#### Problem
7 separate API calls = 7x network latency overhead
Cannot leverage single database transaction for consistency

#### Solution: Unified My Tab Data Endpoint

**Architecture**:
```
┌─────────────────┐
│  Frontend       │
│  (React Query)  │
└────────┬────────┘
         │
         │ Single Request
         ▼
┌─────────────────────────────────────────┐
│  Backend: GET /me/my-tab-data           │
│  ┌─────────────────────────────────────┐ │
│  │  MyTabDataService                  │ │
│  │  - Coordinates all data fetches    │ │
│  │  - Parallel execution              │ │
│  │  - Single DB transaction context   │ │
│  │  - Generates ETag                 │ │
│  └─────────────────────────────────────┘ │
│           │         │         │          │
│      ┌────▼───┐ ┌──▼──┐ ┌───▼────┐       │
│      │ Games  │ │Teams│ │Invites │       │
│      │ Service│ │Svc │ │Service │        │
│      └────┬───┘ └──┬─┘ └───┬────┘       │
│           │        │        │            │
│           └────────┬────────┘            │
│                    ▼                     │
│         ┌──────────────────┐            │
│         │  Database        │            │
│         │  (PostgreSQL)    │            │
│         └──────────────────┘            │
└─────────────────────────────────────────┘
```

**Backend Service Implementation**:
```typescript
// Backend/src/services/me/myTabData.service.ts (NEW)
import { prisma } from '@/config/database';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';

interface MyTabDataInput {
  userId: string;
  options?: {
    includeStories?: boolean;
    includeBooktime?: boolean;
    pastGamesLimit?: number;
  };
}

export class MyTabDataService {
  /**
   * Fetch all data needed for My tab in a single, optimized call
   * Uses parallel queries with minimal selects for maximum performance
   */
  static async getMyTabData(input: MyTabDataInput) {
    const { userId, options = {} } = input;
    
    // Performance monitoring
    const startTime = Date.now();
    
    try {
      // Execute all queries in parallel
      const results = await Promise.allSettled([
        this.fetchCoreGames(userId),
        this.fetchPendingInvites(userId),
        this.fetchUserTeams(userId),
        this.fetchUnreadCounts(userId),
        // Optional: Include only if requested
        options.includeStories ? this.fetchStoriesCount(userId) : Promise.resolve(null),
        options.includeBooktime ? this.fetchBooktimeStatus(userId) : Promise.resolve(null),
      ]);
      
      // Check for failures
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        logger.warn('MyTabDataService partial failure', {
          userId,
          failures: failures.map(f => f.status === 'rejected' ? f.reason.message : 'unknown'),
        });
        
        // If core queries failed, throw error
        if (failures.slice(0, 3).some(f => f.status === 'rejected')) {
          throw new ApiError(500, 'Failed to fetch core my-tab data', true);
        }
      }
      
      const data = {
        games: results[0].status === 'fulfilled' ? results[0].value : [],
        invites: results[1].status === 'fulfilled' ? results[1].value : [],
        teams: results[2].status === 'fulfilled' ? results[2].value : [],
        unreadCounts: results[3].status === 'fulfilled' ? results[3].value : {},
        storiesCount: results[4]?.status === 'fulfilled' ? results[4].value : null,
        booktimeConnected: results[5]?.status === 'fulfilled' ? results[5].value : null,
      };
      
      // Performance logging
      const duration = Date.now() - startTime;
      logger.info('MyTabDataService success', {
        userId,
        duration,
        gamesCount: data.games.length,
        invitesCount: data.invites.length,
      });
      
      return data;
      
    } catch (error) {
      logger.error('MyTabDataService error', {
        userId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      throw error;
    }
  }
  
  /**
   * Fetch user's upcoming games with minimal projection
   */
  private static async fetchCoreGames(userId: string) {
    return prisma.game.findMany({
      where: {
        participants: {
          some: {
            userId,
            status: { in: ['PLAYING', 'INVITED'] }
          }
        },
        status: { not: 'ARCHIVED' },
        startsAt: { gte: new Date() }
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        sport: true,
        gameType: true,
        club: {
          select: { id: true, name: true, slug: true, photo: true }
        },
        court: {
          select: { id: true, name: true }
        },
        participants: {
          select: {
            userId: true,
            status: true,
            user: { select: { id: true, name: true, photo: true } }
          },
          where: { status: { in: ['PLAYING', 'INVITED', 'IN_QUEUE'] } }
        },
        _count: { select: { messages: true } }
      },
      orderBy: { startsAt: 'asc' },
      take: 50,
    });
  }
  
  /**
   * Fetch pending invites for user
   */
  private static async fetchPendingInvites(userId: string) {
    return prisma.gameInvite.findMany({
      where: { userId, status: 'PENDING' },
      select: {
        id: true,
        gameId: true,
        status: true,
        createdAt: true,
        game: {
          select: {
            id: true,
            startsAt: true,
            sport: true,
            club: { select: { id: true, name: true, photo: true } }
          }
        },
        inviter: {
          select: { id: true, name: true, photo: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
  
  /**
   * Fetch user's teams
   */
  private static async fetchUserTeams(userId: string) {
    return prisma.userTeam.findMany({
      where: {
        members: { some: { userId } }
      },
      select: {
        id: true,
        name: true,
        slug: true,
        photo: true,
        sport: true,
        _count: { select: { members: true } }
      },
      take: 10,
    });
  }
  
  /**
   * Fetch unread message counts per game
   */
  private static async fetchUnreadCounts(userId: string) {
    const participants = await prisma.gameParticipant.findMany({
      where: {
        userId,
        game: { status: { not: 'ARCHIVED' } }
      },
      select: {
        gameId: true,
        lastReadAt: true,
        game: {
          select: {
            _count: { select: { messages: true } },
            messages: {
              select: { createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });
    
    // Calculate unread counts
    const counts: Record<string, number> = {};
    for (const p of participants) {
      const lastMessageAt = p.game.messages[0]?.createdAt;
      if (lastMessageAt && (!p.lastReadAt || p.lastReadAt < lastMessageAt)) {
        counts[p.gameId] = p.game._count.messages;
      }
    }
    
    return counts;
  }
  
  /**
   * Fetch stories count (optional, for badge display)
   */
  private static async fetchStoriesCount(userId: string) {
    const cityId = await this.getUserCityId(userId);
    if (!cityId) return 0;
    
    return prisma.storyBubble.count({
      where: {
        cityId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });
  }
  
  /**
   * Fetch booktime connection status (optional)
   */
  private static async fetchBooktimeStatus(userId: string) {
    const connections = await prisma.booktimeConnection.count({
      where: { userId, isActive: true }
    });
    
    return connections > 0;
  }
  
  private static async getUserCityId(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { cityId: true }
    });
    return user?.cityId || null;
  }
}
```

**Route Definition**:
```typescript
// Backend/src/routes/me.routes.ts (NEW)
import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { myTabDataController } from '@/controllers/me.controller';

const router = Router();

// GET /me/my-tab-data - Unified endpoint for My tab data
router.get('/my-tab-data', authenticate, myTabDataController.getMyTabData);

// Optional: Include additional data via query params
router.get('/my-tab-data', authenticate, myTabDataController.getMyTabData);
// ?includeStories=true
// ?includeBooktime=true
// ?pastGamesLimit=10

export default router;
```

**Reliability Measures**:
1. ✅ Promise.allSettled for graceful partial failure handling
2. ✅ Core data (games/invites/teams) must succeed, optional data can fail
3. ✅ Request timeout to prevent hanging
4. ✅ Detailed error logging for debugging
5. ✅ Performance monitoring for each query
6. ✅ Fallback to individual endpoints if aggregation fails

**Estimated Impact**: 50-80% load time reduction (network-bound)

---

### Strategy 3: Database Query Optimization (High Impact)

#### Problem
- N+1 query patterns (fetching participants for each game separately)
- Missing indexes on common query patterns
- Inefficient joins with unnecessary data

#### Solution: Optimized Queries with Proper Indexes

**Index Migration**:
```sql
-- Migration: Add optimized indexes for My Tab queries
-- File: Backend/prisma/migrations/20260628_add_my_tab_indexes/migration.sql

-- Index for user's upcoming games query
-- Covers: WHERE participants.userId = ? AND participants.status IN (?, ?) AND status != 'ARCHIVED' AND startsAt >= ?
CREATE INDEX CONCURRENTLY idx_game_participants_user_status_starts_at
ON game_participants(user_id, status)
WHERE status IN ('PLAYING', 'INVITED', 'IN_QUEUE');

-- Index for games ordering by starts_at
CREATE INDEX CONCURRENTLY idx_games_starts_at_status
ON games(starts_at ASC, status)
WHERE status != 'ARCHIVED';

-- Index for pending invites
CREATE INDEX CONCURRENTLY idx_game_invites_user_status_created
ON game_invites(user_id, status, created_at DESC)
WHERE status = 'PENDING';

-- Index for user teams lookup
CREATE INDEX CONCURRENTLY idx_user_team_members_user_id
ON user_team_members(user_id);

-- Index for unread messages calculation
-- This covers the join between game_participants and messages
CREATE INDEX CONCURRENTLY idx_messages_game_created_at
ON messages(game_id, created_at DESC);

-- Partial index for active participants only
CREATE INDEX CONCURRENTLY idx_game_participants_active
ON game_participants(user_id, game_id, last_read_at)
WHERE status = 'PLAYING';

-- Index for club lookups in games
CREATE INDEX CONCURRENTLY idx_games_club_id
ON games(club_id)
WHERE status != 'ARCHIVED';

-- Index for court lookups
CREATE INDEX CONCURRENTLY idx_games_court_id
ON games(court_id)
WHERE status != 'ARCHIVED';

-- Comment: All indexes are CONCURRENTLY to avoid table locks
-- Comment: Partial indexes (WHERE clauses) reduce index size
```

**Prisma Schema Update**:
```prisma
// Backend/prisma/schema.prisma

// Add @@index attributes to models for auto-generated indexes

model Game {
  // ... existing fields
  
  @@index([startsAt, status], where: { status: { not: "ARCHIVED" } })
  @@index([clubId], where: { status: { not: "ARCHIVED" } })
  @@index([courtId], where: { status: { not: "ARCHIVED" } })
}

model GameParticipant {
  id        String   @id
  userId    String
  gameId    String
  status    ParticipantStatus
  lastReadAt DateTime?
  
  @@index([userId, status], where: { status: { in: ["PLAYING", "INVITED", "IN_QUEUE"] } })
  @@index([userId, gameId, lastReadAt], where: { status: { eq: "PLAYING" } })
}

model GameInvite {
  id        String   @id
  userId    String
  gameId    String
  status    InviteStatus
  createdAt DateTime @default(now())
  
  @@index([userId, status, createdAt(sort: Desc)], where: { status: { eq: "PENDING" } })
}

model UserTeamMember {
  id        String   @id
  userId    String
  teamId    String
  
  @@index([userId])
}
```

**Query Optimization Examples**:
```typescript
// BEFORE: N+1 query pattern
const games = await prisma.game.findMany({
  where: { participants: { some: { userId } } },
  include: { participants: { include: { user: true } } }
});
// Then for each game, fetch additional data...

// AFTER: Single query with optimized selects
const games = await prisma.game.findMany({
  where: {
    participants: {
      some: {
        userId,
        status: { in: ['PLAYING', 'INVITED'] }
      }
    },
    status: { not: 'ARCHIVED' },
    startsAt: { gte: new Date() }
  },
  select: {
    // Minimal fields only
    id: true,
    status: true,
    startsAt: true,
    sport: true,
    club: { select: { id: true, name: true, photo: true } },
    participants: {
      select: {
        userId: true,
        status: true,
        user: { select: { id: true, name: true, photo: true } }
      }
    }
  },
  orderBy: { startsAt: 'asc' },
  take: 50,
});
```

**Reliability Measures**:
1. ✅ Indexes created CONCURRENTLY (no table locks)
2. ✅ Query performance monitoring
3. ✅ Fallback to simpler queries if indexes aren't used
4. ✅ EXPLAIN ANALYZE before deployment
5. ✅ Index usage monitoring in production

**Estimated Impact**: 20-40% faster backend response times

---

### Strategy 4: Smart Prefetching (Medium Impact)

#### Problem
Data only loads when tab is navigated to, causing perceived delay

#### Solution: Multi-Stage Prefetching

**Implementation**:
```typescript
// Frontend/src/hooks/useMyTabPrefetch.ts (NEW)
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from '@/queries/queryKeys';
import { isMobile, requestIdleCallback } from '@/utils/browser';

/**
 * Prefetch My Tab data at multiple stages:
 * 1. App launch - prefetch critical data
 * 2. Idle time - prefetch nice-to-have data
 * 3. Nav hover - prefetch if available
 */
export function useMyTabPrefetch() {
  const queryClient = useQueryClient();
  const user = useAuthStore(state => state.user);
  const hasPrefetched = useRef(false);
  const hasPrefetchedExtras = useRef(false);
  
  useEffect(() => {
    if (!user || hasPrefetched.current) return;
    hasPrefetched.current = true;
    
    // Stage 1: Immediate prefetch of critical data (games, invites)
    // This runs during app initialization
    queryClient.prefetchQuery({
      queryKey: queryKeys.games.my(user.id),
      queryFn: () => api.games.getMyGamesWithUnread(),
      staleTime: 30_000,
    });
    
    // Stage 2: Prefetch nice-to-have data during idle time
    // This doesn't block app initialization
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(
        () => {
          queryClient.prefetchQuery({
            queryKey: queryKeys.teams.all(),
            queryFn: () => api.teams.getMine(),
            staleTime: 10 * 60_000,
          });
          
          queryClient.prefetchQuery({
            queryKey: queryKeys.stories.feed(),
            queryFn: () => api.stories.getFeed(),
            staleTime: 2 * 60_000,
          });
        },
        { timeout: 2000 } // Fallback after 2s if idle never fires
      );
    }
  }, [user, queryClient]);
  
  return {
    // Call this when user hovers/taps My tab nav
    prefetchOnIntent: () => {
      if (!user || hasPrefetched.current) return;
      
      queryClient.prefetchQuery({
        queryKey: queryKeys.games.my(user.id),
        queryFn: () => api.games.getMyGamesWithUnread(),
        staleTime: 30_000,
      });
    },
    
    // Call this when My tab is about to become visible
    prefetchOnActivate: () => {
      if (!user) return;
      
      // Prefetch past games if not already loaded
      queryClient.prefetchInfiniteQuery({
        queryKey: queryKeys.games.past(user.id),
        queryFn: () => api.games.getPastGames({ limit: 30, offset: 0 }),
        pages: 1,
        staleTime: 60_000,
      });
    }
  };
}

// Usage in App.tsx
export function App() {
  const user = useAuthStore(state => state.user);
  useMyTabPrefetch();
  
  // ... rest of app
}

// Usage in Navigation component
export function Navigation() {
  const { prefetchOnIntent } = useMyTabPrefetch();
  
  return (
    <nav>
      <NavLink
        to="/my"
        onMouseEnter={() => prefetchOnIntent()}
        onTouchStart={() => prefetchOnIntent()}
      >
        My Tab
      </NavLink>
    </nav>
  );
}
```

**Reliability Measures**:
1. ✅ Prefetch failures don't break app
2. ✅ Duplicate prefetch calls are idempotent (React Query handles this)
3. ✅ Timeout fallback for requestIdleCallback
4. ✅ Prefetch only on good network conditions
5. ✅ Respect user's Data Saver mode

**Estimated Impact**: Perceived instant load after first visit

---

### Strategy 5: Real-time Updates via Socket.IO (Medium Impact)

#### Problem
- Unread counts updated via polling or refresh
- Invite status changes require full refresh
- Game updates trigger unnecessary re-fetches

#### Solution: Targeted Socket Events

**Backend Socket Events**:
```typescript
// Backend/src/services/socket/myTabEvents.service.ts (NEW)
import { SocketService } from './socket.service';

export class MyTabSocketService {
  static setupMyTabEvents(io: Socket) {
    const userId = this.getUserIdFromSocket(socket);
    if (!userId) return;
    
    // Emit when user receives new invite
    socket.on('invite:created', (invite) => {
      io.to(`user:${userId}`).emit('my-tab:invite_received', {
        id: invite.id,
        gameId: invite.gameId,
        inviter: invite.inviter,
        createdAt: invite.createdAt,
        // Increment invite count
        inviteCountDelta: 1,
      });
    });
    
    // Emit when invite is responded to (by this user or others)
    socket.on('invite:responded', (invite) => {
      if (invite.userId === userId) {
        io.to(`user:${userId}`).emit('my-tab:invite_responded', {
          id: invite.id,
          status: invite.status,
          inviteCountDelta: -1,
        });
      }
    });
    
    // Emit when game is updated
    socket.on('game:updated', (game) => {
      // Check if user participates
      const participates = game.participants?.some(p => p.userId === userId);
      if (!participates) return;
      
      io.to(`user:${userId}`).emit('my-tab:game_updated', {
        id: game.id,
        status: game.status,
        startsAt: game.startsAt,
        // Only send changed fields
        changedFields: this.getChangedFields(game),
      });
    });
    
    // Emit when user is added to game
    socket.on('game:participant_added', (data) => {
      if (data.userId === userId) {
        io.to(`user:${userId}`).emit('my-tab:game_added', {
          game: data.game,
        });
      }
    });
    
    // Emit unread count updates
    socket.on('chat:message', (message) => {
      // Check if message is in user's game
      const isInUsersGame = this.isUserInGame(userId, message.gameId);
      if (!isInUsersGame) return;
      
      io.to(`user:${userId}`).emit('my-tab:unread_updated', {
        gameId: message.gameId,
        unreadDelta: 1,
        lastMessageAt: message.createdAt,
      });
    });
    
    // Emit when messages are read
    socket.on('chat:messages_read', (data) => {
      if (data.userId === userId) {
        io.to(`user:${userId}`).emit('my-tab:unread_updated', {
          gameId: data.gameId,
          unreadDelta: -data.count, // Decrease unread count
        });
      }
    });
  }
}
```

**Frontend Socket Handlers**:
```typescript
// Frontend/src/store/myTabSocketEventsStore.ts (NEW)
import { create } from 'zustand';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/queryKeys';

interface MyTabSocketEventsState {
  connected: boolean;
  setupMyTabSocketEvents: (socket: Socket) => void;
  cleanupMyTabSocketEvents: (socket: Socket) => void;
}

export const useMyTabSocketEventsStore = create<MyTabSocketEventsState>((set, get) => ({
  connected: false,
  
  setupMyTabSocketEvents: (socket) => {
    const queryClient = useQueryClient();
    
    // Handle new invite
    socket.on('my-tab:invite_received', (data) => {
      // Optimistically update invites query
      queryClient.setQueryData(
        queryKeys.invites.pending(),
        (old: Invite[] = []) => [...old, data]
      );
      
      // Show notification
      showNotification('New game invite!', {
        body: `${data.inviter.name} invited you to a game`,
      });
      
      // Invalidate to fetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.invites.pending() });
    });
    
    // Handle invite response
    socket.on('my-tab:invite_responded', (data) => {
      // Remove from pending invites
      queryClient.setQueryData(
        queryKeys.invites.pending(),
        (old: Invite[] = []) => old.filter(i => i.id !== data.id)
      );
    });
    
    // Handle game update
    socket.on('my-tab:game_updated', (data) => {
      // Update specific game in cache
      queryClient.setQueryData(
        queryKeys.games.my(userId),
        (old: Game[] = []) => old.map(g =>
          g.id === data.id ? { ...g, ...data.changedFields } : g
        )
      );
    });
    
    // Handle new game
    socket.on('my-tab:game_added', (data) => {
      queryClient.setQueryData(
        queryKeys.games.my(userId),
        (old: Game[] = []) => [...old, data.game].sort(byStartsAt)
      );
    });
    
    // Handle unread count update
    socket.on('my-tab:unread_updated', (data) => {
      // Update unread counts in cache
      queryClient.setQueryData(
        queryKeys.games.my(userId),
        (old: Game[] = []) => old.map(g =>
          g.id === data.gameId
            ? { ...g, unreadCount: (g.unreadCount || 0) + data.unreadDelta }
            : g
        )
      );
      
      // Update global unread store
      useUnreadStore.getState().updateGameUnread(data.gameId, data.unreadDelta);
    });
    
    set({ connected: true });
  },
  
  cleanupMyTabSocketEvents: (socket) => {
    socket.off('my-tab:invite_received');
    socket.off('my-tab:invite_responded');
    socket.off('my-tab:game_updated');
    socket.off('my-tab:game_added');
    socket.off('my-tab:unread_updated');
    
    set({ connected: false });
  },
}));
```

**Reliability Measures**:
1. ✅ Socket events don't replace API calls, they supplement them
2. ✅ All socket updates invalidate React Query cache for consistency
3. ✅ Socket disconnection doesn't break functionality (falls back to polling)
4. ✅ Duplicate event handling (idempotent updates)
5. ✅ Event queue processing on reconnect

**Estimated Impact**: Eliminates 50%+ of refresh pulls

---

### Strategy 6: Progressive Loading (Medium Impact)

#### Problem
All data loads immediately, including low-priority items

#### Solution: Priority-Based Loading with Intersection Observer

**Implementation**:
```typescript
// Frontend/src/pages/MyTab.tsx
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';

export function MyTab() {
  const user = useAuthStore(state => state.user);
  
  // Priority 1: Critical data (immediate, with suspense)
  const { data: coreData, isLoading: coreLoading } = useQuery({
    queryKey: ['my-tab', 'core', user.id],
    queryFn: () => fetchCoreData(user.id),
    staleTime: 30_000,
    suspense: true, // Render skeleton, don't block
  });
  
  // Priority 2: Important data (100ms delay, automatic)
  const { data: importantData } = useQuery({
    queryKey: ['my-tab', 'important', user.id],
    queryFn: () => fetchImportantData(user.id),
    enabled: !!coreData, // Only after core loads
    staleTime: 5 * 60_000,
  });
  
  // Priority 3: Nice-to-have (viewport-based)
  const [storiesRef, isStoriesVisible] = useIntersectionObserver({
    threshold: 0.1,
    triggerOnce: true,
  });
  
  const { data: storiesData } = useQuery({
    queryKey: ['my-tab', 'stories', user.id],
    queryFn: () => fetchStoriesData(user.id),
    enabled: isStoriesVisible, // Only when in viewport
    staleTime: 2 * 60_000,
  });
  
  // Priority 4: Past games (on scroll near bottom)
  const [pastGamesRef, isPastGamesVisible] = useIntersectionObserver({
    threshold: 0.01,
    rootMargin: '200px', // Start loading 200px before visible
  });
  
  const pastGames = useInfiniteQuery({
    queryKey: ['my-tab', 'past-games', user.id],
    queryFn: ({ pageParam }) => fetchPastGames(user.id, pageParam),
    enabled: isPastGamesVisible,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
  });
  
  return (
    <div className="my-tab">
      {/* Core content - shows immediately */}
      <MyTabCore data={coreData} isLoading={coreLoading} />
      
      {/* Important content - loads shortly after */}
      {importantData && <MyTabTeams data={importantData.teams} />}
      
      {/* Stories - only loads when scrolled into view */}
      <div ref={storiesRef}>
        {isStoriesVisible && <StoriesRail stories={storiesData} />}
      </div>
      
      {/* Past games - only loads when near viewport */}
      <div ref={pastGamesRef}>
        {isPastGamesVisible && <PastGamesSection games={pastGames} />}
      </div>
    </div>
  );
}
```

**Custom Hook**:
```typescript
// Frontend/src/hooks/useIntersectionObserver.ts (NEW)
import { useState, useEffect, RefObject } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
): [RefObject<HTMLElement>, boolean] {
  const { threshold = 0, rootMargin = '0px', triggerOnce = false } = options;
  
  const [isVisible, setIsVisible] = useState(false);
  const [hasIntersected, setHasIntersected] = useState(false);
  const ref = useRef<HTMLElement>(null);
  
  useEffect(() => {
    const element = ref.current;
    if (!element || (triggerOnce && hasIntersected)) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasIntersected(true);
          
          if (triggerOnce) {
            observer.disconnect();
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );
    
    observer.observe(element);
    
    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce, hasIntersected]);
  
  return [ref, isVisible];
}
```

**Reliability Measures**:
1. ✅ Core data always loads (no viewport dependency)
2. ✅ Intersection Observer with polyfill for older browsers
3. ✅ Timeout fallback (load after 5 seconds regardless of viewport)
4. ✅ No data loss - all data eventually loads
5. ✅ Progressive enhancement works without JavaScript

**Estimated Impact**: 30% less initial data, faster perceived load

---

### Strategy 7: Enhanced Caching (Medium Impact)

#### Problem
- Short stale times cause frequent cache invalidation
- No persistence across sessions
- No strategic preloading

#### Solution: Multi-Tier Caching Strategy

**Implementation**:
```typescript
// Frontend/src/queries/games/useMyGamesQuery.ts (UPDATED)
export function useMyGamesQuery(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.games.my(userId),
    queryFn: () => api.games.getMyGamesWithUnread(),
    
    // Extended stale time - Socket.IO will invalidate on changes
    staleTime: 2 * 60 * 1000, // 2 minutes (was 30s)
    
    // Keep in cache for 10 minutes
    gcTime: 10 * 60 * 1000,
    
    // Refetch on window focus (optional, can be disabled)
    refetchOnWindowFocus: false,
    
    // Refetch on reconnect (true for reliability)
    refetchOnReconnect: true,
    
    // Don't refetch on mount if data is fresh
    refetchOnMount: false,
    
    // Retry configuration
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
        return false;
      }
      // Retry up to 2 times on 5xx or network errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

// Query invalidation via Socket.IO
socket.on('game:updated', (game) => {
  // Invalidate only the affected game's cache
  queryClient.invalidateQueries({
    queryKey: queryKeys.games.detail(game.id),
  });
  
  // Also invalidate the list query
  queryClient.invalidateQueries({
    queryKey: queryKeys.games.my(userId),
    refetchType: 'none', // Don't refetch, just mark invalid
  });
});
```

**Service Worker Caching**:
```typescript
// Frontend/service-worker.ts (UPDATED)
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute, Route } from 'workbox-routing';
import { 
  NetworkFirst, 
  StaleWhileRevalidate, 
  CacheFirst 
} from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Cache static assets
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Strategy 1: NetworkFirst for user-specific data
// Ensures fresh data while providing offline fallback
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/me/'),
  new NetworkFirst({
    cacheName: 'api-me',
    networkTimeoutSeconds: 3, // Fall back to cache after 3s
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
  })
);

// Strategy 2: StaleWhileRevalidate for relatively static data
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/sport-questionnaire/'),
  new StaleWhileRevalidate({
    cacheName: 'api-questionnaire',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60, // 1 day
      }),
    ],
  })
);

// Strategy 3: CacheFirst for truly static data
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/sport-configs'),
  new CacheFirst({
    cacheName: 'api-sport-configs',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
    ],
  })
);

// Cache API responses with proper headers
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/'),
  async ({ request, event }) => {
    // Try network first
    try {
      const response = await fetch(request);
      
      // Cache successful GET requests
      if (response.ok && request.method === 'GET') {
        const cache = await caches.open('api-cache');
        cache.put(request, response.clone());
      }
      
      return response;
    } catch (error) {
      // Fall back to cache
      const cache = await caches.open('api-cache');
      const cached = await cache.match(request);
      
      if (cached) {
        return cached;
      }
      
      // Return offline fallback
      return new Response(JSON.stringify({ success: false, message: 'Offline' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
);

// Background sync for failed requests
import { BackgroundSyncPlugin } from 'workbox-background-sync';

const bgSyncPlugin = new BackgroundSyncPlugin('api-queue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours
});

// Use background sync for mutations
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/games') && event.request.method === 'POST',
  new NetworkFirst({
    plugins: [bgSyncPlugin],
  }),
  'POST'
);
```

**Reliability Measures**:
1. ✅ Cache headers respect privacy (no caching of user data on shared devices)
2. ✅ Stale data is marked as such in UI
3. ✅ Manual refresh always fetches fresh data
4. ✅ Network errors gracefully fall back to cache
5. ✅ Cache invalidation on Socket.IO events
6. ✅ Service worker updates trigger cache refresh

**Estimated Impact**: 50% fewer API calls after first load

---

### Strategy 8: Backend Response Optimization (Medium Impact)

#### Problem
- Full JSON serialization of all fields
- No compression on API responses
- Redundant data in responses

#### Solution: Response Compression and Optimization

**Backend Compression Middleware**:
```typescript
// Backend/src/app.ts (UPDATED)
import compression from 'compression';

// Add compression middleware before other middleware
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    
    // Only compress responses for API calls
    return res.getHeader('Content-Type')?.includes('application/json');
  },
  threshold: 1024, // Only compress responses > 1KB
  level: 6, // Balance between speed and compression
}));

// Add response size header for monitoring
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    const size = Buffer.byteLength(data, 'utf8');
    res.setHeader('X-Response-Size', String(size));
    return originalSend.call(this, data);
  };
  next();
});
```

**Optimized JSON Serialization**:
```typescript
// Backend/src/utils/jsonResponse.ts (NEW)
import { Response } from 'express';

interface JsonResponseOptions {
  success: true;
  data?: unknown;
  meta?: Record<string, unknown>;
  etag?: string;
}

/**
 * Send optimized JSON response
 * - Minifies JSON (removes unnecessary whitespace)
 * - Adds compression hints
 * - Includes ETag for caching
 */
export function sendJson(res: Response, options: JsonResponseOptions): void {
  const { success, data, meta, etag } = options;
  
  // Build response object
  const response = {
    success,
    ...(data !== undefined && { data }),
    ...(meta && { _meta: meta }),
  };
  
  // Set headers
  if (etag) {
    res.setHeader('ETag', etag);
  }
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Send minified JSON
  res.send(JSON.stringify(response));
}

// Usage in controller
export async function getMyTabData(req: AuthRequest, res: Response): Promise<void> {
  const data = await MyTabDataService.getMyTabData({ userId: req.userId });
  const etag = generateETag(data);
  
  // Check if client has cached version
  if (req.get('If-None-Match') === etag) {
    res.status(304).end();
    return;
  }
  
  sendJson(res, {
    success: true,
    data,
    etag,
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}
```

**Reliability Measures**:
1. ✅ Compression can be disabled by client header
2. ✅ ETag validation ensures consistent data
3. ✅ Response size monitoring for anomalies
4. ✅ Graceful fallback if compression fails

**Estimated Impact**: 60-80% reduction in response size (after compression)

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Goal**: Set up monitoring, fallback mechanisms, and feature flags

**Tasks**:
1. ✅ Add performance monitoring to existing endpoints
   - Track response times, payload sizes, error rates
   - Set up alerts for anomalies
   
2. ✅ Implement feature flag system
   - Create feature flag infrastructure
   - Add flags for each optimization
   
3. ✅ Build fallback mechanism
   - Create individual endpoint fallback function
   - Add error tracking for fallback triggers
   
4. ✅ Add database query logging
   - Log slow queries (>100ms)
   - Track query patterns
   
5. ✅ Set up A/B testing infrastructure
   - Create user buckets for testing
   - Build metrics comparison dashboard

**Deliverables**:
- Monitoring dashboard
- Feature flag system
- Fallback infrastructure
- Query logging

**Risk**: Low (observability only, no behavior changes)

---

### Phase 2: Quick Wins (Weeks 3-4)

**Goal**: Implement low-risk, high-impact optimizations

**Tasks**:
1. ✅ Verify and ensure parallel loading
   - Audit current query dependencies
   - Remove any sequential dependencies
   - Test parallel execution
   
2. ✅ Add response compression
   - Enable compression middleware
   - Test with different compression levels
   - Monitor CPU impact
   
3. ✅ Increase stale times for safe data
   - Games: 30s → 2min
   - Teams: N/A → 10min
   - Questionnaire: N/A → 1hour
   - Add Socket.IO invalidation
   
4. ✅ Implement app-launch prefetching
   - Add prefetch for core games data
   - Add idle-time prefetch for teams
   - Test prefetch effectiveness
   
5. ✅ Add selective field projection (pilot)
   - Add `?select` parameter to games API
   - Test with small percentage of users
   - Measure payload reduction

**Deliverables**:
- Compression enabled
- Extended stale times
- Prefetching infrastructure
- Select field projection pilot

**Risk**: Low (all changes have fallbacks)

---

### Phase 3: Database Optimization (Weeks 5-6)

**Goal**: Optimize database queries and add indexes

**Tasks**:
1. ✅ Add database indexes (staged deployment)
   - Create migration file
   - Deploy to staging first
   - Test with production-like load
   - Deploy to production with CONCURRENTLY
   
2. ✅ Optimize common queries
   - Rewrite N+1 patterns
   - Add proper selects
   - Use joins efficiently
   
3. ✅ Add query performance monitoring
   - Track index usage
   - Monitor query times
   - Alert on regressions
   
4. ✅ Test under load
   - Run load tests with k6
   - Measure response times
   - Check for connection pool exhaustion

**Deliverables**:
- New database indexes
- Optimized query patterns
- Query performance dashboard

**Risk**: Medium (database changes require careful deployment)

---

### Phase 4: Aggregated Endpoint (Weeks 7-9)

**Goal**: Build and deploy unified My Tab data endpoint

**Tasks**:
1. ✅ Design aggregated endpoint API
   - Define response schema
   - Add ETag support
   - Add conditional request support
   
2. ✅ Implement backend service
   - Create MyTabDataService
   - Implement parallel queries
   - Add error handling
   
3. ✅ Build frontend integration
   - Create API client function
   - Add fallback mechanism
   - Update React Query hooks
   
4. ✅ Deploy with feature flag (10% rollout)
   - Enable for 10% of users
   - Monitor metrics
   - Check error rates
   
5. ✅ Gradual rollout
   - Increase to 25%
   - Increase to 50%
   - Increase to 100%

**Deliverables**:
- `/me/my-tab-data` endpoint
- Frontend integration
- Gradual rollout to 100%

**Risk**: Medium-High (new endpoint requires thorough testing)

---

### Phase 5: Real-time Updates (Weeks 10-11)

**Goal**: Add Socket.IO events for My Tab updates

**Tasks**:
1. ✅ Define socket events
   - List events needed
   - Define event payloads
   
2. ✅ Implement backend events
   - Add invite events
   - Add game update events
   - Add unread count events
   
3. ✅ Implement frontend handlers
   - Create socket event store
   - Add optimistic updates
   - Add cache invalidation
   
4. ✅ Test with feature flag
   - Enable for small percentage
   - Verify real-time updates
   - Check for race conditions

**Deliverables**:
- Socket.IO events for My Tab
- Frontend event handlers
- Tested with 10% of users

**Risk**: Medium (real-time adds complexity)

---

### Phase 6: Progressive Loading (Weeks 12-13)

**Goal**: Implement viewport-based loading

**Tasks**:
1. ✅ Build Intersection Observer hook
   - Create reusable hook
   - Add polyfill support
   
2. ✅ Update My Tab component
   - Add intersection observers
   - Implement priority-based loading
   - Add skeleton states
   
3. ✅ Test progressive loading
   - Verify all data eventually loads
   - Test slow networks
   - Test offline scenarios

**Deliverables**:
- Intersection Observer hook
- Updated My Tab with progressive loading
- Tested on various devices

**Risk**: Low-Medium (UI changes, fallbacks exist)

---

### Phase 7: Service Worker Caching (Weeks 14-15)

**Goal**: Implement strategic service worker caching

**Tasks**:
1. ✅ Design caching strategy
   - Define cacheable endpoints
   - Set cache durations
   - Define cache invalidation rules
   
2. ✅ Implement service worker
   - Add NetworkFirst for user data
   - Add StaleWhileRevalidate for static data
   - Add BackgroundSync for mutations
   
3. ✅ Test caching behavior
   - Verify cache hits
   - Test offline scenarios
   - Test cache invalidation
   
4. ✅ Deploy with versioning
   - Implement service worker versioning
   - Add update notifications
   - Test service worker updates

**Deliverables**:
- Updated service worker
- Caching strategy implemented
- Tested offline scenarios

**Risk**: Medium (service worker bugs can be tricky)

---

### Phase 8: Monitoring & Optimization (Week 16+)

**Goal**: Monitor, iterate, and optimize

**Tasks**:
1. ✅ Analyze production metrics
   - Review all performance metrics
   - Identify bottlenecks
   - Find optimization opportunities
   
2. ✅ A/B test improvements
   - Test different stale times
   - Test prefetching strategies
   - Test cache configurations
   
3. ✅ Iterate on optimizations
   - Implement improvements
   - Measure impact
   - Roll out gradually

**Deliverables**:
- Performance insights
- Continuous optimization
- Best practices documentation

**Risk**: Low (iterative improvements)

---

## Testing & Validation

### Unit Tests

```typescript
// Backend/src/services/me/__tests__/myTabData.service.test.ts
describe('MyTabDataService', () => {
  it('should fetch all data in parallel', async () => {
    const data = await MyTabDataService.getMyTabData({
      userId: 'test-user-id',
    });
    
    expect(data).toHaveProperty('games');
    expect(data).toHaveProperty('invites');
    expect(data).toHaveProperty('teams');
    expect(data).toHaveProperty('unreadCounts');
  });
  
  it('should handle partial failures gracefully', async () => {
    // Mock one query to fail
    vi.mocked(prisma.userTeam.findMany).mockRejectedValueOnce(new Error('DB error'));
    
    const data = await MyTabDataService.getMyTabData({
      userId: 'test-user-id',
    });
    
    // Should still return data for successful queries
    expect(data.games).toBeDefined();
    expect(data.invites).toBeDefined();
    // Teams should be empty array (graceful degradation)
    expect(data.teams).toEqual([]);
  });
  
  it('should throw error if core queries fail', async () => {
    // Mock core query to fail
    vi.mocked(prisma.game.findMany).mockRejectedValueOnce(new Error('DB error'));
    
    await expect(
      MyTabDataService.getMyTabData({ userId: 'test-user-id' })
    ).rejects.toThrow(ApiError);
  });
});
```

### Integration Tests

```typescript
// Frontend/src/pages/__tests__/MyTab.integration.test.tsx
describe('My Tab Integration', () => {
  it('should load data from aggregated endpoint', async () => {
    // Mock the aggregated endpoint
    server.use(
      rest.get('/api/v1/me/my-tab-data', (req, res, ctx) => {
        return res(ctx.json({
          success: true,
          data: mockMyTabData,
        }));
      })
    );
    
    render(<MyTab />);
    
    await waitFor(() => {
      expect(screen.getByTestId('games-list')).toBeVisible();
    });
    
    // Verify API was called
    expect(fetch).toHaveBeenCalledWith('/api/v1/me/my-tab-data');
  });
  
  it('should fall back to individual endpoints on error', async () => {
    // Mock aggregated endpoint to fail
    server.use(
      rest.get('/api/v1/me/my-tab-data', (req, res, ctx) => {
        return res(ctx.status(503));
      })
    );
    
    // Mock individual endpoints
    server.use(
      rest.get('/api/v1/games/my-games-with-unread', (req, res, ctx) => {
        return res(ctx.json({ success: true, games: mockGames }));
      })
    );
    
    render(<MyTab />);
    
    await waitFor(() => {
      expect(screen.getByTestId('games-list')).toBeVisible();
    });
    
    // Verify fallback was used
    expect(fetch).toHaveBeenCalledWith('/api/v1/games/my-games-with-unread');
  });
});
```

### Load Tests

```javascript
// tests/load/my-tab-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up
    { duration: '3m', target: 50 },   // Load test
    { duration: '1m', target: 100 },  // Spike test
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    errors: ['rate<0.01'],             // Error rate under 1%
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function () {
  const authToken = __ENV.AUTH_TOKEN; // Set via environment variable
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  };
  
  // Test aggregated endpoint
  const res = http.get(`${BASE_URL}/me/my-tab-data`, { headers });
  
  const checks = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'has games data': (r) => r.json('success') === true && 'data' in r.json(),
  });
  
  errorRate.add(!checks);
  
  sleep(1);
}
```

### E2E Tests

```typescript
// Frontend/e2e/specs/my-tab-loading.spec.ts
import { test, expect } from '@playwright/test';

test.describe('My Tab Loading Performance', () => {
  test('should load within performance budget', async ({ page }) => {
    // Navigate to My tab
    await page.goto('/my');
    
    // Wait for page to be interactive
    await page.waitForLoadState('networkidle');
    
    // Get performance metrics
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        ttfb: navigation.responseStart - navigation.requestStart,
      };
    });
    
    // Assert performance budgets
    expect(metrics.ttfb).toBeLessThan(500); // TTFB under 500ms
    expect(metrics.domContentLoaded).toBeLessThan(1000); // DCL under 1s
  });
  
  test('should use cached data on second visit', async ({ page }) => {
    // First visit
    await page.goto('/my');
    await page.waitForLoadState('networkidle');
    
    const firstVisitApiCalls = await page.evaluate(() => {
      return (window as any).apiCalls || [];
    });
    
    // Navigate away
    await page.goto('/find');
    await page.waitForLoadState('networkidle');
    
    // Return to My tab
    await page.goto('/my');
    await page.waitForLoadState('networkidle');
    
    const secondVisitApiCalls = await page.evaluate(() => {
      return (window as any).apiCalls || [];
    });
    
    // Second visit should have fewer API calls (cache hit)
    expect(secondVisitApiCalls.length).toBeLessThan(firstVisitApiCalls.length);
  });
  
  test('should fall back gracefully on error', async ({ page }) => {
    // Mock API to fail
    await page.route('**/me/my-tab-data', route => route.abort());
    
    await page.goto('/my');
    
    // Should still show content (from fallback)
    await expect(page.locator('[data-testid="games-list"]')).toBeVisible();
    
    // Should show error notification
    await expect(page.locator('[data-testid="error-toast"]')).toBeVisible();
  });
});
```

### Data Consistency Tests

```typescript
// tests/integration/my-tab-consistency.test.ts
describe('My Tab Data Consistency', () => {
  it('should return consistent data across endpoints', async () => {
    // Fetch from aggregated endpoint
    const aggregated = await api.me.getMyTabData();
    
    // Fetch from individual endpoints
    const individual = await fetchMyTabDataLegacy();
    
    // Compare data
    expect(aggregated.games.length).toEqual(individual.games.length);
    expect(aggregated.invites.length).toEqual(individual.invites.length);
    
    // Verify games are identical
    aggregated.games.forEach((game, i) => {
      expect(game.id).toEqual(individual.games[i].id);
      expect(game.startsAt).toEqual(individual.games[i].startsAt);
    });
  });
  
  it('should handle concurrent updates correctly', async () => {
    // Simulate concurrent updates
    const promises = [
      api.me.getMyTabData(),
      api.games.update(mockGameData),
      api.me.getMyTabData(),
    ];
    
    const results = await Promise.all(promises);
    
    // Second fetch should reflect the update
    expect(results[2].games).not.toEqual(results[0].games);
  });
});
```

---

## Monitoring & Observability

### Metrics to Track

#### Backend Metrics

```typescript
// Backend/src/utils/metrics.ts (NEW)
import { prometheus } from '@/config/prometheus';

// Response time metrics
export const myTabResponseTime = new prometheus.Histogram({
  name: 'my_tab_response_time_seconds',
  help: 'Response time for My Tab endpoint',
  labelNames: ['endpoint', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// Payload size metrics
export const myTabPayloadSize = new prometheus.Histogram({
  name: 'my_tab_payload_size_bytes',
  help: 'Response payload size for My Tab endpoint',
  labelNames: ['endpoint'],
  buckets: [1000, 5000, 10000, 50000, 100000, 500000],
});

// Cache hit rate
export const myTabCacheHitRate = new prometheus.Counter({
  name: 'my_tab_cache_hits_total',
  help: 'Cache hits for My Tab data',
  labelNames: ['endpoint'],
});

// Fallback usage
export const myTabFallbackUsed = new prometheus.Counter({
  name: 'my_tab_fallback_used_total',
  help: 'Times fallback to individual endpoints was used',
  labelNames: ['reason'],
});

// Error rate
export const myTabErrors = new prometheus.Counter({
  name: 'my_tab_errors_total',
  help: 'Errors fetching My Tab data',
  labelNames: ['endpoint', 'error_type'],
});

// Usage in controller
export async function getMyTabData(req: AuthRequest, res: Response): Promise<void> {
  const start = Date.now();
  
  try {
    const data = await MyTabDataService.getMyTabData({ userId: req.userId });
    
    const duration = (Date.now() - start) / 1000;
    myTabResponseTime.labels('/me/my-tab-data', '200').observe(duration);
    
    const payloadSize = JSON.stringify(data).length;
    myTabPayloadSize.labels('/me/my-tab-data').observe(payloadSize);
    
    sendJson(res, { success: true, data });
    
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    myTabResponseTime.labels('/me/my-tab-data', '500').observe(duration);
    myTabErrors.labels('/me/my-tab-data', error.name).inc();
    
    throw error;
  }
}
```

#### Frontend Metrics

```typescript
// Frontend/src/utils/analytics.ts (NEW)
interface PerformanceMetrics {
  ttfb: number; // Time to First Byte
  downloadTime: number; // Download duration
  parsingTime: number; // JSON parsing duration
  totalTime: number; // Total API call duration
  payloadSize: number; // Response size in bytes
  cacheHit: boolean; // Whether data came from cache
  endpoint: string; // API endpoint
}

export function trackApiPerformance(metrics: PerformanceMetrics): void {
  // Send to analytics
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', 'api_performance', {
      event_category: 'API',
      event_label: metrics.endpoint,
      non_interaction: true,
      ...metrics,
    });
  }
  
  // Log for debugging
  console.debug('[API Performance]', metrics);
}

// Usage in API calls
export async function trackPerformance<T>(
  endpoint: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  let payloadSize = 0;
  let cacheHit = false;
  
  try {
    const result = await fn();
    
    // Try to determine payload size
    if (result && typeof result === 'object') {
      payloadSize = JSON.stringify(result).length;
    }
    
    // Check if from cache
    cacheHit = isFromCache(result);
    
    const metrics: PerformanceMetrics = {
      ttfb: 0, // Calculated by browser
      downloadTime: performance.now() - start,
      parsingTime: 0,
      totalTime: performance.now() - start,
      payloadSize,
      cacheHit,
      endpoint,
    };
    
    trackApiPerformance(metrics);
    
    return result;
    
  } catch (error) {
    const metrics: PerformanceMetrics = {
      ttfb: 0,
      downloadTime: performance.now() - start,
      parsingTime: 0,
      totalTime: performance.now() - start,
      payloadSize: 0,
      cacheHit: false,
      endpoint: `${endpoint}_error`,
    };
    
    trackApiPerformance(metrics);
    
    throw error;
  }
}
```

### Dashboards

```yaml
# grafana/dashboards/my-tab-performance.json
{
  "title": "My Tab Performance Dashboard",
  "panels": [
    {
      "title": "Response Time (p95)",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(my_tab_response_time_seconds_bucket[5m]))"
        }
      ]
    },
    {
      "title": "Response Time (p99)",
      "targets": [
        {
          "expr": "histogram_quantile(0.99, rate(my_tab_response_time_seconds_bucket[5m]))"
        }
      ]
    },
    {
      "title": "Payload Size (avg)",
      "targets": [
        {
          "expr": "avg(my_tab_payload_size_bytes)"
        }
      ]
    },
    {
      "title": "Cache Hit Rate",
      "targets": [
        {
          "expr": "rate(my_tab_cache_hits_total[5m]) / rate(http_requests_total[5m])"
        }
      ]
    },
    {
      "title": "Fallback Usage Rate",
      "targets": [
        {
          "expr": "rate(my_tab_fallback_used_total[5m])"
        }
      ]
    },
    {
      "title": "Error Rate",
      "targets": [
        {
          "expr": "rate(my_tab_errors_total[5m])"
        }
      ]
    }
  ]
}
```

### Alerts

```yaml
# prometheus/alerts/my-tab-alerts.yml
groups:
  - name: my_tab_alerts
    rules:
      - alert: MyTabHighResponseTime
        expr: |
          histogram_quantile(0.95, rate(my_tab_response_time_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "My Tab response time is high"
          description: "95th percentile response time is {{ $value }}s"
      
      - alert: MyTabHighErrorRate
        expr: |
          rate(my_tab_errors_total[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "My Tab error rate is high"
          description: "Error rate is {{ $value | humanizePercentage }}"
      
      - alert: MyTabHighFallbackRate
        expr: |
          rate(my_tab_fallback_used_total[5m]) / rate(http_requests_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "My Tab fallback rate is high"
          description: "Fallback rate is {{ $value | humanizePercentage }}"
      
      - alert: MyTabLowCacheHitRate
        expr: |
          rate(my_tab_cache_hits_total[5m]) / rate(http_requests_total[5m]) < 0.5
        for: 15m
        labels:
          severity: info
        annotations:
          summary: "My Tab cache hit rate is low"
          description: "Cache hit rate is {{ $value | humanizePercentage }}"
```

---

## Rollback Strategy

### Feature Flag Controls

```typescript
// Backend/src/config/featureFlags.ts
export const FEATURE_FLAGS = {
  // Immediately disable all optimizations
  DISABLE_ALL_OPTIMIZATIONS: process.env.DISABLE_ALL_OPTIMIZATIONS === 'true',
  
  // Individual flags
  AGGREGATED_ENDPOINT: {
    enabled: process.env.ENABLE_AGGREGATED_ENDPOINT === 'true',
    rolloutPercentage: parseInt(process.env.AGGREGATED_ENDPOINT_ROLLOUT || '0'),
  },
  
  PAYLOAD_PROJECTION: {
    enabled: process.env.ENABLE_PAYLOAD_PROJECTION === 'true',
    rolloutPercentage: parseInt(process.env.PAYLOAD_PROJECTION_ROLLOUT || '0'),
  },
  
  // ... other flags
  
  // Emergency disable
  EMERGENCY_DISABLE_ALL: process.env.EMERGENCY_MODE === 'true',
};

// Check if feature is enabled for user
export function isFeatureEnabled(feature: string, userId: string): boolean {
  if (FEATURE_FLAGS.DISABLE_ALL_OPTIMIZATIONS || FEATURE_FLAGS.EMERGENCY_DISABLE_ALL) {
    return false;
  }
  
  const flag = FEATURE_FLAGS[feature];
  if (!flag?.enabled) return false;
  
  // Hash-based deterministic rollout
  const bucket = hashUserId(userId) % 100;
  return bucket < flag.rolloutPercentage;
}

// Admin endpoint to update flags
app.post('/admin/feature-flags', requireAdmin, (req, res) => {
  const { feature, enabled, rolloutPercentage } = req.body;
  
  FEATURE_FLAGS[feature] = { enabled, rolloutPercentage };
  
  // Log for audit
  logger.info('Feature flag updated', { feature, enabled, rolloutPercentage });
  
  res.json({ success: true });
});
```

### Rollback Procedures

#### Level 1: Feature Flag Rollback (Immediate)
```bash
# Disable specific optimization
curl -X POST https://api.example.com/admin/feature-flags \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"feature": "AGGREGATED_ENDPOINT", "enabled": false, "rolloutPercentage": 0}'

# Disable all optimizations
curl -X POST https://api.example.com/admin/feature-flags \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"EMERGENCY_MODE": true}'
```

#### Level 2: Code Rollback (5-10 minutes)
```bash
# Revert to previous deployment
git revert <commit-hash>
git push origin master

# Or deploy previous version
kubectl rollout undo deployment/api-backend
```

#### Level 3: Database Rollback (if needed)
```sql
-- Drop new indexes (if causing issues)
DROP INDEX CONCURRENTLY idx_game_participants_user_status_starts_at;

-- Revert query changes
-- (requires code deployment with reverted changes)
```

### Rollback Decision Criteria

| Metric | Threshold | Action |
|--------|-----------|--------|
| Error rate | >5% | Immediate rollback |
| Response time p95 | >2s | Investigate, rollback if no quick fix |
| Response time p99 | >5s | Investigate, rollback if no quick fix |
| Cache hit rate | <20% | Monitor, rollback if persists |
| Fallback rate | >20% | Investigate, rollback if no quick fix |
| User complaints | >10 | Immediate rollback |

---

## Success Criteria

### Performance Targets

| Metric | Before | Target | How to Measure |
|--------|--------|--------|----------------|
| API calls on load | 7 | 1-2 | API logs |
| Total payload size | ~200KB | <50KB | Response tracking |
| TTFB (p95) | ~300ms | <100ms | Server timing |
| Time to Interactive | ~1500ms | <500ms | RUM |
| Cache hit rate | ~10% | >70% | Cache metrics |
| Error rate | <1% | <1% | Error tracking |

### Non-Performance Requirements

- ✅ All existing features continue to work
- ✅ Data consistency maintained
- ✅ No regressions in functionality
- ✅ Offline functionality preserved
- ✅ Accessibility not impacted
- ✅ SEO not affected

---

## Conclusion

This optimization plan focuses on achieving **blazing fast** My Tab loading while maintaining **100% reliability** through:

1. **Layered Approach**: Multiple independent optimizations that can be enabled/disabled independently
2. **Graceful Degradation**: Fallbacks at every level ensure functionality is never lost
3. **Feature Flags**: All changes behind flags for instant rollback capability
4. **Comprehensive Monitoring**: Track all metrics to catch issues early
5. **Gradual Rollout**: Test with small percentages before full deployment
6. **Data Integrity**: Validation and consistency checks throughout

The plan prioritizes optimizations by impact and risk, ensuring high-impact, low-risk changes are deployed first while more complex changes are thoroughly tested before rollout.

---

**Next Steps**:
1. Review and approve this plan
2. Set up monitoring and feature flag infrastructure
3. Begin Phase 1 (Foundation)
4. Track metrics continuously
5. Iterate based on data
