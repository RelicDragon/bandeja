# How to investigate this repo

Do not start by grepping the whole monorepo for “how X works”. Contract: `docs/agents/RULES.md`. Open the map, then one domain file, then the paths it names.

## 1. Name the thing

Use `docs/product/glossary.md`. If the word is overloaded (event, city, status, follow), read that entry before searching code.

## 2. Open the map

| Question | File |
|----------|------|
| What is this product surface? | `docs/domains/<area>.md` |
| Where are the files? | `docs/architecture/code-map.md` |
| Request / data flow | `docs/architecture/overview.md` + backend/frontend |
| Can I simplify this? | `docs/product/constraints.md` |
| Schema / enums | `docs/architecture/database.md` then `Backend/prisma/schema.prisma` |
| Auth / refresh / sessions | `docs/architecture/auth.md` |
| Chat / unread / sockets | `docs/domains/chat.md`, `docs/architecture/realtime.md` |
| Deploy / prod DB | `docs/PRODUCTION.md` |
| Local run / tests | `docs/ops/development.md`, `docs/ops/testing.md` |
| UI test coverage | `docs/UI_TEST_PLAN.md` |

## 3. Then read code

The domain file lists the service directory, routes, and FE pages. Read those. If code and docs disagree, believe the code and update the domain file in the same task.

## 4. Do not use

- `CLAUDE.md` as a spec (boot only; enums there were historically wrong).
- League fixture labels `READY` / `SCHEDULED` as `Game.status`.
- `MESSAGE_CREATE` as a chat sync event name (contract uses `MESSAGE_CREATED`, etc.).
- `game:{id}` / `user:{id}` as Socket.IO rooms (actual: `game-{id}`, `notify-user-{id}` — `docs/architecture/realtime.md`).
