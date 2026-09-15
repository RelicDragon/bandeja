# Player invite modal: Search | Looking

Shipped. `PlayerListModal` top `SegmentedSwitch`: **Search** (directory) vs **Looking** (live play intents scored against this game). Not the Find court-lobby radar (`lobby-radar-matching-games.md`). Browse city chip under the tabs (`browse-city.md`).

## When tabs show

```
showLooking = !inviteAsTrainerOnly && !!gameSport && (gameId || gameTiming.timeIsSet)
```

Trainer / wallet / team / compare: Search only. Not on `GroupChannelInvitesModal`. Create-game without date/time: Search only.

Entity mapping: BAR games → BAR intents; every other inviteable entity → GAME intents.

## Decisions

| Topic | Choice |
|-------|--------|
| Population | OPEN + MATCHED, **browse city** + sport + entity |
| Rank | `matchesGame` → fit score → `gamesTogetherCount` desc → `userId`; cap 1000 |
| Mismatches | Dimmed, selectable, one mismatch line |
| Steal | Never. MATCHED / in-proposal → unlinked invite + toast |
| OPEN + not in proposal | `reserve` + `playIntentId` on the invite row (not on create-game Confirm) |
| Live | `play-intent:invalidate` while modal open; 30s refetch |
| Vanished selection | Deselect + toast; still on Search |
| Fit UI | Static 5-dot strip (dates / clubs / time / level / gender) |
| Empty | Tab visible, badge 0, no “I want to play” CTA |
| Default tab | Search |

## API

`POST /play-intents/invite-pool`

- `{ gameId, cityId? }` — invite permission; populate from `cityId` else game city; skip home===game when `cityId` set.
- `{ draft }` — create-game. `draft.cityId` (browse) or viewer Home + sport, entityType, ISO start (date key in **venue** TZ), club, levels, gender.

Member: `userId, intentId, firstName, lastName, avatar, gender, level, status, inProposal, inGame, matchesGame, fit[], mismatch, gamesTogetherCount, matchScore`.

`POST /invites` optional `playIntentId`. Decline/expire linked → `release`. Accept linked → `consume`. Create-game stages `playIntentIdByReceiverId` then `invitesApi.send` after create. Skip ids already in `linkedInviteeIds`.

## Files

BE: `playIntentCriteria.ts`, `playIntentInvitePool.service.ts`, `playIntentInvitePoolRanking.ts`, `playIntentInviteLink.ts`, `invite.service` / `participant.service`. FE: `PlayerListModal.tsx`, `components/playerInvite/*`, `useInviteLookingPool.ts`.
