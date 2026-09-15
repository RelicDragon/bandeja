# Docs

Start here. Do not infer architecture or product behavior from `CLAUDE.md` when a file below exists. `CLAUDE.md` / `AGENTS.md` are boot pointers only.

**Bandeja** (repo: PadelPulse) is a multisport game platform: web, iOS/Android (Capacitor), Apple Watch, Telegram bot, Admin.

## Read in this order

| Need | Read |
|------|------|
| What the product is | [product/overview.md](./product/overview.md) |
| Domain words | [product/glossary.md](./product/glossary.md) then root `CONTEXT.md` |
| Load-bearing “do not simplify” | [product/constraints.md](./product/constraints.md) |
| Where code lives | [architecture/code-map.md](./architecture/code-map.md) |
| How the system is layered | [architecture/overview.md](./architecture/overview.md) |
| A feature | [domains/](./domains/) matching file |
| Local run / tests | [ops/development.md](./ops/development.md), [ops/testing.md](./ops/testing.md) |
| Prod / tunnels / deploy | [PRODUCTION.md](./PRODUCTION.md) |
| Store releases | [APP_RELEASE.md](./APP_RELEASE.md) |
| UI / E2E catalog | [UI_TEST_PLAN.md](./UI_TEST_PLAN.md) |
| How to investigate | [agents/how-to-investigate.md](./agents/how-to-investigate.md) |
| Skill config | [agents/](./agents/) |

## Tree

```
docs/
  README.md                 this file
  product/
    overview.md             sports, platforms, routes, guest, offline
    glossary.md             enums + overloaded words
    constraints.md          do-not-simplify (also inlined at APP_FUNCTIONALITY §2.2)
    platforms.md            web / iOS / Android / Watch / Telegram matrix
    not-shipped.md          commented routes, no shop UI, no wallet top-up
  architecture/
    overview.md             monorepo, ports, request flow
    code-map.md             where files live
    backend.md              Express, mounts, schedulers, workers
    frontend.md             shell, Query vs Zustand vs Dexie
    database.md             Prisma models + real enums
    shared-packages.md      chat-contract, unread-contract, @bandeja/shared
    auth.md                 JWT, refresh, OAuth, Telegram, gates
    realtime.md             Socket.IO rooms (game-{id}, not game:{id})
  domains/
    home-and-find.md games.md create.md leagues.md live-scoring.md results.md
    ratings.md training.md chat.md notifications.md bugs.md
    cities.md play-intent.md booking.md club-admin.md marketplace.md
    social-and-profile.md stories.md economy.md subscriptions.md
    ads-and-attribution.md admin.md native.md weather.md presence.md
  plans/
    browse-city.md          Home / Browse / Venue
    lobby-radar-matching-games.md
    player-invite-looking.md
    event-entity.md         EntityType.EVENT
  ops/
    development.md          local run, env, Prisma, heavy lock
    testing.md              Playwright / Vitest / backend / CI
    security.md             CORS, rate limits, JWT fail-closed
    production.md           pointer → PRODUCTION.md
  agents/
    RULES.md                mandatory contract for every agent
    how-to-investigate.md
    domain.md               how skills consume docs
    issue-tracker.md
    triage-labels.md
  PRODUCTION.md             deploy, tunnels, prod DB, admin UI (stable path)
  APP_RELEASE.md            store baseline (script-managed — do not rewrite history)
  app-release-baseline.txt  last shipped commit SHA
  UI_TEST_PLAN.md           manual/E2E catalog (stable path — update when UI changes)
  UI_TEST_PLAN_TWO_USER.md
  APP_FUNCTIONALITY.md      compatibility index → product/ + domains/
```

## Compatibility paths

Keep these filenames. Code, Cursor rules, and release scripts point at them:

- `docs/agents/RULES.md` — agent contract (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Copilot, Cursor `docs-first`)
- `CONTEXT-MAP.md` — glossary/constraint locations for skills that look for `CONTEXT.md` / ADRs
- `docs/APP_FUNCTIONALITY.md` — index. Canonical glossary/constraints live in `product/`.
- `docs/PRODUCTION.md` — ops source of truth for production.
- `docs/APP_RELEASE.md` + `docs/app-release-baseline.txt` — written by `scripts/app-release*.sh`.
- `docs/UI_TEST_PLAN.md` — Cursor rule `ui-test-plan.mdc`.

## Rules for agents

1. Use glossary terms from `product/glossary.md`. Do not invent synonyms for EntityType, Game.status, participant status, Home/Browse/Venue city.
2. If work would violate `product/constraints.md`, stop and say so.
3. Feature behavior: `domains/<area>.md`. File locations: `architecture/code-map.md`.
4. Prisma schema: `Backend/prisma/schema.prisma`. Do not copy CLAUDE.md enums; several are stale.
5. Empty `plans/` means the file was never written — recreate from code, do not cite missing paths. Load-bearing rules live in `product/constraints.md`, not an ADR folder. Agent boot: `docs/agents/RULES.md`.
