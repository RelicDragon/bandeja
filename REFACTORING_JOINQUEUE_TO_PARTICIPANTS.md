# JoinQueue to Non-Playing Participants Refactoring Plan

## Overview

Replace the `JoinQueue` table with `GameParticipant` entries where `role: PARTICIPANT` and `isPlaying: false`. The frontend continues to display these as a "join queue" for UX. Maintain backward compatibility for 1–2 weeks, then remove the old system.

## Migration Strategy

### Phase 1: Dual-write period (Week 1-2)
- New system: Create non-playing participants for new queue entries
- Old system: Keep `JoinQueue` table and service (marked for removal)
- Both systems work in parallel
- Frontend can use either

### Phase 2: Cleanup (After Week 2)
- Remove `JoinQueue` table and service
- Remove compatibility code marked with `// TODO: Remove after [DATE]`

## Implementation Date Tracking

Set a constant at the top of files with compatibility code:

```typescript
// TODO: Remove after [DATE + 2 weeks] - Backward compatibility for JoinQueue migration
const COMPATIBILITY_REMOVAL_DATE = '2024-XX-XX'; // Set actual date when starting implementation
```

## Database Migration

### Step 1: Migrate existing JoinQueue entries

Create migration file: `Backend/prisma/migrations/XXXXXX_migrate_joinqueue_to_participants/migration.sql`

```sql
-- Migrate existing JoinQueue entries to GameParticipant
-- Only migrate PENDING entries that don't already have a participant record
INSERT INTO "GameParticipant" ("id", "userId", "gameId", "role", "isPlaying", "joinedAt", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid()::text,
  jq."userId",
  jq."gameId",
  'PARTICIPANT',
  false,
  jq."createdAt",
  jq."createdAt",
  jq."updatedAt"
FROM "JoinQueue" jq
WHERE jq."status" = 'PENDING'
AND NOT EXISTS (
  SELECT 1 FROM "GameParticipant" gp 
  WHERE gp."userId" = jq."userId" 
  AND gp."gameId" = jq."gameId"
);
```

**Note:** Do not drop the `JoinQueue` table yet. Keep it during the transition period.

## Backend Implementation

### 1. Update `ParticipantService`

**File:** `Backend/src/services/game/participant.service.ts`

#### Add new method: `addToQueueAsParticipant()`

```typescript
// TODO: Remove after [DATE + 2 weeks] - Backward compatibility: also create JoinQueue entry
static async addToQueueAsParticipant(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: {
        where: { isPlaying: true }
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  await validatePlayerCanJoinGame(game, userId);

  const existingParticipant = await prisma.gameParticipant.findFirst({
    where: { gameId, userId },
  });

  if (existingParticipant) {
    if (existingParticipant.isPlaying) {
      throw new ApiError(400, 'Already a playing participant');
    }
    // Already in queue as non-playing participant
    throw new ApiError(400, 'games.alreadyInJoinQueue');
  }

  try {
    await prisma.$transaction(async (tx) => {
      const currentGame = await tx.game.findUnique({
        where: { id: gameId },
      });

      if (!currentGame) {
        throw new ApiError(404, 'Game not found');
      }

      validateGameCanAcceptParticipants(currentGame);

      // NEW: Create non-playing participant
      await tx.gameParticipant.create({
        data: {
          userId,
          gameId,
          role: 'PARTICIPANT',
          isPlaying: false,
        },
      });

      // TODO: Remove after [DATE + 2 weeks] - Backward compatibility: also create JoinQueue entry
      try {
        await tx.joinQueue.create({
          data: {
            userId,
            gameId,
            status: 'PENDING',
          },
        });
      } catch (error: any) {
        // Ignore if JoinQueue entry already exists or table doesn't exist
        if (error.code !== 'P2002' && error.code !== 'P2021') {
          console.warn('Failed to create backward compatibility JoinQueue entry:', error);
        }
      }
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      const existingParticipant = await prisma.gameParticipant.findFirst({
        where: { gameId, userId },
      });
      if (existingParticipant && !existingParticipant.isPlaying) {
        throw new ApiError(400, 'games.alreadyInJoinQueue');
      }
    }
    throw error;
  }

  await createSystemMessageWithNotification(
    gameId,
    SystemMessageType.USER_JOINED_JOIN_QUEUE,
    userId,
    ChatType.ADMINS
  );

  await InviteService.deleteInvitesForUserInGame(gameId, userId);
  await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
  return 'games.addedToJoinQueue';
}
```

#### Update `joinGame()` method

Replace lines 55-63:

