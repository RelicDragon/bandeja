# Plan: Game invite soft state on `GameParticipant`

## Goals

- On **invite decline**, keep the `GameParticipant` row and set a terminal status instead of deleting.
- On **sender cancel**, use a **distinct** terminal status from decline.
- **Re-invite** updates the same row back to `INVITED` (respects `@@unique([userId, gameId])`).
- **Accept** transitions the same row in place to playing (or queue / trainer rules)—no delete-then-create for the invite row.
- **Lifecycle:** do **not** mass-clean invites on game expired/started; **do** clean pending + terminal invite rows when the game becomes **FINISHED** or **ARCHIVED**.
- **Game details UI:** show users in terminal invite states, **sorted to the bottom**, with clear labels (declined vs cancelled).
- **Invite modal:** show those users with context and allow **Invite again** (revive via API).

---

## 1. Status model (`ParticipantStatus`)

Add invite-terminal states:

| Status | Meaning |
|--------|--------|
| `INVITED` | Active outbound invite (existing) |
| `INVITE_DECLINED` | Receiver declined |
| `INVITE_CANCELLED` | Sender cancelled before accept |

Keep existing: `GUEST`, `IN_QUEUE`, `PLAYING`, `NON_PLAYING`.

**Optional:** `inviteClosedAt DateTime?` (set on decline or sender cancel; cleared when revived to `INVITED`) for sorting and support.

**Re-invite:** For an existing row with `INVITE_DECLINED` or `INVITE_CANCELLED`, **`update`** to `INVITED` with fresh `invitedByUserId`, `inviteMessage`, `inviteExpiresAt`, `inviteUserTeamId`; clear terminal timestamp(s).

---

## 2. Migrations

- Extend Prisma `ParticipantStatus` enum; add optional `inviteClosedAt` on `GameParticipant` if desired.
- Generate migration via normal Prisma workflow (`migrate dev`).
- No backfill for old declines (rows were deleted historically).

---

## 3. Decline and cancel (backend)

**Receiver decline** (`InviteService.declineInvite`, admin mirror):

- Replace `deleteMany` with `update` → `INVITE_DECLINED` (+ optional `inviteClosedAt`).
- Keep system message and sockets; align client handling if anything assumed “row deleted.”

**Sender cancel** (`cancelInvite` in invite controller, non-owner):

- Replace `delete` with `update` → `INVITE_CANCELLED` (+ timestamp).
- Emit updates so inviter and invitee UIs drop pending state consistently.

**Owner-invite edge cases** (owner row `NON_PLAYING` today): document whether unchanged or aligned later.

---

## 4. Accept = update in place

- In `InviteService.acceptInvite` transaction: remove `delete` of the invite row before join.
- **Update** the same `gameParticipant` row to target `status` / `role`, clear invite fields (`inviteMessage`, `inviteExpiresAt`, `inviteUserTeamId`, terminal timestamps), then run existing post-join logic (readiness, fixed teams, notifications).
- Either extend `addOrUpdateParticipant` to update by id or perform an explicit `update` then shared hooks.

**Re-test:** normal `PLAYING`, trainer `ADMIN` + `NON_PLAYING` + `trainerId`, full-game queue redirect (prefer **`update` same row** to `IN_QUEUE` instead of delete + insert when compatible), expired-invite behavior (define: leave `INVITED`, auto terminal status, etc.).

---

## 5. Lifecycle cleanup

**Remove or disable cleanup tied to “expired” or “started”**

- `InviteService.getMyPendingInvites` side effects that delete/update invites based on game time “now.”
- `deleteInvitesForStartedGame` and any callers (scheduler, hooks).
- Any similar “game live → wipe invites” behavior.

Pending invites may therefore still exist after start; UI and permissions must tolerate that.

**On `FINISHED` and `ARCHIVED`**

- In **every** code path that sets a game to `FINISHED` or `ARCHIVED`, run the same helper: for participants on that `gameId` with  
  `status ∈ { INVITED, INVITE_DECLINED, INVITE_CANCELLED }`,  
  run **bulk delete** (`deleteMany`) in one transaction where appropriate.
