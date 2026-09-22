# Social and profile

## Own profile `/profile`

`Profile.tsx` / `ProfileTab`. Tabs via `shellNavStore.profileActiveTab`: **general**, **statistics**, **comparison**, **followers**, **reviews** (trainers only — non-trainers snap off reviews).

### General

Identity: avatar, name, email, gender, bio, verbal status, hand, court side. Sports: enable/disable, per-sport level (`UserSportProfile`; PADEL `User.approved*` is a denormalized mirror only), external rating hints, Playtomic import, competitive/social, weekly availability. Preferences: Home city (`switchCity` — not Browse), language, time format, week start, default currency, theme, native app icon carousel.

Premium users also have a **Main theme** selector in Appearance: **Classic** / **Premium**. `User.mainTheme` is saved on the account independently of the device's Light/Dark/System preference. It defaults to `premium` (including existing accounts), but Premium styling requires both `isPremium === true` and `mainTheme === 'premium'`. Standard users see Classic and no selector. Losing membership preserves the preference for a later renewal; choosing Classic does not remove premium benefits. Profile writes validate both the enum and premium membership. Document, loading-screen, chat, and native WebView backgrounds follow both theme choices, including System changes on resume. Classic uses cool neutral backgrounds; Premium uses warm neutrals.

Privacy: messages from non-contacts, `showOnlineStatus`, always-show names. Sharing to followers: photos / creations / results. Linked Apple/Google/Telegram. Wallet modal. Notification prefs. Blocked users. Logout / delete. Links: `/profile/sessions`, `/profile/connected-clubs`, `/game-subscriptions`, EULA. Native build number.

The Main theme control uses two visual radio choices (`components/MainThemeSelector.tsx`): Classic shows cool neutrals and blue accents; Premium shows obsidian, gold and the tiger crest. Each preview retains its own palette under either selected theme and follows Light/Dark for its page surface. A border and checkmark identify the saved selection. Native radio keyboard controls are supported; both choices are disabled while saving, and a failed save leaves the previous selection and app appearance intact.

Premium members also have a **Show premium status** switch in Appearance, saved as `User.showPremiumStatus` (default `true`). Turning it off removes the gold treatment on names and public premium owner fire markers on game cards, including chat game cards, so the member appears as a standard user. It does not alter `isPremium`, premium benefits, `mainTheme`, or Light/Dark/System. The switch is disabled while saving; failed saves preserve its prior state. Only Premium members can change it; a downgrade preserves the preference for renewal. Account merges retain either account’s opt-out. Public user projections include the preference so guests and all viewers respect it.

### Premium names

Public names receive gold lettering, a thin dark outline and a soft gold glow when `showsPremiumStatus(user)` is true (`isPremium === true` and `showPremiumStatus !== false`). The treatment uses the existing font and layout, with no underline, nameplate, added spacing or avatar decoration. Profiles, roster/invite lists, followers, rankings, chat names and DM headers share it. Opting out removes the treatment and Premium tooltip; personal theme and membership benefits remain independent.

### Premium welcome

After authenticated startup, Premium members verify `/users/me/premium-onboarding` against the server, independently of Classic/Premium theme selection. A null `User.premiumOnboardingCompletedAt` shows the full-screen Inner Circle artwork with a cinematic entrance: a gold tiger seal and vertical light seam, paired dark panels opening over 3.4 seconds, then a slow camera settle onto the unchanged poster. A single gilded light pass gives way to restrained lamplight and 24 softly glowing gold particles until dismissal. The particles build after the doors open with varied sizes, soft halos and longer rising paths from the same low origins, fading around the middle of the poster before reaching the headline. Motion begins only when the poster loads; a failed image shows a readable text welcome. A localized “I accept” compact obsidian pill with high-resolution black-and-gold marble matching the poster’s stone moving in a continuous circular orbit, muted gold text and a slow light sweep beneath the poster replaces the Close icon, with a centered text-only label, keyboard focus treatment and safe-area spacing. The button fades up as soon as the doors finish opening, while the poster continues its camera settle; reduced motion and image failure show it immediately. Its compact reserved space avoids a layout jump. Accepting, Escape, and native Back dismiss immediately and save completion in the background through `POST /users/me/premium-onboarding/complete`. First completion immediately selects the Premium main theme locally and saves `mainTheme=premium` together with the completion timestamp on the account, leaving Light/Dark/System unchanged. Replaying an already completed welcome preserves any later main-theme choice. A slow or failed save never blocks closing, shows an error, or automatically reopens the welcome during the current session. If saving fails, the server may show the welcome again on a later launch. Opening or viewing alone never completes onboarding. Completion is account-wide and idempotent, survives renewal, and is retained when accounts merge. The Premium header brand replays the same animation without route navigation; completed members incur no further write. Reduced-motion users receive the complete static poster immediately, without the entrance panels, zoom or atmospheric effects.

