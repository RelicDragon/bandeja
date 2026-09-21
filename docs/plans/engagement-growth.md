# Engagement and growth plan

Status: revised planning scope. This document does not establish what is deployed.
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
3. **One compact message per shared slot.** Normally one line and one action, dismissible when it is a suggestion. Allow wrapping for large text and translations rather than clipping essential information.
4. **Cards gain at most one optional information row.** Empty rows never render. Accessible wrapping is allowed. Social hints do not displace existing participant attendance information.
5. **Predictable navigation.** Do not relocate major components merely to fit a feature. Deliberate simplification must preserve access to their actions; the layout is not frozen.
6. **Progressive disclosure.** Show a useful fact and open details on tap. Organizer next actions replace scattered hints rather than adding another dashboard.
7. **One optional nudge per session.** Follow, photo, review, and permission suggestions share a slot and cooldown. Required confirmations and user-initiated workflows are not nudges.
8. **Quiet by default.** Controls cover push and Telegram. New proactive delivery follows §4. UI improvements do not wait for the full notification roadmap.
9. **All 11 locales, RTL, and accessibility.** Use `dir=auto` for user text, accessible icon labels, and reduced motion. Copy must not shame inactive players or promise uncertain outcomes.
10. **Controlled rollout.** Optional additions have a user preference or Admin kill switch. Disabling a surface must not hide information needed to manage an existing game.

## 3. Order

### Batch 1 — find a game and organize the next one

1. Find recovery: quick time chips, looking count, filter explanation, and explicit recovery actions.
2. Saved filter alerts: sport support and a defined mapping from Find; newly created public games only.
3. Played with and rematch: “Play with this group again,” with a fresh schedule and booking.
4. Notification foundation, developed alongside these: durable dedupe, expiry, quiet hours, and a shared budget across push and Telegram.

Played with and rematch reuse ordinary invitation delivery and add no notification type. Saved alerts reuse subscription delivery, but can increase proactive volume: saving/editing filters need not wait; enabling expanded delivery requires the foundation. These features do not depend on What's new, coalescing, digests, or push-open tracking.

### Batch 2 — make organizing dependable

5. Organizer next actions: consolidate seat, attendance, booking, and applicable cost actions inside game details.
6. Rescheduling v1: propose one new time, collect yes/no, organizer applies; linked bookings require manual attention.

### Batch 3 — court access and calendar continuity

7. Free courts rail: start with one provider and revalidation before booking.
8. Calendar subscription: upcoming joined games, updates, cancellations, and token revocation.

Grouped product priorities are: (1) Find recovery/alerts, (2) Played with/rematch, (3) organizer next actions, (4) rescheduling, (5) free courts, (6) calendar subscription. Notification work is supporting infrastructure. Keep court discovery at priority five; it can move earlier if city-level evidence shows that court access blocks otherwise ready groups.

Before shipping affected organizer/payment work, verify the closing-report regression: payment details lost after another player leaves, followed by an unrelated organizer save. A fix report exists, but a historical report is not proof of current behavior. This is a release check for affected work, not a blanket prerequisite for unrelated Find UI.

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
- **V1/placement:** Tonight/Tomorrow/Weekend in the existing chip row. Explain active restrictions in the empty state; offer an explicit relaxation, prefilled create, or saved alert based on context. Never silently change city or remove filters. Claims that a particular relaxation yields results need query evidence.
- **Looking count:** count distinct currently looking players for the displayed city, sport, and day. Hide below three. Reuse the pool query where its scope matches; do not label a multi-day or cross-sport total “today.” Show within Find recovery and as the Play hero subtitle, with no new strip. The count signals demand, not guaranteed compatible opponents. Looking remains accessible below the threshold.
- **Success/guardrails:** empty-search sessions leading to join/create/play intent, and subsequent recorded play. Monitor repeated empty searches and abandoned create flows.
- **Dependencies/size:** city-timezone windows, trustworthy counts, recovery queries/instrumentation, accessible filter state. M combined; quick chips or count can be S slices.

### 5.2 Save the current search as an alert