- **Important:** `GameStatusScheduler` (`gameStatusScheduler.service.ts`) currently calls `deleteInvitesForStartedGame` when status becomes `STARTED` and `deleteInvitesForArchivedGame` when it becomes `ARCHIVED`. It does **not** reliably move games to `FINISHED` in that loop for **results-based** entity types (`isResultsBasedEntityType` + `continue` when `newStatus === 'FINISHED'`). So FINISHED cleanup must also run wherever **results flows** (or other services) set `FINISHED`, not only the scheduler.
- Extend/replace `deleteInvitesForArchivedGame` (and any new FINISHED helper) so predicates include all three invite-related statuses, not only `INVITED`.
- Remove the scheduler branch that runs on `STARTED` once product confirms “no cleanup on started.”
- Apply to child games if invites exist there and those games finish/archive independently.
- Emit game/participant updates for connected clients after cleanup.

**Cancelled games (`CancelledGame` / client 410)**

- Define whether game **cancellation** should run the same invite cleanup as FINISHED/ARCHIVED so rows do not linger on defunct games.

---

## 6. Send invite and duplicates

**`ParticipantService.sendInvite`**

- Existing `INVITED` → still “already sent” (or explicit bump policy).
- `INVITE_DECLINED` | `INVITE_CANCELLED` → **`update` → `INVITED`** (revive).
- `PLAYING` / `IN_QUEUE` / other: keep current rules.

**Invite controller `sendInvite`**

- Early return for duplicate pending invite: **`status === 'INVITED'`** only.
- Terminal statuses must fall through to service revive logic, not return the pending invite shape.

**Trainer:** pending trainer checks remain `INVITED` only so cancelled/declined trainer slots can be re-offered.

---

## 7. Permissions and counts

- `hasRealParticipantStatus`: keep **`PLAYING` | `NON_PLAYING`** only; do not treat terminal invite statuses as “in the game.”
- Capacity / readiness / slot math: terminal invite statuses behave like **`INVITED`** (do not count as playing).
- Audit `status === 'INVITED'` filters; add explicit rules for terminal statuses wherever roster vs invite lists diverge.

---

## 8. API / read model

- Game reads continue to return full `participants` including new statuses.
- `participantsToInviteShape`: only map **`INVITED`** rows to synthetic pending invites.
- After FINISHED/ARCHIVED cleanup, responses should not include those cleaned rows.

---

## 9. Frontend

- Extend `ParticipantStatus` with `INVITE_DECLINED` and `INVITE_CANCELLED`.
- Helpers: e.g. `isPendingGameInvite`, `isTerminalInviteStatus`, sorting for game details.
- **Game details:** show terminal invite participants; **sort to bottom**; badges (“Declined”, “Invite cancelled”); muted styling.
- **Invite modal:** include users with terminal statuses with labels; **Invite again** uses existing send-invite API.
- Pending-invite detection everywhere stays **`INVITED` only** (home, chat, hooks).
- i18n for new strings.

---

## 10. Admin, Telegram, notifications

- Admin decline aligned with app → `INVITE_DECLINED`.
- Telegram decline uses same service path.
- Optional: distinct notifications for cancel vs decline.

---

## 11. Testing matrix

- Decline → `INVITE_DECLINED`; game details bottom + badge; not in pending invites.
- Sender cancel → `INVITE_CANCELLED`; distinct copy; bottom section.
- Re-invite after each terminal state → `INVITED`; sockets/notifications OK.
- Accept → same participant id becomes `PLAYING` (or queue path); no unique violations.
- Start game / time-based paths: **no** mass invite cleanup; invites may persist.
- Transition to **FINISHED** / **ARCHIVED**: all `INVITED`, `INVITE_DECLINED`, `INVITE_CANCELLED` removed for that game.
- Training trainer invite flows.
- Concurrency: decline vs accept, double re-invite (two tabs)—transaction + unique constraint still safe.

---

## 12. Gaps — step-by-step closure playbook

Use each subsection as a mini ticket: **discover → decide → implement → verify**.

| ID | Topic | Primary risk if skipped |
|----|--------|-------------------------|
| A | Invites after `STARTED` | Invites allowed mid-game unintentionally |
| B | `getMyPendingInvites` writes | Read endpoint mutates DB; contradicts no cleanup on start |
| C | Sockets / FE cache | Ghost pending invites; roster out of sync |
| D | Accept all branches | Wrong status, duplicate rows, broken queue/trainer |
| E | Permissions | Terminal-invite users act as full participants |
| F | Privacy | Unintended exposure of decline/cancel |
| G | FINISHED / ARCHIVED everywhere | Stray rows after results-driven finish |
| H | Telegram, Admin, push, SQL | Broken UX or wrong counts off-app |
| I | User merge / deletion | Unique violations or wrong survivor row |
| J | i18n | Confusing or identical strings for different outcomes |
| K | Concurrency | Race accept/decline corrupts state |

---

