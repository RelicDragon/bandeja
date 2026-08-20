# Docs

Current-state docs primarily. ADRs under `adr/` for hard-to-reverse trade-offs. No migrations/audits as living docs.

| Doc | Purpose |
|-----|---------|
| [APP_FUNCTIONALITY.md](./APP_FUNCTIONALITY.md) | Product inventory + §2.2 constraints + §2.3 shared packages |
| [PRODUCTION.md](./PRODUCTION.md) | Deploy, tunnels, prod DB, admin |
| [APP_RELEASE.md](./APP_RELEASE.md) | Store baseline (script-managed) + What's new |
| [UI_TEST_PLAN.md](./UI_TEST_PLAN.md) | Manual/E2E catalog — update when UI changes |
| [plans/browse-city.md](./plans/browse-city.md) | Browse / Home / Venue city lens (invite, chat Users, club pick) |
| [plans/player-invite-looking.md](./plans/player-invite-looking.md) | Invite Search \| Looking |
| [UI_TEST_PLAN_TWO_USER.md](./UI_TEST_PLAN_TWO_USER.md) | Two-user / Socket cases |
| [adr/](./adr/) | Hard-to-reverse decisions (e.g. chat read cursor authority) |
| [agents/](./agents/) | Skill config (issues, triage, domain) |
| `app-release-baseline.txt` | Last shipped commit SHA |

Dev: `CLAUDE.md` / `AGENTS.md`. Constraints: `APP_FUNCTIONALITY.md` §2.2.

**Shared code:** `packages/chat-contract`, `packages/unread-contract`, `Frontend/shared/` (`@shared/*`) — see §2.3.

**Testing:** CI Node 24 lint/build + targeted Vitest. Playwright: `Frontend` `npm run test:e2e*`. Backend: `test:automated` / domain `test:*`.