The Premium theme uses the gold tiger for the footer, HTML/React loading screens and native iOS/Android launch branding. Background colors still follow Light/Dark/System. Classic and non-Premium accounts retain their chosen sport/app-icon branding. Native launch changes require a new store build.

### Statistics / comparison / followers / reviews

Per-sport stats, insights, streaks, reliability, level history, player-level-feedback aggregate (privacy threshold). Head-to-head comparison. Following/followers (`/favorites/users`). Trainer reviews.

Also on Statistics: **Your partners** (pairs with ≥3 games together, with the chemistry chip — [ratings.md](./ratings.md)) and **Recaps** (up to 12 month cards — [stories.md](./stories.md)).

#### "Shows up" — attendance counters

`UserSportProfile.attendedCount` / `noShowCount` are a **cache of a derivable query**, recomputed rather than incremented, which makes every hook point idempotent and self-healing.

- `attendedCount` counts PLAYING rows with `attendance = CONFIRMED` and no no-show note, on a game that reached `resultsStatus = FINAL` or `status ∈ {FINISHED, ARCHIVED}`.
- `noShowCount` counts PLAYING rows with a no-show note on such a game.
- Both refresh **post-commit** at two points: after `recalculateGameOutcomes` ([results.md](./results.md)) and in `gameStatusScheduler.service.ts` when the sweep moves a game to FINISHED/ARCHIVED. Never inside a transaction — a counter must not be able to slow down or roll back finalisation.

**Attendance rate** = `attended / (attended + noShow)` over the trailing 12 months, exposed on `GET /users/:userId/stats` as `attendance: { rate, sampleSize, minSample } | null`. It is `null` — the whole object, not a zero — until the denominator reaches **5**, so one missed game can never read as "0 % shows up". The ring is a single tone at every value; it reports, it does not judge. The mechanics of answering and of no-show notes are in [games.md](./games.md).

## First-run onboarding (`/welcome`)

Two columns on `User` carry the whole feature:

| Column | Meaning |
|--------|---------|
| `onboardingCompletedAt` | `null` ⇒ never finished the flow. The Wave 1 migration backfilled every pre-existing account to its `createdAt`, so the flow only ever appears for genuinely new users |
| `onboardingStep` | the last step id reached, so `/welcome` resumes instead of restarting; `null` once the flow completes |

**The step ids are persisted strings — never rename one.** They are declared twice and the two lists must stay byte-identical: `Backend/src/services/onboarding/onboardingSteps.ts` and `Frontend/src/components/onboarding/onboardingSteps.ts` → `welcome, sport, profile, level, city, follow, notifications`.

`profile` (name + photo) is **conditional**: inserted only when the account has no display name or no avatar, so the visible flow is 6 or 7 steps. Everything that reports progress ("Step 3 of 6") derives from `visibleOnboardingSteps(user)`, never from the raw seven. `parseOnboardingStep` degrades a retired id to "restart" instead of throwing, and `resolveResumeStep` moves a stored step that is no longer visible forward to the next one.

**The gate.** `decideOnboardingGate` (`Frontend/src/components/onboarding/onboardingGate.ts`) is a pure function and the only place the routing rule lives; `ProtectedRoute` calls it.

| State | Result |
|-------|--------|
| `onboardingCompletedAt === null` | redirect to `/welcome` |
| completed but `sportsEnabled` empty | redirect to `/welcome?step=sport` (sport step only, headline "Pick a sport to continue") |
| completed with a sport | allow |
| auth still initialising, status unknown, guest, auth route, already on `/welcome` | allow |

