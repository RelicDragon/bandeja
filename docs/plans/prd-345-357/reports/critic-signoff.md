# Sign-off

## Verdict

**SHIP.** The `paymentHint` data-loss chain is genuinely broken, and broken twice over, at the two
links the last gate named. The backend belt is a real chokepoint: `projectGameForBroadcast` runs
once in `SocketService.emitGameUpdate` (`socket.service.ts:1199`) and both of the only two
`game-updated` emits in the codebase send the projection, and every one of the ~50 call sites —
including the `socketEmitFacade` indirection — passes through that one method, so there is no
second path. The frontend belt is real too: the edit modal only sends `paymentHint` when the
trimmed value actually changed, an explicit clear still reaches the database as `null`, and
`preserveUntransmittedGameFields` stops a broadcast from erasing a locally-held value on both
screens that replace their game object wholesale. Stripping the three keys costs no consumer a
live update — `paymentHint` has exactly one reader and it reads over HTTP, and `userNote` /
`isClubFavorite` were *wrong* on the wire before (they carried the actor's values into every
recipient's state), so removing them deletes bad data rather than good. Both MINORs are closed at
the right layer, and the one declared-unfixed MINOR from the last gate — the two frontend test
files outside every npm script — has quietly been closed as well. I found nothing new at MINOR or
above. What remains is a short list of deliberate trade-offs and one pre-existing sibling defect
of the same family, all recorded below.

## The paymentHint BLOCKER

| Link in the chain | Broken? | Evidence (file:line) |
|---|---|---|
| 1. `leaveGame` deletes the roster row, then emits for that actor | **No — deliberately kept** | `participant.service.ts:294`; rationale and the "never re-entitle the actor to fix this" warning at `participantMessageHelper.ts:107-121`. Harmless once link 2 holds. |
| 2. The actor-projected payload is broadcast to the whole room | **Yes** | `socket.service.ts:1199` `const broadcastGame = projectGameForBroadcast(gameToEmit)`; both emits send it (`:1235` direct `notify-user-*`, `:1249` room). `projectGameForBroadcast` at `gameDetail.projection.ts:610-617` drops `GAME_BROADCAST_STRIPPED_KEYS` = `['paymentHint','userNote','isClubFavorite']` (`:46`, `:56`, `:594-597`) and returns a **copy**, so `gameToEmit` — used for the recipient set at `socket.service.ts:1204-1210` — is untouched. |
| 2b. Is it the single chokepoint? | **Yes** | `grep "'game-updated'"` over `Backend/src` returns exactly `socket.service.ts:1232` and `:1246`. Every emitter (`participant.service.ts`, `invite.service.ts`, `update.service.ts:1023`, `gamePhoto.events.ts:49`, `gameResultsArtifact.events.ts:44`, `admin.controller.ts`, `training.controller.ts`, `results.controller.ts`, `league/*`, `userTeamAddToGame.service.ts:300`, `utils/gameInviteCleanup.ts:83`, `utils/postJoinOperations.ts:19`) calls `SocketService.emitGameUpdate`, directly or via `socketEmitFacade.ts:139-146`. No other socket event carries a game object — I enumerated all 60+ `.emit(` sites in `socket.service.ts`; the only other one with a game inside is `new-invite` (`:1112`), which goes to a single `notify-user-${receiverId}` whose owner holds an `INVITED` roster row and is therefore entitled by `isEntitledToGamePaymentHint` (`gameDetail.projection.ts:561-569`). |
| 3. `GameDetailsShell` replaces `game` wholesale | **Yes** | `GameDetailsShell.tsx:456` applies `preserveUntransmittedGameFields(prevGame, broadcastGame)` **before** the self / non-self split, so both branches are covered; mirrored at `EventDetailsContent.tsx:139`. The helper's `'key' in incoming` test is sound because `normalizeGameFromApi` (`api/games.ts:16-26`) spreads and never re-introduces any of the three keys. An explicitly transmitted value, including `null`, still wins (`preserveUntransmittedGameFields.ts:46-57`). |
| 4. `EditGameInfoModal` writes the field back unconditionally | **Yes** | `EditGameInfoModal.tsx:828` now spreads `buildGameEditPricePayload(price, initialPrice)`; `gameEditPricePayload.ts:59-62` sends `paymentHint` only when `current.trim() !== initial.trim()`. Backend: `update.service.ts:138-146` `pickUncheckedGameScalars` uses `hasOwnProperty` + `!== undefined`, so an absent key never names the column. |
| 5. Can the gate be bypassed by another save path? | **No** | The only frontend writers of the column are `EditGameInfoModal` (gated), `CreateGame.tsx:1499` (create only, non-empty only), and `PUT /games/:id/cost-shares` (`gameCost.controller.ts:66`, already `'paymentHint' in raw`-gated, and `useUpdateCostShares` has no caller). The 14 other `gamesApi.update(` call sites all send narrow named patches and none mentions `paymentHint` — including `EventEditListingModal.tsx:178-193` on the event surface. PRD 345's `SeriesScopeSheet` inherits the already-gated `updateData` (`EditGameInfoModal.tsx:1363`), so an untouched hint is not pushed onto the series template either. |
| 6. Is an explicit clear still possible? | **Yes** | Blank vs a non-blank seed is a change → `'' \|\| null` → `paymentHint: null` (`gameEditPricePayload.ts:61`) → `update.service.ts:161-162` normalises and `pickUncheckedGameScalars` writes it. Covered both ways by `costViewModel.test.ts:305-309` (clear sends `null`) and by the real-DB step 4 of `gameCostSettle.integration.test.ts:427+`, which exists precisely so the preservation assertion at step 3 is not vacuous. |

The integration test at `gameCostSettle.integration.test.ts:368-425` walks the same chain against a
live database — delete the leaver's row, assert his `getGameById` has no hint, assert the
*organizer's* entitled view loses it under `projectGameForBroadcast`, then assert a price-only
`updateGame` preserves the stored IBAN. That is the regression the last gate asked for.

## Socket broadcast regression check

The concern was a consumer that read one of the three keys **off the socket** rather than from
HTTP. I checked every reader of each key and every merge point a broadcast flows into.

- **`paymentHint`** — exactly two readers in `Frontend/src`. `CostSettleSheet.tsx:55,81-88` reads
  `summary.paymentHint`, which comes from `GET /games/:id/cost-shares`
  (`api/gameCost.ts:40`), not from the game object; and the edit-modal seed
  (`EditGameInfoModal.tsx:121`), which is now fed by the preserved HTTP value. **No live loss.**
- **`userNote`** — rendered at `GameCard.tsx:215`, `LeagueGameCard.tsx:272-289,382`,
  `GameInfo.tsx:1234`. Its authoritative sources are `GET /api/games/:id` and the viewer's own
  optimistic write (`queries/games/patchUserGameNoteInCaches.ts`, `api/me.ts:185-209`). Before the
  fix, the broadcast carried the **actor's** note into every recipient's cache, so what was
  removed was wrong data, not fresh data. **No live loss; a latent display bug removed.**
- **`isClubFavorite`** — `GameInfo.tsx:998-1002` (the star) and the optimistic toggle at
  `GameDetailsShell.tsx:1098-1103`. Same story: a leave used to flip an unrelated viewer's star to
  the actor's value. **No live loss; the same latent bug removed.**
- **react-query caches.** `mergeMyOrPast` (`patchGameInGamesCaches.ts:30-42`) is
  `{...existing, ...incoming}` — an absent key keeps the cached value. `mergeFindCardGame.ts:138-139`
  names `userNote` explicitly with an `!== undefined` guard. Home / My / Past / Find / invite-card
  copies all keep what they held. The socket→query bridge (`queryInvalidationBridge.ts:28-45`)
  routes the broadcast through exactly those merges.
- **Self-branch behaviour.** `shouldMergeSelfGameSocketUpdate`
  (`utils/gameResultsArtifacts.util.ts:155-166`) inspects only `resultsArtifacts` and the three
  photo fields, so carrying the preserved keys cannot change the self-merge decision.
- **Other surfaces reading the broadcast.** `useResultsArtifactsTelegram.ts:170-181` (artifacts
  only), `useLeagueFixtureResultsLive.ts:89-98` (`resultsStatus` only), `GameQueuePanel` /
  `SpotOpenedGameSection` (refetch, do not merge). None touch the three keys.
- **Non-web clients.** No occurrence of `game-updated`, `paymentHint`, `userNote` or
  `isClubFavorite` in `Frontend/ios/App/App` (Swift), `Frontend/android` (Kotlin), `packages/`,
  `Frontend/shared` or `Admin/` source. Only the checked-in built bundles under
  `Frontend/ios/App/App/public/assets/`, which are build output.

**Conclusion: nothing stops updating live.** The strip removed three keys that were either never
read from the socket or were actively wrong there.

## The two MINORs

**(a) League-season room members receiving the hint — CLOSED.** No socket recipient receives
`paymentHint` at all now, so the transport can no longer be wider than the entitlement. This also
closes two mirror leaks the last gate had not separated out: `update.service.ts:1023` emits a game
loaded **for the organizer**, and `gameResultsArtifact.events.ts:39-44` deliberately resolves the
game **owner** as the actor — both really did put the organizer's IBAN on the room's wire on every
save and every artifact refresh, and both are now stripped at `socket.service.ts:1199`.

**(b) The three rating-explanation endpoints — CLOSED.** `assertCanReadGameResults(gameId,
req.userId ?? null)` is the first statement of all three handlers:
`results.controller.ts:396` (`getOutcomeExplanation`), `:428` (`getOutcomeRatingExplanationLlm`),
`:456` (`getOutcomeRatingExplanationTranslation`) — the same gate `getGameResults` uses at `:50`.
The gate (`services/results/gameResultsAccess.ts:33-82`) throws **404**, not 403, in all three
refusal branches, so the routes stay non-oracles; a public game short-circuits at `:45-52`, so the
intended guest read still works; a private game admits a roster row on the game *or its parent*
(`:60-67`), which matches what `MessageService` already allows for league fixtures.

Legitimate consumers still work. The only callers are `OutcomesDisplay.tsx:36` and
`RatingExplanationLlmSection.tsx:221` (inside `OutcomeExplanationModal.tsx:56`), both reached only
from `GameResultsEntryEmbedded.tsx:456` — a screen that exists only after `GET /results/game/:gameId`
passed the identical gate, so no user who can see the scoreboard gets a new 404. The spectator /
share path is a different route family (`LiveMatchPageChrome`, `SpectatorTopBar`, `api/live.ts`)
and does not touch these three endpoints. `Admin/` does not call them.

**Bonus, not claimed in the fix report:** the last gate's one declared-unfixed MINOR is now fixed.
`PlayIntentDeepLink.test.tsx` is in `test:play-intent` (`Frontend/package.json:63`) and
`TeamPlayerSelector.test.tsx` is in `test:user-team` (`:80`) — the two lanes the orchestrator
reports green at 127 and 12. All five new/extended test files for this fix sit in lanes that are
actually invoked: `src/queries/games/*.test.ts` glob (`:68`), FE `test:cost-split` (`:36`), BE
`test:available-games`, `test:live-rail` and `test:prd-integration`
(`Backend/package.json:83,107,113`).

## New findings

**None at MINOR or above.** I went looking specifically for a second `game-updated` producer, a
second `paymentHint` writer, a consumer that lost a live field, and a way to make the field
unclearable. None exists. The items below are trade-offs and pre-existing conditions, deliberately
not filed as findings.

## Open items a reviewer should know about

1. **Cross-device staleness of `paymentHint` is now real and deliberate.** If the organizer edits
   the hint on device A, device B's already-open Game Details keeps the old value in memory until
   its next HTTP read. Declared in `fix-payment-hint-regression.md` §2 and encoded in
   `docs/product/constraints.md:186-190`. A stale-but-present value is the right trade against the
   silent deletion it replaces.
2. **Turning a paid game FREE no longer clears the stored hint.**
   `gameEditPricePayload.ts:50-54` returns before the hint branch, so the column keeps its value
   (asserted as intended by `costViewModel.test.ts:317-323`). Nothing displays a hint for a free
   game, and switching back restores it — but it does mean an IBAN stays on the row after the
   organizer "removed" the price. Worth a conscious yes.
3. **The dirty gate's two halves have different lifetimes.** `price` is frozen at modal-open
   (`EditGameInfoModal.tsx:304-321`, keyed off `prevIsOpenRef`) while `initialPrice` is a `useMemo`
   on the *live* `game` prop (`:605`). A `game` object that gained `paymentHint` **after** the modal
   opened would therefore look like a deliberate clear. I traced every writer of the shell's `game`
   state and could not construct a reachable path — `initialGame` is itself a full `getById` payload
   (`GameDetailsPage.tsx:115-124`), the socket path is covered by `preserveUntransmittedGameFields`,
   and the one non-detail projection I found (`GameDetailsShell.tsx:988`, the results-entry start
   response) cannot land while the edit modal is open. Recorded as a robustness note, not a defect;
   see "Not verified".
4. **Pre-existing sibling of the same family, not touched by this fix.** The broadcast is still
   projected for the actor for *everything except* the three stripped keys, and
   `projectGamePhotoPayload` (`read.service.ts:50-68`) degrades `photosCount` to `0` and `mainPhoto`
   to `null` — **present** keys, which `preserveUntransmittedGameFields` by design does not restore
   — when the actor fails `canViewGamePhotos` (`shared/gamePhotos/permissions.ts:35-47`: needs
   `resultsStatus === 'FINAL'` **and** `forbidOthersPhotosView` **and** a non-participant actor). The
   same code is on `master` (`git show master:Backend/src/services/game/read.service.ts`, same
   `projectGamePhotoPayload` at the detail read), so it is not a regression from this programme, and
   the actor paths that reach it on a FINAL game are narrow enough that I could not confirm one. It
   is the natural next item if the new "least-entitled recipient" invariant is to hold for the whole
   payload rather than three keys.
5. **The live repro still has not been run.** One manual pass settles the whole BLOCKER in a minute:
   set a payment hint on a paid game, have a second account leave, edit the description, save,
   reload. Worth doing once before merge even though the chain is read-verified and covered by a
   real-DB test.
6. **The connection-pool note from the closing gate stands unchanged.**
   `validatePlayerCanJoinGame` issues queries on the global `prisma` client from inside the
   interactive transaction that holds the new game row lock (`participantValidation.ts:174,190`);
   pre-existing pattern, lengthened hold, unsized without load testing.
7. **The ~2,200 lines of Watch/iOS auth-rotation work still ship with this branch** and no lane
   covers them. Out of scope for this review per the brief, but it is a merge decision someone
   should make on purpose.
8. **Accepted and not re-litigated:** native push-shade actions for PRD 346 (recorded in
   `docs/product/not-shipped.md`), the pre-existing `console.log` tracing in `results.controller.ts`,
   and the full accepted-gaps list carried forward from `critic-final.md` / `critic-closing.md`.

## Not verified

- **Nothing was executed.** No `tsc`, build, lint, test runner, Prisma, HTTP request or device run.
  Every verdict above is from reading the working tree. I took the orchestrator's mechanical state
  as given and did not re-run any lane.
- **The fix was not reproduced live.** Both belts are proven by code and by a real-DB test I read
  but did not run; I did not watch an IBAN survive a leave-then-edit in a browser.
- **Item 3 above (the dirty-gate lifetime asymmetry) is UNVERIFIED as reachable.** I could not build
  a path that makes `game.paymentHint` go absent→present while the edit modal is open, so I am not
  filing it as a defect — but I also cannot prove no such path exists across every navigation into
  `GameDetailsShell`.
- **Item 4 above (photo-field degradation on a broadcast) is UNVERIFIED as reachable** on a FINAL
  game with `forbidOthersPhotosView`; the projection behaviour itself is proven by code.
- **No socket run.** The "exactly two emits" claim is from source, and is additionally pinned by a
  source-scan assertion in `availableGamesCard.projection.test.ts:399-419`; I did not observe a live
  `game-updated` frame.
- **The Telegram bot, the Admin panel and anything needing a device or a live integration** were not
  exercised — unchanged from the closing gate.
