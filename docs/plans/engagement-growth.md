# Engagement and growth plan

Status: revised planning scope (2026-09-22 decisions folded in). This document does not establish what is deployed.
PRDs for weeks 1–5: `docs/plans/prd-358-364/` (README lists grouping and the code facts verified on 2026-09-22 that corrected §5.1, §5.3, §5.4 and §5.5 below).
Scope: help players find a suitable game, organize it successfully, and play again.
Builds on PRDs 345–357: series, attendance, spot alerts, cost split, live rail, onboarding, referral, pair leaderboard, monthly recap, club page, shop, Telegram commands, and weather alerts. Reuse these capabilities rather than creating parallel workflows.

Explicitly **out**: confirmed-level badges, dynamic share images, profile link previews, store review prompts, and Chats empty-state city-group prompts. Users are already auto-joined to the city group, muted and pinned, on city set/switch. Attendance on cards remains participant-facing.

## 1. Outcomes and hypothesis template

Primary outcomes: **weekly players with recorded play** and **players returning for a second game**. Push opens, follows, photos, and visits are supporting signals.

Segment by city and sport. Sparse markets need help forming games; busy markets need better discovery, court access, and coordination. Establish baselines before setting uplift targets.

Every implementation brief contains:

- **Player/problem:** who is stuck, and at which step?
- **Hypothesis:** what behavior should improve, and why?
- **Reuse:** existing UI, services, and domain behavior.
- **V1/placement:** the smallest useful version, its location, and scope boundary.
- **Success/guardrails:** an outcome measure and ways the feature could make things worse.
- **Dependencies/size:** backend, data, permissions, localization, and verification, not just UI.

Sizes are rough whole-feature estimates: S ≤ 2 days, M ≈ 1 week, L > 1 week. Deferred candidates need this full brief before implementation.

## 2. UX rules

1. **Mobile first.** Design for a 375 pt phone, including sheets with the software keyboard open. Follow `Frontend/src/utils/keyboardLayout.ts` and existing `data-state` animations.
2. **No additional default clutter on My or Find.** Use existing containers, empty states, sheets, and optional card content. Replacement or simplification is allowed when it shortens the workflow.
3. **One compact message per shared slot.** Normally one line and one action, dismissible when it is a suggestion. Allow wrapping for large text and translations rather than clipping essential information. Avatar stacks appear in at most one place per screen.
4. **Cards gain at most one optional information row.** Empty rows never render. Accessible wrapping is allowed. Social hints do not displace existing participant attendance information.
5. **Predictable navigation.** Do not relocate major components merely to fit a feature. Deliberate simplification must preserve access to their actions; the layout is not frozen.
6. **Progressive disclosure.** Show a useful fact and open details on tap. Organizer next actions replace scattered hints rather than adding another dashboard.
7. **One optional nudge per session.** Follow, photo, review, and permission suggestions share a slot and cooldown. Required confirmations and user-initiated workflows are not nudges.
8. **Quiet by default.** Controls cover push and Telegram. New proactive delivery follows §4. UI improvements do not wait for the full notification roadmap. The notification settings modal already has 15 toggles: the tier layer adds at most one "Suggestions" switch for the Discovery tier and never per-type switches or an exposed tier vocabulary.
9. **All 11 locales, RTL, and accessibility.** Use `dir=auto` for user text, accessible icon labels, and reduced motion. Copy must not shame inactive players or promise uncertain outcomes.
10. **Controlled rollout.** Optional additions have a user preference or Admin kill switch. Disabling a surface must not hide information needed to manage an existing game.
11. **Replace, do not duplicate.** A new entry point for an action that already exists (rematch vs Duplicate, next actions vs existing hints) must remove or absorb the old one. Two ways to do the same thing is a defect.
12. **No external booking work in this plan.** Nothing in weeks 1–5 calls a booking provider, lists provider availability, or changes a reservation. Existing linked-booking coverage may be **read** and shown; it is never acted on. Provider-touching work is parked in §5.7 for a separate, later dive.
13. **No new rails on Find and nothing above the calendar on My.** Find has header chip, play-intent strip, ad, chip row, calendar, events rail. My has stories, city banner, questionnaire, unlinked bookings, hero ad, action grid, invites, calendar. These stacks do not grow.

