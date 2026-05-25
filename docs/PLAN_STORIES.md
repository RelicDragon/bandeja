# Plan: Instagram-like Stories (Followers Feed)

## Locked decisions

| Topic | Decision |
|-------|----------|
| **Photo privacy** | New `canReadForStories`: viewer follows uploader + `game.status ∈ {FINISHED, ARCHIVED}` + `game.isPublic` + uploader `shareGamePhotosToFollowers` (default `true`). Existing `/api/games/:id/photos` `canRead` unchanged (participant-only gallery). |
| **Content sources** | Manual story, game photo, public game created, game result |
| **Feed** | One aggregated `GET /api/stories/feed` |
| **Segments** | One segment per photo / per game / per result (no album sub-swipe v1) |
| **Self bubble** | Manual stories only |
| **Window** | Manual = 24h; activity = 7 days |
| **Manual audience** | Followers only |

---

## 1. Data model

### 1.1 New tables (`Backend/prisma/schema.prisma`)

```prisma
model UserStory {
  id        String         @id @default(cuid())
  userId    String
  expiresAt DateTime
  createdAt DateTime       @default(now())
  user      User           @relation("UserStoryOwner", fields: [userId], references: [id], onDelete: Cascade)
  items     UserStoryItem[]
  @@index([userId, expiresAt])
}

model UserStoryItem {
  id              String      @id @default(cuid())
  storyId         String
  mediaUrl        String
  thumbnailUrl    String
  posterUrl       String?
  messageType     MessageType
  videoDurationMs Int?
  width           Int?
  height          Int?
  overlayText     String?
  overlayStyle    Json?
  sortOrder       Int         @default(0)
  clientUploadId  String?
  createdAt       DateTime    @default(now())
  deletedAt       DateTime?
  story           UserStory   @relation(fields: [storyId], references: [id], onDelete: Cascade)
  @@unique([storyId, clientUploadId])
  @@index([storyId, sortOrder])
}

model StoryView {
  id          String   @id @default(cuid())
  viewerId    String
  ownerUserId String
  sourceType  StorySourceType
  sourceId    String
  viewedAt    DateTime @default(now())
  viewer      User     @relation("StoryViewViewer", fields: [viewerId], references: [id], onDelete: Cascade)
  owner       User     @relation("StoryViewOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  @@unique([viewerId, sourceType, sourceId])
  @@index([viewerId, ownerUserId])
  @@index([ownerUserId, sourceId])
}

enum StorySourceType {
  USER_STORY_ITEM
  GAME_PHOTO
  GAME_CREATED
  GAME_RESULT
}
```

### 1.2 `User` fields

```prisma
shareGamePhotosToFollowers    Boolean @default(true)
shareGameCreationsToFollowers Boolean @default(true)
shareGameResultsToFollowers   Boolean @default(true)
```

### 1.3 Migration

```bash
cd Backend && npx prisma migrate dev --name add_user_stories_and_share_flags
```

No custom SQL migration files.

---

## 2. Backend

### 2.1 Folder layout

```
Backend/src/services/story/
  story.constants.ts          # STORY_TTL_MS=24h, ACTIVITY_WINDOW_MS=7d, MAX_SEGMENTS_PER_USER=20
  story.permissions.ts        # canReadForStories(viewer, uploader, game)
  story.create.service.ts     # create UserStory + items, idempotent via clientUploadId
  story.delete.service.ts     # soft-delete own item; cascade story when empty
  story.feed.service.ts       # ranks bubbles, aggregates 4 sources, attaches viewed flags
  story.view.service.ts       # batch view upserts
  story.media.ts              # image/video pipeline reuse
  story.events.ts             # story:new, story:deleted, story:viewed
Backend/src/controllers/story.controller.ts
Backend/src/routes/story.routes.ts
Backend/scripts/cron/expireStories.ts
```

### 2.2 Feed query (`GET /api/stories/feed`)

