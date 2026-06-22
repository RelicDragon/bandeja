# App store release baseline

Marks the last commit that was shipped to **Google Play** and **App Store**. Use it to draft the next **What's new** section from everything merged after that point.

## Current baseline

| | |
|---|---|
| **Version** | 0.96.40 |
| **Build** | 154 |
| **Commit** | `109da47b0a2c3a0cf59fcf86c00cf63e92315a2e` |
| **Short** | `109da47b` |
| **Date** | 2026-06-23 |
| **Message** | Update versioning and iOS platform compatibility |

Canonical commit hash: `docs/app-release-baseline.txt` (one line, full SHA).

## Before the next store release

1. List changes since baseline:

   ```bash
   ./scripts/app-release-changes.sh
   ```

   Or with full messages:

   ```bash
   ./scripts/app-release-changes.sh --full
   ```

2. Turn commit subjects (and linked PRs/issues) into store **What's new** copy.

3. Bump `versionName` / `versionCode` (Android) and iOS project version + build.

4. Commit the version bump (and any last-minute fixes).

5. Submit to stores.

6. **After approval / release:** update this file and `docs/app-release-baseline.txt` to that commit's full SHA, version, build, and date. That commit becomes the new baseline.

## History

| Version | Build | Commit | Date |
|---------|-------|--------|------|
| 0.96.40 | 154 | `109da47b` | 2026-06-23 |
