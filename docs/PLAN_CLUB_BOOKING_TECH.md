# Plan: Club admin & court scheduling — technical

Companion UX spec: [PLAN_CLUB_BOOKING_UX.md](./PLAN_CLUB_BOOKING_UX.md). Verified against codebase 2026-05.

## Goals & constraints

| Rule | Technical implication |
|------|------------------------|
| Players book only via game flows | No `CourtBooking` for users; occupancy = `Game` (+ `GameCourt` for multi-court) |
| Club admin ≠ platform admin | New `ClubAdmin` join table + `requireClubAdmin` middleware |
| Admin holds block create-game grid | Merge holds into availability APIs |
| Cancel must DM + push | Reuse `GameDeleteService` notifications **plus** templated user DM |
| No standalone player booking | Extend `getBookedCourts` / grid hooks only |

## Code anchors (existing)

| Area | Location |
|------|----------|
| Occupancy API | `Backend/src/services/game/bookedCourts.service.ts`, `GET /games/booked-courts` |
| Slot grid | `Frontend/src/components/createGame/GameStartSection.tsx`, `Frontend/src/hooks/useBookedCourts.ts` |
| Game cancel | `Backend/src/services/game/delete.service.ts`, `DELETE /games/:id` (OWNER only) |
| Game update | `Backend/src/services/game/update.service.ts` |
| External slots | `Backend/src/services/clubIntegration/clubIntegration.service.ts` |
| User DM | `UserChatService.getOrCreateChatWithUser`, `MessageService.createMessageWithEvent` |
| Platform clubs | `Backend/src/routes/admin.routes.ts`, `Admin/` |
| Club PUT / media | `PUT /clubs/:id` (`requireAdmin`), `uploadClubAvatar` (`isAdmin` only) |
| Court CRUD routes | `Backend/src/routes/court.routes.ts` — **no auth today (fix in P1)** |
| Tab bar / shell | `Frontend/src/pages/MainPage.tsx`, `BottomTabBar.tsx` |

---

## Resolved product defaults

| # | UX open question | Decision |
|---|------------------|----------|
| 1 | Cancel scope | **Two APIs:** full game delete + `clearCourtSlot` (strip court/time flags, keep game) |
| 2 | Remove from grid without delete | `clearCourtSlot` only |
| 3 | External override | **v1 view-only** on admin grid |
| 4 | Tournament multi-court | Schedule includes `gameCourts` + primary `courtId` |
| 5 | BAR | Same grid; entity-specific filtering later |
| 6 | Multi-admin audit | `createdByUserId` on holds; `cancelledByUserId` on `CancelledGame` |
| 7 | Court CRUD | Club admin create/update/deactivate for assigned clubs |

---

## Data model (Prisma)

### New models

```prisma
enum ClubAdminRole {
  ADMIN
  STAFF   // reserved
}

model ClubAdmin {
  id        String        @id @default(cuid())
  userId    String
  clubId    String
  role      ClubAdminRole @default(ADMIN)
  createdAt DateTime      @default(now())
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  club      Club          @relation(fields: [clubId], references: [id], onDelete: Cascade)

  @@unique([userId, clubId])
  @@index([clubId])
  @@index([userId])
}

enum CourtSlotHoldLabel {
  WALK_IN
  PHONE
  ACADEMY
  MAINTENANCE
  OTHER
}

model CourtSlotHold {
  id              String             @id @default(cuid())
  clubId          String
  courtId         String
  startTime       DateTime
  endTime         DateTime
  label           CourtSlotHoldLabel
  note            String?
  createdByUserId String
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  club            Club               @relation(fields: [clubId], references: [id], onDelete: Cascade)
  court           Court              @relation(fields: [courtId], references: [id], onDelete: Cascade)
  createdBy       User               @relation(fields: [createdByUserId], references: [id], onDelete: Cascade)

  @@index([clubId, startTime, endTime])
  @@index([courtId, startTime])
}
```

Add relations on `User`, `Club`, `Court`.

Migration: `npx prisma migrate dev` (auto-create per workspace rule).

### Optional club fields (P2)

- `defaultSlotMinutes`, `cancellationNoticeHours`, `policyText` on `Club` or `Club.settings` JSON
- Weekly hours = v2 JSON on `Club`

### No player booking table

`Game` fields: `timeIsSet`, `clubId`, `courtId`, `hasBookedCourt`, `startTime`, `endTime`. Multi-court: `GameCourt`.

