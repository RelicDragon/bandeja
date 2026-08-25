# Court lobby radar: matching public games

Shipped. Looking players see fully eligible public games in the court lobby radar as circular icons, same family as player avatars. Push (`GAME_MATCHES_INTENT`) and the Find list are unchanged.

## Decisions

| Topic | Choice |
|---|---|
| Shape | Circular, 40px, same family as player avatars. No squircles, cards, or bottom dock |
| Game node | Composite of 1–3 PLAYING faces in one circle (owner if the roster is thin) |
| Placement | Same polar radius as `eligibleForProposal` (`ORBIT_NEAR`), opposite rotation, behind player avatars. Not far-field drift. Not mixed into `PoolMember` physics |
| Cap | 4 visible. Parallel to the 48 player cap. Does not steal player slots or `clusterProgress` |
| Eligibility | Full match only: public, future start, `timeIsSet`, open PLAYING slot, `intentMatchesGame` (dates / clubs / time / level / gender), viewer level inside the game band, MIX_PAIRS gender seat actually free |
| Queue-only | Included when a PLAYING slot is free (`allowDirectJoin: false`). Approval is not eligibility. Full games are out |
| Direct join | `allowDirectJoin: true` + open PLAYING slot |
| Sport intent | `GAME` + `TOURNAMENT` on the radar |
| BAR intent | `BAR` only |
| Skip | TRAINING, leagues, non-public, owner’s own, already PLAYING / INVITED / IN_QUEUE |
| Spectator | Hidden (no reachable looking intent) |
| Proposal open | Hidden while a real PENDING/ACCEPTED proposal is attached. Direct match editor (no proposal) still shows games |
| Fit dots | None on the node or card. Filter already required a full match |
| Rank | Direct join first, then soonest start, then more open slots, then `gameMatchScore` tightness, then `id` |
| Join PLAYING | Consume looking intent and detach from any pending proposal. Applies to any unlinked PLAYING join (radar, Find, queue accept, invite accept, toggle), not only the radar CTA |
| Join queue | Do not consume looking |
| Push | Unchanged. `GAME_MATCHES_INTENT` is still GAME/BAR only (not TRAINING/TOURNAMENT). Radar may show a tournament that push will not notify |
| Find list | Unchanged. Radar is a shortcut while looking |

## Visual

People stay circles. Games stay circles. Chrome tells them apart.

| Kind | Ring | Badge |
|---|---|---|
| Direct join | Solid emerald, near-affinity glow | `n/max` pips at 8 o’clock |
| Queue | Dashed cooler orbit, no glow | Clock at 8 o’clock |
| Tournament | Same join/queue ring + thin red rim | Swords at 2 o’clock |
| BAR | Same join/queue ring | Amber beer at 2 o’clock |

Tap freezes the node and springs `CourtLobbyGameFitCard`. Card: time as title, club as subtitle, entity · open slots, **Join** / **Ask to join**, **See game**. Gender, name, and overlap gates match Find. Overlap confirm does not freeze the arena; in-flight join does.

Empty lobby with only matching games still shows the arena.

## Data

`matchingGames[]` on `GET /play-intents/pool`. Not stuffed into `PoolMember`.

Omitted (`[]`) when the viewer has no reachable looking intent or has a PENDING/ACCEPTED proposal. Clients treat a missing array as `[]`.

`listMatchingGamesForIntent` is the radar filter. Notify still uses `matchIntentToGames` (open-slot public GAME/BAR, including queue-only).

Payload per game:

```
id, entityType, allowDirectJoin, genderTeams,
startTime, timeLabel, club { id, name } | null,
maxParticipants, playingCount,
playingAvatars[], ownerAvatar
```

Query: city + sport + public + `timeIsSet` + entity types + date bounds + not already owner/PLAYING/INVITED/IN_QUEUE. Rank in memory, slice to 4.

## Live

`play-intent:invalidate` reason `matching-games-changed` on public GAME / TOURNAMENT / BAR:

- create (including tournaments; notify still GAME/BAR only)
- PLAYING join, queue add/leave/accept/decline/cancel
- leave PLAYING, toggle PLAYING ↔ queue
- invite send / accept / decline / cancel / expire
- game update (public, join mode, roster-affecting fields, time, club, status, …)
- delete / cancel

Last free slot taken: node gone on next pool payload. 2 min poll + focus/reconnect stay as backup.

## Files

**Backend**

- `playIntentMatchingGames.ts` — entity types, open slot, MIX_PAIRS seat, rank
- `playIntentMatchingGames.service.ts` — `listMatchingGamesForIntent`
- `playIntentMatch.service.ts` — pool `matchingGames`; `onPublicGameCreated` publishes radar first, then GAME/BAR notify
- `playIntentPlayingJoin.ts` — consume reachable OPEN/MATCHED intent and detach from proposal
- `playIntentRealtime.ts` — `matching-games-changed`
- `participant.service.ts`, `invite.service.ts`, `update.service.ts`, `delete.service.ts` — consume on PLAYING + publish

**Frontend**

- `playIntents.ts` — `matchingGames` (default `[]`)
- `matchingLobbyGames.ts` — spectator/proposal hide; occupancy key vs orbit key
- `CourtLobbyArena.tsx` — dedicated game orbit, not player physics
- `CourtLobbyGameNode` / `CourtLobbyGameFitCard` / composite / pips
- `CourtLobbySheet.tsx` — pin, join/ask, hide spectator/proposal
- i18n `playIntent.json` (en, ru, cs, es, sr)

## Tests

`docs/UI_TEST_PLAN.md` §16.1 PI-46–PI-57. Unit: ranking, MIX_PAIRS seat, queue-only with a free slot, entity types, spectator/proposal hide, arena circular nodes not in `PoolMember` physics.