The last row is load-bearing. `ProtectedRoute` does **not** wait for the auth bootstrap the way the shell-level `holdShellForBootstrap` does, and the status query can fail. Redirecting on either would bounce a perfectly normal returning user into `/welcome` on every cold start or network blip: **a failed status request is not evidence that onboarding is unfinished.**

**Deep links survive the flow.** When the gate intercepts a route it stores that path in `sessionStorage` under `bandeja_post_onboarding_path`. After the last step the flow prefers that path over the closing choice's destination, and also drains `deepLinkStore.pendingAuthPath`. `resolvePostOnboardingPath` refuses anything that is not a safe in-app path and refuses `/welcome` itself, so the flow can never loop back into itself.

**Offline.** `/welcome` is exempt from the `NoInternetScreen` gate in `App.tsx` (alongside game details, user profiles, club pages and chat). New users are *sent* here, so showing the no-internet screen would lock them out of the app entirely. The app-level `OfflineBanner` renders above the route, and every server write in the flow is best-effort: losing the per-step `PATCH` costs a resume position, never the step the user is standing on.

**The flow adds no new write endpoint.** Each step uses the one that already existed:

| Step | Endpoint |
|------|----------|
| sport | `POST /users/primary-sport/confirm`, or `POST /users/sports` + `PUT /users/primary-sport` + `DELETE /users/me/sports/:sport` when `primarySportIsSet` is already true (`persistSportSelection.ts`) |
| profile | `POST /media/upload/avatar`, `PUT /users/profile` |
| level | the existing `SportQuestionnaireContent` → `POST /users/me/sports/:sport/questionnaire` |
| city | `POST /users/switch-city` |
| follow | `POST /favorites/users` |
| notifications | `pushNotificationService.ensureTokenSentToBackend({ requestPermission: true })` — native only |

