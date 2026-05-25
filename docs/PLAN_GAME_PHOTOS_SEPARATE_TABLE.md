# Plan: Re-implement Game Photos as a Separate System (Decoupled from Game-Chat `PHOTOS`)

## Orchestrator status (live)

| Step | Owner | Status |
|------|-------|--------|
| 1. Prisma + Phase A migration | backend-schema | done |
| 2. gamePhoto services + routes | backend-services | completed |
| 3. game/read embed + Telegram + tests | backend-integration | done |
| 4. Frontend API + store + PhotosSection + GameCard | frontend-photos | completed |
| 5. Phase B migration script | migration | done |
| 6. Phase B½ unread + docs | migration | done |
| 7. Frontend PHOTOS chat cleanup + Dexie | frontend-chat | completed |
| 8. Phase C enum removal | migration | done |
| 9. Final PATCH cleanup + lint + tests | qa | done (2026-05-23 — see verification below) |

## 1. Current state (what exists today)

Today game photos are an overloaded use of the chat pipeline. The artifacts:

**Schema** (`Backend/prisma/schema.prisma`):
- `ChatType` enum includes `PHOTOS` (line 1363)
- Photos are stored as `ChatMessage` rows with `chatType = 'PHOTOS'`, `messageType = 'IMAGE'`, `mediaUrls`, `thumbnailUrls`
- `Game.photosCount` (Int) and `Game.mainPhotoId` (String?, references a `ChatMessage.id`) — no FK enforced

**Backend code paths that reference `PHOTOS` / `photosCount` / `mainPhotoId`**:
- `Backend/src/services/chat/message.service.ts` — create branch (lines 777–810) increments `photosCount` and sets `mainPhotoId` on first photo, then emits `emitGameUpdate`. Delete branch (lines 1690–1763) decrements and re-picks main photo. Still calls `sendGameChatNotification` for PHOTOS uploads.
- `Backend/src/services/chat/gameChatVisibility.ts` — `canParticipantSeeGameChatMessage`: PHOTOS visible when `game.status !== 'ANNOUNCED'` (any participant; looser than write rules)
- `Backend/src/services/chat/unreadCountBatch.service.ts` — includes `PHOTOS` in unread filter
- `Backend/src/services/game/update.service.ts` — validates `mainPhotoId` belongs to a `PHOTOS` chat message; `photosCount` in writable fields
- `Backend/src/services/game/create.service.ts` — accepts `mainPhotoId` on game create
- `Backend/src/controllers/game.controller.ts` — Telegram results send requires `photosCount > 0 || mainPhotoId` (line 376)
- `Backend/src/services/telegram/results-telegram.service.ts` — `getMainPhotoUrl` reads `mediaUrls` from `ChatMessage`
- `Backend/src/services/telegram/notifications/game-chat.notification.ts` + `handlers/callback.handler.ts` — chat-type char `F → PHOTOS`
- `Backend/src/services/notification.service.ts` — push for game chat uses `canParticipantSeeGameChatMessage` (PHOTOS uploads notify participants today)
- `Backend/src/utils/chatAutoTranslateKey.ts`
- `Backend/src/controllers/media.controller.ts` — `uploadChatImage` used by Photos UI; separate `uploadGameMedia` pushes `Game.mediaUrls` (legacy, not gallery)
- `Backend/src/routes/chat.routes.ts` — `PHOTOS` allowed in query/body validators
- `Backend/src/controllers/user/stats.controller.ts` — exposes `photosCount` on user game stats
- Migrations: `20251112125424_add_photos_chat_type`, `20251112132604_add_photos_count_to_game`, `20251208235237_add_main_photo_id_to_game`

