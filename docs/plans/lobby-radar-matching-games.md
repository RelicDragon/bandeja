# Court lobby radar: matching public games

Shipped. Looking players see fully eligible public games as circular nodes on the court lobby radar. Push (`GAME_MATCHES_INTENT`) and the Find list are unchanged. Invite Search \| Looking is a different surface (`player-invite-looking.md`).

## Decisions

| Topic | Choice |
|-------|--------|
| Shape | Circular, ~40px, same family as player avatars. Not cards, not `PoolMember` physics |
| Game node | Composite of 1–3 PLAYING faces (owner if roster thin) |
| Placement | Near orbit (`ORBIT_NEAR`), opposite rotation, behind player avatars |
| Cap | 4. Does not steal player slots |
| Eligibility | Public, future, `timeIsSet`, open PLAYING slot, `intentMatchesGame`, viewer level in band, MIX_PAIRS seat free |
| Queue-only | Included when a PLAYING slot is free (`allowDirectJoin: false`). Full games out |
| Sport intent | `GAME` + `TOURNAMENT` (`radarEntityTypes`) |
| BAR intent | `BAR` only |
| EVENT intent | `[]` |
| Skip | TRAINING, leagues, EVENT, private, owner, already PLAYING / INVITED / IN_QUEUE |
| Spectator | Hidden |
| Proposal open | Hidden while PENDING/ACCEPTED. Direct match editor still shows games |
| Rank | Direct join, soonest start, more open slots, `gameMatchScore`, `id` |
| Join PLAYING | Consume looking + detach proposal (any PLAYING join, not only radar CTA) |
| Join queue | Do not consume |
| Push | `GAME_MATCHES_INTENT` GAME/BAR only. Radar may show a tournament with no push |

CTA: **Join** / **Ask to join**. Gender, name, overlap gates match Find.

## Data

`matchingGames[]` on `GET /play-intents/pool`. Omitted/`[]` without reachable looking or with a real proposal. `listMatchingGamesForIntent` vs notify `matchIntentToGames`.

Payload: `id, entityType, allowDirectJoin, genderTeams, startTime, timeLabel, club, maxParticipants, playingCount, playingAvatars[], ownerAvatar`.

## Live

`play-intent:invalidate` reason `matching-games-changed` on public GAME / TOURNAMENT / BAR create, PLAYING/queue/invite changes, game update/delete. 2 min poll + focus/reconnect backup.

## Files

BE: `playIntentMatchingGames.ts`, `playIntentMatchingGames.service.ts`, `playIntentMatch.service.ts`, `playIntentPlayingJoin.ts`, `playIntentRealtime.ts`. FE: `api/playIntents.ts`, `matchingLobbyGames.ts`, `CourtLobbyArena.tsx`, `CourtLobbyGameNode`, `CourtLobbyGameFitCard`, `CourtLobbySheet.tsx`.