---

## Auth & authorization

### Middleware (`Backend/src/middleware/auth.ts`)

`requireClubAdmin(paramKey = 'clubId')`:

- `ClubAdmin` row for `req.userId` + `req.params[paramKey]`
- **Or** `req.user.isAdmin` (platform admin)
- 403 `clubAdmin.forbidden`

Helpers in `ClubAdminService`:

- `getAdminClubIds(userId)`
- `assertClubAdmin(userId, clubId)`

### Secure existing routes

| Route | Today | Target |
|-------|--------|--------|
| `POST/PUT/DELETE /courts` | No auth | `authenticate` + `requireClubAdmin` (club from body/params) |
| `PUT /clubs/:id` | `requireAdmin` | Club admins use `PATCH /club-admin/clubs/:id` |
| `POST /media/upload/club/*` | `isAdmin` only | Club admin for owned `clubId` |

### Bootstrap / FAB

On profile/auth payload:

```ts
clubAdminClubs: { id: string; name: string; avatar?: string }[]
```

- Extend profile query: `clubAdmins: { select: { club: { select: { id, name, avatar } } } }`
- Frontend: `authStore` or `useClubAdminClubs()`

---

## Backend API (`/club-admin`)

Router: `Backend/src/routes/clubAdmin.routes.ts` → `router.use('/club-admin', clubAdminRoutes)` in `routes/index.ts`.

### Clubs

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/club-admin/clubs` | Assigned clubs + metrics |
| `GET` | `/club-admin/clubs/:clubId` | Detail + courts + integration status |
| `PATCH` | `/club-admin/clubs/:clubId` | Whitelist: name, description, contact, hours, amenities, address, lat/lng — **not** `cityId`, `isActive`, integration |

### Schedule (admin-enriched)

| Method | Path | Query |
|--------|------|-------|
| `GET` | `/club-admin/clubs/:clubId/schedule` | `date`, optional `courtId` |

Response `ScheduleSlot` union:

```ts
| { type: 'game'; gameId; courtId; startTime; endTime; hasBookedCourt; status; entityType;
    name?; host: BasicUser; participantCount }
| { type: 'game_court'; gameId; courtId; ... }   // GameCourt rows
| { type: 'external'; courtId; startTime; endTime; courtName }
| { type: 'hold'; holdId; courtId; label; note; startTime; endTime }
```

Plus optional `conflicts: ConflictDescriptor[]` for admin UI.

`ClubAdminScheduleService.buildDaySchedule`:

1. Games (`timeIsSet`, club/court filter, participants OWNER, `gameCourts`)
2. External via `ClubIntegrationService`
3. `CourtSlotHold` in range

### Player availability (extend existing)

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/games/booked-courts` | Append holds as busy slots (no PII); extend `BookedCourtSlot` |

`useBookedCourts` / create-game: holds = **hard busy** (same UX as external red once P3 enforces non-selectable).

**Extend `BookedCourtSlot`** (`Frontend/src/types/index.ts` + service):

```ts
slotKind?: 'game' | 'external' | 'hold';  // optional; infer from flags if omitted
holdBlocked?: boolean;  // true for CourtSlotHold — treat like clubBooked in grid
// gameId / holdId only on admin schedule API, not public booked-courts
```

**`bookedCourts` game query:** add `status` filter (e.g. exclude `FINISHED` / `CANCELLED` if those remain rows) — today only `timeIsSet: true`, no status filter.

### Courts

| Method | Path |
|--------|------|
| `GET` | `/club-admin/clubs/:clubId/courts` |
| `POST` | `/club-admin/clubs/:clubId/courts` |
| `PATCH` | `/club-admin/courts/:courtId` |
| `PATCH` | `/club-admin/courts/:courtId/deactivate` → `isActive: false` |

Use `refreshClubCourtsCount`; avoid hard delete when references exist.

### Holds

| Method | Path |
|--------|------|
| `POST` | `/club-admin/clubs/:clubId/holds` |
| `PATCH` | `/club-admin/holds/:holdId` |
| `DELETE` | `/club-admin/holds/:holdId` |

Validate `court.clubId`, `endTime > startTime`, optional overlap rules.

### Game actions