**Frontend code paths**:
- `Frontend/src/components/GameDetails/PhotosSection.tsx` — paginates `chatApi.getGameMessages(..., 'PHOTOS')`, upload via `mediaApi.uploadChatImage` + `chatApi.createMessage`, socket `lastChatMessage` / `lastChatDeleted`; `runWithProfileName` before upload
- `Frontend/src/components/GameCard.tsx` — extra fetch: `getGameMessages(..., 'PHOTOS')` to resolve `mainPhotoId`
- `Frontend/src/components/chat/ChatListGameCardTags.tsx` — `photosCount` badge
- `Frontend/src/components/GameDetails/GameResultsEntryEmbedded.tsx` — Telegram post gating on `photosCount` / `mainPhotoId`
- `Frontend/src/pages/GameChat/*` — PHOTOS tab UI exists in `GameChatTabs.tsx`, but **`getAvailableGameChatTypes` (`chatType.ts`) never adds `PHOTOS`** — tab is effectively dead; unread/sync still treat PHOTOS as a channel
- `Frontend/src/services/chatSyncService.ts` — `ALL_GAME_CHAT_TYPES` includes `PHOTOS`
- `Frontend/src/services/chat/chatOpenReconcile.ts` — flushes missed PHOTOS buffer
- `Frontend/src/utils/gameChatTypesForUnread.ts` (+ test), `gameChatChannelActivity.ts`, `chatContextUserLookup.ts`, `MentionInput.tsx`, `types/index.ts`, `i18n/locales/*/chat.json` + `gameDetails.json`

**Related docs**:
- `docs/unread-counts-architecture.md` — PHOTOS in game unread sum and mark-read scope (§36–61, QA rows)

## 2. Target design (separate `GamePhoto` table)

### 2.1 New Prisma model

```prisma
model GamePhoto {
  id              String   @id @default(cuid())
  gameId          String
  uploaderId      String?
  originalUrl     String
  thumbnailUrl    String
  width           Int?
  height          Int?
  thumbWidth      Int?
  thumbHeight     Int?
  byteSize        Int?
  order           Int      @default(0)
  clientUploadId  String?  // idempotent mobile retries (like chat clientMutationId)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  game     Game  @relation(fields: [gameId], references: [id], onDelete: Cascade)
  uploader User? @relation("GamePhotoUploader", fields: [uploaderId], references: [id], onDelete: SetNull)
  mainFor  Game? @relation("GameMainPhoto")

  @@unique([uploaderId, clientUploadId])
  @@index([gameId, deletedAt, createdAt])
  @@index([uploaderId])
}
```

**Do not add `isMain` on `GamePhoto`** — single source of truth is `Game.mainPhotoId` only (avoids drift with `isMain` boolean).

### 2.2 Changes to `Game`

- `mainPhotoId` → FK to `GamePhoto.id` (`onDelete: SetNull`).
- Keep `photosCount` (denormalized; server-maintained only — remove from client-writable fields in `game/update.service.ts`).
- `photos GamePhoto[]`, `mainPhoto GamePhoto? @relation("GameMainPhoto", fields: [mainPhotoId], references: [id], onDelete: SetNull)`.
- `Game.mediaUrls` (line 437) — legacy `uploadGameMedia` path; **not** the gallery; leave untouched.

### 2.3 Removal of `PHOTOS` from chat

- Remove `PHOTOS` from `ChatType` enum **after** data migration.
- Frontend `ChatType` loses `'PHOTOS'`.
- Drop `'PHOTOS'` from `chat.routes.ts` validators.
- Remove PHOTOS branches from visibility, unread, sync, notifications, Telegram `F` links.

### 2.4 Product rules (document explicitly)

| Rule | Today | Target |
|------|-------|--------|
| Gallery visible | `status !== 'ANNOUNCED'` (`PhotosSection` returns null for ANNOUNCED) | Same on `GET /photos` + upload |
| Upload | Playing participant or admin/owner (`message.service` write) | `gamePhoto.permissions.canUpload` — same + parent admin/owner if desired |
| Set main | Admin/owner (`PhotosSection`) | `canSetMain` — admin/owner only |
| Delete | No dedicated UI (chat delete only) | Uploader or admin/owner; explicit `DELETE` |
| Read gallery | Any participant when not ANNOUNCED (`canParticipantSeeGameChatMessage` for PHOTOS) | `canRead` — align with today or tighten to playing-only (decide) |
| Push on upload | Yes — `sendGameChatNotification` for PHOTOS image messages | **No chat push** by default; optional future `GAME_PHOTO` notification type |
| `photosCount` semantics | Incremented by `mediaUrls.length` per message | One row per image → count = non-deleted rows |

## 3. New backend surface

### 3.1 Service: `Backend/src/services/gamePhoto/`

