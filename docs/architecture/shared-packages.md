# Shared packages

Four shareable units. Backend `tsconfig.json` has **no** `paths`. Frontend aliases `@shared` / `@bandeja/shared` / `@bandeja/chat-contract` / `@bandeja/unread-contract` / `@bandeja/app-locale` in `Frontend/vite.config.ts` and (partially) `Frontend/tsconfig.json`.

## `@bandeja/chat-contract` — `packages/chat-contract`

`package.json` name `@bandeja/chat-contract`. Built to `dist/` (`npm run build` via `scripts/run-heavy`).

Exports (`src/index.ts`):

| Export | Source |
|--------|--------|
| `ChatSyncEventType` | const object of event name strings |
| `ChatSyncEventTypeValue` | union of those strings |
| `CHAT_SYNC_EVENT_TYPES` | `Object.values` |
| `MESSAGE_TRANSLATION_PENDING` | sentinel |
| `MESSAGE_TRANSCRIPTION_PENDING` | sentinel |
| `MESSAGE_TRANSCRIPTION_NO_SPEECH` | sentinel |
| `isMessageTranslationPending` | helper |
| `normalizeClientMutationId` | `clientMutationId.ts` |

Event list must match Prisma `enum ChatSyncEventType` — `packages/chat-contract/test/parity.test.mjs`. Values: see [database.md](./database.md).

BE/FE both import `@bandeja/chat-contract`. FE Vite points at `packages/chat-contract/src/index.ts` (source). Backend `prebuild` builds the package.

## `@bandeja/unread-contract` — `packages/unread-contract`

Unread math shared by API unread services and FE `unreadStore` / chat sync.

Exports (`src/index.ts`):

- Types: `UnreadSnapshot`, `UnreadTotals`, `UnreadMergeState`, `UnreadAuthorityEnvelope`, `ContextKey`, `SnapshotContextType` (`GAME` \| `USER` \| `GROUP`), `GroupChannelMeta`, `OptimisticUnreadBump`, clocks/reasons.
- `contextKey` / `parseContextKey`
- `computeTotals` / `emptyUnreadTotals`
- Merge: `mergeDeltaAccepted`, `mergeSnapshotAccepted`, `shouldApplyDelta`, `shouldApplySnapshot`, `computeRepairFloor`, `reapplyOptimisticClears`, `setContextUnreadInMap`
- Optimistic receive: `applyInboundMessageBump`, `reconcileOptimisticBumpOnEnvelope`, …

`SnapshotContextType` is **not** the full Prisma `ChatContextType` (no `BUG` in the snapshot union; bugs fold via group-channel meta `bugId`).

## `@bandeja/app-locale` — `packages/app-locale`

Shared UI locale registry. `package.json` name `@bandeja/app-locale`. Built to `dist/` (`npm run build` via `scripts/run-heavy`). Backend `prebuild` and Frontend `prebuild` both build it. Seed/ts-node loads `env.ts`, which imports this package’s `dist/`.

Exports (`src/index.ts`): `APP_UI_LANGUAGES`, `normalizeAppUiLanguage`, `GAME_TEXT_TRANSLATION_POLICY_VERSION`, `GAME_TEXT_LOCALIZATION_GENERATION_ENABLED` (package default; Backend env can override).

FE Vite points at `packages/app-locale/src/index.ts` (source). Backend resolves `main: dist/index.js`.

## `@bandeja/shared` — `Frontend/shared`

npm `"name": "@bandeja/shared"`. Backend dependency `"@bandeja/shared": "file:../Frontend/shared"`. Frontend also aliases `@shared` → this folder.

`package.json` `exports`: `./booking`, `./booking/*`, `./clubIntegration`, `./gameBooking/*`, `./achievements`, `./achievements/*`, `./*`.

Backend **also** keeps `Backend/src/shared/` copies of many of the same files (`createTemplates.ts`, `sport.ts`, `gameFormat/`, `officiating*`, `strictValidation.ts`, …). Keep them in sync:

- `Frontend/shared/sharedModuleParity.test.ts` — runtime equality vs `@backend/shared` and vs `@bandeja/shared/booking`.
- `Backend/src/shared/sharedModuleParity.test.ts` — same idea from BE.
- `Frontend/src/sport/createTemplates.parity.test.ts` — FE `@shared/createTemplates` vs `Backend/src/shared/createTemplates.ts` source + vs `Frontend/src/sport/createFlow.ts` UI wrapper.

When editing templates or booking helpers, change **canonical** `Frontend/shared` and the BE duplicate (or the import from `@bandeja/shared`) in the same change. Do not invent a template ID matrix in markdown — read `Frontend/shared/createTemplates.ts`.

