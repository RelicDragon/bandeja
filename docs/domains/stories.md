# Stories

Instagram-style ephemeral rail on Home (`StoriesRail`). TTL 24h (`STORY_TTL_MS`). Max 20 segments/user, 100 bubbles, overlay text 80 chars, video 60s.

## Create / editor

Photo (text overlays, stickers, filters, crop, caption) and video. From + menu / rail. `story.create.service.ts`.

## Auto slides

`GAME_CREATED`, `GAME_RESULT`, `GAME_PHOTO`, `BRACKET_CHAMPION` (`SOURCE_PRIORITY`). `bracketChampionStory.service.ts`, `story.resultDetails.service.ts`. EVENT promo reuses listing avatar.

## Monthly recap

`StorySourceType.MONTHLY_RECAP` is the sixth source and the odd one out: it is the only source that is **not** visible in `StoryFeedService.getFeed`. It has two completely separate representations.

| | The owner's reel | What followers see |
|---|---|---|
| Produced by | `services/recap/recapSegments.ts` | `services/recap/recapShare.service.ts` |
| Source type | `MONTHLY_RECAP` | `USER_STORY_ITEM` |
| Rendering | client-side from the payload | server-rendered PNGs (sharp → S3) |
| Reached via | `GET /users/me/recaps/:monthKey` | the normal story feed |
| Lifetime | 12 months in `MonthlyRecap` | 24 h `UserStory.expiresAt` |

The reason is the privacy rule: **an unshared recap never creates a story row.** Generating a recap writes exactly one `MonthlyRecap`; nothing about it is reachable by anyone but its owner until they press Share. Sharing then publishes *images*, not the payload — so a follower can never read a number the owner chose to leave out of the selection.

`MONTHLY_RECAP` is in `SOURCE_PRIORITY` (highest, 4) for completeness. It has no `gameId`, so the feed's game dedupe never sees it.

**Segment keys** are `MONTHLY_RECAP:<monthKey>#<slideKey>` (e.g. `MONTHLY_RECAP:2026-09#wins:PADEL`) — stable across regenerations, unique per slide. `storySegmentSlideVersion` derives slide identity from `monthKey` + `slideKey` only; `engagement` and `viewed` are deliberately excluded, because a like arriving mid-playback would otherwise remount the slide.

**Provenance of a published reel.** `UserStoryItem` has no source column, so a shared recap slide is tagged through `clientUploadId = recap:<monthKey>:<slideKey>`. `(storyId, clientUploadId)` is already unique, so one month can never publish the same slide twice, and re-sharing a month finds and soft-deletes the superseded reel with a `startsWith` scan instead of a second table.

Each publication uses its own media keys. A superseded story retains its soft-deleted items until expiry, and the expiry sweep deletes their objects; sharing those keys with a newer publication would erase images from an active reel. Summary-card exports likewise have independent keys.

**Retention.** `pruneExpiredMonthlyRecaps` lives in `story.prune.service.ts` next to the story-media sweep, uses the same ascending-id cursor batching, runs from `MonthlyRecapScheduler` on every pass, and drops `MonthlyRecap` rows older than 12 months.

Payload shape, eligibility, the UTC month boundary and the neutral-level rule: [social-and-profile.md](./social-and-profile.md).

> **Adding a story source** still means touching all five hand-written switches (`Frontend/src/api/stories.ts`, `storiesViewerSlideKind.ts`, `storyPlayback.ts`, `storiesViewerSlide.tsx`, `store/storiesStore.ts`) plus the backend union and `SOURCE_PRIORITY`. Two of them have a `default` and will compile silently if you miss them.

## Viewer

Navigate others’ stories. Likes, comments (report), view counts. Quick emoji from viewer. Socket engagement (`storyEngagement.events.ts`).

## DM replies

Story reply lands in user chat as `STORY_REPLY` card (`StoryReplyPreview`). Thumbnail / media; owner vs sender copy.

## Expiry

`story.expire.service.ts` (Telegram scheduler ~5–10 min): delete expired `UserStory`, engagement, S3 media. `story.prune.service.ts` for retention.

## Code

BE: `Backend/src/services/story/*`, `storyEngagement/*`, `/stories`. FE: `Frontend/src/components/stories/*`.