| File | Responsibility |
|------|----------------|
| `gamePhoto.create.service.ts` | Upload + persist; `MAX_PHOTOS_PER_GAME`; block when `ANNOUNCED`; idempotent via `clientUploadId`; increment `photosCount`; set `mainPhotoId` if null; emit events + optional `emitGameUpdate` for list cards |
| `gamePhoto.read.service.ts` | Cursor list; `getMainPhotoUrl` for Telegram; include `uploader: { id, name, avatar }` |
| `gamePhoto.update.service.ts` | `setMainPhoto` only (not via generic game PATCH) |
| `gamePhoto.delete.service.ts` | Soft-delete; decrement count; re-pick main; `ImageProcessor.deleteFile`; emit events |
| `gamePhoto.permissions.ts` | `canRead`, `canUpload`, `canSetMain`, `canDelete` |
| `gamePhoto.events.ts` | `game_photo:*` socket helpers |

**Constants** (e.g. `gamePhoto.constants.ts`):
- `MAX_PHOTOS_PER_GAME` (e.g. 50 — pick product number; club uses 24)
- Max file size aligned with client (10 MB in `PhotosSection`)

**Media paths**: Reuse `ImageProcessor.processChatImage` → `uploads/chat/originals|thumbnails` (simplest migration), or new `uploads/game-photos/...` + `isAllowedGamePhotoUrl()` on create.

### 3.2 Controller & routes

| Method | Path | Body / Query | Returns |
|--------|------|--------------|---------|
| `POST` | `/api/games/:gameId/photos` | multipart `image`, optional `clientUploadId` | `GamePhoto` + uploader snippet |
| `GET` | `/api/games/:gameId/photos` | `?limit=50&cursor=<id>` | `{ items, nextCursor }` |
| `PATCH` | `/api/games/:gameId/photos/main` | `{ photoId: string \| null }` | `{ gameId, mainPhotoId }` |
| `DELETE` | `/api/games/:gameId/photos/:photoId` | — | `{ ok: true }` |

Optional later: `POST .../photos/batch` for multi-select uploads.

Register `gamePhoto.routes.ts` in app entry. Reuse multer from `media.routes.ts`.

**Remove from generic game update**:
- `mainPhotoId` validation against `ChatMessage` in `game/update.service.ts`
- Client ability to set `photosCount` / `mainPhotoId` via `PATCH /games/:id` — only dedicated photo endpoints

**Game create** (`game/create.service.ts`): disallow `mainPhotoId` on create, or allow only after photos exist.

### 3.3 Game read DTO

`Backend/src/services/game/read.service.ts` — include on game payloads used by lists/cards:

```ts
mainPhoto?: { id, thumbnailUrl, originalUrl } | null
photosCount: number
```

Eliminates `GameCard` N+1 `getGameMessages(..., 'PHOTOS')` fetch.

### 3.4 Telegram integration

- `results-telegram.service.ts` `getMainPhotoUrl` → `GamePhoto` by `mainPhotoId`.
- `game.controller.ts` line 376 guard unchanged (`photosCount || mainPhotoId`).
- Remove `F → PHOTOS` from `game-chat.notification.ts` and `callback.handler.ts`; document that old Telegram deep links to PHOTOS tab fall back to PUBLIC or game details.

### 3.5 Socket events

| Event | Payload |
|-------|---------|
| `game_photo:added` | `{ gameId, photo }` |
| `game_photo:deleted` | `{ gameId, photoId, mainPhotoId, photosCount }` |
| `game_photo:main_changed` | `{ gameId, mainPhotoId }` |

Also call `emitGameUpdate` when `photosCount` / `mainPhotoId` change so existing game list subscribers update without wiring every consumer to `game_photo:*`.

Wire handlers in `Frontend/src/store/socketEventsStore.ts`.

### 3.6 Notifications & chat cleanup

- Stop creating `ChatMessage` for gallery uploads → no `sendGameChatNotification` for photos.
- Remove `ChatType.PHOTOS` from `gameChatVisibility.ts`, `unreadCountBatch.service.ts`, `chatAutoTranslateKey.ts`.
- No change to PUBLIC/PRIVATE/ADMINS push paths.

