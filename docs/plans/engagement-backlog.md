# Engagement backlog — everything outside PRDs 358–364

Companion to `docs/plans/engagement-growth.md` (rules, order, briefs) and `docs/plans/prd-358-364/` (weeks 1–5). This file is the complete list of what is **not** in those seven PRDs, so nothing is lost and nothing is re-proposed by accident. Each item needs the §1 brief from the plan before it is promoted.

Sizes: S ≤ 2 days, M ≈ 1 week, L > 1 week. "Depends" names what must exist first. "NF" = notification foundation (plan §4).

---

## A. Specified and demoted (briefs exist in the plan)

Useful, but nearly invisible: a player has to go looking for them. Next in line after PRD 364.

| # | Feature | Smallest version | Placement | Size | Depends |
|---|---------|------------------|-----------|------|---------|
| A1 | **Saved filter alerts** (plan §5.2) | "Alert me about new games like this" from the advanced panel; newly created public games with a club only; adds a sport field to `GameSubscription` | Bottom of `FiltersPanel`, Find empty state; edit in `/game-subscriptions` | M | NF budget before delivery expands; migration |
| A2 | **Calendar subscription** (plan §5.8) | Tokenised ICS of upcoming PLAYING games; copy, revoke, regenerate; CANCELLED kept 7 days | Profile → calendar preferences | M | none |
| A3 | **Time change v0** (plan §5.6) | On time edit: reset attendance answers, one "time changed" notice to PLAYING participants, flag linked bookings from existing coverage | Existing edit flow | S–M | NF for the notice type |
| A4 | **Rescheduling with reconfirmation** (plan §5.6 full) | One proposed time, yes/no replies, organizer applies; old attendance never carries over | Game details, organizer only | M–L | A3 shipped and evidence organizers change times often |
| A5 | **Filter explanation in the empty state** (plan §5.1 follow-up) | Name at most two blocking filters chosen by probe query, one tap to relax each | Find `EmptyStateCard` | M | PRD 363 numbers |

## B. Parked — real booking touches (plan §5.7)

Not scheduled. Needs its own investigation first: provider coverage per rollout city, Weltner exact-slot semantics, freshness, unknown-outcome handling, and which single provider goes first.

| # | Feature | Notes |
|---|---------|-------|
| B1 | **Book a court inside the create flow** | List exact available slots for club/day/duration; revalidate before submit; one provider first |
| B2 | **"Book a court" action in the Find empty state** | Opens create with the day prefilled and B1 |
| B3 | **Free courts rail on Find** | Dropped for good: its gate never fires in busy cities; do not revive |
| B4 | **Booking-aware rescheduling** | Moving or cancelling a reservation on time change; out until A4 and B1 exist |

## C. Notification foundation and later additions (plan §4)

Backend lane, runs in parallel with everything. Blocks nothing in PRDs 358–364.

| # | Item | Size | Notes |
|---|------|------|-------|
| C1 | **Durable dedupe, expiry, quiet hours, shared budget** across push and Telegram | M–L | Prerequisite for every new proactive send below; one "Suggestions" switch at most in settings |
| C2 | **Admin kill switch per type + 24 h send log** | S | Part of C1 |
| C3 | **Coalescing** of compatible Discovery events (20–30 min) | M | After C1 |
| C4 | **Suppress while viewing** relevant content | S | After C1; presence alone is not "read" |
| C5 | **What's new line + sheet** on My under the Play hero | M | Only when a durable in-app sink is needed (D14) |
| C6 | **Engagement-based downgrade** to Digest tier | M | Only after push-open tracking is reliable |
| C7 | **Telegram as fallback channel** for users with Telegram linked and no push token | S | Preference-aware; after C1 |

## D. Deferred candidates (plan §6 table, with placement)

Ordered roughly by how soon they could follow the PRDs.