## 3. Order

Scored on visibility first: how many players hit the surface per session, whether they notice the change unprompted, and whether it needs a schema or notification change. Play impact second. Verified against code on 2026-09-22: cards already carry attendance controls; the join button has no seat count; queue position and time chips do not exist.

### Week 1 — visible to everyone, no migration

1. Quick time chips: Tonight / Tomorrow / Weekend in the existing Find chip row. Sets the advanced time window; no new control.
2. Seats left on the join button: "Add me · 1 seat left" when two or fewer PLAYING seats remain, otherwise the label is unchanged. Data is already on the card.
3. Queue position: "2nd in line" for `IN_QUEUE` participants on the card and game page. One count query.
4. Suitable for novices (§5.9): organizer toggle in create and details settings, card tag, Find chip. One boolean migration; the only week-1 item with a schema change.

Measure by tap rate on each. The recorded-play contract (§8) is written this week in parallel; it does not block these.

### Weeks 2–3 — the play loop

5. Played with as the zero-query state of invite Search (§5.3). No new tab.
6. Play with this group again as the primary action after FINAL, replacing Duplicate for FINAL games (§5.4). Opens the existing create flow; no new booking logic.

### Week 3 — recovery

7. Find empty state actions: prefilled create, and saved alert once §5.2 exists. No booking action. Ship **without** the probe-query filter explanation; add the two-filter explanation as a follow-up once the actions have numbers.
8. Looking count in Find only, behind an Admin flag, labelled "this week" until a day filter exists. Not on the Play hero until the below-three copy is settled.

### Weeks 4–5 — organizing

9. Organizer next actions (§5.5). Replaces three existing components, so it gets its own week and a rollback switch. The booking-gap hint reads existing coverage only and opens the existing linked-bookings section; it does not call a provider.

### Demoted — useful but nearly invisible

10. Saved filter alerts (§5.2): schema, matcher, budget. After organizer next actions.
11. Calendar subscription (§5.8).
12. Time change v0 (§5.6). Attendance reset and one notice on time edit. Linked bookings are flagged from existing coverage data, never moved or cancelled.

### Parked — real booking touches, separate dive later

- Book a court inside the create flow, provider availability lists, slot revalidation, any Find action that opens a provider (§5.7). Not scheduled. Needs its own investigation into provider coverage per rollout city, Weltner exact-slot semantics, freshness, and failure handling before any brief is promoted.

Notification foundation (§4) runs in the backend lane from day one. It blocks nothing in weeks 1–5; it gates saved-alert delivery and any future proactive send.

### Dropped from week-1 candidates after checking

- Attendance reply on the My card: already exists (`GameCardRightRail`).
- Distance on cards: needs a permission prompt, which contradicts the one-nudge rule for a cosmetic gain.

### Small additions that ride along later

- **Last played together** on the player overlay, from the Played with co-play query. No extra backend once item 5 ships.

Before shipping affected organizer/payment work, verify the closing-report regression: payment details lost after another player leaves, followed by an unrelated organizer save. A fix report exists, but a historical report is not proof of current behavior. This is a release check for affected work, not a prerequisite for week-1 UI.

## 4. Notification foundation

Integrate with existing preferences, thread mute, and durable feature delivery claims in [notifications](../domains/notifications.md). Do not replace them with process-local sets.

### Before expanded proactive delivery

- **Durable dedupe:** claim each logical event/recipient delivery before sending. Channel attempts belong to that logical notification. Preserve existing feature-specific semantics; two meaningful events for a game are not automatically duplicates.
- **Expiry/revalidation:** every queued item has a relevance deadline. Before each attempt, recheck access, preferences, seats, time, and action validity. Drop stale items; never send yesterday's open seat in the morning.
- **Quiet hours:** default 22:00–08:00 in the recipient's Home-city timezone for Discovery/Digest. Define a fallback timezone and consistent day keys across DST and city changes.
- **Shared budget:** initially two logical Discovery notifications per recipient/local day across push and Telegram, not two per channel. Atomic claims/counters; retries reuse their claim. Define storage-failure behavior so an outage cannot cause a discovery flood.
- **Channel choice:** for new discovery, select one eligible channel respecting per-channel preferences. Telegram fallback requires an enabled, linked Telegram channel. A missing push token does not override an opt-out. Preserve existing direct-message channel behavior.
- **Admin:** per-type kill switch and rolling 24-hour log: logical notification, tier, channel, retries, and outcome (sent, failed, expired, deduplicated, queued-quiet, over-budget, disabled).

