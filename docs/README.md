# Docs

Current-state docs only. No plans, migrations, audits, or ADR folders.

| Doc | Purpose |
|-----|---------|
| [APP_FUNCTIONALITY.md](./APP_FUNCTIONALITY.md) | Product inventory + §2.2 constraints + §2.3 shared packages |
| [PRODUCTION.md](./PRODUCTION.md) | Deploy, tunnels, prod DB, admin |
| [APP_RELEASE.md](./APP_RELEASE.md) | Store baseline (script-managed) + What's new |
| [UI_TEST_PLAN.md](./UI_TEST_PLAN.md) | Manual/E2E catalog — update when UI changes |
| [UI_TEST_PLAN_TWO_USER.md](./UI_TEST_PLAN_TWO_USER.md) | Two-user / Socket cases |
| [agents/](./agents/) | Skill config (issues, triage, domain) |
| `app-release-baseline.txt` | Last shipped commit SHA |

Dev: `CLAUDE.md` / `AGENTS.md`. Constraints: `APP_FUNCTIONALITY.md` §2.2.

**Shared code:** `packages/chat-contract`, `packages/unread-contract`, `Frontend/shared/` (`@shared/*`) — see §2.3.

**Testing:** CI Node 24 lint/build + targeted Vitest. Playwright: `Frontend` `npm run test:e2e*`. Backend: `test:automated` / domain `test:*`.