| # | Feature | Smallest version | Placement | Size | Depends / guardrail |
|---|---------|------------------|-----------|------|---------------------|
| D1 | **Last played together** on the player overlay | "Played together 3 days ago · 5 games" line | `?player=` sheet | S | PRD 361 query |
| D2 | **Followed players on cards** | Up to two avatars + "Ana is playing" in the one optional card row | Find/My cards | S–M | No friend-first sorting; row priority: attendance first |
| D3 | **Online dot** | Presence dot on avatars | Invite modal, roster | S | Respect `showOnlineStatus` |
| D4 | **Usually free** sort | Co-players whose weekly availability covers the slot rise, clock icon | Played-with group only | S | PRD 361; availability is a suggestion |
| D5 | **Guest join copy** | "Sign in to take one of the 2 open seats" + roster avatars | Guest `/games/:id` CTA | S | Distinguish direct join from ask-to-join |
| D6 | **Trainer students** | Past-trainees group in invite Search + referral share | Invite modal (trainers) | M | PRD 361 grouping; PRD 351 link |
| D7 | **Availability match line** | "Thursday evening: 3 games at your level" | Shared My one-line slot | S | Weekly availability; timezone |
| D8 | **Results moment** | Actual level delta in the results push and screen, real rank movement, supported partner insight | Results block | M | No predictions; reduced motion |
| D9 | **Distance on cards** | "2.1 km" in the club line when geolocation is already granted | Card club text | S | No permission prompt for it |
| D10 | **Reaction count on cards** | "🔥 3" next to the existing reactions control when > 1 | Card | S | none |
| D11 | **Follow after game** | "Follow 3 players from this game" with per-avatar toggle | Shared nudge slot, results screen | S | PRD 350 suggested-users ranking |
| D12 | **Profile photo nudge** | "Help other players recognize you at the court" → avatar picker | Shared nudge slot | S | 7-day cooldown |
| D13 | **Push permission suggestion after join** | "Remind you 2 h before?" via `PermissionModalProvider` | Bottom sheet after join toast | S | Once per 30 days; separate initial vs denied flow |
| D14 | **Followed user created a game** notification | `FOLLOWED_USER_GAME_CREATED`, Discovery tier | Push + C5 | S | C1, C5 |
| D15 | **Club review after FINAL** | One-question "How was the club?" | Shared nudge slot | S | Lower priority than D11; feeds PRD 354 |
| D16 | **Achievement toast + next-step chip** | Toast on unlock; link to shop when a cosmetic unlocks | Toast system, C5 | S | Activity persistence if shown in C5 |
| D17 | **Streak chip** | Passive "3 weeks running", no deadline, hidden at zero | Calendar heading row on My, only if room | S | Recorded-play contract |
| D18 | **Public series on Find** | Organizer-controlled public summary + request-to-join flow | Find list card → public series page | L | New public projection; series details are insider-only today |
| D19 | **"When do we play?" poll** | Three proposed times in group/game chat; organizer creates from the winner | Chat + menu | M | After A4 v0 evidence; no auto-mutation from a vote |
| D20 | **Weekly digest** | "12 open games at your level this week", favourite-club games | Push + Telegram, Digest tier, Sunday 18:00 city time | M | C1 |
| D21 | **Return-to-play suggestion** | "Ana and Marko play Thursday, one seat open" | Digest tier | S | C1; never "played without you" or uncertainty-threat copy |
| D22 | **Weekly movers** | "+7 d" as a value in the existing leaderboard period control | Leaderboard | S | none |
| D23 | **Challenge from the leaderboard** | "Challenge" button on the player overlay → DM with a prefilled proposal | `?player=` sheet | M | Explicit user send only |
| D24 | **Spectator prediction** | "Who wins?" on the live rail card, result on the same card | PRD 349 live rail | M | No push |
| D25 | **Monthly city challenge** | "Play 4 games in October", progress on profile achievements, optional coin/cosmetic reward | Achievements + C5 | M | Sustainable play evidence first |
| D26 | **Automatic photo reminder** | One Discovery-tier reminder ~1 h after FINAL | Push | S | C1; evidence it is wanted |

## E. Ideas raised earlier and never promoted

From the first brainstorm rounds. Kept so they are not re-invented; most need a brief and a reason.

| # | Idea | Why it stayed out | Revisit when |
|---|------|-------------------|--------------|
| E1 | **Looking count on the Play hero** (My tab) | Replaces a stable hint string; below-three copy unsettled | PRD 363 data shows the count helps |
| E2 | **Looking count badge on the Find city chip** | Header clutter; same data as E1 | Same as E1 |
| E3 | **"Open to beginners" as an inferred tag** from a low minimum level | Inference is not an invitation | Never; PRD 360 is the explicit version |
| E4 | **Attendance summary on cards for followers / non-participants** | Changes the participant-facing visibility policy | Product decision on attendance privacy |
| E5 | **Friend-first sorting of Find** | Second implicit ordering rule next to spot-opened; confuses a chronological list | D2 avatars have numbers |
| E6 | **Rating uncertainty win-back** ("your level loses certainty in 5 days") | Punitive framing | Rewrite as D21 only |
| E7 | **Co-player win-back** ("your regulars played 6 games without you") | Punitive framing | Rewrite as D21 only |
| E8 | **Rank prediction** ("one win from #12") | Not knowable; other players' results move it | Never; D8 shows real movement |
| E9 | **Third tab "Played with"** in the invite modal | Modal already has Search, Looking, sport chips, filter bar | Never; PRD 361 uses the zero-query state |
| E10 | **Per-type notification toggles / exposed tier names** | 15 toggles already | Never |
| E11 | **Big results celebration modal** | Interrupts; reduced-motion burden | Never; D8 is inline |
| E12 | **Rematch from the card or from chat** | Extra entry points for one action | PRD 362 numbers |
| E13 | **Trainer "my students" list on the training page** | Adds a section; invite-modal group is enough | D6 |
| E14 | **Nearby-city games in the Find empty state** | Existing nearby expand is for people, not games; needs a query | After PRD 363 |
| E15 | **Series conversion inside rematch success toast** | Only if the PRD 345 entry point already accepts a game; otherwise no new path | PRD 362 implementation |
| E16 | **Urgency colour or pulsing on scarce games** | Fabricated urgency | Never; PRD 359 uses text only |
| E17 | **Distance requiring a location prompt** | Contradicts one-nudge rule for a cosmetic gain | D9 only when already granted |

## F. Explicitly rejected (do not re-propose)

| Item | Reason |
|------|--------|
| Confirmed-level badges anywhere (`approvedLevel` tick, sort, filter) | User decision |
| Dynamic share image for game links | User decision |
| Rich link previews for player profiles | User decision |
| Store review prompt | User decision |
| Chats empty-state city-group prompt | Users are auto-joined to the city group, muted and pinned, on city set/switch |
| Free courts rail on Find | Gate never fires where it matters; see B3 |
| Readiness score / organizer dashboard | Facts with actions instead; PRD 364 |
| Any new rail on Find or element above the calendar on My | Plan §2 rule 13 |
| Photo reminder as a Direct-tier push | Discovery at most; D26 |

---

## Suggested next promotions after PRD 364

1. **D1 Last played together** (rides on PRD 361, S).
2. **A2 Calendar subscription** (self-contained, M).
3. **A1 Saved filter alerts** together with **C1 notification foundation** (the first proactive send needs the budget).
4. **A3 Time change v0**, then decide on A4.
5. **D2 Followed players on cards** and **D11 Follow after game** as a pair (they feed each other).
6. **D20 Weekly digest** once C1 is in and A1 has volume data.