Map tiers beside `NOTIFICATION_TYPE_TO_PREF` in `notificationPreference.service.ts`:

| Tier | Examples | Policy |
|------|----------|--------|
| Direct | DM, explicit invite, mention, cancellation, queue-seat offer, result, transaction | Preserve prompt delivery and preferences; dedupe and validate relevance. |
| Time-critical | Upcoming-game reminder, attendance re-ask, actionable weather change | Collapse by recipient/game/purpose; expire stale actions; define quiet-hour exceptions per type. |
| Discovery | New game/subscription match, followed-player game or live start, follower seat alert, social play intent, achievement, recap | Shared budget, quiet hours, dedupe, expiry. Live start does not itself justify an exception. |
| Digest | Weekly opportunities, relevant return-to-play suggestions | Later: at most one weekly slot, replacing equivalent discovery rather than supplementing it. |

Classify existing series next-week prompts and cost reminders explicitly during integration; neither gets an unlimited exemption simply because it concerns a game. A cost reminder is not a transaction. Photo reminders, if enabled later, are Discovery, never Direct.

**Hypothesis:** fewer duplicate, stale, and irrelevant interruptions preserve trust while useful notifications still reach players. **Success:** duplicate/expired send rate, notification load, opt-outs, and resulting joins; monitor missed actionable delivery. **Size:** M–L across both channels, including retry behavior and rollout checks.

### Later additions

- Coalesce compatible Discovery events for 20–30 minutes, respecting expiry. Sharing a tier is not sufficient reason to merge unrelated events.
- Suppress interruptions when the user is viewing relevant content. Presence alone is not proof an item was read.
- Build **What's new** only when new discovery sources need a durable in-app destination. One compact line under the Play hero in `HomeActionGrid`, opening a sheet; hidden when empty. Respect access and remove expired actions. The activity list is backend work, not just a line of UI.
- Consider engagement-based downgrade only after delivery/open tracking is reliable. Missing open telemetry does not establish that someone ignored a notification.

## 5. Feature briefs

### 5.1 Find recovery, quick time chips, and looking count

- **Player/problem:** an unsuccessful search leaves the player without a useful next step.
- **Hypothesis:** explaining the search and offering relevant alternatives turns empty results into joins, game creation, or play intent.
- **Reuse:** Find filters, empty state, nearby expansion, create prefills, play-intent pool, Play hero.
- **V1/placement:** Today/Tonight/Tomorrow/Weekend as a segmented group replacing the go-to-today control in the calendar heading (the entity chip row is a fixed five-up grid, not a scrolling row; verified 2026-09-22, PRD 358). Explain active restrictions in the empty state; offer an explicit relaxation, prefilled create, or saved alert based on context. No booking action (§2 rule 12). Never silently change city or remove filters.
- **Bounded explanation:** the filters panel already has 18 controls, so the empty state names **at most two** blocking filters, chosen by which single relaxation returns results (one probe query per candidate, cached per session). Each named filter has one tap to relax it. If no single relaxation returns results, say so in one sentence and show create / alert only. Never list every active filter.
- **Looking count:** count distinct currently looking players for the displayed city and sport. The pool query has no day filter; either add one or label the count "this week", never "today" without it. Show within Find recovery. On the Play hero the count **always** replaces the existing hint string (neutral "Nobody looking yet" below three) so the subtitle does not flip meaning day to day; if that copy tests poorly, keep the count in Find only. No new strip. The count signals demand, not guaranteed compatible opponents. Looking remains accessible at any count.
- **Success/guardrails:** empty-search sessions leading to join/create/play intent, and subsequent recorded play. Monitor repeated empty searches and abandoned create flows.
- **Dependencies/size:** city-timezone windows, trustworthy counts, recovery queries/instrumentation, accessible filter state. M combined; quick chips or count can be S slices.

