# CLAUDE.md

Boot file. **Not** the product or architecture spec.

**Must follow `docs/agents/RULES.md`.** Map: `docs/README.md`. Skills that want CONTEXT/ADRs: `CONTEXT-MAP.md`.

Glossary `docs/product/glossary.md`. Constraints `docs/product/constraints.md` (§2.2 in `docs/APP_FUNCTIONALITY.md`). Code map `docs/architecture/code-map.md`. Investigate `docs/agents/how-to-investigate.md`.

## Stack

- Node 24 (`.nvmrc`), npm 11+
- Backend: Express + Prisma + PostgreSQL (`padelpulse` schema) + Redis + Socket.IO — port **3000**
- Frontend: React 19 + Vite + Tailwind — port **3001** (proxies `/api` and `/socket.io/` to 3000)
- Admin: `./Admin/serve.sh` → `http://127.0.0.1:9010/` (never `file://`)
- Mobile: Capacitor 8. Shared: `packages/chat-contract`, `packages/unread-contract`, `Frontend/shared` (`@bandeja/shared`; FE Vite also `@shared`)

## Heavy command serialization

Builds, tests, typecheck, Prisma generate, Playwright: never concurrent in the same frontend or backend lane. One FE + one BE heavy command may run at once. Use serialized npm scripts or `./scripts/run-heavy …`. Never invoke `tsc`, `vite build`, Vitest, Playwright, backend test runners, or Prisma generate directly. Lint does not need the lock.

## Commands

```bash
cd Backend && npm run dev
cd Frontend && npm run dev
cd Backend && npm run prisma:generate
cd Backend && npm run prisma:migrate    # named; never db push
```

Registration needs a `City` row and `FALLBACK_CITY_ID` in `Backend/.env` (copy `env.sample`).

## Enums (do not invent)

`Game.status`: `ANNOUNCED` | `STARTED` | `FINISHED` | `ARCHIVED`.  
Only `GameParticipant.status === PLAYING` counts toward slots.  
Trainer: `Game.trainerId`.  
Product Event: `EntityType.EVENT` only.

Full enums: `Backend/prisma/schema.prisma` and `docs/architecture/database.md`.

## Production / stores

`docs/PRODUCTION.md`. Mobile: `docs/APP_RELEASE.md` + `./scripts/app-release.sh`.

## Skills

Issue tracker `docs/agents/issue-tracker.md`. Triage `docs/agents/triage-labels.md`. Domain consume: `docs/agents/domain.md`.
