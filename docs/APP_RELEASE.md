# App store release baseline

Marks the last commit that was shipped to **Google Play** and **App Store**. Use it to draft the next **What's new** section from everything merged after that point.

## Current baseline

| | |
|---|---|
| **Version** | 0.97.5 |
| **Build** | 187 |
| **Commit** | `5dc1534fb243501fac00e828baaa398b876f7df5` |
| **Short** | `5dc1534f` |
| **Date** | 2026-07-17 |
| **Message** | Bump app release to 0.97.5 (build 187) |

Canonical commit hash: `docs/app-release-baseline.txt` (one line, full SHA).

## Before the next store release

### Unified release CLI (recommended)

```bash
./scripts/app-release.sh
```

Dry-run planner: `APP_RELEASE_DRY_RUN=1 ./scripts/app-release.sh`. Resume after failure: `APP_RELEASE_RESUME=1 ./scripts/app-release.sh`.

Store API credentials, Android signing, and internal-track smoke steps: **`docs/PRODUCTION.md`** (Mobile app store releases).

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
| 0.97.5 | 187 | `5dc1534f` | 2026-07-17 |
| 0.97.4 | 186 | `867a9b3d` | 2026-07-17 |
| 0.97.3 | 185 | `687e842e` | 2026-07-16 |
| 0.97.2 | 184 | `2a98dd8e` | 2026-07-15 |
| 0.97.1 | 183 | `bce38b79` | 2026-07-14 |
| 0.96.66 | 180 | `ff0f84c4` | 2026-07-12 |
| 0.96.65 | 179 | `7ca6c6ac` | 2026-07-11 |
| 0.96.63 | 177 | `3d5d85ac` | 2026-07-11 |
| 0.96.61 | 175 | `58f745b3` | 2026-07-10 |
| 0.96.58 | 172 | `8d3180c6` | 2026-07-07 |
| 0.96.57 | 171 | `797d69d6` | 2026-07-06 |
| 0.96.55 | 169 | `a5ab8c35` | 2026-07-03 |
| 0.96.54 | 168 | `a782ccbc` | 2026-07-02 |
| 0.96.52 | 166 | `bd167854` | 2026-06-28 |
| 0.96.51 | 165 | `d985ad8d` | 2026-06-28 |
| 0.96.50 | 164 | `35478ae3` | 2026-06-28 |
| 0.96.42 | 156 | `70e3da22` | 2026-06-24 |
| 0.96.40 | 154 | `109da47b` | 2026-06-23 |
