# Engagement and growth plan

Status: planning only. Nothing here is built.
Scope: small, visible improvements that bring more players in and make existing players play more often.
Builds on PRDs 345–357 (series, attendance, spot alerts, cost split, live rail, onboarding, referral, pair leaderboard, monthly recap, club page, shop, Telegram `/play` `/live`, weather alerts). Nothing below duplicates them.

Explicitly **out** of this plan: confirmed-level badges (do not use `approvedLevel` anywhere here), dynamic share images, profile link previews, store review prompt, Chats empty-state city-group prompt (users are already auto-joined to the city group, muted and pinned, on city set/switch).

---

## 1. UX rules for every item

These are hard constraints. An item that cannot meet them is cut, not squeezed in.

1. **Mobile first.** Design for a 375 pt phone with the software keyboard open. Desktop inherits. Follow the keyboard contract in `Frontend/src/utils/keyboardLayout.ts` and animate overlays with the existing `data-state` keyframes.
2. **No new top-of-page elements on My or Find.** Both tabs are already stacked (stories, city banner, questionnaire, unlinked bookings, hero ad, action grid, invites, calendar on My; header chip, play-intent strip, ad, chips, calendar, events rail on Find). New information goes **into** existing containers: a row inside a card, a line inside an existing section, a tab inside an existing sheet, an existing empty state.
3. **One-line budget.** Where a new line is unavoidable, it is one line, single colour, one action, dismissable, and it never shows more than one at a time. A priority order decides which line wins.
4. **Cards grow by at most one row.** Card height on Find and My is the scroll economy of the app. Any new card information competes for one optional row and is shown only when it has something to say (a followed player, one seat left, starts soon). Empty rows are never rendered.
5. **Do not move the main components.** Stories rail, action grid, calendar, chip row, bottom tabs, game card header stay where they are. New surfaces are sheets, tabs inside existing sheets, or optional card rows.
6. **Progressive disclosure.** Show the smallest fact, open the detail on tap. A number in a chip, not a paragraph. A stacked avatar pair, not a list.
7. **One nudge per session.** Prompts (photo, push permission, follow after game, rate the club) share a single slot and a cooldown. The user never sees two prompts in a row.
8. **Quiet by default.** Every new push type joins the priority layer in §2. Nothing new is fire-and-forget.
9. **Localised and RTL-safe from day one.** All 11 locales, `dir=auto` where user text appears.
10. **Reversible.** Every new push, chip and line has an off switch, either a user preference or an Admin kill switch.

---

## 2. Push priority layer (prerequisite)

Today: per-category toggles and per-thread mute only. No daily cap, no quiet hours, no coalescing, no "already in the app" check. Roughly 45 push types after the PRD batch. This layer ships **before** any new social push.

### Tiers

Assigned per `NotificationType`, next to the existing type → preference map in `notificationPreference.service.ts`.

| Tier | Types | Rule |
|------|-------|------|
| Direct | DM, invites, game chat mention, game cancelled, spot opened for a queued player, results, cost reminder, weather alert, transaction | Send now, as today |
| Time-critical | Reminders, attendance re-ask, followed user live, series next-week prompt | Send now, collapse per game |
| Discovery | New game in city, followed user created a game, spot opened for followers, play-intent social, achievement, streak, challenge, recap ready | Budgeted, coalesced |
| Digest | Weekly digest, win-back | One slot per week; replaces Discovery for quiet users |

### Discovery rules

- **Budget:** 2 per user per day, Redis counter keyed by user and city-TZ day.
- **Coalesce:** 20–30 min window. Same-tier events merge into one push: "3 new games at your level this week".
- **Quiet hours:** 22:00–08:00 city time. Queue and merge into the morning send.
- **Presence suppression:** user active in the last few minutes → no push, in-app only (`presence.service.ts`).
- **Dedupe by game:** one game → at most one Discovery push per user, whatever matched it.
- **Engagement downgrade:** two weeks of ignored Discovery pushes → Digest tier only. Needs push-open tracking in the tap handlers.

### In-app sink: "What's new"

Suppressed items must still be visible, so the push layer can stay strict.

- **Where:** inside the existing **HomeActionGrid** area on My, as one compact line under the Play hero. Not a new section. Not a banner.
- **Look:** one line, up to three stacked avatars or icons, a short label, a chevron. Tap opens a bottom sheet with the list.
- **Empty:** the line does not render. No "nothing new" state.
- **Sources:** followed player created a game, achievement unlocked, merged discovery, challenge progress.

### Admin

Per-type kill switch. Per-user send log for the last 24 h with tier and outcome (sent, merged, suppressed-presence, suppressed-quiet, over-budget).

Size: M for budget + coalescing + quiet hours. S for the What's new line once the activity list exists.

---

## 3. Features

Sizes: S ≤ 2 days, M ≈ 1 week, L > 1 week. Each item states its screen placement and what it must not do.

### 3.1 Attract

