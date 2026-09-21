# Domain glossary

Canonical words. Do not invent synonyms. Schema: `Backend/prisma/schema.prisma`. League-withdrawal terms also live in root `CONTEXT.md`.

Format: **Term**: meaning. _Avoid_: wrong names.

## Entity types (`EntityType`)

Every scheduled row is a `Game`. `entityType` says which kind.

| Value | Meaning |
|-------|---------|
| `GAME` | Standard match or social session |
| `TOURNAMENT` | Bracket-oriented event |
| `TRAINING` | Coach-led session; trainer is `Game.trainerId`, not a participant flag |
| `BAR` | Bar meetup (simplified social) |
| `LEAGUE` | Fixture sub-game under a season (`parentId` → season) |
| `LEAGUE_SEASON` | Season hub (schedule, planner, standings, FAQ) |
| `EVENT` | External camp / tournament / league **listing**. No rating, results, courts, or Game Settings. Kind is `eventKind`, not extra entity types |

**event (lowercase / prose)**: any `Game` row, or a calendar “event”, or a Socket.IO event, or a `LinkToAppEvent`. Ambiguous. _Avoid_: using this as if it were `EntityType.EVENT`.

**Event (product)**: only `EntityType.EVENT`. Create at `/create-event` (`CreateEventWrapper`). Lands as `eventApprovalStatus=ON_APPROVE`. Public Find/details/RSVP after `APPROVED`. Owner + `isAdmin` see pending. _Avoid_: “ad” as the type name (create menu may say Event/Ad; the enum is `EVENT`).

**EventKind** (`Game.eventKind`, Event rows only): `TOURNAMENT` \| `LEAGUE` \| `CAMP`. _Avoid_: treating these as `EntityType` values.

**EventApprovalStatus**: `ON_APPROVE` \| `APPROVED` \| `DECLINED`.

## Game.status vs league UI labels

**Game.status** (`GameStatus` on every `Game`): `ANNOUNCED` \| `STARTED` \| `FINISHED` \| `ARCHIVED`. Scheduler: `Backend/src` game-status job (`calculateGameStatus`). `timeIsSet === false` forces `ANNOUNCED`. `resultsStatus === IN_PROGRESS` → `STARTED`. In the scheduled window → `STARTED`. Results-based types (`GAME`, `LEAGUE`, `TOURNAMENT`, `TRAINING`) are **not** auto-set to `FINISHED` by the scheduler; they stay on the results flow until finalized. _Avoid_: `READY`, `PLAYING`, `SCHEDULED` as stored `Game.status`. CLAUDE.md is stale here.

**BracketMatchStatus** (league bracket chrome only): `TBD` \| `READY` \| `SCHEDULED` \| `LIVE` \| `FINAL` \| `WALKOVER` \| `FORFEIT`. Code: `Frontend/src/utils/leagueBracketMatchStatus.ts`. `READY` = game exists, no `startTime`, not live/final. `SCHEDULED` = has `startTime`. `LIVE` = `resultsStatus === IN_PROGRESS`. _Avoid_: writing these to `Game.status`.

**League schedule “my games” labels**: `NOT_SCHEDULED` \| `SCHEDULED` in `Frontend/src/utils/leagueScheduleMyGameStatus.ts`. `SCHEDULED` means `timeIsSet === true` or `resultsStatus === IN_PROGRESS`. Independent of `Game.status`.

**ResultsStatus** (`Game.resultsStatus`): `NONE` → `IN_PROGRESS` → `FINAL`. Drives live scoring, photo gallery, bet lock, court cameras on details.

## Participants

**ParticipantStatus** (`GameParticipant.status`):

| Value | Counts toward `maxParticipants` slots? | Notes |
|-------|----------------------------------------|-------|
| `PLAYING` | **Yes** | Active roster |
| `IN_QUEUE` | No | Waiting owner approval |
| `INVITED` | No | Pending invite |
| `GUEST` | No | Chat-only guest |
| `NON_PLAYING` | No | e.g. non-playing owner, trainer not in roster |
| `INVITE_DECLINED` | No | Deprecated; outcomes live on `GameInviteOutcome` |
| `INVITE_CANCELLED` | No | Deprecated; same |

Only `PLAYING` fills slots. _Avoid_: counting queue/invites as occupancy.

**ParticipantRole**: `OWNER` \| `ADMIN` \| `PARTICIPANT`.

**Trainer**: `Game.trainerId` FK to `User`. _Avoid_: a “trainer” participant flag.

## Play intent vs matching lobby game vs notify

**Play intent**: a city + sport (or BAR) wish to play. Compose entity types are `GAME` or `BAR` only (`Backend/src/services/playIntent/playIntent.schemas.ts`). Status `PlayIntentStatus`: `OPEN` → `MATCHED` (in a proposal or reserved by invite) → `CONSUMED` \| `EXPIRED` \| `CANCELLED`. Only a join that lands `PLAYING` consumes a reachable looking intent. `IN_QUEUE` does not. _Avoid_: “lobby” as the intent row; “match” as the intent.

