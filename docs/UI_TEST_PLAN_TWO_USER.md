# PadelPulse Two-User UI Test Plan

> Playwright E2E catalog for **client-to-client** flows: two authenticated users, Socket.IO delivery, cross-actor permissions. Complements `docs/UI_TEST_PLAN.md`.

---

## 1. Scope & goals

### In scope
- Two users in `padelpulse_dev`: **User A** and **User B**
- Dual-browser and hybrid (API actor + UI observer) patterns
- Chat DM/game receive, game join roster, invites, live score sync, marketplace bid

### Out of scope (initially)
- Push notifications, OAuth device flows, 3rd/4th players for full courts

### Definition of done (phase 1)
- **T2-P0** passes locally with both users seeded
- DM A→B visible without reload; join B→A roster updates live

---

## 2. Tooling

| Layer | Tool | Notes |
|-------|------|-------|
| E2E | Playwright project `two-user` | `workers: 1`, serial describes |
| Dual session | `openDualSession(browser)` | `e2e/fixtures/two-user.fixture.ts` |
| Auth | `global-setup.ts` | `user-a.json`, `user-b.json`, `ids.json` |
| API | `e2eLoginAs('A' \| 'B')`, `sendUserDmViaApi` | `e2e/fixtures/api-client.ts` |
| Waits | `expect.poll` | Socket / roster / bid price |

---

## 3. Test data & personas

| Alias | Phone | Password | Env override |
|-------|-------|----------|--------------|
| **User A** | `+79672825552` | `Metal4me` | `E2E_PHONE` / `E2E_PASSWORD` |
| **User B** | `+79672820000` | `Metal4me` | `E2E_PHONE_B` / `E2E_PASSWORD_B` |

Both need: `nameIsSet`, enabled sport, shared city, no mutual block (except block tests).

### Tags
- `@two-user` — runs in `two-user` project
- `@dual-browser` — two contexts in one test
- `@hybrid` — API on one side, UI on the other
- `@serial` — no parallel mutators on same resource

---

## 4. Infrastructure

| File | Purpose |
|------|---------|
| `e2e/test-user.ts` | `E2E_USERS`, `getE2eCredentials(role)` |
| `e2e/global-setup.ts` | Dual login + storageState + `ids.json` |
| `e2e/fixtures/two-user.fixture.ts` | `openDualSession`, `registerTeardown` |
| `e2e/fixtures/api-client.ts` | `e2eLoginBoth`, DM/invite API helpers |
| `e2e/fixtures/games.fixture.ts` | `createLiveScoringFixtureWithUserB` |
| `e2e/fixtures/marketplace.fixture.ts` | Auction create/bid/withdraw |

---

## 5. Chat — DM

| ID | Test | Steps | Expected | Mode | Spec |
|----|------|-------|----------|------|------|
| T2-CH-01 | DM receive realtime | B on `/user-chat/:aId`; A sends | B sees bubble | Dual | `chat-dm.spec.ts` |
| T2-CH-02 | DM receive hybrid | B on thread; A API send | B sees message | Hybrid | `chat-dm.spec.ts` |
| T2-CH-03 | Inbox preview | B on `/chats`; A sends | Preview/unread | Hybrid | `chat-dm.spec.ts` |
| T2-CH-04 | Read receipt | B opens thread | A sees read | Dual | P2 |
| T2-CH-10 | Game chat receive | Both in game; A sends | B sees in game chat | Dual | `chat-game.spec.ts` |

**Maps:** `CH-12`, `CH-18`, `X-07`

---

## 6. Games — join & invites

| ID | Test | Expected | Spec |
|----|------|----------|------|
| T2-GD-01 | Join updates owner UI | A roster shows B | `games-join.spec.ts` |
| T2-GD-03 | Hybrid join | Same via API join | `games-join.spec.ts` |
| T2-H-01 | Invite on B home | Invite card visible | `games-invite.spec.ts` |
| T2-H-02 | Accept invite | B playing in game | `games-invite.spec.ts` |

**Maps:** `GD-08`, `H-12`, `H-13`, `X-06`

---

## 7. Live scoring

| ID | Test | Expected | Spec |
|----|------|----------|------|
| T2-LS-01 | Score sync | B board updates when A scores | `live-scoring-sync.spec.ts` |

**Maps:** `LS-10`

---

## 8. Marketplace

| ID | Test | Expected | Spec |
|----|------|----------|------|
| T2-M-02 | Bid updates seller | B (seller) sees new high bid | `marketplace-auction.spec.ts` |
| T2-M-03 | Real-time auction | Both on item; live price | P2 |

**Maps:** `M-27`, `M-33`

---

## 9. Cross-cutting

| ID | Test | Expected | Spec |
|----|------|----------|------|
| T2-X-01 | Chat socket | Message in open thread | `cross-cutting-realtime.spec.ts` |
| T2-X-02 | Join socket | Roster updates | `cross-cutting-realtime.spec.ts` |

---

## 10. Priority matrix

### T2-P0
`T2-CH-01, T2-CH-02, T2-GD-01, T2-GD-03, T2-X-01, T2-X-02`

### T2-P1
`T2-CH-03, T2-CH-10, T2-H-01, T2-H-02, T2-LS-01, T2-M-02`

### T2-P2
Read receipts, Holland auction, bets (`GD-42`), block/follow/wallet

---

## 11. Execution

```bash
cd Frontend
npm run test:e2e:two-user
npm run test:e2e              # all projects
```

Pre-flight: both users exist in `padelpulse_dev`, backend `/health` → `e2eSafe`, same city.

Flake mitigation: `expect.poll` 15–20s; unique `Date.now()` message text; teardown games/listings in `afterAll` / `registerTeardown`.