### Gap A — Invites after game is `STARTED`

**Problem:** `validateGameCanAcceptParticipants` only blocks `ARCHIVED` and `FINISHED`. Once you stop wiping invites at `STARTED`, send/revive may remain allowed for live games unless you add policy elsewhere.

**Step A1 — Inventory call sites**

- Grep: `validateGameCanAcceptParticipants`, `sendInvite`, `ParticipantService.sendInvite`, any `game.status` checks around invites.
- List every path that creates or revives an invite and note whether it checks `STARTED`.

**Step A2 — Product decision (record in PR / ticket)**

Pick one:

- **A2a** Forbid new invites and revives when `game.status === 'STARTED'` (and optionally `ANNOUNCED` if you want invites only pre-live).
- **A2b** Allow only `OWNER`/`ADMIN` after `STARTED`.
- **A2c** Allow anyone who could invite before (document edge cases: mid-match noise).

**Step A3 — Implement**

- Enforce the chosen rule in **one** place if possible (e.g. `ParticipantService.sendInvite` + invite controller after loading game `status`), so Telegram/admin cannot bypass.

**Step A4 — Verify**

- Automated or manual: game `STARTED`, attempt send/revive as participant vs owner; expect allow/deny per A2.
- Regression: invites still work when `ANNOUNCED` (or your allowed pre-start statuses).

---

### Gap B — `getMyPendingInvites` mutates DB on read

**Problem:** `InviteService.getMyPendingInvites` deletes or updates rows when the game is in a time window. That contradicts “no cleanup on started” and surprises anyone who thought GET-style APIs are read-only.

**Step B1 — Read current logic**

- Open `getMyPendingInvites`; document exactly which rows are deleted vs updated and under which time conditions.

**Step B2 — Decide behavior**

- **B2a** Pure read: return only `status === 'INVITED'` (and not expired if you filter in memory only), **no writes**.
- **B2b** Optional background job elsewhere for expiry—out of scope of this endpoint.

**Step B3 — Implement**

- Remove `deleteMany` / `updateMany` from this method; if “stale” invites should disappear from UI only, filter in the query or in memory.

**Step B4 — Verify**

- Call `getMyPendingInvites` twice for same user with a game in the former “toProcess” window; DB row counts unchanged unless another feature intentionally changes them.
- Pending list still omits truly irrelevant rows if product requires (via filter, not silent delete).

---

### Gap C — Sockets and client assumptions (stable participant id)

**Problem:** `emitInviteDeleted` + delete implied “invite gone.” Soft decline/cancel keeps the same `GameParticipant` id; clients may show stale “pending” or miss game roster updates.

**Step C1 — Frontend inventory**

- Grep: `emitInviteDeleted`, `inviteDeleted`, `NewInvite`, handlers that splice pending invites by id.
- Grep: game store updates on invite accept/decline.

**Step C2 — Backend contract**

- After decline/cancel: emit **either** updated `emitGameUpdate` with full/merged participants **or** a dedicated event payload that includes `{ participantId, status, gameId }`.
- Decide whether to **keep** calling `emitInviteDeleted` for “remove from pending tray only” or deprecate in favor of one event (document for mobile if applicable).

**Step C3 — Implement FE**

- On decline/cancel: remove from “pending invites” list **and** merge participant status into game cache (terminal state).
- Ensure no code path assumes `inviteDeleted` ⇒ row absent from `game.participants`.

**Step C4 — Verify**

- Two clients open: decline on one; other shows terminal state on game details and cleared pending invite within one refresh cycle (no ghost pending).

---

### Gap D — Accept: update-in-place (all branches)

**Problem:** Accept currently deletes the invite row in several branches; queue redirect and errors may also delete. All must become coherent updates on the same id.

**Step D1 — Map branches**

- In `InviteService.acceptInvite`, list: owner shortcut, expired, main transaction, catch block (`ApiError` 400 → queue), non-`gameId` else branch.
- Note each `delete` / `deleteMany` on `gameParticipant`.

**Step D2 — Single target matrix**

- For each branch, define resulting `{ status, role, cleared invite fields }` (e.g. `PLAYING`, `IN_QUEUE`, trainer `NON_PLAYING` + game `trainerId`).

**Step D3 — Refactor transaction**

- Replace delete+`addOrUpdateParticipant` with **update** where `(userId, gameId)` unique already holds the invite row, or one upsert pattern that never creates a second row.
- Ensure `inviteMessage`, `inviteExpiresAt`, `inviteUserTeamId`, `inviteClosedAt` are nulled when leaving invite state.