### Modules (what they export)

| Module | Role |
|--------|------|
| `sport.ts` | `Sports`, `Sport`, `ALL_SPORTS`, `DEFAULT_SPORT`, `isSport` / `parseSport` |
| `createTemplates.ts` | `CREATE_TEMPLATES`, `CreateTemplateId`, preset meta. Canonical create-flow templates. |
| `clubIntegration.ts` | Detect Booktime/Padeloo/Klikteren/NSPadel from club JSON; parse Booktime company id |
| `booking/types.ts` | `BusySnapshotCourt`, `ExternalBookingResult`, `BookingErrorCode`, `bookingProviderError` |
| `booking/errorKeys.ts` | `BOOKING_ERROR_KEYS` |
| `booking/index.ts` | re-exports types + error keys |
| `gameBooking/*` | Snapshots on `Game`: `buildBookingSnapshots`, `computeGameBookingStatus`, `deriveGameTimeFromBookings`, `linkBookingToGame`, `rollbackBooktimeBookings`, `reservationIntent`, selection limits, coverage, court id apply, deep-link parse |
| `booktime/` | local time / timezone helpers |
| `nextGame/policy.ts` | **Policy string + lookback constants only** |
| `gameFormat/` | normalize patch, golden point, balls-in-games, match generation, legacy timed |
| `officiatingLevel.ts` / `officiatingEnforcement.ts` | strict vs honor scoring |
| `entityCapabilities.ts` | per-`EntityType` roster/results rules |
| `eventApproval.ts` | `EVENT_APPROVAL_STATUS` |
| `achievements/` | catalog, eligibility, pin slots |
| `playIntentRealtime.ts` | socket event names/payloads (BE re-exports via `@bandeja/shared/playIntentRealtime`) |
| `playIntentCreateSource.ts` | create-source enum for looking-to-play → game |
| `systemMessages/` | roster lifecycle translation keys |
| `rotationFormats.ts` | Americano/Mexicano/etc. |
| `strictValidation.ts` | BWF / pickleball caps |
| `timedCustomPresets.ts` | timed custom live |
| `gameSlotOverlap.ts` | overlapping game detection |
| `gamePhotos/permissions.ts` | who can view photos |
| `isPresetLegal.ts` | scoring preset legality |
| `matchFormat.ts` | match format helpers |
| `nameSearch.ts` | name matching |
| `sportRegistryDefaults.ts` | default match sizes |
| `automaticRelaxedScoring.ts` | relaxed scoring → rating sets (BE results import this package path) |

### Booking ports (runtime)

Shared package defines **data shapes**, not HTTP.

FE port interface: `Frontend/src/integrations/booking/ClubBookingProvider.ts` — `bookSlot`, `cancelBooking`, `listUpcoming`, optional `verifyBooking`, `fetchSnapshotCourts`.

Factory: `createClubBookingProvider.ts`. Implementations:

- `providers/BooktimeClubBookingProvider.ts`
- `providers/PadelooClubBookingProvider.ts`
- `providers/KlikterenClubBookingProvider.ts`
- `providers/NspadelClubBookingProvider.ts`

BE booking HTTP: `/api/booktime`, `/api/padeloo`, `/api/klikteren`, `/api/nspadel`. Linking onto `Game`: `GameExternalBooking` + `services/game/gameExternalBooking.service.ts` using `@bandeja/shared/gameBooking/*`.

### nextGame policy vs `pickNextGame.ts`

| File | Role |
|------|------|
| `Frontend/shared/nextGame/policy.ts` | `NEXT_GAME_DISPLAY_POLICY` (human string), `NEXT_GAME_LOOKBACK_SECONDS` = 3600, `NEXT_GAME_LOOKBACK_MS` |
| `Frontend/src/utils/pickNextGame.ts` | **Implementation**: skip `FINISHED`/`ARCHIVED`; `startTime` strictly after `reference − 1h`; earliest `startTime` wins. Re-exports policy constants. |
| `Frontend/shared/nextGame/pickNextGameGolden.json` | Cross-platform golden cases |
| Swift `BandejaNextGames` / Kotlin picker | Must stay aligned; FE script `npm run verify:next-game` |

Do not put selection logic in `policy.ts`. Do not fork a second JS picker.

## Build order

Backend `prebuild`: chat-contract → unread-contract → app-locale → `Frontend/shared` (`tsc` in that package). Frontend `prebuild`: both contracts + app-locale. Import `@bandeja/shared` from Backend **after** shared `dist/` exists, or use source via tests’ `@backend` alias. Deploy (`scripts/deploy-backend.sh`) runs `prebuild` before `seed:sticker-packs` so `@bandeja/app-locale` `dist/` exists for ts-node.
