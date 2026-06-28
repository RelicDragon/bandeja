-- Migration: Add optimized indexes for My Tab queries
-- These indexes improve query performance for the My Tab data aggregation endpoint

-- Index for user's upcoming games query
-- Covers: WHERE participants.userId = ? AND participants.status IN (?, ?)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_GameParticipant_userId_status"
ON "GameParticipant"("userId", "status")
WHERE "status" IN ('PLAYING', 'INVITED', 'IN_QUEUE');

-- Index for games ordering by start time
-- Covers: ORDER BY startTime ASC WHERE status != 'ARCHIVED'
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_Game_startTime_status"
ON "Game"("startTime" ASC, "status")
WHERE "status" != 'ARCHIVED';

-- Index for active games lookups by club (for My Tab games list)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_Game_clubId_active"
ON "Game"("clubId")
WHERE "status" != 'ARCHIVED';

-- Index for active games lookups by court
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_Game_courtId_active"
ON "Game"("courtId")
WHERE "status" != 'ARCHIVED';

-- Composite index for user's games with status filter
-- This optimizes: SELECT games WHERE user is participant AND status IN (...)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_GameParticipant_userId_gameId_status"
ON "GameParticipant"("userId", "gameId", "status")
WHERE "status" IN ('PLAYING', 'INVITED', 'IN_QUEUE');

-- Index for unread messages calculation (gameId + createdAt for ordering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ChatMessage_gameId_createdAt"
ON "ChatMessage"("gameId", "createdAt" DESC);

-- Index for ChatReadCursor lookups (for unread counts)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ChatReadCursor_userId_contextType_contextId"
ON "ChatReadCursor"("userId", "chatContextType", "contextId");