```typescript
const joinResult = await validatePlayerCanJoinGame(game, userId);

if (!joinResult.canJoin && joinResult.shouldQueue) {
  // NEW: Create non-playing participant instead of joinQueue
  return await this.addToQueueAsParticipant(gameId, userId);
}

if (!game.allowDirectJoin) {
  // NEW: Create non-playing participant instead of joinQueue
  return await this.addToQueueAsParticipant(gameId, userId);
}
```

Also update the existing participant check (lines 40-52):

```typescript
if (existingParticipant) {
  if (existingParticipant.isPlaying) {
    throw new ApiError(400, 'Already joined this game as a player');
  }

  // Non-playing participant trying to become playing
  await prisma.$transaction(async (tx) => {
    const currentGame = await fetchGameWithPlayingParticipants(tx, gameId);
    const joinResult = await validatePlayerCanJoinGame(currentGame, userId);

    if (!joinResult.canJoin && joinResult.shouldQueue) {
      throw new ApiError(400, joinResult.reason || 'errors.games.cannotAddPlayer');
    }

    // Check if allowDirectJoin allows self-promotion
    if (!currentGame.allowDirectJoin) {
      throw new ApiError(400, 'errors.games.directJoinNotAllowed');
    }

    await addOrUpdateParticipant(tx, gameId, userId);
  });

  await performPostJoinOperations(gameId, userId);
  return 'games.joinedSuccessfully';
}
```

#### Add new method: `acceptNonPlayingParticipant()`

```typescript
static async acceptNonPlayingParticipant(gameId: string, currentUserId: string, queueUserId: string) {
  const participant = await prisma.gameParticipant.findFirst({
    where: {
      gameId,
      userId: queueUserId,
      isPlaying: false,
      role: 'PARTICIPANT',
    },
  });

  if (!participant) {
    throw new ApiError(404, 'games.joinQueueRequestNotFound');
  }

  await prisma.$transaction(async (tx: any) => {
    const currentGame = await fetchGameWithPlayingParticipants(tx, gameId);

    const currentParticipant = await tx.gameParticipant.findFirst({
      where: { gameId, userId: currentUserId },
    });

    if (!canUserManageQueue(currentParticipant, currentGame)) {
      throw new ApiError(403, 'games.notAuthorizedToAcceptJoinQueue');
    }

    const joinResult = await validatePlayerCanJoinGame(currentGame, queueUserId);
    if (!joinResult.canJoin) {
      throw new ApiError(400, joinResult.reason || 'errors.games.cannotAddPlayer');
    }

    const currentParticipantEntry = await tx.gameParticipant.findFirst({
      where: {
        gameId,
        userId: queueUserId,
        isPlaying: false,
      },
    });

    if (!currentParticipantEntry) {
      throw new ApiError(404, 'games.joinQueueRequestNotFound');
    }

    // Update to playing participant
    await tx.gameParticipant.update({
      where: { id: currentParticipantEntry.id },
      data: { isPlaying: true },
    });

    // TODO: Remove after [DATE + 2 weeks] - Backward compatibility: delete JoinQueue entry
    try {
      await tx.joinQueue.deleteMany({
        where: {
          userId: queueUserId,
          gameId,
          status: 'PENDING',
        },
      });
    } catch (error: any) {
      // Ignore if JoinQueue table doesn't exist
      if (error.code !== 'P2021') {
        console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
      }
    }
  });

  await ParticipantMessageHelper.sendJoinMessage(gameId, queueUserId);
  await InviteService.deleteInvitesForUserInGame(gameId, queueUserId);
  await GameService.updateGameReadiness(gameId);
  await ParticipantMessageHelper.emitGameUpdate(gameId, currentUserId);
  return 'games.joinRequestAccepted';
}
```

#### Add new method: `declineNonPlayingParticipant()`

```typescript
static async declineNonPlayingParticipant(gameId: string, currentUserId: string, queueUserId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      anyoneCanInvite: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const currentParticipant = await prisma.gameParticipant.findFirst({
    where: { gameId, userId: currentUserId },
  });

  if (!canUserManageQueue(currentParticipant, game)) {
    throw new ApiError(403, 'games.notAuthorizedToDeclineJoinQueue');
  }

  const participant = await prisma.gameParticipant.findFirst({
    where: {
      gameId,
      userId: queueUserId,
      isPlaying: false,
      role: 'PARTICIPANT',
    },
  });

  if (!participant) {
    throw new ApiError(404, 'games.joinQueueRequestNotFound');
  }

  await prisma.gameParticipant.delete({
    where: { id: participant.id },
  });

  // TODO: Remove after [DATE + 2 weeks] - Backward compatibility: delete JoinQueue entry
  try {
    await prisma.joinQueue.deleteMany({
      where: {
        userId: queueUserId,
        gameId,
        status: 'PENDING',
      },
    });
  } catch (error: any) {
    if (error.code !== 'P2021') {
      console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
    }
  }

  await createSystemMessageWithNotification(
    gameId,
    SystemMessageType.USER_DECLINED_JOIN_QUEUE,
    queueUserId
  );

  await ParticipantMessageHelper.emitGameUpdate(gameId, currentUserId);
  await ParticipantMessageHelper.emitGameUpdateToUser(gameId, queueUserId);
  return 'games.joinRequestDeclined';
}
```

