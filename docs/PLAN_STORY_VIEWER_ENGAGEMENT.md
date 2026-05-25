# Plan: StoriesViewer engagement (caption, heart, comments)

Scope: extend **`StoriesViewer`** (and feed/create) with Instagram/TikTok-style **caption**, **segment heart**, and **comments** (threaded replies + per-comment hearts). v1 stories plan explicitly excluded this ([PLAN_STORIES.md](./PLAN_STORIES.md) §7); this is the v2 engagement layer.

**Depends on:** `featureFlags.stories` enabled (engagement ships with stories; no separate flag).

---

## 0. Current state (gap)

| Area | Today |
|------|--------|
| Viewer chrome | Header + progress only — no footer actions (`Frontend/src/components/stories/StoriesViewer.tsx`) |
| “Text on story” | `overlayText` / `overlayStyle` on `UserStoryItem` — baked or rendered on media, not a social caption |
| API | Feed, create, delete, views only (`Backend/src/routes/story.routes.ts`) |
| Likes / comments | **No** models, routes, or UI |
| Reuse in app | Chat `MessageReaction` + replies; game `GameReaction` (❤️ on **game**, not segment) — patterns to copy, not wire to stories |
| Owner “who viewed” | `StoryView` exists; `applyStoryViewed` in `storiesStore` is no-op — separate from engagement v2 |

Segment identity is already stable: `key = ${sourceType}:${sourceId}` — use this everywhere for engagement.

---

## 1. Product reference (IG / TikTok)

**Instagram Stories (viewer)**

- Right rail: reply (DM), optional sticker reactions to owner
- Tap “…” or swipe up: **viewers list** (owner) / limited public replies in some regions
- **Caption**: often separate from on-image text; shown in composer and sometimes under story
- Comments on stories are **not** the same as Reels; IG pushes DMs for replies. For this product: **inline comments** → closer to **Reels / TikTok**.

**TikTok / Reels (target UX)**

- Right: **heart**, **comment count**, share
- Bottom: **caption** (truncated, “more”)
- Comments: bottom sheet, flat list + **threaded replies**, **heart per comment**
- Double-tap heart animation on video
- Opening comments **pauses** playback
- Swipe up opens comments on many builds

### Locked decisions

| Decision | Choice |
|----------|--------|
| Segment like | Single **❤️** per viewer per segment (toggle); show count on rail (`99+` cap) |
| Comment like | **❤️** per viewer per comment (toggle); show count on row |
| Replies | **1 level** (comment → replies); reject reply-to-reply |
| Caption vs overlay | **Separate `caption` field**; `overlayText` = editor graphics only (max 80, existing) |
| Who can engage | Followers who can see segment in feed (+ self); block graph respected |
| Activity segments | Likes + comments **enabled** on all `StorySourceType` values |
| Activity caption | Server synthetic only; not editable |
| Owner tools | Delete any comment on own bubble segments; see aggregate counts |
| Owner liker list | Optional **E5.5**: tap like count → avatars sheet (not full `StoryView` list) |
| Comment sort | Top-level **newest first**; replies under parent **oldest first** |
| Login / name | Like: auth required; comment: `runWithProfileName` (same as story create) |
| Self-interaction | May like/comment own segment; **no** notification to self |
| Realtime | Socket count updates + optimistic UI |
| Privacy toggles v2 | **No new profile toggles** — follower visibility + existing share flags suffice |
| DM reply | **Out of scope** v2 |

---

## 2. Product defaults

| Item | Default |
|------|---------|
| Manual caption max | 220 chars, trimmed |
| Synthetic caption max | 120 chars, trimmed |
| Overlay text max | 80 chars (unchanged; not caption) |
| Comment body max | 500 chars, trimmed; reject whitespace-only / emoji-only |
| Comment plain text | No URLs rendered as links v2 (plain text only) |
| Top-level comment page size | 30 |
| Reply preview on list | 2 newest replies + `replyCount` |
| `MAX_COMMENTS_PER_SEGMENT` | 500 (new comments → 429) |
| Like API | Single `POST .../like/toggle` (idempotent) |
| Rate limits | 10 comments/min/user; 100 like toggles/min/user |
| Display like count | Exact number; UI caps at `99+` |
| Offline | View counts; like/comment toast “offline” (no mutation queue v2) |
| Feature flags | `stories` required (engagement always on when stories are on) |

---

## 3. Privacy & user controls

Engagement visibility follows **story feed** rules ([`story.permissions.ts`](Backend/src/services/story/story.permissions.ts)):