### 5.2 Save the current search as an alert

- **Player/problem:** players repeatedly search for games matching the same preferences.
- **Hypothesis:** understandable saved criteria deliver useful new games with less repeated setup.
- **Reuse:** `GameSubscription`, existing preference handling and subscription delivery.
- **V1/placement:** “Alert me about new games like this” at the bottom of advanced filters and in Find recovery. Review criteria before saving; edit/pause in existing subscription settings.
- **Scope:** newly created public games only. Reopened seats remain on PRD 347's spot-opened path. The matcher only fires for games with a `clubId`; games without a club never alert and the save sheet says so in one line. Supported entity types are those the matcher supports today; do not promise exact Find parity where matching cannot support it.
- **Volume:** a saved alert is Discovery tier and counts against the shared budget like any other proactive send. A broad alert in a busy city is the most likely flood source in this plan; it is not exempt.
- **Sport correction:** the model has no sport field. Add explicit sport scope through a named migration, API validation, matcher, and UI. Define defaults/backfill for existing subscriptions without silently changing their audience. Decide whether “my sport” saves today's choice or follows later profile changes, and explain it in the UI.
- **Filter mapping:** document supported criteria, resolve relative dates into explicit ranges, and disclose unsupported criteria rather than silently dropping them. Overlapping subscriptions must not deliver the same new game twice.
- **Success/guardrails:** matching-game joins and recorded play; mismatches, pauses, and notification volume.
- **Dependencies/size:** schema/API/matcher parity and matching tests; §4 before expanded proactive delivery. M, not UI-only S.

### 5.3 Played with

- **Player/problem:** organizers must remember names and search to invite familiar players.
- **Hypothesis:** recent co-players shorten invitation setup and help fill games.
- **Reuse:** invite modal, player search, eligibility checks, invite service.
- **V1/placement:** **not a third tab.** The invite modal already has Search, Looking, sport chips and a filter bar. Recent co-players are the zero-query state of Search: open the modal, see up to ten people you played with, type to search anyone. Relevant to the game's sport. Exclude self; respect existing access, block, and invite rules. Show current roster/invite state to avoid repeat invitations. Empty history → today's empty Search state, unchanged.
- **Co-play predicate (fixed):** both users had `GameParticipant.status = PLAYING` in the same game with `resultsStatus = FINAL`; for unscored entity types, both PLAYING with confirmed attendance. `IN_QUEUE`, `INVITED`, `GUEST`, `NON_PLAYING` never count. Trainer relationship is separate and not co-play. Order by most recent shared game, then count of shared games.
- **Data:** the invite user-search handler (`social.controller.ts`) already computes `gamesTogetherCount` with this exact predicate; PRD 361 adds `lastPlayedTogetherAt`, a 12-month window, and the empty-query ordering. Cap ten, cached per game/city/sport.
- **Success/guardrails:** time to send a useful invitation, accepted invitations, time to fill; duplicates and dismissals.
- **Dependencies/size:** history query, provenance, invite-state handling, localization. M. Usually-free sorting is later and does not imply commitment.

### 5.4 Play with this group again

- **Player/problem:** a group wants another session without rebuilding the setup.
- **Hypothesis:** reuse of format and a selectable group makes a second game easier to organize.
- **Reuse:** duplicate/create flow, invite selection, existing series conversion.
- **V1/placement:** evolve the existing **Play again** button in `GameResultsShareCard` (GAME only today; copies old time/court/booking flag; invites nobody) into one button inside results after `resultsStatus === FINAL`, as the **primary** action there; share and stories controls become secondary. For FINAL games this button **replaces** the Duplicate action in settings; Duplicate remains only for non-FINAL editable games. Open a draft with format and previous players preselected for review; choose a fresh schedule and confirm invitees. Use “Play with this group again,” independent of sport or roster size.
- **Copied fields (allow-list):** entity type, format template, level range, gender rule, club, duration, price type and currency, `affectsRating`, `isPublic`, `anyoneCanInvite`, `allowDirectJoin`, `suitableForNovices`. **Never copied:** courts, start time, booking ids/receipts/coverage, series link, `resultsByAnyone` if it was relaxed, results, attendance, cost settlements, chat, private notes.
- **Fresh state:** no copied results, attendance, settlements, booking IDs/receipts, or booking confirmation. The draft opens the existing create flow, whose booking step applies unchanged; rematch adds no booking calls of its own. Normal gates apply. Opening a draft sends nothing; normal confirmed creation/invitation sends invites. Never automatically seat the previous roster.
- **Series:** optional “Make it weekly” reuses PRD 345 after creating the new game, including existing failure handling. Repetition does not reserve future courts.
- **Success/guardrails:** second recorded games and rematch completion; abandoned drafts, duplicate games, unintended invitations/bookings.
- **Dependencies/size:** safe duplicate allow-list, scheduling, invite handling across formats. M.