### 3.7 Moderation (v1 decision)

Today PHOTOS images were reportable as chat messages (`MessageReport`). Options:
- **v1**: no in-gallery report; admin deletes via API only.
- **Later**: `POST /games/:gameId/photos/:photoId/report`.

### 3.8 Automated tests

Add `Backend/scripts/tests/game-photos.ts` (or Vitest):
- CRUD happy path
- Permissions (ANNOUNCED blocked, non-participant 403, uploader vs admin delete)
- `photosCount` / `mainPhotoId` on create, delete main, delete last photo
- Idempotent `clientUploadId` replay
- Telegram `getMainPhotoUrl` after migration

## 4. Frontend surface

### 4.1 API — `Frontend/src/api/gamePhotos.ts`

```ts
export type GamePhoto = {
  id: string;
  gameId: string;
  originalUrl: string;
  thumbnailUrl: string;
  uploader?: { id: string; name: string; avatar?: string | null };
  createdAt: string;
};

export const gamePhotosApi = {
  list(...),
  upload(gameId, file, { signal?, clientUploadId? }),
  setMain(...),
  delete(...),
};
```

### 4.2 Store — `Frontend/src/store/gamePhotosStore.ts`

Keyed by `gameId`; actions: `loadGamePhotos`, optimistic add/replace/remove, `setMain`, `applySocketEvent`.

**Upload UX**: progress + retry (mirror `chatImageUploadRetry.ts` / outbox patterns where useful).

### 4.3 `PhotosSection.tsx`

| Today | Target |
|-------|--------|
| Chat messages pagination | `gamePhotosApi.list` / store |
| Chat upload pipeline | `gamePhotosApi.upload` |
| `gamesApi.update({ mainPhotoId })` | `gamePhotosApi.setMain` |
| Chat socket events | `game_photo:*` |
| No delete UI | Delete control (uploader or admin); confirm dialog |
| Single-image fullscreen | Swipe between all photos in viewer |
| `runWithProfileName` | Keep before upload |

i18n: `gameDetails.json` (add/delete/main), not only `chat.json`.

### 4.4 `GameCard.tsx`

Use `game.mainPhoto?.thumbnailUrl` from API — remove `getGameMessages(..., 'PHOTOS')`.

### 4.5 Remove PHOTOS from GameChat (low UX risk)

`getAvailableGameChatTypes` never exposed PHOTOS; removal is mostly dead-code + unread/sync cleanup:

| File | Change |
|------|--------|
| `GameChatTabs.tsx` | Remove PHOTOS tab / camera icon branch |
| `useGameChatDerived.ts`, `useGameChatFooterVariant.ts` | Drop PHOTOS branches |
| `chatSyncService.ts`, `chatOpenReconcile.ts` | Remove PHOTOS from game chat type lists |
| `gameChatTypesForUnread.ts` (+ test) | Remove PHOTOS |
| `gameChatChannelActivity.ts`, `MentionInput.tsx`, `chatContextUserLookup.ts`, `MessageInput.tsx` | Remove PHOTOS |
| `types/index.ts`, `i18n/locales/*/chat.json` | Drop `PHOTOS` |
| Deep links `?chatType=PHOTOS` | Redirect to game details or PUBLIC |

### 4.6 Unchanged consumers

- `ChatListGameCardTags.tsx` — `photosCount` badge
- `GameResultsEntryEmbedded.tsx` — Telegram gating
- `Frontend/src/api/users.ts` stats — `photosCount` from server

### 4.7 Client cache after migration

On app upgrade (or chat DB version bump): purge Dexie threads `GAME:*:PHOTOS` from `chatLocalDb.ts` so stale PHOTOS messages don’t linger offline.

## 5. Data migration

### Phase A — schema add (`npx prisma migrate dev`)

1. Add `GamePhoto` model (no `isMain`).
2. Add FK `Game.mainPhotoId → GamePhoto.id` (enforce after Phase B).

### Phase B — data backfill