- **Player/problem:** players repeatedly search for games matching the same preferences.
- **Hypothesis:** understandable saved criteria deliver useful new games with less repeated setup.
- **Reuse:** `GameSubscription`, existing preference handling and subscription delivery.
- **V1/placement:** “Alert me about new games like this” at the bottom of advanced filters and in Find recovery. Review criteria before saving; edit/pause in existing subscription settings.
- **Scope:** newly created public games only. Reopened seats remain on PRD 347's spot-opened path. Document supported entity types and the existing club requirement; do not promise exact Find parity where matching cannot support it.
- **Sport correction:** the model has no sport field. Add explicit sport scope through a named migration, API validation, matcher, and UI. Define defaults/backfill for existing subscriptions without silently changing their audience. Decide whether “my sport” saves today's choice or follows later profile changes, and explain it in the UI.
- **Filter mapping:** document supported criteria, resolve relative dates into explicit ranges, and disclose unsupported criteria rather than silently dropping them. Overlapping subscriptions must not deliver the same new game twice.
- **Success/guardrails:** matching-game joins and recorded play; mismatches, pauses, and notification volume.
- **Dependencies/size:** schema/API/matcher parity and matching tests; §4 before expanded proactive delivery. M, not UI-only S.

### 5.3 Played with

- **Player/problem:** organizers must remember names and search to invite familiar players.
- **Hypothesis:** recent co-players shorten invitation setup and help fill games.
- **Reuse:** invite modal, player search, eligibility checks, invite service.
- **V1/placement:** Played with tab beside Search and Looking, default when non-empty. Up to ten distinct recent co-players, relevant to the game's sport. Exclude self; respect existing access, block, and invite rules. Show current roster/invite state to avoid repeat invitations.
- **Data:** bounded backend queries with a documented co-play predicate. A FINISHED game status, queue entry, or invitation alone does not prove people played together.
- **Success/guardrails:** time to send a useful invitation, accepted invitations, time to fill; duplicates and dismissals.
- **Dependencies/size:** history query, provenance, invite-state handling, localization. M. Usually-free sorting is later and does not imply commitment.

### 5.4 Play with this group again

- **Player/problem:** a group wants another session without rebuilding the setup.
- **Hypothesis:** reuse of format and a selectable group makes a second game easier to organize.
- **Reuse:** duplicate/create flow, invite selection, existing series conversion.
- **V1/placement:** one button inside results after `resultsStatus === FINAL`. Open a draft with format and previous players preselected for review; choose a fresh schedule and confirm invitees. Use “Play with this group again,” independent of sport or roster size.
- **Fresh state:** no copied results, attendance, settlements, booking IDs/receipts, or booking confirmation. Recheck court availability and normal gates. Opening a draft sends nothing; normal confirmed creation/invitation sends invites. Never automatically seat the previous roster.
- **Series:** optional “Make it weekly” reuses PRD 345 after creating the new game, including existing failure handling. Repetition does not reserve future courts.
- **Success/guardrails:** second recorded games and rematch completion; abandoned drafts, duplicate games, unintended invitations/bookings.
- **Dependencies/size:** safe duplicate allow-list, scheduling/booking, invite handling across formats. M.

### 5.5 Organizer next actions

- **Player/problem:** seat, attendance, booking, and cost state is scattered across game details.
- **Hypothesis:** concrete next actions reduce unfinished setup and last-minute coordination.
- **Reuse:** PRD 346 attendance, PRD 347 seats, PRD 348 costs, linked-booking coverage, existing detail actions.
- **V1/placement:** replace scattered organizer hints with one compact block: “1 player needed,” “2 replies pending,” “Court partly booked,” or an applicable cost action. Each opens the existing workflow. No readiness score or new Home banner.
- **Rules:** only PLAYING fills seats; unanswered attendance is not a no-show; booking coverage is separate from attendance/roster. Before play, prioritize seats and booking gaps, then attendance. After play, show applicable settlement work instead of stale setup prompts. Preserve participant access to details/actions.
- **Success/guardrails:** time to fill, unresolved booking gaps at start, attendance response completion, organizer action completion; duplicate hints and incorrect “all done” states.
- **Dependencies/size:** permission-aware aggregate/view model and explicit list of hints being replaced. M; no parallel domain state machine.

