# App store release baseline

Marks the last commit that was shipped to **Google Play** and **App Store**. Use it to draft the next **What's new** section from everything merged after that point.

## Current baseline

| | |
|---|---|
| **Version** | 0.96.42 |
| **Build** | 156 |
| **Commit** | `70e3da22e77504a0c9e98dd0368fa4d00b7493a1` |
| **Short** | `70e3da22` |
| **Date** | 2026-06-24 |
| **Message** | Bump app release to 0.96.42 (build 156) |

Canonical commit hash: `docs/app-release-baseline.txt` (one line, full SHA).

## Before the next store release

### Unified release CLI (recommended)

```bash
./scripts/app-release.sh
```

Dry-run planner: `APP_RELEASE_DRY_RUN=1 ./scripts/app-release.sh`. Resume after failure or after App Store Connect is still processing an uploaded iOS build: `APP_RELEASE_RESUME=1 ./scripts/app-release.sh`.

The store phase is staged: upload Android and iOS binaries, wait until App Store Connect exposes the processed build, update App Store metadata with What's New, optionally submit for review, then verify both Google Play and App Store Connect before updating the shipped baseline. If Apple processing times out, the saved session keeps the uploaded-binary checkpoint so the next resume skips the IPA upload.

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
| 0.96.42 | 156 | `70e3da22` | 2026-06-24 |
| 0.96.40 | 154 | `109da47b` | 2026-06-23 |