| Method | Path | Body |
|--------|------|------|
| `POST` | `/club-admin/clubs/:clubId/games/:gameId/cancel` | `{ reason, note?, message? }` |
| `POST` | `/club-admin/clubs/:clubId/games/:gameId/clear-court` | `{ reason, note?, message? }` |

**Preconditions:** game at club; future slot; `resultsStatus === 'NONE'` for full cancel.

**`cancel`:**

1. `GameDeleteService.deleteGame(gameId, adminUserId)` → `sendGameCancelledNotification` to non-owner participants + socket
2. `ClubAdminNotificationService.sendCourtCancellationDm(adminId, hostId, customMessage)` — host = `OWNER`, else first `ADMIN`
   - `getOrCreateChatWithUser` + `createMessageWithEvent` (USER context, sender = admin user)

**Notification policy (avoid duplicate noise):**

| Recipient | Full cancel | Clear court |
|-----------|-------------|-------------|
| Host (OWNER) | Custom DM (required) | Custom DM (required) |
| Other participants | Existing `GAME_CANCELLED` push (no custom DM unless product asks) | Optional push “court released” v2; v1 host-only DM |
| Admin | — | — |

For full cancel: if host is also in `GAME_CANCELLED` recipients, **skip generic push for host** when custom DM is sent, or use DM as sole host channel.

**`clear-court`:**

1. `GameUpdateService`: `courtId: null`, `timeIsSet: false`, `hasBookedCourt: false` (keep `startTime`/`endTime` by default)
2. DM to host only (v1); template keys `clubAdmin.dm.courtCancelled` / `clubAdmin.dm.courtCleared`

Built by `Backend/src/utils/clubAdminDmMessage.ts` from `translations.ts` placeholders: `{{hostName}}`, `{{club}}`, `{{date}}`, `{{time}}`, `{{reason}}`, `{{note}}`. Client preview: `Frontend/src/utils/clubAdmin/cancelMessage.ts` (same keys).

### Platform admin assignment

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/admin/clubs/:clubId/admins` | `requireAdmin` |
| `POST` | `/admin/clubs/:clubId/admins` | `{ userId, role? }` |
| `DELETE` | `/admin/clubs/:clubId/admins/:userId` | |

**Admin UI:** club modal in `Admin/index.html` — assign/list club admins.

---

## Service layer

```
Backend/src/services/clubAdmin/
  clubAdmin.service.ts
  clubAdminClub.service.ts
  clubAdminCourt.service.ts
  clubAdminHold.service.ts
  clubAdminSchedule.service.ts
  clubAdminGame.service.ts
  clubAdminNotification.service.ts

Backend/src/services/game/
  bookedCourts.service.ts    # merge holds; thin public vs admin paths
```

`detectScheduleConflicts(slots)` — admin-only helper.

---

## Frontend

### Routing

`urlSchema.ts` places: `myClubs`, `myClub`, `myClubSchedule`, `myClubCourt`, `myClubSettings`.

```
/my-clubs
/my-clubs/:clubId
/my-clubs/:clubId/schedule
/my-clubs/:clubId/courts
/my-clubs/:clubId/courts/:courtId
/my-clubs/:clubId/settings
```

Separate `App.tsx` routes under `ProtectedRoute` (not inside `MainPage` tab switch).

### FAB

`ClubAdminFab.tsx` in `MainPage.tsx` (+ `SplitViewPanels` if needed):

- Visible when `clubAdminClubs.length > 0`
- `fixed` above tab bar
- Navigate to list or single club

### Pages & components

```
pages/clubAdmin/
  MyClubsPage.tsx
  ClubAdminHomePage.tsx
  ClubSchedulePage.tsx
  ClubCourtsPage.tsx
  ClubCourtDetailPage.tsx
  ClubSettingsPage.tsx

components/clubAdmin/
  ClubAdminLayout.tsx
  ClubAdminFab.tsx
  CourtScheduleGrid.tsx
  ScheduleSlotCell.tsx
  SlotDetailSheet.tsx
  SlotDetailPanel.tsx
  BlockSlotSheet.tsx
  CancelGameSheet.tsx
  ClubAdminCourtForm.tsx