#### Add new method: `cancelNonPlayingParticipant()`

```typescript
static async cancelNonPlayingParticipant(gameId: string, userId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const participant = await prisma.gameParticipant.findFirst({
    where: {
      gameId,
      userId,
      isPlaying: false,
      role: 'PARTICIPANT',
    },
  });

  if (!participant) {
    throw new ApiError(404, 'games.joinQueueRequestNotFound');
  }

  await prisma.gameParticipant.delete({
    where: { id: participant.id },
  });

  // TODO: Remove after [DATE + 2 weeks] - Backward compatibility: delete JoinQueue entry
  try {
    await prisma.joinQueue.deleteMany({
      where: {
        userId,
        gameId,
        status: 'PENDING',
      },
    });
  } catch (error: any) {
    if (error.code !== 'P2021') {
      console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
    }
  }

  await createSystemMessageWithNotification(
    gameId,
    SystemMessageType.USER_CANCELED_JOIN_QUEUE,
    userId
  );

  await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
  return 'games.joinRequestCanceled';
}
```

#### Update `togglePlayingStatus()` method

Update lines 188-213:

```typescript
if (isPlaying && !participant.isPlaying) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: {
        where: { isPlaying: true },
        include: {
          user: {
            select: {
              gender: true,
            },
          },
        },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  // NEW: Check if allowDirectJoin allows self-promotion
  if (!game.allowDirectJoin) {
    // Only owner/admin can accept non-playing participants when allowDirectJoin is false
    const isOwnerOrAdmin = participant.role === 'OWNER' || participant.role === 'ADMIN';
    if (!isOwnerOrAdmin) {
      throw new ApiError(403, 'errors.games.directJoinNotAllowed');
    }
  }

  const joinResult = await validatePlayerCanJoinGame(game, userId);
  if (!joinResult.canJoin) {
    throw new ApiError(400, joinResult.reason || 'errors.games.cannotJoin');
  }
}
```

Update lines 220-222:

```typescript
if (isPlaying) {
  await InviteService.deleteInvitesForUserInGame(gameId, userId);
  
  // TODO: Remove after [DATE + 2 weeks] - Backward compatibility: delete JoinQueue entry
  try {
    await prisma.joinQueue.deleteMany({
      where: {
        userId,
        gameId,
        status: 'PENDING',
      },
    });
  } catch (error: any) {
    if (error.code !== 'P2021') {
      console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
    }
  }
}
```

### 2. Update `JoinQueueService` (Mark for Removal)

**File:** `Backend/src/services/game/joinQueue.service.ts`

Add deprecation comments and delegate to new methods:

```typescript
// TODO: Remove after [DATE + 2 weeks] - This entire service is deprecated
// Use ParticipantService methods instead:
// - addToQueueAsParticipant() instead of addToQueue()
// - acceptNonPlayingParticipant() instead of acceptJoinQueue()
// - declineNonPlayingParticipant() instead of declineJoinQueue()
// - cancelNonPlayingParticipant() instead of cancelJoinQueue()

export class JoinQueueService {
  // TODO: Remove after [DATE + 2 weeks] - Use ParticipantService.addToQueueAsParticipant()
  static async addToQueue(gameId: string, userId: string) {
    // Delegate to new service for backward compatibility
    return await ParticipantService.addToQueueAsParticipant(gameId, userId);
  }

  // TODO: Remove after [DATE + 2 weeks] - Use ParticipantService.acceptNonPlayingParticipant()
  static async acceptJoinQueue(gameId: string, currentUserId: string, queueUserId: string) {
    return await ParticipantService.acceptNonPlayingParticipant(gameId, currentUserId, queueUserId);
  }

  // TODO: Remove after [DATE + 2 weeks] - Use ParticipantService.declineNonPlayingParticipant()
  static async declineJoinQueue(gameId: string, currentUserId: string, queueUserId: string) {
    return await ParticipantService.declineNonPlayingParticipant(gameId, currentUserId, queueUserId);
  }

  // TODO: Remove after [DATE + 2 weeks] - Use ParticipantService.cancelNonPlayingParticipant()
  static async cancelJoinQueue(gameId: string, userId: string) {
    return await ParticipantService.cancelNonPlayingParticipant(gameId, userId);
  }
}
```