### 5.5 Organizer next actions

- **Player/problem:** seat, attendance, booking, and cost state is scattered across game details.
- **Hypothesis:** concrete next actions reduce unfinished setup and last-minute coordination.
- **Reuse:** PRD 346 attendance, PRD 347 seats, PRD 348 costs, linked-booking coverage, existing detail actions.
- **V1/placement:** one compact block under the header. **Moves into it:** `AttendanceOrganizerStrip` (progress pill + Nudge) and the open-spot summary row of `SpotOpenedGameSection`. **Stays unchanged:** `GameQueuePanel`, `GameLinkedBookingsSection` and its coverage badge, `GameCostCard`/`CostStateChip`, `WeatherRiskBanner`, and `ParticipantSetupTags` (these are descriptive format tags, not organizer hints; corrected 2026-09-22). Each hint opens the existing workflow. No readiness score, no new Home banner. Detail: PRD 364.
- **Finite hint list, in priority order:** seats needed → booking gap → attendance replies pending → cost action → nothing. Show at most **two** hints at once; the rest are reachable from the block's tap target. "Nothing to do" renders as no block at all, never as a green "all done" state.
- **Audience:** owner and admins. Participants with invite rights see only the seats-needed hint. Others never see the block.
- **Rules:** only PLAYING fills seats; unanswered attendance is not a no-show; booking coverage is separate from attendance/roster. The booking-gap hint is derived from existing linked-booking coverage and opens the existing linked-bookings section; it never queries or changes a provider. Before play, prioritize seats and booking gaps, then attendance. After play, show applicable settlement work instead of stale setup prompts. Preserve participant access to details/actions.
- **Success/guardrails:** time to fill, unresolved booking gaps at start, attendance response completion, organizer action completion; duplicate hints and incorrect “all done” states.
- **Dependencies/size:** permission-aware aggregate/view model and explicit list of hints being replaced. M; no parallel domain state machine.

### 5.6 Rescheduling with reconfirmation

**v0 ships first (batch 2):** editing the time already exists. Add three behaviours to it: reset attendance answers for PLAYING participants, send one notice with the new time (Time-critical tier, collapsed per game), and flag linked bookings needing manual attention with coverage recalculated. No proposal, no replies. Measure how often organizers change times on games with three or more PLAYING participants; the proposal flow below is justified only if that is common.

- **Player/problem:** schedule changes require chat coordination and can leave old attendance answers looking current.
- **Hypothesis:** an explicit proposal and organizer decision make changes easier to coordinate.
- **Reuse:** chat/poll presentation where suitable, edit permissions, attendance, notifications, series occurrence behavior.
- **V1/placement:** organizer proposes **one new time** from game details for an unstarted game with `resultsStatus === NONE`. Current PLAYING participants answer yes/no; organizer explicitly applies or cancels. The current schedule stays authoritative until apply.
- **Reply semantics:** proposal replies are separate from attendance on the current schedule. No reply is not consent; no does not silently remove a player. Applying requests fresh attendance for the new schedule, preserving the owner's existing implicit confirmation. Old attendance is not evidence for the new time.
- **Scope:** one active proposal and one occurrence. No automatic apply or series-wide propagation. A replacement proposal invalidates earlier replies. Recheck permissions, conflicts, roster, and proposal version on apply; failed apply preserves the original schedule.
- **Booking boundary:** a time change never moves or cancels an external reservation automatically. Identify linked bookings needing manual attention and recalculate coverage. Old booking confirmation does not mean the new time is booked.
- **Notifications:** §4 applies to proposal/applied-change delivery; include the changed time and invalidate stale actions. Venue changes and multi-option group scheduling are outside v1.
- **Success/guardrails:** completed reschedules, reply rate, coordination time; stale attendance and booking mismatches after apply.
- **Dependencies/size:** proposal persistence, attendance reset, linked bookings, series occurrence scope, replay/delivery handling. M–L.