- Non-followers cannot read or engage.
- Existing profile toggles (`shareGamePhotosToFollowers`, etc.) only control whether **activity segments appear** in feed — not a separate “allow comments” switch v2.
- Blocked users (either direction): **403** on like/comment; **hide** their existing comments in lists (server filter).
- Deleted/banned author: row shows “Deleted user” (no avatar link).

**Not in v2:** hide like counts globally, mute user’s stories, disable comments per segment type only.

---

## 4. UX / UI spec (modern, clean)

### 4.1 Layout zones (`StoriesViewer`)

```
┌─────────────────────────────────────┐
│ [progress] [avatar name · time]  ✕  │  ← existing header
│                                     │
│           STORY MEDIA               │
│                                     │
│  ♡ 12     💬 3        [game CTA]    │  ← NEW right rail
│                                     │
│  @owner  Caption line… more         │  ← NEW caption strip
└─────────────────────────────────────┘
```

- **Right rail** (`data-story-interactive`):
  - Heart: toggle + animation; unauthenticated → toast (`chat.reactions.loginToReact` pattern)
  - Comment: opens sheet; badge = `commentCount` (`99+`)
  - Share: optional later (`sharePlayerProfile`)
- **Caption strip:** `@owner` tappable → `PlayerCardBottomSheet`; “more” expands inline (pauses playback)
- **Double-tap** media: like + float heart; does not advance segment
- **Swipe up** (threshold ~60px): open comments sheet (same as comment button)
- **Comments sheet** (`Drawer` / Vaul):
  - ~55–70vh; `useVisualViewportInset` for keyboard (reuse story editor pattern)
  - Pauses `useStoriesPlayback` while open or caption expanded
  - Header: title + count; drag handle; Esc / close resumes playback
  - Row: avatar (→ profile), name, time, body (3 lines + expand), heart, Reply
  - Owner row: subtle “Author” badge when `authorId === ownerUserId`
  - Replies: indent + “View N replies” if N > 3
  - Composer: 500 char limit (show counter after 400); `runWithProfileName` before focus
  - Reply banner: “Replying to @x” + cancel
  - Long-press: Report (`ReportMessageModal` UX) / Delete
  - Empty: “No comments yet”; error/offline states
  - Soft-deleted comment: “Comment removed” (keep thread slot)

### 4.2 Per slide type

| Slide | Rail | Caption | Notes |
|-------|------|---------|-------|
| `MediaStorySlide` | Bottom-right, above safe area | Bottom-left | Double-tap on media frame |
| `GamePromoStorySlide` | Above existing CTA | System caption + game line | CTA remains primary |
| `GameResultStorySlide` | Same | Result summary line | Don’t overlap stats row |

### 4.3 Visual language

- `OVERLAY_CONTROL_GLASS`, white / `white/80` type
- `framer-motion` sheet + heart; `lightHaptic` on like / send
- `prefers-reduced-motion`: no float heart; keep toggle feedback

### 4.4 Create / edit flow

- Story editor: optional **Caption** field (not text tool)
- `POST /stories/items` accepts `caption?: string`
- v2.1: `PATCH /stories/items/:id` caption for own active item

---

## 5. Data model (Prisma)

Use `npx prisma migrate dev`; no hand-written SQL migration files.

### 5.1 `UserStoryItem`

```prisma
caption String?  // max 220, trimmed server-side
```

### 5.2 `StorySegmentLike`

```prisma
model StorySegmentLike {
  id         String          @id @default(cuid())
  sourceType StorySourceType
  sourceId   String
  userId     String
  createdAt  DateTime        @default(now())
  user       User            @relation(...)
  @@unique([sourceType, sourceId, userId])
  @@index([sourceType, sourceId])
}
```

### 5.3 `StorySegmentComment` + `StoryCommentLike`

```prisma
model StorySegmentComment {
  id               String          @id @default(cuid())
  sourceType       StorySourceType
  sourceId         String
  ownerUserId      String
  authorId         String
  parentId         String?
  body             String
  clientMutationId String?
  createdAt        DateTime        @default(now())
  deletedAt        DateTime?
  author           User            @relation(...)
  parent           StorySegmentComment?  @relation("CommentReplies", ...)
  replies          StorySegmentComment[] @relation("CommentReplies")
  likes            StoryCommentLike[]
  reports          StoryCommentReport[]
  @@unique([authorId, clientMutationId])
  @@index([sourceType, sourceId, createdAt])
  @@index([parentId])
}

model StoryCommentLike {
  id        String   @id @default(cuid())
  commentId String
  userId    String
  createdAt DateTime @default(now())
  @@unique([commentId, userId])
}
```