**Looking-to-play count**
- What: "12 people want to play today" from the play-intent pool.
- Where: as the **subtitle of the existing Play hero** on My, and as a number badge on the existing Find header city chip. Guest game page: same number as a subtitle under the login prompt.
- Must not: add a new strip. Hidden when count < 3 (a small number demotivates).
- Size: S.

**Guest game page sells the login**
- What: "Sign in to take one of the 2 open seats" plus the avatars already on the roster.
- Where: the existing join CTA area on `/games/:id` for guests. Replaces the current plain login prompt copy; same height.
- Size: S.

**Trainer invites students**
- What: trainer's referral link (PRD 351) on the training details page, and a "my students" list from past trainings for one-tap invite.
- Where: inside the existing invite modal as a **tab** for trainers; the share action reuses the existing Share sheet.
- Must not: add a trainer-only section to the training page.
- Size: M.

**"Open to beginners" chip**
- What: filter chip and card tag for games with a low minimum level.
- Where: chip joins the existing Find chip row (scrolls horizontally already). Tag joins the existing header tag row on the card, same style as gender/private.
- Must not: add a second tag row.
- Size: S.

**Public series on Find**
- What: a series card "Every Thursday 19:00 · 1 regular seat open" with request-to-join. Discovery for PRD 345 series.
- Where: renders as a normal game card in the Find list with the existing cadence pill; no separate rail. Tap → `SeriesPage`.
- Size: M.

### 3.2 Activate

**Find empty state that acts**
- What: replace "No games found" with three stacked actions: looking count, "Create a game tomorrow evening" (prefilled), nearby-city games via the existing nearby expand.
- Where: the existing empty state only. Zero effect on the populated view.
- Size: S.

**Free courts today rail**
- What: free slots from connected-club busy snapshots; tap prefills create with club and time.
- Where: appears **only in the selected-day list when that day has fewer than 3 games**, as one horizontal rail in the position the events rail already uses. Never on a busy day.
- Must not: push the calendar down; the rail lives below it.
- Size: M.

**Availability match line**
- What: "Thursday evening: 3 games at your level" from `weeklyAvailability`.
- Where: the same one-line slot as What's new (§2), lower priority. Shown only when What's new is empty and the user has availability set.
- Size: S.

**Photo nudge with a reason**
- What: "Add a photo, organizers pick players they recognize."
- Where: the shared nudge slot (rule 7). Shown once, dismissable. Tap opens the existing avatar picker.
- Size: S.

**Push permission re-ask at join**
- What: after a successful join, if push is denied: "Remind you and ask if you're coming 2 h before?" (pairs with PRD 346 attendance).
- Where: a small bottom sheet after the join toast, not a modal over the game page. Once per 30 days. Uses `PermissionModalProvider`.
- Size: S.

### 3.3 Engage

**Followed players on game cards** (first)
- What: stacked avatars of followed players in the game, "Ana is playing", and these games sort first within the day.
- Where: the **one optional card row** (rule 4). Renders only when at least one followed player is in. Two avatars max, then "+2".
- Must not: change card header or join button.
- Size: S–M.

**Followed user created a game**
- What: new type `FOLLOWED_USER_GAME_CREATED`, Discovery tier, existing social toggle.
- Where: push (budgeted) and What's new line.
- Size: S after §2.

**"Played with" tab in invite modal**
- What: last ten distinct co-players from finished games.
- Where: a **tab** inside the existing `PlayerListModal`, next to Search and Looking. Default tab when non-empty.
- Size: S.

**"Usually free" sort**
- What: co-players whose `weeklyAvailability` covers the game slot rise to the top with a small clock icon. No badge text.
- Where: inside the Played with tab only.
- Size: S after Played with.

**Online dot**
- What: presence dot on avatars in the invite modal and roster, honouring `showOnlineStatus`.
- Where: on the avatar, no layout change.
- Size: S.

**One-tap rematch after FINAL**
- What: "Play again with these four" → duplicate + pre-invite roster. Secondary link "Make it weekly" → PRD 345 series.
- Where: inside the existing results summary block on the game page, one button. Not a new section.
- Size: S.

**Results moment**
- What: level delta in the results push body; on the results screen an animated delta, rank context "#14 in the city, one win from #12", partner insight "5th game with Ana, 4 wins", and "Invite the friend who missed this" (referral link).
- Where: the existing results summary block. Delta replaces the static level line; rank and insight are one line each below it; the invite is a text link.
- Must not: add a modal or a full-screen celebration. Respect reduced motion.
- Size: M.

**Follow players after the game**
- What: one-tap "Follow 3 players from this game", ranked by the suggested-users service from PRD 350.
- Where: the shared nudge slot, shown on the results screen only. One tap follows all; per-avatar toggle in the sheet.
- Size: S.

**Achievement toast and next-step chip**
- What: toast on unlock, links to the shop (PRD 355) when a cosmetic is unlocked. What's new line shows "2 games to 10 games".
- Where: the existing toast system; What's new line.
- Size: S.

**Streak chip**
- What: "3 weeks · play by Sunday".
- Where: as a chip **inside the calendar heading row** on My, right-aligned, replacing nothing. Hidden when streak is 0.
- Size: S.

