# Game Results Refactoring - Migration Notes

## Overview

The game results system has been completely refactored to support progressive result saving and more complex game structures (rounds, matches, teams, sets).

## Database Changes

### Removed Models
- `GameResult` - Old monolithic result model

### New Models

1. **Round**
   - Belongs to Game
   - Has roundNumber (unique per game)
   - Contains multiple matches
   - Has status: IN_PROGRESS, COMPLETED, CANCELLED
   - Has outcomes per player

2. **Match**
   - Belongs to Round
   - Has matchNumber
   - Contains teams and sets
   - Has optional winnerId
   - Has status: IN_PROGRESS, COMPLETED, CANCELLED

3. **Team**
   - Belongs to Match
   - Has teamNumber (1 or 2, or more if needed)
   - Contains players via TeamPlayer relation
   - Has score field

4. **TeamPlayer**
   - Many-to-many relation between Team and User
   - Links players to teams for each match

5. **Set**
   - Belongs to Match
   - Has setNumber
   - Has teamAScore and teamBScore (0-100)

6. **RoundOutcome**
   - Belongs to Round
   - Tracks level change per player per round
   - Unique per (roundId, userId)

7. **GameOutcome**
   - Belongs to Game
   - Tracks final level/reliability changes per player
   - Replaces old GameResult
   - Includes position, isWinner, pointsEarned

### Schema Relations

```
User
  ├── teamPlayers (TeamPlayer[])
  ├── roundOutcomes (RoundOutcome[])
  └── gameOutcomes (GameOutcome[])

Game
  ├── rounds (Round[])
  └── outcomes (GameOutcome[])

Round
  ├── game (Game)
  ├── matches (Match[])
  └── outcomes (RoundOutcome[])

Match
  ├── round (Round)
  ├── teams (Team[])
  ├── sets (Set[])
  └── winner (Team, optional)

Team
  ├── match (Match)
  ├── players (TeamPlayer[])
  └── wonMatches (Match[])

TeamPlayer
  ├── team (Team)
  └── user (User)

Set
  └── match (Match)

RoundOutcome
  ├── round (Round)
  └── user (User)

GameOutcome
  ├── game (Game)
  └── user (User)
```

## API Changes

### Old Endpoints (Removed)
- `POST /api/game-results/:gameId` - Submit results
- `PUT /api/game-results/:gameId` - Update results
- `GET /api/game-results/:gameId` - Get results
- `DELETE /api/game-results/:gameId` - Delete results

### New Endpoints

1. **POST /api/results/game/:gameId**
   - Progressive result saving
   - Can be called multiple times during game
   - Include `finalOutcomes` to complete game

2. **GET /api/results/game/:gameId**
   - Get all game results with rounds, matches, outcomes

3. **GET /api/results/game/:gameId/generate**
   - Auto-calculate outcomes from saved results
   - Returns suggested finalOutcomes

4. **GET /api/results/round/:roundId**
   - Get results for specific round

5. **GET /api/results/match/:matchId**
   - Get results for specific match

6. **DELETE /api/results/game/:gameId**
   - Delete all results and revert rating changes

## Code Changes

### Deleted Files
- `src/controllers/gameResult.controller.ts`
- `src/routes/gameResult.routes.ts`
- `src/services/rating.service.ts`

### New Files

#### Controllers
- `src/controllers/results.controller.ts` - Main results endpoints

#### Services
- `src/services/results.service.ts` - Core result saving/retrieval
- `src/services/results/rating.service.ts` - Rating calculation logic
- `src/services/results/calculator.service.ts` - Game outcome calculation
- `src/services/results/outcomes.service.ts` - Auto-generate outcomes

#### Routes
- `src/routes/results.routes.ts` - Results API routes

#### Types
- `src/types/results.types.ts` - TypeScript interfaces for results

### Modified Files

1. **src/routes/index.ts**
   - Changed from `gameResultRoutes` to `resultsRoutes`
   - Changed route from `/game-results` to `/results`

2. **src/controllers/user.controller.ts**
   - Updated `gameResult` references to `gameOutcome`

3. **src/controllers/ranking.controller.ts**
   - Updated `gameResult` references to `gameOutcome`

4. **src/services/game.service.ts**
   - Updated `results` relation to `outcomes`
   - Added `rounds` relation with full nesting

5. **prisma/schema.prisma**
   - Removed `GameResult` model
   - Added new models (Round, Match, Team, TeamPlayer, Set, RoundOutcome, GameOutcome)
   - Updated User relations
   - Updated Game relations
   - Added new enums (RoundStatus, MatchStatus)

## Migration Steps

Since the database was dropped and this is a clean start:

1. **Update Schema**: ✅ Done
2. **Generate Prisma Client**: ✅ Done (`npx prisma generate`)
3. **Push Schema to DB**: ✅ Done (`npx prisma db push`)
4. **Build TypeScript**: ✅ Done (`npm run build`)

## Key Features

### Progressive Saving
- Save results during gameplay, not just at the end
- Each round/match can be saved independently
- Only finalize with `finalOutcomes` when game is complete

### Flexible Team Structure
- Teams can be different for each match (Americano style)
- Or fixed throughout game (Classic style)
- Support for 1-2 players per team (extensible to more)

### Multiple Game Types
- **Classic**: Fixed teams, winner/loser based
- **Americano/Mexicano**: Mixed teams, score delta based
- **Tournament**: Multiple rounds with cumulative outcomes

### Auto-Calculation
- Enter scores, system calculates ratings
- GET `/api/results/game/:gameId/generate` endpoint
- Supports different calculation methods per game type

### Statistics & History
- Round-by-round outcomes stored
- Final game outcomes stored separately
- Can reconstruct game progression for charts/analytics

## Testing Checklist

- [ ] Test progressive saving (save multiple times during game)
- [ ] Test final outcome submission
- [ ] Test auto-generate outcomes
- [ ] Test rating updates when game affects rating
- [ ] Test rating rollback on result deletion
- [ ] Test different game types (Classic, Americano)
- [ ] Test tournament with multiple rounds
- [ ] Test permissions (owner/admin/resultsByAnyone)
- [ ] Test mixed teams (different players each round)
- [ ] Test multiple sets per match

## Frontend Integration Notes

The frontend will need updates to:
1. Use new API endpoints (`/api/results/*`)
2. Support progressive result entry
3. Display round-by-round results
4. Show match structure (teams, sets)
5. Handle in-progress games vs completed games
6. Use auto-generate endpoint for quick result entry

## Rollback Plan

If rollback is needed:
1. Restore previous schema from git history
2. Run `npx prisma db push --force-reset`
3. Restore old controller/service files
4. Update routes/index.ts
5. Rebuild and restart

## Performance Considerations

- Queries include proper relations for efficiency
- Indexes on roundNumber, matchNumber, setNumber
- Unique constraints on (gameId, roundNumber), (matchId, setNumber), etc.
- Cascade deletes configured properly
- Transaction usage for atomic operations

## Security Considerations

- Permission checks maintained (owner/admin/resultsByAnyone)
- Optional auth on GET endpoints (public can view)
- User rating updates only if game.affectsRating
- Proper rollback on result deletion to prevent rating manipulation