### 5.4 `StoryCommentReport`

Mirror `MessageReport` + admin queue.

### 5.5 Retention

- **Manual:** cascade delete likes/comments in `expireStories.ts` when `UserStory` removed
- **Activity:** purge engagement older than `ACTIVITY_WINDOW_MS + 1d` via nightly `pruneStoryEngagement.ts` (optional cron)

### 5.6 User merge / delete

- Add remaps in [`userMergeRemaps.ts`](Backend/src/services/user/userMergeRemaps.ts) for likes, comments, reports
- Account delete: cascade via Prisma `onDelete: Cascade` on `userId` relations

---

## 6. Backend

### 6.1 Folder layout

```
Backend/src/services/storyEngagement/
  storyEngagement.permissions.ts
  storyEngagement.caption.ts
  storyEngagement.like.service.ts
  storyEngagement.comment.service.ts
  storyEngagement.commentLike.service.ts
  storyEngagement.feedCounts.ts
  storyEngagement.events.ts
Backend/src/controllers/storyEngagement.controller.ts
Backend/scripts/cron/pruneStoryEngagement.ts   // optional
```

Extend [`story.routes.ts`](Backend/src/routes/story.routes.ts) under `/api/stories`.

### 6.2 Permissions

For `(viewerId, sourceType, sourceId, ownerUserId)` — **`ownerUserId` required on all engagement routes** (query or body) so server does not infer from `sourceId` alone on `GAME_PHOTO`:

1. Segment exists and passes same visibility as feed
2. Viewer follows owner (or is owner)
3. Not blocked
4. Comment: `nameIsSet`, body valid, parent is top-level if `parentId` set

### 6.3 API surface

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `.../engagement?ownerUserId=` | Summary + caption |
| `POST` | `.../like/toggle?ownerUserId=` | `{ liked, likeCount }` |
| `GET` | `.../likes?ownerUserId=&cursor=` | **E5.5** liker list (BasicUser[]) |
| `GET` | `.../comments?ownerUserId=&cursor=` | Top-level + reply preview |
| `GET` | `/comments/:id/replies?cursor=` | Reply page |
| `POST` | `.../comments?ownerUserId=` | `{ body, parentId?, clientMutationId? }` |
| `DELETE` | `/comments/:id` | Soft-delete |
| `POST` | `/comments/:id/like/toggle` | Comment heart |
| `POST` | `/comments/:id/report` | `{ reason? }` |

**Feed** (`GET /api/stories/feed`): batch `engagement` per segment key.

**Comment DTO:**

```ts
{
  id: string;
  body: string;
  createdAt: string;
  author: BasicUser;
  likeCount: number;
  viewerHasLiked: boolean;
  replyCount: number;
  isSegmentOwner: boolean;
  deletedAt?: string | null;
  previewReplies?: StoryCommentDto[];
}
```

### 6.4 Error codes

| Code | HTTP | When |
|------|------|------|
| `STORY_SEGMENT_NOT_FOUND` | 404 | Expired / not visible |
| `STORY_ENGAGEMENT_FORBIDDEN` | 403 | Not follower / blocked |
| `STORY_COMMENT_INVALID_PARENT` | 400 | Nested reply |
| `STORY_COMMENT_BODY_INVALID` | 400 | Empty / too long |
| `STORY_COMMENT_RATE_LIMIT` | 429 | Throttled |
| `STORY_COMMENT_CAP_REACHED` | 429 | 500 comments on segment |
| `STORY_COMMENT_NOT_FOUND` | 404 | Deleted / missing |

### 6.5 Synthetic captions

| sourceType | Template |
|------------|----------|
| `GAME_PHOTO` | `{game.name \|\| sport} · {clubName}` |
| `GAME_CREATED` | `New game · {club} · {relative time}` |
| `GAME_RESULT` | `{W/L} · {game.name} · {wins}-{losses}` |
| `USER_STORY_ITEM` | `item.caption` |

### 6.6 Sockets

| Event | Payload |
|-------|---------|
| `story:like` | `{ sourceType, sourceId, ownerUserId, likeCount, viewerId? }` |
| `story:comment` | `{ comment, commentCount, ownerUserId, sourceType, sourceId }` |
| `story:comment:deleted` | `{ commentId, commentCount, ... }` |
| `story:comment:like` | `{ commentId, likeCount }` (optional) |