1. `followingIds` from `UserFavoriteUser` (+ viewer for self-bubble).
2. Window: `now`, `now - 7d`, manual `expiresAt > now`.
3. Four SQL sources → `(ownerUserId, segmentKey, createdAt, payload)`:
   - **Manual:** `UserStoryItem` + `UserStory` where `userId IN followingIds`, not expired, not deleted.
   - **Game photos:** `GamePhoto` where `uploaderId IN followingIds`, `deletedAt IS NULL`, `createdAt >= 7d`, join `game`. Filter: `FINISHED|ARCHIVED`, `isPublic`, `shareGamePhotosToFollowers`.
   - **Public games created:** `Game` `isPublic`, `ANNOUNCED`, `entityType != LEAGUE_SEASON`, `createdAt >= 7d`, owner in `followingIds`, `shareGameCreationsToFollowers`.
   - **Game results:** `Game` `resultsStatus = FINAL`, `finishedDate >= 7d`, `outcomes` includes followed user, `isPublic`, `shareGameResultsToFollowers`.
4. Load `StoryView` for viewer → `viewedSet`.
5. Group by `ownerUserId`; sort segments `createdAt asc`.
6. Dedup same `gameId`: **`GAME_PHOTO > GAME_RESULT > GAME_CREATED`**.
7. `hasUnseen = any segment not in viewedSet`.
8. Sort bubbles: self (if manual) → unseen (latest desc) → seen (latest desc).
9. Cap: `MAX_BUBBLES = 100`, `MAX_SEGMENTS_PER_USER = 20`.

**Response types:**

```ts
type StoryFeed = {
  serverTime: string;
  bubbles: Array<{
    user: BasicUser;
    isSelf: boolean;
    hasUnseen: boolean;
    previewThumbnailUrl: string | null;
    segments: StorySegment[];
  }>;
};

type StorySegment =
  | { key: string; sourceType: 'USER_STORY_ITEM'; viewed: boolean; createdAt: string;
      media: { url: string; thumbnailUrl: string; type: 'IMAGE' | 'VIDEO'; durationMs?: number; width?: number; height?: number; overlayText?: string; overlayStyle?: unknown } }
  | { key: string; sourceType: 'GAME_PHOTO'; viewed: boolean; createdAt: string;
      media: { url: string; thumbnailUrl: string; type: 'IMAGE'; width?: number; height?: number };
      game: GameStorySummary }
  | { key: string; sourceType: 'GAME_CREATED'; viewed: boolean; createdAt: string; game: GameStorySummary }
  | { key: string; sourceType: 'GAME_RESULT'; viewed: boolean; createdAt: string; game: GameStorySummary; result: ResultSummary };
```

`key = ${sourceType}:${sourceId}`.

### 2.3 Routes

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/stories/feed` | Aggregated feed |
| `POST` | `/api/stories/items` | After media upload; append to today's story |
| `DELETE` | `/api/stories/items/:itemId` | Own items only |
| `POST` | `/api/stories/views` | `{ entries: [{ sourceType, sourceId, ownerUserId }] }` |
| `POST` | `/api/media/upload/story/image` | `uploads/stories/` |
| `POST` | `/api/media/upload/story/video` | Reuse chat video pipeline |

### 2.4 Expiry

`expireStories.ts` every 10 min: delete expired `UserStory` (cascade items), `ImageProcessor.deleteFilePair` on URLs. Wire into existing scheduler (e.g. `gamesScheduler.service.ts`).

### 2.5 Sockets

| Event | Payload | Rooms |
|-------|---------|-------|
| `story:new` | `{ ownerUserId, segment }` | Each follower's `user-{id}` |
| `story:deleted` | `{ ownerUserId, segmentKey }` | Followers |
| `story:viewed` | `{ ownerUserId, segmentKey, viewerId }` | Owner only |

### 2.6 Permissions (`story.permissions.ts`)

```ts
canSeeManualStory(viewerFollows: boolean): boolean

canSeePhotoInStories(opts: {
  viewerFollows: boolean;
  game: { status: string; isPublic: boolean };
  uploader: { shareGamePhotosToFollowers: boolean };
}): boolean

