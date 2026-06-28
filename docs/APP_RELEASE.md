# App store release baseline

Marks the last commit that was shipped to **Google Play** and **App Store**. Use it to draft the next **What's new** section from everything merged after that point.

## Current baseline

| | |
|---|---|
| **Version** | 0.96.51 |
| **Build** | 165 |
| **Commit** | `d985ad8d45e3d7c34cf1153fde652e6248cc7b82` |
| **Short** | `d985ad8d` |
| **Date** | 2026-06-28 |
| **Message** | Bump app release to 0.96.51 (build 165) |

Canonical commit hash: `docs/app-release-baseline.txt` (one line, full SHA).

## Before the next store release

### Unified release CLI (recommended)

```bash
./scripts/app-release.sh
```

Dry-run planner: `APP_RELEASE_DRY_RUN=1 ./scripts/app-release.sh`. Resume after failure: `APP_RELEASE_RESUME=1 ./scripts/app-release.sh`.

See this file for store API credentials, Android signing, and internal-track smoke test steps.

### Headless scripts

Generate **What's new** (LLM summarizes commits since baseline):

   ```bash
   ./scripts/app-release-whats-new.sh
   ```

   Preview prompt without calling the API:

   ```bash
   ./scripts/app-release-whats-new.sh --dry-run
   ```

   Save to a file:

   ```bash
   ./scripts/app-release-whats-new.sh --save release-notes.txt
   ```

   Requires `AI_PROVIDER` + `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` in `Backend/.env`.

   Raw commit list (no LLM):

   ```bash
   ./scripts/app-release-changes.sh
   ./scripts/app-release-changes.sh --full
   ```

**Mark as shipped** (manual fallback after store submission):

   ```bash
   ./scripts/app-release-mark-shipped.sh --commit
   ```

   Run on the branch/commit you shipped (usually right after the version-bump commit). Uses `baseline..HEAD` for the next cycle's What's new.

## History

| Version | Build | Commit | Date |
|---------|-------|--------|------|
| 0.96.51 | 165 | `d985ad8d` | 2026-06-28 |
| 0.96.50 | 164 | `35478ae3` | 2026-06-28 |
| 0.96.42 | 156 | `70e3da22` | 2026-06-24 |
| 0.96.40 | 154 | `109da47b` | 2026-06-23 |
