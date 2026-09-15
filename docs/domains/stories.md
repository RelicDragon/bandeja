# Stories

Instagram-style ephemeral rail on Home (`StoriesRail`). TTL 24h (`STORY_TTL_MS`). Max 20 segments/user, 100 bubbles, overlay text 80 chars, video 60s.

## Create / editor

Photo (text overlays, stickers, filters, crop, caption) and video. From + menu / rail. `story.create.service.ts`.

## Auto slides

`GAME_CREATED`, `GAME_RESULT`, `GAME_PHOTO`, `BRACKET_CHAMPION` (`SOURCE_PRIORITY`). `bracketChampionStory.service.ts`, `story.resultDetails.service.ts`. EVENT promo reuses listing avatar.

## Viewer

Navigate others’ stories. Likes, comments (report), view counts. Quick emoji from viewer. Socket engagement (`storyEngagement.events.ts`).

## DM replies

Story reply lands in user chat as `STORY_REPLY` card (`StoryReplyPreview`). Thumbnail / media; owner vs sender copy.

## Expiry

`story.expire.service.ts` (Telegram scheduler ~5–10 min): delete expired `UserStory`, engagement, S3 media. `story.prune.service.ts` for retention.

## Code

BE: `Backend/src/services/story/*`, `storyEngagement/*`, `/stories`. FE: `Frontend/src/components/stories/*`.