Emit to `user-{ownerUserId}`; optionally bump open viewers’ `storiesStore` segment engagement via client handlers in [`socketEventsStore.ts`](Frontend/src/store/socketEventsStore.ts).

### 6.7 Notifications (E6)

| Type | Recipient | Throttle |
|------|-----------|----------|
| Story liked | Segment `ownerUserId` | 1 per (owner, segment, actor) per 24h for likes; batch “N people liked” if >3 in 1h |
| Story comment | Owner | 1 per segment per 5 min per actor |
| Comment reply | Parent author + owner (dedupe if same) | 1 per thread per 5 min per actor |

- In-app + push; Telegram only if story notifications already exist elsewhere
- Respect existing notification preference patterns
- Skip if actor === recipient

### 6.8 Admin

- Admin API + UI for `StoryCommentReport` (mirror [`messageReports.service.ts`](Backend/src/services/admin/messageReports.service.ts) / Admin panel)

---

## 7. Frontend

### 7.1 Files

```
Frontend/src/api/storyEngagement.ts
Frontend/src/hooks/useStorySegmentEngagement.ts
Frontend/src/hooks/useStoryComments.ts
Frontend/src/components/stories/viewer/   // chrome, sheet, rows, composer
Frontend/src/store/storyEngagementStore.ts  // optional cache
```

### 7.2 Store merge

- **Primary:** embed `engagement` on each `StorySegment` in [`storiesStore`](Frontend/src/store/storiesStore.ts) feed bubbles
- On socket: `patchSegmentEngagement(segmentKey, partial)` + prepend comment if sheet open
- On viewer open: `GET .../engagement` if feed older than 60s TTL or counts missing
- `storyEngagementStore` only if sheet needs heavy list state decoupled from feed

### 7.3 Gates

- `featureFlags.stories`
- Unauthenticated: rail visible; tap → login toast
- Comment composer: `runWithProfileName` before focus

### 7.4 i18n

`stories.viewer.*` in all `stories.json` locales (en, cs, es, ru, sr).

### 7.5 Accessibility

- `aria-label` with counts on rail
- Sheet focus trap; Esc closes
- Screen reader: “Comment removed”, pending send state

### 7.6 Deep links (v2.1)

`?storyOwner=:userId&segment=:key&comments=1` — open viewer + sheet (document only until routing exists)

---

## 8. Owner-facing engagement

| Feature | v2 | v2.1+ |
|---------|----|-------|
| Aggregate counts on rail | Yes (owner sees on own story) | — |
| Tap like count → liker avatars | Optional E5.5 | — |
| Full viewer list (`StoryView`) | No — stays separate | Build on `applyStoryViewed` |

---

## 9. Phased rollout

| Phase | Deliverable |
|-------|-------------|
| **E1** | Schema, migrate, like toggle, feed counts, rail, double-tap |
| **E2** | Caption column, create UI, strip, synthetic captions |
| **E3** | Top-level comments, sheet, swipe-up, composer, playback pause |
| **E4** | Replies, comment likes, thread UI |
| **E5** | Sockets, store patch, report/delete, admin reports, haptics |
| **E5.5** | Likers list sheet (optional) |
| **E6** | Push / in-app notifications |
| **E7** | `story-engagement.ts` tests + manual QA matrix |

---

## 10. Edge cases

| Case | Behavior |
|------|----------|
| Segment removed from feed | Close sheet; clear pending; rail hidden |
| `shareGame*` off → segment gone | Engagement 404 |
| Unfollow mid-view | 403 on next action; refresh feed |
| Block user | 403 new actions; hide their comments |
| `GAME_PHOTO` bubble owner ≠ uploader | `ownerUserId` = bubble user for API |
| Duplicate `clientMutationId` | Return existing comment (idempotent) |
| Socket race while sheet loading | Merge or prepend by `id`; de-dupe |
| Self story | Full engage; no self-notify |
| Deleted author | “Deleted user” |
| `featureFlags.stories` off | No rail; no API calls |

---

## 11. Performance

- Feed: one batched counts query for all segment keys in response
- Comments: keyset cursor `(createdAt, id)`
- Load comments only when sheet opens
- Likers list: paginated, only on E5.5 tap

---

## 12. Safety & abuse

- Rate limits (§2) enforced server-side
- Reports → `StoryCommentReport` → admin queue
- Reuse [`ReportMessageModal`](Frontend/src/components/ReportMessageModal.tsx) patterns
- No profanity service v2 — rely on report + delete
- Owner may delete any comment on their segments

---

## 13. Testing