```

### Shared grid extraction

| Piece | Location |
|-------|----------|
| 30-min iteration, TZ | `utils/clubSchedule/timeSlots.ts` |
| Slot colors | `utils/clubSchedule/slotStyle.ts` |
| Admin data hook | `hooks/useClubAdminSchedule.ts` |

Player: keep `useBookedCourts`; share color utils.

### API client

`Frontend/src/api/clubAdmin.ts`

### State

- Schedule: 10s poll + pull-to-refresh (match create-game)
- 403 → toast + exit admin stack

### i18n

`Frontend/src/i18n/locales/*/clubAdmin.json`

### P3 player polish (no new routes)

- Create/edit game: warn red overlap + `!hasBookedCourt`
- Post-create nudge to mark court booked

---

## Real-time & performance

| Concern | v1 | v2 |
|---------|----|----|
| Stale grid | 10s poll + pull-to-refresh | Socket `club-admin:{clubId}` |
| External | `isLoadingExternalSlots` banner | — |
| Indexes | holds `(clubId, startTime)` | — |

---

## Security

- All mutating `/club-admin/*` → `requireClubAdmin`
- Public `booked-courts`: no game PII; holds as anonymous busy blocks
- Rate-limit cancel/hold POSTs
- Max hold duration server-side (e.g. 6h)
- Custom message max length (e.g. 500)
- Assignment only via `/admin/*`

---

## Testing

| Layer | Focus |
|-------|--------|
| Unit | `buildDaySchedule`: games + holds + external mock |
| Integration | Admin cannot touch other club; player cannot POST hold |
| Integration | Cancel → DM mock + game deleted |
| Frontend | `slotStyle` / grid snapshots |
| Automated | `club-admin-schedule.ts` (unit), `club-admin.suite.ts` (DM + DB when `DB_URL` set) |

---

## Implementation phases

### P0 — Read-only admin shell

- [x] Prisma `ClubAdmin` + db push (2026-05-15)
- [x] `requireClubAdmin`, `GET /club-admin/clubs`, `GET .../schedule` (games + external)
- [x] Admin assignment API + Admin UI list/assign
- [x] Profile `clubAdminClubs`
- [x] FAB + routes + home + schedule grid + slot sheet (read-only mode removed for mutating flows in P1+)

### P1 — Holds & courts

- [x] Prisma `CourtSlotHold` + db push
- [x] Holds CRUD
- [x] Merge holds into `getBookedCourts` + admin schedule
- [x] Block/release UI; court pages
- [x] Auth on legacy `/courts` mutations

### P2 — Settings & cancel

- [x] `PATCH` club + club-admin media upload
- [x] `ClubSettingsPage`
- [x] `cancel` + `clear-court` + `ClubAdminNotificationService`
- [x] `CancelGameSheet` + live preview (`cancelMessage.ts`) — 2026-05-15

### P3 — Polish

- [x] `GameCourt` in schedule
- [x] Create-game hard-block for holds/external (`isSlotHardBlocked`)
- [x] Conflict badges on admin schedule
- [x] Coach marks (localStorage) — 2026-05-15
- [x] Save-time overlap warn for yellow slots + hard-block save guard — 2026-05-15
- [x] Post-create mark-court nudge (`MarkCourtBookedModal`) — 2026-05-15

### P4 — v1 completion (2026-05-15)

- [x] `externalSlotsFailed` on schedule response (`clubAdminSchedule.service.ts`)
- [x] Rate-limit cancel / hold / clear-court (`clubAdmin.routes.ts`)
- [x] Max hold 6h (`clubAdminHold.service.ts` — `MAX_HOLD_HOURS`)
- [x] `photos` on club admin PATCH whitelist
- [x] `clear-court` + cancel preview + message host UI (`ClubSchedulePage`, `SlotDetailSheet`)
- [x] `ClubAdminCourtForm`, court detail PATCH UI
- [x] `resolveSlotMinutes` / `defaultSlotMinutes` in `timeSlots.ts`, `useGameTimeDuration`
- [x] `clubAdmin.json` cs, es, sr (+ index imports)

### P3.1 — v1 polish (2026-05-15)

- [x] `scheduleSlotCourtKey` + unassigned column (`UNASSIGNED_COURT_ID`)
- [x] `ScheduleLegend`, now-line, refresh on `ClubSchedulePage`
- [x] `EditHoldSheet` + `patchHold`
- [x] `ClubSettingsPage` amenities / policy / defaults / avatar via existing media API
- [x] `scripts/tests/club-admin-schedule.ts` (+ run-all entry)

### P4.1 — post–v1 backlog (2026-05-15)

- [x] `clubAdminDmMessage.ts` + `clubAdmin.dm.*` in `translations.ts` (en, ru, sr, es, cs)
- [x] `clubAdminGame.service.ts` uses templates + host `language`
- [x] `scripts/tests/club-admin.suite.ts` (+ `run-all.ts`)
- [x] `SlotDetailPanel` + rail layout on `ClubSchedulePage` (`lg+`)
- [x] `GameStartSection` policy / cancellation notice from club fields

---

## Remaining backlog

Canonical UX list: [PLAN_CLUB_BOOKING_UX.md § Remaining backlog](./PLAN_CLUB_BOOKING_UX.md#remaining-backlog). Verified 2026-05-15. **P4.1 shipped; no open post–v1 items.**

### v2 — tech

| Item | Notes |
|------|--------|
| Socket schedule push | `socket.service.ts` — channel `club-admin:{clubId}` |
| Weekly hours JSON | `Club` schema + admin PATCH whitelist |
| `STAFF` role enforcement | Assignment API + middleware if permissions diverge |
| Activity log model + API | Optional; holds already have `createdByUserId` |
| Skip duplicate `GAME_CANCELLED` push for host when custom DM sent | `clubAdminGame.service.ts` + `GameDeleteService` |

### Resolved (remove from active gaps)

| Item | Status |
|------|--------|
| `bookedCourts` `GameStatus` filter | `ANNOUNCED`, `STARTED` in `bookedCourts.service.ts` |
| `/courts` mutation auth | `authenticate` + `ClubAdminService.assertClubAdmin` in `court.controller.ts` |
| Unassigned `courtId` on admin grid | `UNASSIGNED_COURT_ID` column |
| Player grid hard-block / yellow warn | `isSlotHardBlocked`, `overlapCheck`, `MarkCourtBookedModal` |
| `conflicts[]` on admin schedule | Shipped on schedule response |
| DM templates T3 | `clubAdminDmMessage.ts`, `translations.ts`, `cancelMessage.ts` |
| Integration tests T10 | `scripts/tests/club-admin.suite.ts` |
| Desktop slot rail T5 | `SlotDetailPanel`, `SlotDetailSheet` `layout="rail"` |
| Create-game policy copy | `GameStartSection` + `createGame.*` i18n |

### Ongoing constraints

1. Club admin **must not** use `DELETE /games/:id` (OWNER); use `/club-admin/.../cancel`.
2. External + game overlap — `conflicts[]` for display only; no auto-merge.

---

## Shipped vs planned (codebase check 2026-05)

| Item | Status |
|------|--------|
| `ClubAdmin`, `CourtSlotHold`, `/club-admin/*` | Implemented 2026-05-15 |
| `getBookedCourts` + `useBookedCourts` + `GameStartSection` colors | Shipped |
| 10s occupancy poll on create-game | Shipped |
| Club admin FAB / `my-clubs` routes | Implemented 2026-05-15 |
| Red/hold slot non-selectable on create-game | Implemented (`isSlotHardBlocked` incl. holds) |
| Yellow soft-warn on save | Implemented (`overlapCheck` + confirm modal) |
| Post-create mark-court nudge | Implemented (`MarkCourtBookedModal`) |
| Club admin coach marks | Implemented (`ClubAdminCoachMark` + localStorage) |
| Unassigned court column | Implemented (2026-05-15) |
| Schedule legend / now-line / refresh | Implemented (2026-05-15) |
| Hold edit UI | Implemented (`EditHoldSheet`) |
| Club settings amenities + avatar | Implemented (2026-05-15) |
| `club-admin-schedule` unit script | Implemented |
| `CancelledGame.cancelledByUserId` | Shipped |
| P4: view-as-player, pull-refresh, clear court, cancel preview, message host | Implemented (2026-05-15) |
| P4: court form, club photos, `externalSlotsFailed`, rate limits | Implemented (2026-05-15) |
| P4: `defaultSlotMinutes` in grids / create-game time step | Implemented (2026-05-15) |
| P4: `clubAdmin` i18n cs/es/sr | Implemented (2026-05-15) |
| P4.1: DM templates, suite, desktop rail, create-game policy | Implemented (2026-05-15) |

---

## Non-goals

- Player `CourtBooking` entity or checkout
- Club admin create/delete clubs
- Replacing `Admin/` for club lifecycle
- Payments for court slots (v1)
