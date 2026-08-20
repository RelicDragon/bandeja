# Player invite modal: Search | Looking

Shipped. Invite picker (`PlayerListModal`) has a top `SegmentedSwitch`: **Search** (directory) and **Looking** (live Play Intents scored against this game).

## Decisions

| Topic | Choice |
|---|---|
| Population | Live Play Intents (`OPEN` + `MATCHED`), **browse city** (default Home) + sport + entity |
| Rank | `matchesGame` → fit score → `gamesTogetherCount` desc → `userId`; one row per user; cap 1000 |
| Mismatches | Shown, dimmed, still selectable, one mismatch line |
| Gender-locked slot | `filterGender` on the picker (invite-a-man / invite-a-woman) also filters Looking |
| Steal from lobby | Never. `MATCHED` / in-proposal → unlinked invite + toast |
| Invite + intent | OPEN + not in proposal → `reserve` + `playIntentId` on the invite |
| Reserve timing | Only when the invite row is created (not on create-game Confirm) |
| Live list | Subscribe `play-intent:invalidate` while modal is open; 30s refetch backup |
| Vanished selection | Deselect + toast; still findable on Search |
| Fit UI | Static 5-dot strip (dates / clubs / time / level / gender), not the court-lobby arena |
| Tab labels | Search \| Looking (third person). Count badge on Looking |
| Empty | Tab always visible, badge `0` after load, quiet copy, no “I want to play” CTA |
| Load error | Distinct copy + retry; do not fake an empty city |
| Conflict badges | Only **In a match** / **In a game**. OPEN+free: no badge |
| Default tab | Search |
| Chrome on Looking | List only: no search, teams segment, refine filters, or invite-as-trainer. Browse-city chip stays under the tabs |
| `intentLinked` | `true` linked; `false` steal-skip / reserve 409 (toast); `null` no intent or already gone (silent unlinked invite) |

## Surfaces

| Open | Tabs |
|---|---|
| Game details, player invite | Search \| Looking |
| Create game, timing set | Search \| Looking (score the draft) |
| Create game, no date/time | Search only |
| Trainer / wallet / team / compare | Search only, no switch |

```
showLooking = !inviteAsTrainerOnly && !!gameSport && (gameId || gameTiming.timeIsSet)
```

Do not put this tab on `GroupChannelInvitesModal`.

Entity mapping for the pool: `BAR` games → BAR intents; every other inviteable entity (GAME, TOURNAMENT, TRAINING-as-players, LEAGUE, …) → GAME intents.

## UX

- Top of the modal: `SegmentedSwitch` full-width, Looking badge = visible pool size (live, including while Search is active).
- Shared city chip under the tabs (browse lens). Confirm footer unchanged.
- Looking row: avatar, name, 5-dot fit, games-together, conflict badge.
- Full match: normal weight. Any missed dimension: dimmed + mismatch line.
- Sticky hint: `{{great}} great fit · {{total}} looking`.
- Empty: `browseCity.lookingEmptyInCity` (“Nobody’s looking in {city}”) + hint to use Search.

### Copy

Keys in `playerInvite.json` (`en`, `ru`, `cs`, `es`, `sr`). City-scoped empty copy: `browseCity.lookingEmptyInCity`. Do not reuse first-person `playIntent.looking`.

| Key | EN | RU | ES | CS | SR |
|---|---|---|---|---|---|
| `tabSearch` | Search | Поиск | Buscar | Hledat | Pretraži |
| `tabLooking` | Looking | Хотят поиграть | Quieren jugar | Chtějí hrát | Žele da igraju |
| `lookingBadgeMatch` | In a match | В матче | En un partido | V zápase | U meču |
| `lookingBadgeInGame` | In a game | В игре | En un juego | Ve hře | U igri |
| `lookingEmpty` | Nobody’s looking right now (fallback) | Пока никто не ищет игру | Nadie está buscando ahora | Nikdo teď nehledá | Niko trenutno ne traži |
| `stoppedLooking` | {{name}} stopped looking | {{name}} больше не ищет | {{name}} ya no busca | {{name}} už nehledá | {{name}} više ne traži |
| `alreadyInMatch` | They’re already in a match | Этот игрок уже в матче | Ya está en un partido | Už je v zápase | Već su u meču |

Mismatch phrasing reuses `playIntent.mismatch*` / `fitTimeSubtitle`.

## Rank

1. `matchesGame` (`intentMatchesGame`)
2. Fit score: ok-count, then tightness (shared club, tight time window)
3. `gamesTogetherCount` desc
4. Stable `userId`

Pool filters: **browse city** (session lens, default Home), sport, entity mapping above, `OPEN`+`MATCHED`, reachable window, not self, not blocked, not already playing/invited on **this** game. Fit still uses the game/draft venue (club / time / level / dates).