**Automated** `Backend/scripts/tests/story-engagement.ts`:

- Like toggle idempotency
- Permissions: non-follower, blocked, expired, share-flag hidden segment
- `GAME_PHOTO` with mismatched uploader vs `ownerUserId`
- Reply depth, `clientMutationId` replay
- Owner vs author delete
- Feed counts batch
- Expiry cron removes engagement
- Comment cap 429

Add to [`run-all.ts`](Backend/scripts/tests/run-all.ts).

**Manual QA**

- All three slide types: rail + caption + CTA layout
- Swipe-up + comment button equivalence
- iOS Safari keyboard + sheet inset
- Double-tap vs tap zones / gesture layer
- Reduced motion
- Offline toasts
- Block user hides comments
- Socket updates count while viewer open

---

## 14. Out of scope (v2)

- Emoji picker on segment (❤️ only)
- Full **who viewed** list from `StoryView`
- DM reply from story
- `@mention` autocomplete + mention notifications
- Edit comment; unlike history audit
- Sort comments by “top” / likes
- Pinned comments; GIF/sticker comments
- Share segment externally; link previews in comments
- Public / non-follower discovery
- Comment translation
- Hide like counts (IG setting)
- Mute / hide user’s stories
- Offline mutation queue for comments
- HLS / highlights

---

## 15. Related docs & code

| Area | Location |
|------|----------|
| Stories v1 plan | [PLAN_STORIES.md](./PLAN_STORIES.md) |
| Frontend queue | [STORIES_FRONTEND_NEXT.md](./STORIES_FRONTEND_NEXT.md) |
| Viewer | `Frontend/src/components/stories/StoriesViewer.tsx` |
| Feed / permissions | `Backend/src/services/story/story.feed.service.ts`, `story.permissions.ts` |
| Store / sockets | `Frontend/src/store/storiesStore.ts`, `socketEventsStore.ts` |
| Share toggles | `Frontend/src/pages/Profile.tsx` |
| Reactions pattern | `GameCardReactions.tsx`, `useGameChatReactions.ts` |
| Reports | `messageReport.service.ts`, `ReportMessageModal.tsx` |
| Blocked users | `blockedUsersApi` |
| Expiry cron | `Backend/scripts/cron/expireStories.ts` |
| Feature flags | `Frontend/src/config/featureFlags.ts` |

---

## 16. Reuse map

| Pattern | Source |
|---------|--------|
| Optimistic reactions | `useGameChatReactions`, `GameCardReactions` |
| Reply threading | Chat `replyToId` (1-level) |
| Bottom sheet | `Drawer` (Vaul), `PlayerCardBottomSheet` |
| Reports | `messageReport.service.ts` |
| Segment permissions | `story.permissions.ts` |
| Interactive hit-test | `data-story-interactive` in `StoriesGestureLayer` |
| Keyboard inset | `useVisualViewportInset` (story editor) |
| Profile gate | `runWithProfileName` |

---

## 17. Implementation order

1. Prisma + `migrate dev` + user merge remaps
2. `feedCounts` + feed DTO + error codes
3. Like toggle + rail + double-tap
4. Caption + create UI + strip + synthetic captions
5. Comments CRUD + sheet + swipe-up
6. Replies + comment likes
7. Sockets + `storiesStore` patch + reports + admin
8. Extend `expireStories.ts` + optional prune cron
9. Notifications (E6) + tests + flags

---

## Orchestration progress

### Backend
- [x] Prisma models + `migrate dev`
- [x] `userMergeRemaps` for engagement tables
- [x] `storyEngagement/*` services
- [x] Routes + controller + error codes
- [x] Feed counts batch
- [x] `expireStories` engagement cascade
- [x] Sockets
- [x] Admin story comment reports
- [x] `story-engagement.ts` tests

### Frontend
- [x] `storyEngagement.ts` API
- [x] `viewer/*` components + slide layouts
- [x] `StoriesViewer` + `storiesStore` socket patch
- [x] Create flow caption field
- [x] i18n
- [x] Engagement gated by `featureFlags.stories` only (removed `storyEngagement` flag)

### QA
- [x] Backend lint + automated tests
- [x] Frontend lint
- [ ] Manual checklist (§13)

**Test run: PASS** (2026-05-25) — `story-engagement.ts` all §13 checks passed; integrated in `run-all.ts`.

**Post-QA fixes:** Real socket emits for comments; `liked` on `story:like`; store comment-like + live comment prepend; E5.5 likers sheet; feed→viewer engagement sync.
