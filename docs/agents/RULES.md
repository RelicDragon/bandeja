# Agent rules (Bandeja / PadelPulse)

Every agent (Cursor, Claude Code, Codex, Copilot, Gemini, Cloud) follows this. Boot files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/docs-first.mdc`) only exist to load **this** file.

## Before exploring or changing code

1. Read **`docs/README.md`**. Pick one file from the map. Do not grep the whole repo to invent architecture.
2. Vocabulary: **`docs/product/glossary.md`**. Overloaded: event vs `EntityType.EVENT`; `Game.status` vs league UI `READY`/`SCHEDULED`; Home / Browse / Venue city; follow vs favorite clubs.
3. Invariants: **`docs/product/constraints.md`** (same table inlined at `docs/APP_FUNCTIONALITY.md` §2.2 for code comments). If a change would violate a constraint, stop and say so.
4. Where files live: **`docs/architecture/code-map.md`**. Feature behavior: **`docs/domains/<area>.md`**.
5. How to investigate: **`docs/agents/how-to-investigate.md`**.

Skills that look for `CONTEXT.md` / ADRs: read **`CONTEXT-MAP.md` first**. Product language is `docs/product/glossary.md`, not root `CONTEXT.md` (that file is league-withdrawal only). Do **not** create `docs/adr/`. New load-bearing rules go in `docs/product/constraints.md` (and the §2.2 table).

## Do not invent

| Wrong | Right |
|-------|--------|
| `GameStatus` `READY` / `PLAYING` / `SCHEDULED` | `ANNOUNCED` \| `STARTED` \| `FINISHED` \| `ARCHIVED` |
| Slot count includes queue/invites | Only `ParticipantStatus.PLAYING` |
| Trainer participant flag | `Game.trainerId` |
| `MESSAGE_CREATE` | `MESSAGE_CREATED` (`@bandeja/chat-contract`) |
| Socket rooms `game:{id}` / `user:{id}` | `game-{id}` / `notify-user-{id}` (`docs/architecture/realtime.md`) |
| Backend `@shared/*` tsconfig | `@bandeja/shared` + `Backend/src/shared/` copies |
| Browse city drives Find/My | Browse never `switchCity` |
| `CLAUDE.md` as spec | Boot only |

Schema: `Backend/prisma/schema.prisma` + `docs/architecture/database.md`.

## After a change

- UI behavior/workflow: update **`docs/UI_TEST_PLAN.md`** (Cursor rule `ui-test-plan.mdc`).
- Domain behavior: update the matching **`docs/domains/`** file in the same task if docs and code would disagree.
- Constraints: update **`docs/product/constraints.md`** and the §2.2 table together.

## Repo mechanics (always)

- Node 24. Heavy commands: serialized npm scripts or `./scripts/run-heavy`. Never concurrent FE+FE or BE+BE heavy work. Never raw `tsc` / `vite build` / Vitest / Playwright / Prisma generate.
- Prisma: named `prisma migrate dev` via `npm run prisma:migrate`. Never `db push`.
- Admin: `./Admin/serve.sh` → `http://127.0.0.1:9010/` — never `file://`.
- Prod: `docs/PRODUCTION.md`. Stores: `docs/APP_RELEASE.md`.
- No `eslint-disable` comments. Fix the lint.