### 5.7 Book a court — PARKED

**Decision (2026-09-22):** all real booking touches are parked for a separate dive. Nothing below is scheduled. The earlier Find rail is dropped for good: its "fewer than three games" gate would never fire in busy cities, where court access is the actual problem, and sparse cities rarely have a connected provider. What remains is a candidate shape for the later investigation, not a brief.

- **Player/problem:** a willing group cannot find a court at a suitable time.
- **Hypothesis:** relevant available slots turn play intent into a booked game, particularly in busy cities.
- **Reuse:** provider integrations and existing create/booking flow.
- **V1/placement:** (a) a "Book a court" step inside the create flow that lists available slots for the chosen club, day and duration; (b) a "Book a court" action in the Find empty state when the Home city has a connected provider, opening create with the day prefilled. No rail, no gate.
- **Provider scope:** select **one provider** based on rollout-city coverage and availability quality. Match sport, day, and duration. Show freshness and revalidate the exact slot before booking. A suggestion is not a reservation.
- **Weltner correction:** providers are BOOKTIME, PADELOO, KLIKTEREN, NSPADELSUPABASE, and WELTNER. Weltner has exact start/duration tuples, which cannot be inverted into busy snapshots. Preserve its receipt/unknown-outcome handling if selected. Other providers keep their own supported semantics.
- **Success/guardrails:** slot-to-booking/create conversion and recorded play; stale-slot failures and uncertain/duplicate booking attempts.
- **Dependencies/size:** provider choice, freshness contract, prefill, revalidation. M–L for one provider; expansion is separate.
- **Before promotion:** per-city provider coverage audit, Weltner exact-slot contract review, freshness and unknown-outcome handling, and a decision on which single provider goes first. Until then this section stays parked.

### 5.8 Calendar subscription

- **Player/problem:** players plan elsewhere and can miss changes to joined games.
- **Hypothesis:** calendar continuity reduces manual copying and scheduling mistakes.
- **Reuse:** existing calendar preferences and game/timezone/access data.
- **V1/placement:** “Subscribe in calendar” in Profile's calendar area; tokenized ICS of upcoming PLAYING games, with copy/revoke/regenerate. Invitations and queue entries are not committed play.
- **Scope (fixed):** included: GAME, TOURNAMENT, TRAINING, BAR, LEAGUE fixtures with `timeIsSet`, series occurrences the user has already joined, EVENT listings marked Going with a start time. Excluded: `LEAGUE_SEASON` hubs, fixtures without a time, future series occurrences not yet joined, queue and invited seats. Cancelled or left games stay in the feed as CANCELLED for 7 days so clients remove them, then drop.
- **Contract:** stable event identifiers, schedule updates, cancellation/leave handling, correct timezones/DST, and no payment/chat data. Calendar clients control refresh timing; do not promise instant updates or use ICS as the only cancellation notice.
- **Success/guardrails:** uptake and continued use, reported schedule mismatches; revoked-feed access and duplicate calendar entries.
- **Dependencies/size:** token lifecycle, caching, cancellation retention, calendar-client verification. M.

### 5.9 Suitable for novices