What it does add is bookkeeping and two reads, all in `Backend/src/routes/onboarding.routes.ts`, mounted at `/api/users` **before** `user.routes.ts` and all rate-limited:

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/users/me/onboarding` | routing state: `completedAt`, `step`, `resumeStep`, `needsOnboarding`, `needsSportStep`. One request per session on the client |
| `PATCH` | `/api/users/me/onboarding` | `{ step, event? }`, validated against the seven ids. Viewed events save the resume position and log the funnel event; completed/skipped events only log, so delayed analytics cannot overwrite a newer position. Never clears `onboardingCompletedAt` |
| `POST` | `/api/users/me/onboarding/complete` | **idempotent** — a second call keeps the original timestamp, so a retried offline mutation cannot move the completion date |
| `GET` | `/api/users/suggested?cityId&sport&limit` | follow suggestions, ≤20, default 8 |

**`GET /users/suggested` ranking** (`services/onboarding/suggestedUsers.service.ts`):

1. Count `GameParticipant` rows with `status = PLAYING` on `FINISHED` games in the given city and sport, started within the last **60 days**; order by that count descending.
2. Exclude, as a set: the viewer, every user in a `BlockedUser` row **in either direction**, and everyone the viewer already follows.
3. If fewer than `limit` remain, top up with active users in the same city who have the sport enabled, newest first, reporting `gamesInWindow: 0`. This keeps the step from being empty in a young city, but the fallback rows always sort **behind** ranked ones and never carry an invented count.
4. Project with `USER_SELECT_WITH_SPORT_PROFILES` — the same safe shape every other public list uses. **Never widen this to `PROFILE_SELECT_FIELDS`**: that carries phone, email, wallet and notification preferences.
5. The "{{count}} games this month" number is a **separate 30-day count**, not the ranking number.

Home prompts are not replaced by the flow — [home-and-find.md](./home-and-find.md). City social proof: [cities.md](./cities.md).

## Monthly recap payload

`MonthlyRecap.payload` is a versioned JSON blob (`version: 1`) with one hard rule: **it is language-free.** No month name, no formatted percentage, no pluralised noun, no pre-rendered string. It stores `monthStart` (ISO, UTC), raw counts, `winRatePct` as a whole number and `weekdayOffset` as a Monday-based index. Everything a user reads is formatted at render time by `Frontend/src/features/recap/recapFormat.ts` through `Intl` for the active locale.

That is what makes a twelve-month archive survive a language switch, and it is why the *image* renderer (`services/recap/recapSlideImage.renderer.ts`) needs its own copy table: images are baked at share time and therefore do need words.

**Eligibility and the day window.** `MonthlyRecapScheduler` runs `0 4 1-3 * *` and targets the month that just ended. Two sweeps, both cursor-paged by ascending `userId`: users with ≥1 FINAL game in that month get the full recap; users with no game that month but activity in the previous 90 days get the low-activity variant. `EntityType.EVENT` and `EntityType.BAR` are excluded — they are not a personal result.

**Idempotency is the unique key, never a `Set`.** `generateMonthlyRecap` does a plain `create` and treats `P2002` as "already done": it returns `created: false` and the scheduler stays silent. That is the entire reason the 2nd and 3rd of the month do not re-push. Do not "optimise" it into an `upsert` — an upsert reports success on every pass and the notification guard is lost.

**Month arithmetic is UTC.** `recapMonth.ts` is deliberately timezone-free: "September" has to mean the same 30 days to the scheduler, the payload builder and the retention sweep. The client re-labels the month with `Intl`, so the UTC boundary is never visible.

**The neutral-level rule.** A slide whose `level.delta < 0` is marked `sensitive: true`, which does two things: the share sheet leaves it unticked by default, and the viewer swaps the celebratory caption for a neutral one ("Level moved to 3.8"). This is a product invariant — a player with a bad month must not be made to feel bad by their own recap. `sensitive` currently has exactly this one producer; a second one would mean revisiting the share-sheet default deliberately.

**Best partner** is computed inside the recap month only (teammates in decided matches, ranked by wins, then games, then the stable user id). It is *not* the profile's all-time `bestPartner` from `userPerformanceInsights.service.ts`, and it is not `PairStat` — both are unbounded in time.

Story mechanics, sharing and retention: [stories.md](./stories.md).

## Other profile `/user-profile/:userId`

Guest-readable. Avatar, stats, levels, favorite/follow, share, DM, block, reviews. `?sport=` for level context.

## Social graph

- Follow/unfollow: API `/favorites/users` (UI “follow”). Also highlights trainers on Find.
- Favorite clubs: separate API; Find filter shortcut.
- Block/unblock: chat + follow.
- User teams `/user-team/:id`: pair, invite, add pair to a game the member can invite to, delete.
- Invite friend: share link (Home empties / invite modal).

### Co-play (PRD 361)

"Played with" means both users had `GameParticipant.status = PLAYING` in the same game with `resultsStatus = FINAL`, started inside the last 12 months, and the entity type is not `BAR`, `LEAGUE_SEASON` or `EVENT`. Queue, invited, guest, trainer (`NON_PLAYING`) seats never count; `UserInteraction` tap counts are a tiebreaker only, never evidence of having played. The predicate lives once in `Backend/src/services/user/coPlay.service.ts` (`loadCoPlayers`, `rankInvitablePlayers`); the profile "last played together" line reuses it later.

`GET /users/invitable-players` returns `gamesTogetherCount` and `lastPlayedTogetherAt` per row, excludes blocked pairs in both directions, always includes the ten most recent still-invitable co-players even when they live outside the Browse city, and with an empty query orders by `lastPlayedTogetherAt DESC NULLS LAST, gamesTogetherCount DESC, interactionCount DESC`.

Invite modal, Search tab, empty query: a "Played with" group (≤10, most recent first, co-players without the game sport enabled omitted) above "Everyone in {Browse city}"; a Played-with row shows "Played together {when} · {N games}" instead of the together badge. Any query text collapses the groups; clearing restores them from the per-open react-query cache (`queryKeys.invitePicker.bundle`) without a refetch. No history → no headings. Not a third tab; the Looking tab, sport chips, filters and the send path are unchanged.

## Player overlay `?player=`

`PlayerCardModalManager` + `urlSchema.getOverlay`. Bottom sheet: avatar/stats, follow, block, DM, invite, send coins (`SendMoneyToUserModal`), common groups `GET /users/:id/common-groups`. `?sport=` preserved.

## Sessions `/profile/sessions`

Per-device refresh sessions; revoke one / all.

## i18n

`APP_UI_LANGUAGES`: en, ru, sr, es, cs, ar, zh, id, hi, th, ja. Synced from `user.language`. RTL: ar. Fallback en. Namespaces under `Frontend/src/i18n/locales/<lang>/`.