**Quick time chips on Find**
- What: Tonight, Tomorrow, Weekend.
- Where: the existing chip row, after the entity chips. They set the advanced time window; no new control.
- Size: S.

**Subscribe from the current filter**
- What: "Alert me about games like this" prefilling a game subscription from the current chips and advanced panel.
- Where: one action at the **bottom of the advanced filter panel**, plus a link in the Find empty state. Not a Find header button.
- Size: S.

**ICS feed**
- What: tokenised calendar feed of all my games.
- Where: Profile → the existing Add-to-calendar preferences area; one "Subscribe in calendar" row with copy and revoke.
- Size: M.

**Distance on cards**
- What: "2.1 km" when geolocation is granted.
- Where: appended to the existing club line on the card, muted text. No new row. Hidden when unknown.
- Size: S.

**Urgency on cards**
- What: "1 seat left", "Starts in 2 h".
- Where: the existing join button label or the existing slots counter, not a new tag. Only one urgency at a time, seats win.
- Size: S.

**Reaction count**
- What: "🔥 3" as social proof.
- Where: the existing reactions control on the card already renders; show the count next to it only when > 1.
- Size: S.

**"When do we play?" poll**
- What: a poll template with three time slots; winning slot → one-tap create or set time.
- Where: the existing + menu in group chat and game chat; the poll renders as a normal poll message. Create action is a button on the poll card after it closes.
- Size: M.

**Challenge from the leaderboard**
- What: "Challenge" on a player row → DM with a prefilled proposal or invite to my next game. "Closest to you by level" section.
- Where: the existing player overlay (`?player=`) gets one button; the section is a collapsed group at the top of the rating list, closed by default.
- Size: M.

**Weekly movers**
- What: biggest 7-day level gain.
- Where: a new value in the existing period control (10 / 30 / all → + 7d movers). No new tab.
- Size: S.

**Score prediction for spectators**
- What: "Who wins?" for followers before a live game starts; coin bets already exist for stakes.
- Where: on the live rail card (PRD 349) as two tap targets; result shown on the same card. No push.
- Size: M.

**Rate the club after FINAL**
- What: one-question "How was the club?" feeding club reviews for the club page (PRD 354).
- Where: the shared nudge slot on the results screen, lower priority than follow-after-game, never both.
- Size: S.

**Monthly city challenge**
- What: "Play 4 games in October"; reward is coins or a shop cosmetic.
- Where: progress lives in What's new and on the profile achievements list. No Home banner.
- Size: M.

**Photo reminder**
- What: one Direct-tier reminder one hour after FINAL to the roster: "Add a photo of the game". Feeds stories and the monthly recap.
- Where: push with deep link to the photos block. Once per game.
- Size: S.

**Attendance on cards for followers**
- What: "3 of 4 confirmed" from PRD 346 data, shown to non-participants as social proof.
- Where: the same optional card row as followed players; the row shows one or the other, followed players win.
- Size: S.

### 3.4 Retain

**Weekly digest**
- What: "12 open games at your level in Belgrade this week", favourite-club games, challenge progress. Push and Telegram, Digest tier, honours preferences. Sunday 18:00 city time.
- Size: M.

**Win-back at day 25**
- What: "Your level starts losing certainty in 5 days. Games this week: …". Digest tier, reuses the inactive scheduler.
- Size: S.

**Co-player win-back**
- What: "Your regulars played 6 games without you." Digest tier, once.
- Size: S after Played with.

**Telegram as fallback channel**
- What: users with Telegram linked but no push token get digest and win-back on Telegram only.
- Size: S.

---

## 4. Shared slot rules

Two shared slots keep the screens calm. Each shows at most one thing.

**One-line slot on My (under the Play hero).** Priority: What's new → availability match → nothing. Never two lines.

**Nudge slot (bottom sheet, once per session, 7-day cooldown per nudge).** Priority on the results screen: follow players → rate the club → photo nudge. Priority elsewhere: push permission (after join) → photo nudge.

**Card optional row (Find and My cards).** Priority: followed players → attendance → nothing. Urgency and distance are not rows; they live in existing text.

---

## 5. Metrics to add to Admin first

| Metric | Why |
|--------|-----|
| Days from signup to first finished game | Activation |
| Weekly players with ≥ 1 finished game | Engagement |
| Invite → join rate | Social loop |
| Pushes sent per active user per day, by tier | Guard against flooding |

Assumption: no event analytics exists; the first three are computed from `Game` and `GameParticipant` tables.

---

## 6. Order

1. Push priority layer + What's new line (§2). Everything social depends on it.
2. Followed players on cards; followed-user-created-game push; follow after game.
3. Looking count; Find empty state that acts.
4. Played with tab; one-tap rematch.
5. Results moment with level delta.
6. Weekly digest; public series on Find; free courts rail.

Before starting item 2, confirm the closing report blocker on this branch (payment hint wiped on organizer save after a leave) is fixed.