## API

### `POST /play-intents/invite-pool`

Auth required.

- `{ gameId, cityId? }` — load game, require invite permission (owner or `anyoneCanInvite` participant). Ignore client criteria. Populate from `cityId` when set, else game city. When `cityId` is set, do not require viewer Home === game city.
- `{ draft }` — create-game only. `draft.cityId` (browse) or viewer `currentCityId` + sport, entityType, ISO `startTime` (server derives the date key in **venue** TZ), clubId, minLevel, maxLevel, genderTeams.

Response member:

```
userId, intentId, firstName, lastName, avatar, gender, level,
status, inProposal, inGame,
matchesGame, fit[], mismatch,
gamesTogetherCount, matchScore
```

`gameFitBreakdown(intent, game)` lives next to `intentFitBreakdown` in `playIntentCriteria.ts`.

`gamesTogetherCount` uses the same co-play SQL as `GET /users/invitable-players`.

### `POST /invites` — optional `playIntentId`

In the send transaction:

| Intent | Action |
|---|---|
| OPEN, not in a proposal | `PlayIntentGameLifecycleService.reserve` + set `participant.playIntentId` |
| `MATCHED` / in a proposal | Unlinked invite + toast. Do not steal |
| reserve `409` | Unlinked invite + toast |
| Missing / cancelled / expired intent | Unlinked invite, no “already in a match” toast |
| Decline / expire linked invite | existing `release` |
| Accept linked invite | existing `consume` |

Create-game: stage `playIntentIdByReceiverId` on modal confirm (same pattern as `userTeamIdByReceiverId`). After `gamesApi.create`, `invitesApi.send({ playIntentId })`. Do **not** put Looking picks on `playIntentSource`. Skip ids already in `linkedInviteeIds`.

## Live

While the modal is open, subscribe to `play-intent:invalidate` (`PLAY_INTENT_INVALIDATE_EVENT`). Refetch when city/sport/entity match.

If a **selected** user leaves the pool: drop from selection + toast (`playerInvite.stoppedLooking`). New people may appear; other selections stay. Do not confirm ghosts.

Prefetch the pool on modal open so the Looking badge is ready on Search.

## Files

**Backend**

- `Backend/src/services/playIntent/playIntentCriteria.ts` — `gameFitBreakdown` + score
- `Backend/src/services/playIntent/playIntentInvitePool.service.ts` — `forGame` / `forDraft`
- `Backend/src/services/playIntent/playIntentInvitePoolRanking.ts`
- `Backend/src/services/playIntent/playIntentInviteLink.ts` — `shouldLinkPlayIntent` / `invitePlayIntentLinkOutcome`
- `Backend/src/services/user/gamesTogetherCount.ts`
- `Backend/src/services/playIntent/playIntent.schemas.ts` + routes + controller
- `Backend/src/services/game/participant.service.ts` — optional link/reserve on `sendInvite`

**Frontend**

- `Frontend/src/components/PlayerListModal.tsx` — top switch, tab body, shared selection
- `Frontend/src/components/playerInvite/PlayerInviteLookingList.tsx`
- `Frontend/src/components/playerInvite/PlayerInviteLookingRow.tsx`
- `Frontend/src/components/playerInvite/LookingFitDots.tsx`
- `Frontend/src/components/playerInvite/useInviteLookingPool.ts`
- `Frontend/src/components/playerInvite/lookingTypes.ts`
- `Frontend/src/pages/CreateGame.tsx` — pass `lookingDraft`; send `playIntentId`
- `Frontend/src/api/playIntents.ts`, `Frontend/src/api/invites.ts`
- `Frontend/src/i18n/locales/{en,ru,cs,es,sr}/playerInvite.json`

`PlayerListItem` stays Search-only.

### Create-game draft

```
lookingDraft: {
  sport, entityType, clubId,
  startTime, endTime, timeZone,
  minLevel, maxLevel, genderTeams
}
```

## UI tests

Catalog: `docs/UI_TEST_PLAN.md`.

| ID | Test | Expected |
|---|---|---|
| GD-148 | Invite modal tabs | Search default; Looking has count badge |
| GD-149 | Looking rank + gray | Matches first; misses dimmed with a mismatch line; still selectable |
| GD-150 | Looking invite reserves | OPEN player → pending invite, intent MATCHED, drops off Looking live |
| GD-151 | In-a-match invite | Badge; send does not steal; unlinked invite |
| GD-152 | Empty Looking | Tab visible, badge 0, empty copy, Search still works |
| C-62 | Create game Looking | Tab only after date/time; create sends invite with `playIntentId` |
| C-63 | No looking chrome | Wallet / team / trainer picker: no Search\|Looking switch |