**Step D4 — Verify**

- Accept happy path → same `participant.id` as invite, `PLAYING`.
- Full game → same id, `IN_QUEUE`, system messages/notifications unchanged in intent.
- Expired: behavior matches product (reject vs terminal status—align with decline semantics).
- Trainer accept still sets `trainerId` and participant role/status correctly.

---

### Gap E — Permissions (role without status)

**Problem:** `hasParentGamePermission` uses role on `gameParticipant` without requiring `PLAYING`/`NON_PLAYING`. A terminal-invite-only user might still be treated as `PARTICIPANT` for some actions.

**Step E1 — Grep audit**

- Patterns: `hasParentGamePermission`, `hasRealParticipantStatus`, `findFirst({ gameId, userId`, `onlyParticipantsCanSend`, `anyoneCanInvite`, league parent permission checks.

**Step E2 — Define “can act as participant”**

- Align with plan: **real** membership = `PLAYING` | `NON_PLAYING` (existing `hasRealParticipantStatus` or extend with explicit allowlist).
- Decide if `IN_QUEUE` counts for “can invite others” (today may be implicit—do not change unintentionally).

**Step E3 — Tighten gates**

- For each endpoint that should not be available to terminal-invite-only users, add status predicate or reuse a shared helper `isActiveGameMembership(status)`.

**Step E4 — Verify**

- User with only `INVITE_DECLINED` on game A cannot perform actions gated to participants (invite send, queue moderation, etc.) unless product explicitly allows.

---

### Gap F — Privacy (terminal states on game details)

**Problem:** Declined/cancelled labels reveal social signal to all viewers of participants.

**Step F1 — Confirm product**

- **F1a** Visible to all current game viewers (matches current “show at bottom” decision).
- **F1b** Only `OWNER`/`ADMIN` see terminal invite rows; others see them omitted or as anonymous count.

**Step F2 — Implement API or FE filter**

- If **F1b**: filter in serializer used by game details for non-privileged users, or pass `viewerRole` and split payload (avoid leaking in API for third-party clients).

**Step F3 — Verify**

- Participant user vs outsider vs owner: each sees the intended subset; chat/mentions rules unchanged.

---

### Gap G — FINISHED / ARCHIVED cleanup everywhere

**Problem:** Scheduler hits `ARCHIVED` and `STARTED`; `FINISHED` may be set in results flows, skipping scheduler logic.

**Step G1 — Enumerate status writers**

- Grep: `status: 'FINISHED'`, `status: 'ARCHIVED'`, `GameStatus.FINISHED`, `prisma.game.update` with status.
- Include `GameStatusScheduler`, results services, bar/league flows, admin tools.

**Step G2 — Extract helper**

- e.g. `cleanupInviteParticipantsForEndedGame(gameId)` deleting `INVITED | INVITE_DECLINED | INVITE_CANCELLED`.
- Call from **every** transition to `FINISHED` or `ARCHIVED` (or from a single domain function that all writers use).

**Step G3 — Remove/adjust STARTED cleanup**

- Remove `deleteInvitesForStartedGame` from scheduler (and delete the function if unused).
- Expand `deleteInvitesForArchivedGame` or replace with G2 helper predicate.

**Step G4 — Cancelled games**

- If games move to `CancelledGame` / 410 flow: add same cleanup or document why rows are removed differently.

**Step G5 — Verify**

- Integration: game reaches `FINISHED` via results path → no invite-terminal rows remain.
- `ARCHIVED` path same.
- In-progress game still has invites after `STARTED` if that is product intent.

---

### Gap H — Downstream (Telegram, Admin, push, analytics, SQL)

**Problem:** Secondary surfaces may assume delete-on-decline or only `INVITED` counts.

**Step H1 — Checklist**

- Telegram invite/decline handlers and message copy.
- Admin decline and game participant lists.
- Push notification builders for invites.
- Any dashboards/raw SQL in repo or external docs.

**Step H2 — Update predicates**

- Replace “row exists” with status checks; add handling for `INVITE_CANCELLED` vs `INVITE_DECLINED` where user-visible.

**Step H3 — Verify**

- Decline/cancel from each channel leaves correct UX and no 500s from null assumptions.

---

### Gap I — User merge and account deletion

**Problem:** More participant statuses increase combinations when merging users or deleting accounts.

**Step I1 — Read `userMerge` (and related)**

- Trace all `gameParticipant` updates/deletes for duplicate `(userId, gameId)`.

**Step I2 — Rules for conflicts**

