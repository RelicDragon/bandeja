# Event entity (`EntityType.EVENT`)

Shipped. Community listing for camps and **external** tournaments/leagues Bandeja does not run. Bulletin board + partner market. Play happens elsewhere.

Product name **Event**; enum `EVENT`. Kind is `eventKind`, not extra entity types. Prose “event” is overloaded — see `docs/product/glossary.md`.

## Kind + approval

`EventKind`: `TOURNAMENT` | `LEAGUE` | `CAMP` (`EVENT_KINDS`). Copy: External tournament / External league / Camp.

`EventApprovalStatus`: create `ON_APPROVE` (owner + `isAdmin` only, pending banner). Public Find/details/RSVP after `APPROVED`. Admin Approve/Decline (`eventApproval.service.ts`). `DECLINED` stays non-public.

## Capabilities

`@shared/entityCapabilities` EVENT: no results, rating, booking, occupancy, play-intent radar; `hasLevelBand`; `hasPartnerBoard`; `archiveByTime`; `unboundedRoster` (999); `alwaysPublic`; `alwaysDirectJoin`; `excludeFromCompetitiveStats`; `skipPlayIntentNotify`.

Do not extend `CreateGame.tsx`. No courts, invites, `affectsRating`, `resultsByAnyone` (`eventCreateDefaults.applyEventUpdateInvariants`).

## Create `/create-event`

`CreateEvent.tsx`. Step 1: organizer vs looking (`eventCreatorIntent`: `organizing` | `looking`). Organizing is **not** auto-Going. Looking: owner lands on partner board. Required: kind chips, name, ≥1 hero (`EVENT_MAX_HEROES` = 8). Sport picker if multiple enabled. Level band same as GAME. City, club or `venueText`, date range, price, optional `externalUrl`.

Defaults: `isPublic`, `allowDirectJoin`, `timeIsSet`, `eventApprovalStatus=ON_APPROVE`, no courts.

## Find rail

Events chip off by default. List river excludes EVENT when no chip. Calendar idle includes EVENT. Compact poster rail below calendar (1 row / 2–3 carousel). See all → Events chip. `ON_APPROVE` omitted except owner/admin. `home-and-find.md`.

## Details `/games/:id`

`EventDetails` / `EventDetailsContent`. Heroes slideshow, kind, Register URL, sticky **I’m going** / **Need a partner**. Going = `PLAYING`. Need partner = `GameParticipant.lookingForPartner` (XOR Going). Partner board above Going; Message → DM. No results, live, bets, courts, Game Settings.

My/calendar if OWNER, Going, or Looking. Reminders 24h/2h while `ANNOUNCED` + `timeIsSet`. Archive by `endTime`.

## Radar / notify

Skip like TRAINING. Do not `GAME_MATCHES_INTENT`. `radarEntityTypes(EVENT)` → `[]`.

## Schema

`Game.eventKind`, `eventApprovalStatus`, `venueText`, `externalUrl`, `eventHeroes`. `GameParticipant.lookingForPartner`. Indexes on kind + approval.