- **Player/problem:** a new or low-level player cannot tell which games will welcome them. A low minimum level is a gate, not an invitation, and organizers have no way to say "we'll help you learn".
- **Hypothesis:** an explicit organizer signal gets novices into their first games faster and reduces awkward joins into games that only tolerate them.
- **Reuse:** `GameSettings` toggle list (same row style as `afterGameGoToBar`), create-flow settings step, card header tag row (`GameCardHeaderTags`), Find chip row (`EntityFilterChips`), `GameInfo` format tags.
- **V1/placement:**
  - `Game.suitableForNovices Boolean @default(false)`. Named migration. Included in create, `PUT /games/:id`, detail and list projections.
  - **Toggle** in the settings block of create and of game details, owner/admin only, same permission and lock rules as the other toggles: editable while `resultsStatus === NONE`, never after. Copy: title "Suitable for novices", one-line hint "You'll help newer players; the level range still applies."
  - **Tag** in the existing header tag row on Find and My cards and in the details header, same style as the gender and private tags. Rendered only when true. Never a second tag row.
  - **Chip** "Novice-friendly" in the existing Find chip row, ANDed with the other filters like the advanced panel. Off by default. Persisted with the other chips.
  - Entity types: GAME, TOURNAMENT, TRAINING, BAR. Not LEAGUE fixtures, `LEAGUE_SEASON`, or EVENT (organizer does not control those rosters the same way). Gate on `entityCapabilities`.
- **Rules:** the tag is a promise about atmosphere, not a gate change. Level range, gender rule, direct-join and queue rules apply unchanged. The create-game level mismatch banner still fires. Copying into a rematch draft is allowed (§5.4 allow-list); series occurrences inherit from the series template.
- **Not in v1:** auto-suggesting the toggle from the level range, a subscription filter, a push, a badge on organizers, or any "novice" label on players.
- **Success/guardrails:** share of games tagged; joins by players with fewer than five rated games into tagged vs untagged games; whether tagged games fill slower. Watch for organizers tagging everything, which would make the chip useless; if the tagged share passes roughly half in a city, revisit the copy.
- **Dependencies/size:** migration, three projections, create and details settings, card and chip UI, 11 locales, parity test for the create template if the default is template-driven. S, roughly two days including the migration.

## 6. Later candidates and deferred work

**Kept out of all three batches, by decision:** any new rail on Find or element above the calendar on My; per-type notification toggles; engagement-based downgrade before open tracking exists; follow suggestions, streaks, challenges and What's new before Played with and rematch have numbers; avatar stacks in more than one place per screen; a readiness score or organizer dashboard; a third tab in the invite modal.

Preserved ideas, not commitments for the first two batches. Each needs §1's full brief before promotion; notification additions depend on §4.

| Idea | Candidate scope and placement | Evidence / dependency |
|------|-------------------------------|-----------------------|
| Followed players on cards | Up to two avatars and short label in optional row | Relevant joins; no friend-first sorting. Preserve current ordering, including existing spot-opened behavior. |
| Usually free | Availability sort within Played with; clock icon | Accepted invites; availability is a suggestion, not a promise. |
| Online dot | Invite/roster avatar indicator | Coordination benefit; respect `showOnlineStatus`. |
| Guest join copy | Replace existing login CTA | Guest-to-join conversion; distinguish direct join from organizer approval. |
| Trainer students | Past-trainees invite tab and referral/share action | Repeat trainings; appropriate history/access query. |
| Availability match | Compact My line linking to fitting games | Match-to-join conversion; timezone-aware matching. |
| Results moment | Actual level/rank movement and supported partner insight | Repeat play; no “one win from #12” prediction; reduced motion. |
| Distance, seats, reactions | Truthful values in existing controls/text | Better join decisions without extra rows or fabricated urgency. |
| Follow after game | Optional shared-slot suggestion with selectable players | Useful repeat connections, not just follow totals. |
| Profile photo nudge | “Help other players recognize you at the court”; avatar picker | Completion/dismissals; shared cooldown. |
| Permission suggestion | Contextual suggestion after joining via existing provider | Opt-in; distinguish initial request from denied/settings flow; at most once per 30 days. |
| Club review | One-question results nudge | Useful feedback; lower priority than follow suggestion. |
| Achievement toast | Existing toast and relevant shop link | Player value without excess interruptions; activity infrastructure if persisted. |
| Streak chip — deferred | Passive “3 weeks running”; no deadline; hide at zero | Recorded-play definition and repeat play; only if heading has room. |
| What's new / followed-game notification — deferred | My line + sheet; `FOLLOWED_USER_GAME_CREATED` as Discovery | Durable access-filtered activity list and §4. |
| Public series — deferred | Organizer-controlled public summary and request flow | Existing details are insider-only and expose private roster/chat/occurrences. Requires a public projection and request lifecycle, toward L. Do not infer a held regular seat from an empty occurrence slot. |
| Group scheduling poll — deferred | Multiple proposed times in chat, organizer creates from selection | Demand beyond rescheduling v1; no automatic booking or mutation from a winning vote. |
| Digest / return-to-play — deferred | Relevant games: “Ana and Marko play Thursday, one seat open” | Relevance and §4; no uncertainty threat or “played without you” copy. Telegram fallback remains preference-aware. |
| Weekly movers / leaderboard challenge — deferred | Existing controls/player overlay | Useful play outcomes; explicit user send for a proposal. |
| Spectator prediction — deferred | Live-card interaction, no push | Spectator demand; lower priority than organizing/courts. |
| Monthly challenge — deferred | Achievement/profile progress with optional reward | Sustainable play outcomes before additional incentives/prompts. |
| Automatic photo reminder — deferred | At most budgeted Discovery, never Direct | Evidence it is wanted; no automatic after-every-game reminder in these batches. |