canSeeCreatedGameInStories(opts: {
  viewerFollows: boolean;
  game: { isPublic: boolean; status: string; entityType: string };
  owner: { shareGameCreationsToFollowers: boolean };
}): boolean

canSeeResultInStories(opts: {
  viewerFollows: boolean;
  game: { resultsStatus: string; isPublic: boolean };
  outcomeOwner: { shareGameResultsToFollowers: boolean };
}): boolean
```

Self: `viewerFollows = true` for manual items only.

### 2.7 Tests

`Backend/scripts/tests/stories.ts`:

- Create/delete manual item; `clientUploadId` idempotency
- Feed visibility matrix (private game, opt-out flags, follow graph)
- Dedup photo + result same game
- View tracking unique
- Expiry cron
- Socket smoke (mock)

Add to `scripts/tests/run-all.ts`.

---

## 3. Frontend

### 3.1 Folder layout

```
Frontend/src/api/stories.ts
Frontend/src/store/storiesStore.ts
Frontend/src/hooks/useStoriesFeed.ts
Frontend/src/hooks/useStoriesPlayback.ts
Frontend/src/components/stories/
  StoriesRail.tsx
  StoriesRailBubble.tsx
  StoriesRailSkeleton.tsx
  StoriesViewer.tsx
  StoriesViewerHeader.tsx
  StoriesProgressBars.tsx
  StoriesGestureLayer.tsx
  slides/MediaStorySlide.tsx
  slides/GamePromoStorySlide.tsx
  slides/GameResultStorySlide.tsx
  create/StoryCreateSheet.tsx
  create/StoryComposer.tsx
  create/StoryOverlayTextEditor.tsx