```sql
INSERT INTO "GamePhoto" (id, "gameId", "uploaderId", "originalUrl", "thumbnailUrl", "createdAt", "updatedAt", "deletedAt")
SELECT
  m.id, m."contextId", m."senderId",
  m."mediaUrls"[1], COALESCE(m."thumbnailUrls"[1], m."mediaUrls"[1]),
  m."createdAt", m."updatedAt", m."deletedAt"
FROM "ChatMessage" m
WHERE m."chatContextType" = 'GAME'
  AND m."chatType" = 'PHOTOS'
  AND array_length(m."mediaUrls", 1) >= 1;
```

Script `Backend/scripts/migrations/migrate-game-photos.ts`:
- One `GamePhoto` per `mediaUrls[]` entry; first URL keeps `ChatMessage.id` for `mainPhotoId` stability
- Migrate soft-deleted rows with `deletedAt` set; exclude from count
- Fix broken `mainPhotoId` (missing message → null or oldest photo)
- Recompute `photosCount = COUNT(*)` where `deletedAt IS NULL` per game
- Verification report (games with count mismatch, orphan `mainPhotoId`)

**Optional dual-write window**: short period writing both `GamePhoto` and PHOTOS message (or read-new/write-both) before Phase C — only if rollout risk is high.

### Phase B½ — unread / snapshot cleanup

After PHOTOS messages deleted:
- One-time job: recompute user unread snapshots for affected games (PHOTOS no longer in filter)
- Update `docs/unread-counts-architecture.md` — remove PHOTOS from tables, mark-read scope, QA scenarios

### Phase C — removal

1. Delete `ChatMessage` where `chatType = 'PHOTOS'`.
2. Drop `PHOTOS` from `ChatType` enum.
3. Enforce FK on `Game.mainPhotoId`.

**Run order (production)**

1. Phase A already applied (`20260523120000_add_game_photo`).
2. `cd Backend && npm run migrate:game-photos` (optional `--dry-run` first).
3. Deploy backend with `gamePhoto` APIs.
4. `npm run migrate:delete-photos-chat` (optional `--dry-run`).
5. `npm run migrate:recompute-unread-after-photos` (optional `--emit-socket` with API up).
6. `npx prisma migrate dev --name remove_photos_chat_type` (schema: no `PHOTOS` enum; `Game.mainPhoto` FK relation).
7. Deploy backend without legacy PHOTOS chat paths.

## 6. Files touched (summary)

**Backend (modify)**  
`prisma/schema.prisma`, `message.service.ts`, `gameChatVisibility.ts`, `unreadCountBatch.service.ts`, `game/update.service.ts`, `game/create.service.ts`, `game/read.service.ts`, `game.controller.ts`, `results-telegram.service.ts`, `notification.service.ts` (no photo path), `game-chat.notification.ts`, `callback.handler.ts`, `chatAutoTranslateKey.ts`, `chat.routes.ts`, `socket.service.ts`, `user/stats.controller.ts`

**Backend (new)**  
`services/gamePhoto/*`, `controllers/gamePhoto.controller.ts`, `routes/gamePhoto.routes.ts`, `scripts/migrations/migrate-game-photos.ts`, `scripts/tests/game-photos.ts`

**Frontend (modify)**  
§4.5 list, `PhotosSection.tsx`, `GameCard.tsx`, `socketEventsStore.ts`, `gameDetails.json` + `chat.json` locales

**Frontend (new)**  
`api/gamePhotos.ts`, `store/gamePhotosStore.ts`, optional `PhotosSectionGrid.tsx`, `usePhotosSectionUpload.ts`

**Docs (modify)**  
`docs/unread-counts-architecture.md`

## 7. Risks and considerations

| Risk | Mitigation |
|------|------------|
| Telegram `mainPhotoId` | Reuse `ChatMessage.id` as first `GamePhoto.id` |
| Multi-image messages | One row per URL; recount `photosCount` |
| Push spam on upload | No chat message → no `sendGameChatNotification` |
| Read vs write mismatch | Document in §2.4; implement in `permissions.ts` |
| Orphan unread badges | Phase B½ snapshot recompute |
| Stale Dexie PHOTOS threads | Client purge on upgrade |
| Broken `mainPhotoId` | Migration repair step |
| Telegram `F` deep links | Fallback route; remove char from new notifications |
| `photosCount` drift | Server-only field; transactional updates |
| `Game.mediaUrls` vs gallery | Document separate; don’t merge |
| Empty gallery | `mainPhotoId = NULL`, `photosCount = 0` |
| Deploy order | Backend API + dual-read → migrate → frontend → Phase C |
| N+1 on list cards | Embed `mainPhoto` in game read |