### 5.6 Rescheduling with reconfirmation

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

### 5.7 Free courts rail

- **Player/problem:** a willing group cannot find a court at a suitable time.
- **Hypothesis:** relevant available slots turn play intent into a booked game, particularly in busy cities.
- **Reuse:** provider integrations and existing create/booking flow.
- **V1/placement:** one rail below the Find calendar in the selected-day list, initially when fewer than three games are shown. Share the supplementary-rail position with events rather than stacking another rail; define the selection rule before implementation. Evaluate whether this gate misses court demand in busy cities.
- **Provider scope:** select **one provider** based on rollout-city coverage and availability quality. Match sport, day, and duration. Show freshness and revalidate the exact slot before booking. A suggestion is not a reservation.
- **Weltner correction:** providers are BOOKTIME, PADELOO, KLIKTEREN, NSPADELSUPABASE, and WELTNER. Weltner has exact start/duration tuples, which cannot be inverted into busy snapshots. Preserve its receipt/unknown-outcome handling if selected. Other providers keep their own supported semantics.
- **Success/guardrails:** slot-to-booking/create conversion and recorded play; stale-slot failures and uncertain/duplicate booking attempts.
- **Dependencies/size:** provider choice, freshness contract, rail selection, prefill, revalidation. M–L for one provider; expansion is separate.

### 5.8 Calendar subscription

- **Player/problem:** players plan elsewhere and can miss changes to joined games.
- **Hypothesis:** calendar continuity reduces manual copying and scheduling mistakes.
- **Reuse:** existing calendar preferences and game/timezone/access data.
- **V1/placement:** “Subscribe in calendar” in Profile's calendar area; tokenized ICS of upcoming PLAYING games, with copy/revoke/regenerate. Invitations and queue entries are not committed play.
- **Contract:** stable event identifiers, schedule updates, cancellation/leave handling, correct timezones/DST, and no payment/chat data. Calendar clients control refresh timing; do not promise instant updates or use ICS as the only cancellation notice.
- **Success/guardrails:** uptake and continued use, reported schedule mismatches; revoked-feed access and duplicate calendar entries.
- **Dependencies/size:** token lifecycle, caching, cancellation retention, calendar-client verification. M.

## 6. Later candidates and deferred work

Preserved ideas, not commitments for the first two batches. Each needs §1's full brief before promotion; notification additions depend on §4.

| Idea | Candidate scope and placement | Evidence / dependency |
|------|-------------------------------|-----------------------|
| Followed players on cards | Up to two avatars and short label in optional row | Relevant joins; no friend-first sorting. Preserve current ordering, including existing spot-opened behavior. |
| Usually free | Availability sort within Played with; clock icon | Accepted invites; availability is a suggestion, not a promise. |
| Online dot | Invite/roster avatar indicator | Coordination benefit; respect `showOnlineStatus`. |
| Guest join copy | Replace existing login CTA | Guest-to-join conversion; distinguish direct join from organizer approval. |
| Trainer students | Past-trainees invite tab and referral/share action | Repeat trainings; appropriate history/access query. |
| Open to beginners | Explicit organizer choice; existing chip/tag row | Beginner games that lead to play; low minimum level alone is insufficient and join gates still apply. |
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

**Recorded play needs an explicit contract.** FINISHED status alone is insufficient. ARCHIVED, FINAL results, confirmed attendance, and technical wins are not interchangeable. For scored sports, start from finalized scored participation/outcomes, excluding neutral technical results and known no-shows; validate generated-format participation. Report unscored games/training separately until evidence is reliable. Results coverage is not all actual play.

Current Game/GameParticipant snapshots cannot be assumed to reconstruct funnels. Audit invite outcomes and game logs, then capture missing publication, recovery, invitation, queue-decision, roster-full, and reschedule events. Preserve rematch/alert attribution where needed; collect identifiers/outcomes rather than private chat/payment contents.

Each release verifies relevant permissions, empty/stale states, city/sport/timezones, all locales, large text/RTL, and failure recovery. Use repository-serialized checks. Implementation updates the matching domain docs and `docs/UI_TEST_PLAN.md`; this planning revision changes no product behavior.