### 3. Update `GameReadService`

**File:** `Backend/src/services/game/read.service.ts`

#### Add helper function to compute joinQueues

Add after `getGameInclude()` function (around line 177):

```typescript
// TODO: Remove after [DATE + 2 weeks] - Backward compatibility: compute joinQueues from participants
export function computeJoinQueuesFromParticipants(game: any): any[] {
  const nonPlayingParticipants = game.participants?.filter(
    (p: any) => !p.isPlaying && p.role === 'PARTICIPANT'
  ) || [];
  
  // Merge with old joinQueues for backward compatibility
  const oldJoinQueues = game.joinQueues || [];
  
  // Create map to avoid duplicates
  const queueMap = new Map();
  
  // Add non-playing participants
  nonPlayingParticipants.forEach((p: any) => {
    queueMap.set(p.userId, {
      id: p.id,
      userId: p.userId,
      gameId: p.gameId,
      status: 'PENDING' as const,
      createdAt: p.joinedAt,
      updatedAt: p.joinedAt,
      user: p.user,
    });
  });
  
  // Add old joinQueues that don't have corresponding participants
  oldJoinQueues.forEach((jq: any) => {
    if (!queueMap.has(jq.userId)) {
      queueMap.set(jq.userId, jq);
    }
  });
  
  return Array.from(queueMap.values()).sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
```

#### Update `getGameInclude()` to keep joinQueues

Keep the `joinQueues` include in `getGameInclude()` (lines 46-56) but add a comment:

```typescript
// TODO: Remove after [DATE + 2 weeks] - Backward compatibility: include JoinQueue
joinQueues: {
  where: {
    status: InviteStatus.PENDING,
  },
  include: {
    user: {
      select: USER_SELECT_FIELDS,
    },
  },
  orderBy: { createdAt: 'asc' },
},
```

#### Update `getGameById()` method

Update the return statement (around line 223):

```typescript
return {
  ...game,
  isClubFavorite,
  // TODO: Remove after [DATE + 2 weeks] - Backward compatibility: compute joinQueues from participants
  joinQueues: computeJoinQueuesFromParticipants(game),
};
```

### 4. Update Controllers

**File:** `Backend/src/controllers/game.controller.ts`

Update the three join queue controllers (lines 196-226):

```typescript
export const acceptJoinQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  
  // TODO: Remove after [DATE + 2 weeks] - Use ParticipantService directly
  const message = await ParticipantService.acceptNonPlayingParticipant(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const declineJoinQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  
  // TODO: Remove after [DATE + 2 weeks] - Use ParticipantService directly
  const message = await ParticipantService.declineNonPlayingParticipant(id, req.userId!, userId);

  res.json({
    success: true,
    message,
  });
});

export const cancelJoinQueue = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  
  // TODO: Remove after [DATE + 2 weeks] - Use ParticipantService directly
  const message = await ParticipantService.cancelNonPlayingParticipant(id, req.userId!);

  res.json({
    success: true,
    message,
  });
});
```

## Frontend Implementation

### 1. Update `GameDetails.tsx`

**File:** `Frontend/src/pages/GameDetails.tsx`

Update line 413:

```typescript
// TODO: Remove after [DATE + 2 weeks] - Backward compatibility: check both old joinQueues and new non-playing participants
const isInJoinQueue = 
  game?.participants.some(
    p => p.userId === user?.id && !p.isPlaying && p.role === 'PARTICIPANT'
  ) || 
  game?.joinQueues?.some(q => q.userId === user?.id && q.status === 'PENDING') || 
  false;
```

### 2. Update `GameParticipants.tsx`

**File:** `Frontend/src/components/GameDetails/GameParticipants.tsx`

Add a useMemo hook after line 66 to compute joinQueues:

```typescript
// TODO: Remove after [DATE + 2 weeks] - Backward compatibility: compute joinQueues from participants
const computedJoinQueues = useMemo(() => {
  // NEW: Get from non-playing participants
  const fromParticipants = game?.participants
    ?.filter(p => !p.isPlaying && p.role === 'PARTICIPANT')
    .map(p => ({
      id: p.id,
      userId: p.userId,
      gameId: p.gameId,
      status: 'PENDING' as const,
      createdAt: p.joinedAt,
      user: p.user,
    })) || [];
  
  // TODO: Remove after [DATE + 2 weeks] - Backward compatibility: merge with old joinQueues
  const oldJoinQueues = joinQueues || [];
  
  // Merge and deduplicate
  const queueMap = new Map();
  [...fromParticipants, ...oldJoinQueues].forEach(q => {
    if (!queueMap.has(q.userId)) {
      queueMap.set(q.userId, q);
    }
  });
  
  return Array.from(queueMap.values()).sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}, [game?.participants, joinQueues]);
```