- If source and target both have rows for same game: define precedence (`PLAYING` wins over terminal invite, etc.).

**Step I3 — Verify**

- Merge scenarios covered by test or script; no unique constraint violations post-merge.

---

### Gap J — i18n and empty states

**Problem:** Users need clear language for declined vs cancelled vs re-invite.

**Step J1 — Key list**

- Game details badge: declined; badge: cancelled.
- Invite modal hint / disabled vs “Invite again”.
- Optional: toast when cleanup removed invites at game end (only if surfaced).

**Step J2 — Add keys + wire**

- Follow existing i18n namespace conventions.

**Step J3 — Verify**

- EN (and other locales if required) render; no shared string incorrectly reused between decline and cancel.

---

### Gap K — Concurrency and idempotency

**Problem:** Double clicks, two tabs, decline while accept in flight.

**Step K1 — DB constraints**

- Rely on `@@unique([userId, gameId])` + transactions; ensure accept uses `WHERE id AND status = 'INVITED'` (or version check) so stale accept after decline fails cleanly.

**Step K2 — Tests**

- Decline then accept → expect controlled error, no orphan `PLAYING` without intent.
- Parallel revive requests → single consistent `INVITED`.

---

## 13. Implementation order

1. Prisma enum (+ optional `inviteClosedAt`) + migration.
2. `declineInvite`, `cancelInvite`, admin decline → soft statuses.
3. `sendInvite` revive from both terminal statuses; controller guards.
4. Refactor **`acceptInvite`** to update-in-place (largest change).
5. Remove **STARTED** (and time-based) invite cleanup; align **`getMyPendingInvites`** with no side-effect deletes on started games.
6. Implement **FINISHED** and **ARCHIVED** cleanup in **all** transition sites (scheduler **plus** results-driven and any other `FINISHED` writers); extend delete predicates to all invite-terminal statuses; handle **cancelled game** if applicable.
7. Frontend types, game details sort + badges, invite modal behavior.
8. Socket/client alignment and regression on full game lifecycle.

---

## Locked product decisions

- Sender cancel uses **`INVITE_CANCELLED`**, distinct from **`INVITE_DECLINED`**.
- **No** cleanup on expired/started; **yes** cleanup of `INVITED` + `INVITE_DECLINED` + `INVITE_CANCELLED` when game becomes **FINISHED** or **ARCHIVED**.
- **Accept** updates the row in place (preferred over delete + create).
- Terminal invite users **appear on game details**, sorted to bottom, marked declined vs cancelled.

---

## 14. Implementation status (shipped in repo)

- **Owner row (§3):** Owner invite accept / decline / sender-cancel still transitions the owner participant to **`NON_PLAYING`** with invite fields cleared (existing model). Non-owner decline → **`INVITE_DECLINED`**; non-owner sender cancel → **`INVITE_CANCELLED`** (+ `inviteClosedAt` where applicable).
- **Expired invite (§4):** Row stays **`INVITED`**. `acceptInvite` returns **`errors.invites.expired`** and does not auto-move to a terminal status.
- **Cancelled game (§5):** Deleting a `Game` (owner cancel → `CancelledGame` + `game` delete) **cascades** `GameParticipant`; no separate invite-cleanup helper runs on that path because the game row no longer exists.
- **FINISHED / ARCHIVED cleanup:** `cleanupInviteParticipantsForEndedGame` removes non-owner rows in `{ INVITED, INVITE_DECLINED, INVITE_CANCELLED }` and resets **owner** rows in that set to **`NON_PLAYING`** with invite fields cleared. Invoked from scheduler, `GameService` update path, results outcomes transaction, and training finish.
- **Gap A:** Policy **A2a** — `ParticipantService.sendInvite` rejects new invites and revives when **`game.status === STARTED`** (`errors.invites.cannotSendAfterGameStarted`).
- **Sockets (Gap C):** `invite-deleted` may include **`participantPatch`** (`status`, `inviteClosedAt`); clients merge into cached games; **`game-updated`** still follows where applicable.
- **Automated tests (§11 helpers / merge):** From repo root: `cd Frontend && npm run test:game-invite` (Vitest: `src/utils/gameInviteParticipant.test.ts`). End-to-end DB matrix (decline → accept races, full lifecycle) remains manual or a future `DB_URL` QA script.
- **§10 optional:** There is still **no** separate chat system message type for sender cancel vs receiver decline (decline posts `USER_DECLINED_INVITE`). Distinct in-app notifications for cancel vs decline remain optional.