Frontend/src/i18n/locales/*/stories.json
```

### 3.2 Store (`storiesStore.ts`)

- `feed`, `lastFetchedAt`, `isLoading`
- `viewedKeys` (optimistic + server)
- `fetchFeed(force?)`, debounced `markViewed`, socket handlers
- TTL 60s; refresh on pull-to-refresh

### 3.3 Rail (`StoriesRail`)

- **Placement:** `MyTab.tsx`, `FindTab.tsx` above `WelcomeQuestionnairePrompt`
- **Order:** `+` create bubble → server `bubbles[]`
- **Ring:** conic gradient = unseen; gray = all seen
- **Empty:** hint when only self bubble

### 3.4 Viewer (`StoriesViewer`)

**Durations:**

| Segment type | Duration |
|--------------|----------|
| Image (manual / game photo) | 5s |
| Video | `videoDurationMs` (max 60s) |
| Game created / result | 7s |

**Gestures:**

| Input | Action |
|-------|--------|
| Tap left ⅓ | Previous segment |
| Tap right ⅔ | Next segment |
| Long press | Pause timer + video |
| Swipe down | Close |
| Swipe left/right | Next/prev user |
| ← / → / Space / Esc | prev / next / pause / close |

**Slides:**

- `MediaStorySlide` — fullscreen image/video + overlay text
- `GamePromoStorySlide` — entity gradient, game info, CTA → `/games/:id`
- `GameResultStorySlide` — scores, trophy, CTA → `/games/:id`

View marked after segment shown ≥ 800ms or on bubble exit.

### 3.5 Create flow

1. Tap `+` → sheet: Photo | Video
2. `runWithProfileName` gate
3. `StoryComposer` — overlay text (position + theme)
4. Upload → `POST /stories/items` with `clientUploadId`
5. Refresh feed; open viewer at new segment

Reuse: `prepareChatVideoForSend`, `FullScreenDialog`, `ensureChatMediaDownloaded`.

### 3.6 Sockets

`socketEventsStore.ts`: `story:new`, `story:deleted`, `story:viewed` → `storiesStore`.

### 3.7 Profile settings

Three toggles in Profile → "Sharing to followers":

- Share game photos in followers' stories
- Share games I create
- Share my results

Default ON → `usersApi.updateProfile`.

---

## 4. Phased rollout

| Phase | Scope |
|-------|--------|
| **A** | Schema + manual stories + rail + viewer + composer + playback |
| **B** | `GAME_PHOTO` in feed |
| **C** | `GAME_CREATED` + `GamePromoStorySlide` |
| **D** | `GAME_RESULT` + `GameResultStorySlide` |
| **E** | Sockets, preload, haptics, `prefers-reduced-motion` |

Feature flag `featureFlags.stories` gates rail until phase D stable.

---

## 5. Edge cases

| Case | Behavior |
|------|----------|
| Game deleted while viewing | Skip segment, advance |
| Item deleted via socket | Advance or drop from feed |
| Video load fail | Retry ×2, then auto-advance |
| Offline | Cached feed; create disabled |
| Photo + result same game | Photo wins |
| `nameIsSet === false` | Gate create only |

---

## 6. Performance

- 4 indexed queries, cap 200 rows each, trim to 20/user
- Preload next segment media only
- Optional indexes: `Game(resultsStatus, finishedDate)` if EXPLAIN slow

---

## 7. Out of scope (v1)

- Replies, reactions, stickers, highlights
- Public discovery (non-followed)
- Post game gallery photo to story directly
- HLS video

---

## 8. QA / gates

```bash
cd Backend && npm run lint
cd Backend && npx ts-node scripts/tests/stories.ts
cd Frontend && npm run lint
```

Manual: rail on My + Find, create photo/video, hold-to-pause, swipe between users, game promo/result CTAs, privacy toggles.

### QA run (2026-05-24)

| Gate | Result |
|------|--------|
| Backend `npm run lint` | Pass |
| Frontend `npm run lint` | Pass |
| `scripts/tests/stories.ts` | Pass (all 2.7 cases) |
| `run-all.ts` includes `stories` | Yes |
| Backend routes wired (`/stories` in `index.ts`) | Yes |
| Feed 4 sources (`story.feed.service.ts`) | Manual, `GAME_PHOTO`, `GAME_CREATED`, `GAME_RESULT` |
| Frontend integration | `StoriesRail` in `MyTab.tsx` + `AvailableGamesSection.tsx`; `featureFlags.stories`; socket handlers; Profile share toggles |
| Manual UI checklist | Not run (automated only) |

**Test fixes (flaky on shared dev users):** pre-test manual-story cleanup; delete/dedup assertions scoped to created segment/game ids.

**Coverage vs §2.7:** create/delete, `clientUploadId` idempotency, feed visibility (private game, `shareGamePhotosToFollowers`, `ARCHIVED`, `GAME_CREATED` opt-out), dedup photo > result, view upsert unique, expiry cron, socket `story:new` + `story:deleted` smoke. Not covered: `shareGameResultsToFollowers` opt-out, `story:viewed` socket smoke.

### Code review (2026-05-24)

| Severity | Finding | Status |
|----------|---------|--------|
| High | `GAME_RESULT` — backend sends `isWinner`/`wins`/`losses`/…; frontend slide expected `winnerName`/`scoreLabel`/`teamAScore` → result slide mostly empty | [x] fixed |
| Medium | `GAME_CREATED` — feed `GameStorySummary` lacked `clubName`/`cityName`/`participantCount`; promo slide fields empty | [x] fixed |
| Medium | `applyStoryNew` — new bubble from socket used stub user → header shows `—` until feed refresh | [x] fixed (`user` in socket payload) |
| Low | `applyStoryViewed` no-op (owner “who viewed” not in v1 scope) | accepted |
| Low | Activity sources (photo/created/result) not realtime via socket; feed TTL refresh only | accepted v1 |
| Medium | §5 edge cases: deleted segment while viewing doesn’t auto-advance; game deleted while viewing not handled | [x] partial — viewer clamps/advances on segment removal; game delete still needs feed refresh |
| Minor | Reduced motion + video: no auto-advance on end; user taps Next | accepted |

---

## Orchestration progress

### Frontend
- [x] API — `Frontend/src/api/stories.ts` + export from `api/index.ts`
- [x] Store — `Frontend/src/store/storiesStore.ts` (feed, viewedKeys, fetchFeed, markViewed, socket handlers, 60s TTL)
- [x] Hooks — `useStoriesFeed.ts`, `useStoriesPlayback.ts`
- [x] Components — `Frontend/src/components/stories/` (rail, viewer, slides, create flow)
- [x] i18n — `stories.json` for en, cs, es, ru, sr
- [x] Integration — `StoriesRail` in `MyTab.tsx` and `AvailableGamesSection.tsx` (Find tab)
- [x] Sockets — `socketEventsStore.ts` handlers `story:new`, `story:deleted`, `story:viewed`
- [x] Profile settings — three "Sharing to followers" toggles
- [x] Feature flag — `featureFlags.stories` (enabled in dev)
- [x] Phase E — preload next segment media (`storySegmentMediaPreload` + `ensureChatMediaDownloaded`)
- [x] Phase E — light haptics (open, segment advance, user swipe, close)
- [x] Phase E — `prefers-reduced-motion` (playback timer off, progress bar transitions, manual Next)

---

## 9. Product defaults

| Item | Default |
|------|---------|
| Video sound | Unmuted; tap to mute |
| Max video length | 60s |
| Max overlay text | 80 chars |
| Segments per bubble | 20 (defer rest) |
| `LEAGUE_SEASON` child games | Excluded from activity sources |

---

## 10. Related code (existing)

| Area | Location |
|------|----------|
| Follow graph | `UserFavoriteUser`, `favoritesApi`, `useFavoritesStore` |
| Game photos | `GamePhoto` model, `gamePhoto/*` services, `gamePhotosApi` |
| Fullscreen media | `FullscreenImageViewer`, `FullscreenVideoViewer` |
| Horizontal rail pattern | `TrainersList.tsx` |
| Game card styling | `getGameCardEntityGradientClasses`, `GameStatusIcon` |
| Results UI vocabulary | `gameResults/MatchCard.tsx`, `PlayerStatsPanel.tsx` |

---

## Orchestration progress

### Global phases
- [x] Phase A: Schema + manual stories + rail + viewer + composer
- [x] Phase B: GAME_PHOTO in feed
- [x] Phase C: GAME_CREATED + GamePromoStorySlide
- [x] Phase D: GAME_RESULT + GameResultStorySlide
- [x] Phase E: Sockets, preload, haptics, reduced-motion

### Team tracks
**Backend** (owner: backend-dev)
- [x] 1.1 Prisma models + migrate dev — migration `20260524120000_add_stories_and_share_preferences` applied; `migrate dev` reports schema in sync (2026-05-24)
- [x] 1.2 User share flags
- [x] 2.1 Story services folder
- [x] 2.2 Feed query
- [x] 2.3 Routes + media upload
- [x] 2.4 Expiry cron
- [x] 2.5 Sockets
- [x] 2.6 Permissions
- [x] 2.7 Automated tests

**Frontend** (owner: frontend-dev)
- [x] 3.1 API + store + hooks
- [x] 3.2 StoriesRail placement
- [x] 3.3 StoriesViewer playback
- [x] 3.4 Create flow
- [x] 3.5 Socket integration
- [x] 3.6 Profile toggles
- [x] i18n stories.json

**QA** (owner: qa)
- [x] Backend lint
- [x] Frontend lint
- [x] `stories.ts` (§2.7 automated)
- [x] `run-all.ts` includes stories
- [x] Integration spot-check (routes, feed sources, rail, sockets, profile toggles, feature flag)
- [ ] Manual UI (§8): rail, create, playback, CTAs, privacy toggles

**Post-review fixes** (owner: full-stack)
- [x] Align `ResultSummary` + `GameResultStorySlide` with backend payload
- [x] Enrich feed `GameStorySummary` (club/city names, participant count)
- [x] Include owner `user` in `story:new` socket payload + store merge
- [x] Viewer auto-advance when current segment/bubble removed
- [x] Tests: `ARCHIVED` photo, `GAME_CREATED` opt-out, `story:deleted` smoke