Update line 442 to use `computedJoinQueues`:

```typescript
{computedJoinQueues.length > 0 && (
```

And update line 448:

```typescript
{computedJoinQueues.map((queue) => (
```

### 3. Update `GameChat.tsx`

**File:** `Frontend/src/pages/GameChat.tsx`

Update line 95:

```typescript
// TODO: Remove after [DATE + 2 weeks] - Backward compatibility: check both old joinQueues and new non-playing participants
const isInJoinQueue = 
  game?.participants.some(
    p => p.userId === user?.id && !p.isPlaying && p.role === 'PARTICIPANT'
  ) || 
  game?.joinQueues?.some(q => q.userId === user?.id && q.status === 'PENDING') || 
  false;
```

## Testing Checklist

### Phase 1 Testing (During Dual-Write Period)

- [ ] Test joining a game when `allowDirectJoin: false` - should create non-playing participant
- [ ] Test joining a full game - should create non-playing participant
- [ ] Test accepting a non-playing participant as owner/admin
- [ ] Test declining a non-playing participant as owner/admin
- [ ] Test canceling own non-playing participant entry
- [ ] Test `togglePlayingStatus` when `allowDirectJoin: true` - should allow self-promotion
- [ ] Test `togglePlayingStatus` when `allowDirectJoin: false` - should only allow owner/admin
- [ ] Verify old `JoinQueue` entries still work (backward compatibility)
- [ ] Verify frontend displays join queue correctly from both sources
- [ ] Verify system messages are sent correctly
- [ ] Verify notifications are sent correctly

### Phase 2 Testing (After Cleanup)

- [ ] Verify all `JoinQueue` references are removed
- [ ] Test all join queue flows work with only participants
- [ ] Verify no database queries reference `JoinQueue` table
- [ ] Verify frontend works without `joinQueues` field

## Cleanup Checklist (After 2 Weeks)

### Database

- [ ] Create migration to drop `JoinQueue` table
- [ ] Remove `JoinQueue` model from Prisma schema
- [ ] Run migration on production

### Backend

- [ ] Remove `JoinQueueService` file
- [ ] Remove `joinQueues` include from `getGameInclude()`
- [ ] Remove `computeJoinQueuesFromParticipants()` function
- [ ] Remove all `// TODO: Remove after [DATE + 2 weeks]` blocks
- [ ] Update all imports that reference `JoinQueueService`
- [ ] Remove `JoinQueue` imports from controllers

### Frontend

- [ ] Update `GameDetails.tsx` to only check participants
- [ ] Update `GameParticipants.tsx` to only use participants
- [ ] Update `GameChat.tsx` to only check participants
- [ ] Remove `JoinQueue` type from frontend types (optional)
- [ ] Remove all `// TODO: Remove after [DATE + 2 weeks]` blocks

## Key Implementation Notes

1. **Permission Logic**: Non-playing participants can become playing only if:
   - `game.allowDirectJoin === true` (self-promotion via `togglePlayingStatus`), OR
   - Owner/admin accepts them (via `acceptNonPlayingParticipant`)

2. **Backward Compatibility**: During the transition, both systems work:
   - New entries create both participant and JoinQueue (with error handling)
   - Reading merges both sources
   - Deleting removes from both sources (with error handling)

3. **Error Handling**: All backward compatibility code should gracefully handle:
   - `P2002` (unique constraint violation) - entry already exists
   - `P2021` (table doesn't exist) - table already dropped
   - Other errors should be logged but not break the flow

4. **System Messages**: Continue using the same system message types:
   - `USER_JOINED_JOIN_QUEUE`
   - `USER_DECLINED_JOIN_QUEUE`
   - `USER_CANCELED_JOIN_QUEUE`

5. **Frontend UX**: The frontend should continue to show "Join Queue" UI, but it's now backed by non-playing participants.

## Rollback Plan

If issues arise during Phase 1:

1. The old `JoinQueueService` methods are still available
2. Controllers can be reverted to use `JoinQueueService` directly
3. Database migration can be rolled back (entries remain in `JoinQueue`)
4. Frontend will continue to work with old `joinQueues` field

---

**This plan maintains backward compatibility while transitioning to the new system, with clear markers for removal after the transition period.**