**Matching lobby game**: a public `GAME` / `TOURNAMENT` / `BAR` that fully fits the viewer’s looking intent and still has a `PLAYING` slot. Returned as `matchingGames[]` on the pool (`Backend/src/services/playIntent/playIntentMatchingGames.ts`). Cap 4. Sport intent radar: `GAME` + `TOURNAMENT`. BAR intent: `BAR` only. `EVENT` → empty list. Not `PoolMember` physics. Direct-join vs queue is chrome (`allowDirectJoin`); a free `PLAYING` slot is required either way. _Avoid_: stuffing games into player orbits; treating `allowDirectJoin` as the notify predicate.

**`GAME_MATCHES_INTENT`**: push/Telegram type (`Backend/src/types/notifications.types.ts`). Delivery queued in `playIntentNotify.service.ts` + `playIntentNotificationDeliveryQueue.service.ts`. **GAME and BAR only** — a fitting `TOURNAMENT` can appear on the radar without this notify. _Avoid_: tightening notify to radar membership or `allowDirectJoin`.

## Follow vs favorites

**Follow / unfollow (users)**: UI copy. API is `/favorites/users` (`Frontend/src/api/favorites.ts`: `addUserToFavorites`, `GET /favorites/users/following`, `/followers`). Also used to highlight trainers in Find. _Avoid_: calling this “favorite user” in product copy; do not mix with clubs.

**Favorite clubs**: `POST/DELETE /favorites` with `clubId`, `GET /favorites`. Star on club / Find filter shortcut. Separate table from user follows.

## Three city roles

Do not collapse these.

**Home city**: `user.currentCity`. Set via Profile or Find header `switchCity`. Drives Find, My, weather, city group chats, play-intent lobby. _Avoid_: using browse city for Find.

**Browse city**: session lens `useBrowseCityStore` (`Frontend/src/store/browseCityStore.ts`), `sessionStorage` key `bandeja.browseCity`. Drives Invite Search/Looking, chat contacts, chat Users search. Never calls `switchCity`. Default = Home. Profile city change snaps browse back to Home (recents kept). Logout clears recents.

**Venue city**: club pick (`locationCityId` / `club.cityId`). Create-game and edit-location club list; Looking **fit**. Independent of browse.

## Chat: live projection vs Dexie vs unread

**Thread live projection**: in-memory React reducer while a thread is **open**. `Frontend/src/services/chat/threadLiveProjection.ts`. Inbox can update; the open thread still applies inbound + read-receipt paths without a full refresh. Bootstrap rules: `Frontend/src/services/chat/threadOpen/types.ts`. _Avoid_: using this as the durable store.

**`applyThreadEvent`**: Dexie durability + L1 memory cache. `Frontend/src/services/chat/chatLocalApplyThreadEvent.ts`. Kinds include `syncPull`, `httpMessages`, `sendSuccess`, `socketSyncSeq`. Sibling of live projection, not a replacement. _Avoid_: skipping this and only mutating React state.

**Unread authority**: `@bandeja/unread-contract` (`packages/unread-contract/`). Merge + totals + optimistic bumps. FE: `unreadStore` / snapshot sync. Context keys `GAME:{id}` \| `USER:{id}` \| `GROUP:{id}` (`SnapshotContextType`). Totals: `all`, `games`, `userChats`, `bugs`, `groups`, `channels`, `marketplace`, `myGames`, `pastGames`. Muted threads excluded. Open-thread clear does not wait for socket round-trip. Bottom-tab badge is Chats only (`useBottomTabUnreadBadges`). _Avoid_: treating chat-card unread chips as the tab badge; treating Dexie as unread SoT.

**UnreadAuthorityReason** (`packages/unread-contract/src/types.ts`): `message_created` \| `mark_context_read` \| `mark_all_read` \| `auto_read` \| `message_deleted` \| `mute_changed` \| `snapshot_repair` \| `repair`.

## Chat sync event names

Shared FE/BE: `packages/chat-contract/src/chatSyncEventType.ts` and Prisma `ChatSyncEventType`. **Past-tense `*_ED` forms.** Not `MESSAGE_CREATE`.

| Value |
|-------|
| `MESSAGE_CREATED` |
| `MESSAGE_UPDATED` |
| `MESSAGE_DELETED` |
| `REACTION_ADDED` |
| `REACTION_REMOVED` |
| `POLL_VOTED` |
| `MESSAGE_TRANSCRIPTION_UPDATED` |
| `MESSAGE_READ_RECEIPT` |
| `MESSAGE_TRANSLATION_UPDATED` |
| `MESSAGES_READ_BATCH` |
| `READ_CURSOR_UPDATE` |
| `MESSAGE_PINNED` |
| `MESSAGE_UNPINNED` |
| `MESSAGE_STATE_UPDATED` |
| `THREAD_LOCAL_INVALIDATE` |
| `THREAD_ARCHIVED` |
| `CHAT_AUTO_TRANSLATE_CONFIG_UPDATED` |