## 7. Shared slots

- **My compact line:** later What's new → availability match → nothing. One message, hidden when empty; neither is required for batch 1.
- **Optional nudge:** once per session, seven-day cooldown per nudge unless stricter. Results: follow → club review → profile photo. Elsewhere: contextual permission → profile photo. Check relevance before priority; never queue a second prompt immediately after dismissal.
- **Card optional row:** existing participant attendance first where applicable, followed-player hint next, otherwise nothing. No attendance for non-participants. Distance/occupancy stay in existing text/controls.
- **Organizer summary:** replaces relevant hints inside details. Actionable information is not hidden by the optional-nudge cooldown.

## 8. Measurement and release checks

Start baseline reporting first and add lightweight instrumentation with each batch. A comprehensive analytics platform is not a prerequisite for UI work.

| Metric | Definition / purpose |
|--------|----------------------|
| Weekly players with recorded play | Distinct qualifying players by city/sport; disclose evidence source and coverage. |
| First-to-second-game conversion | First-play cohorts reaching a second qualifying game within an explicit window, initially 30 days; exclude immature cohorts from final rates. |
| Signup to first recorded play | Distribution plus non-converter share, not only an average among successful users. |
| Empty-search recovery | Sessions leading to join/create/play intent/saved alert; later play reported separately. |
| Time to fill | Publication to first full PLAYING roster; whether it remains full until start; reopened-seat recovery. |
| Approval delay | Queue request to organizer decision, with pending/withdrawn requests visible. |
| Invite conversion | Invitation → accepted PLAYING seat → recorded play; separate declined/expired/cancelled/pending. |
| Organizing failures | Booking gaps, stale attendance after changes, failed/abandoned reschedules. |
| Notification load | Logical sends and channel attempts per recipient/day/tier; expiry, duplicates, opt-outs, over-budget. Include inactive recipients. |

**Recorded play needs an explicit contract, written as its own short doc before batch 1a ships.** Every metric depends on it. FINISHED status alone is insufficient. ARCHIVED, FINAL results, confirmed attendance, and technical wins are not interchangeable. For scored sports, start from finalized scored participation/outcomes, excluding neutral technical results and known no-shows; validate generated-format participation. Report unscored games/training separately until evidence is reliable. Results coverage is not all actual play.

Current Game/GameParticipant snapshots cannot be assumed to reconstruct funnels. Audit invite outcomes and game logs, then capture missing publication, recovery, invitation, queue-decision, roster-full, and reschedule events. Preserve rematch/alert attribution where needed; collect identifiers/outcomes rather than private chat/payment contents.

Each release verifies relevant permissions, empty/stale states, city/sport/timezones, all locales, large text/RTL, and failure recovery. Use repository-serialized checks. Implementation updates the matching domain docs and `docs/UI_TEST_PLAN.md`; this planning revision changes no product behavior.