## 8. Non-goals (initial slice)

- Video in game gallery (chat VIDEO stays separate; see `PLAN_CHAT_VIDEO_ATTACHMENTS.md`)
- Comments, likes, reactions on photos
- Drag-and-drop reorder (`order` field reserved)
- Public gallery without login (unless product changes `canRead`)
- Replacing `Game.mediaUrls` / `uploadGameMedia`
- In-gallery report/moderation UI (unless added in §3.7)
- HLS / new CDN layout

## 9. QA checklist

Verified 2026-05-23 (`game-photos.ts`, lint, code review). Remaining items need manual/E2E pass before prod.

- [ ] Upload single + multiple photos after game started (UI + multipart; service seed only in automated test)
- [x] Block upload when `ANNOUNCED` (`game-photos.ts`)
- [x] Non-participant cannot upload/list (per `canRead` decision) (`game-photos.ts` stranger list 403)
- [x] Playing participant can upload; admin can set main (permissions in `gamePhoto.permissions.ts`; set-main + player-deny in `game-photos.ts`)
- [x] Delete photo (uploader); delete as admin (`GamePhotoDeleteService` in `game-photos.ts`; uploader vs admin split in `canDelete`)
- [x] Delete main photo → next oldest becomes main (`game-photos.ts`)
- [x] Delete last photo → `mainPhotoId` null, `photosCount` 0 (`game-photos.ts`)
- [x] `GameCard` cover without extra API call (`GameCard.tsx` uses `game.mainPhoto?.thumbnailUrl`; no `getGameMessages` PHOTOS)
- [x] Telegram results post with/without photo (`getMainPhotoUrl` via `GamePhotoReadService` in `game-photos.ts`; controller guard unchanged)
- [x] Chat unread badge unchanged for PUBLIC; no PHOTOS ghost unread after migration (PHOTOS removed from sync/unread paths; Dexie v17 purge; recompute script present — E2E not run)
- [x] Muted game: no push on photo upload (gallery no longer creates `ChatMessage`; `notification.service` early-return guard)
- [x] Parent-game admin upload on child game (if supported) (`hasParentGamePermissionWithUserCheck` in `gamePhoto.permissions.ts` — not in automated test)
- [x] Offline: stale PHOTOS tab cleared after upgrade (`chatLocalDb.ts` version 17 upgrade purges `:PHOTOS` threads)
- [x] `clientUploadId` double-tap doesn’t duplicate row (`game-photos.ts` idempotent lookup)

### Step 9 verification (2026-05-23)

| Check | Result |
|-------|--------|
| `cd Backend && npm run lint` | pass |
| `cd Backend && npx ts-node scripts/tests/game-photos.ts` | pass (12 checks) |
| `cd Frontend && npm run lint` | pass |
| `cd Frontend && npx vitest run gameChatTypesForUnread.test.ts` | pass (4 tests) |
| Phase A migration `20260523120000_add_game_photo` | present |
| Phase C Prisma migration (drop `PHOTOS` enum + `Game.mainPhotoId` FK) | **done** — `20260523130000_remove_photos_chat_type` (run `migrate:delete-photos-chat` before `migrate deploy` on each env) |

## 10. Implementation order

1. Prisma model + Phase A migration (additive).
2. Backend `gamePhoto` services + routes + permissions + constants.
3. Embed `mainPhoto` on `game/read.service.ts`; tests + Telegram path.
4. Frontend API + store + `PhotosSection` + `GameCard`; socket handlers.
5. Phase B migration script + verification.
6. Phase B½ unread snapshot cleanup + update `unread-counts-architecture.md`.
7. Frontend: remove PHOTOS chat code; Dexie purge.
8. Phase C: delete PHOTOS messages, drop enum, enforce FK.
9. Remove `mainPhotoId` from generic game PATCH; lint + `test:chat-outbox` + `game-photos` test script.

**Optional**: feature flag `gamePhotosSeparateTable` on backend route + frontend API for gradual rollout.