## Club booking providers

**ClubIntegrationType**: `BOOKTIME` \| `PADELOO` \| `KLIKTEREN` \| `NSPADELSUPABASE` \| `WELTNER`. Shared type: `Frontend/shared/clubIntegration.ts`. Per-provider auth + busy snapshot models (`UserClub*Auth`, `Club*BusySnapshot`). _Avoid_: calling all of them “Booktime”.

**Nspadel**: product name for `NSPADELSUPABASE`. Club Supabase is same-origin gated; FE talks to `/api/nspadel/*` only. Anon key stays on the backend (`Backend/src/routes/nspadel.routes.ts`).

## League withdrawal (fixed-team seasons)

From root `CONTEXT.md`. Applies to `LeagueParticipant` type `TEAM` only.

**Team withdrawal**: franchise leaves remaining regular-season competition; stays on standings for history. _Avoid_: DNS, remove from group, delete participant, forfeit (alone).

**Technical win**: automatic match/fixture win for the opponent of a withdrawn team on an unfinished regular-season fixture. _Avoid_: walkover (prefer for playoff bracket unless shared implementation).

**Technical loss**: corresponding automatic loss for the withdrawn team. _Avoid_: “technical loose”.

**Played result**: fixture already decided before withdrawal; kept, not rewritten. _Avoid_: annulled result, retroactive walkover.

**Neutral technical result**: technical W/L updates standings points from W/L but adds no set/game score delta and no rating/level change. _Avoid_: scored walkover, rated forfeit.

**Standings place**: ordinal among **active** (non-withdrawn) participants only; withdrawn rows after them with no place. _Avoid_: rank including withdrawn, hidden withdrawn row.

**Unfinished fixture**: regular-season fixture whose `resultsStatus` is not `FINAL`; on withdrawal overwritten with a neutral technical result. _Avoid_: leaving `IN_PROGRESS` for manual finish.

**Withdrawal finality**: irreversible in product; technical results stay `FINAL`. _Avoid_: undo withdraw.

**Withdrawal scope (rounds)**: auto-settles unfinished `REGULAR` fixtures only; playoff slots out of scope. _Avoid_: auto playoff walkover on withdraw.

**Withdrawal eligibility**: TEAM participants in fixed-team league seasons. _Avoid_: USER withdrawal via this flow.

**Withdrawal authority**: season editors with `canEditGame` (same as mid-season player swap). _Avoid_: player self-withdraw.

**Results vs withdrawn**: fixtures against a withdrawn team remain full standings inputs for active teams. _Avoid_: annulling those games for ranking.

**Withdrawn cluster order**: same ranking rules among withdrawn rows; whole cluster after all active rows, no places.

**Withdrawn roster lock**: no player swap (or equivalent) after withdraw.

**Withdrawn group lock**: stays in its group; cannot be removed/reassigned; new REGULAR fixtures among non-withdrawn only.

**Withdraw team action (UI)**: editor action next to mid-season player swap in Manage groups, with confirm. _Avoid_: standings-only withdraw control.

## Link-to-app attribution

**aid**: 8–32 alphanumeric id (`LINK_TO_APP_AID_RE`). Carried in URLs, cookie `bandeja_aid` and localStorage `bandeja.attribution`; attribution never accesses the clipboard. First-touch: existing stored UTM/choice wins (`mergeAttributionFirstTouch` in `Frontend/src/utils/appAttribution.ts`). User columns: `attributionId`, `utmSource`/`utmMedium`/`utmCampaign`/`utmContent`/`utmTerm`, `attributedAt`, `attributionChoice`, `attributionAuthKind`. Event kinds: `view` \| `ios` \| `android` \| `web` (`Backend/src/services/linkToApp/linkToApp.urls.ts`).

## Auth refresh

**X-Refresh-Request-Id**: required header on `POST` refresh. Pattern `^[A-Za-z0-9._:-]{16,128}$`. Missing → `auth.refreshRequestIdRequired`. Invalid → `auth.refreshRequestIdInvalid`. `Backend/src/controllers/authRefresh.controller.ts`. Replay-safe one-time rotation. Default access JWT `30m`, refresh `60d`, cap `AUTH_MAX_ACTIVE_SESSIONS_PER_USER` default 20 (`Backend/src/config/jwtAuthConfig.ts`, `Backend/src/config/env.ts`).

**Weltner connection**: a player’s saved booking phone number for one club. It does not verify phone ownership or establish a Weltner account.

**Weltner booking receipt**: Bandeja’s record of a reservation submission and its outcome. It distinguishes confirmed, rejected and uncertain outcomes; it is not a live view of changes made through the club.
