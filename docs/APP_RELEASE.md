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

## Unified release CLI (recommended)

Run the full interactive flow (version bump → build → store upload → baseline update):

```bash
./scripts/app-release.sh
```

Dry-run planner only (no file writes, builds, uploads, or baseline changes):

```bash
APP_RELEASE_DRY_RUN=1 ./scripts/app-release.sh
```

Resume after a build or upload failure:

```bash
APP_RELEASE_RESUME=1 ./scripts/app-release.sh
```

The CLI freezes the What's new commit range at session start (before the version bump), builds signed AAB/IPA locally, uploads to both stores with your release notes, and updates the baseline only after both uploads succeed.

### Store API credentials

Set these in `Backend/.env` (or export in your shell) before running the upload phase:

| Variable | Purpose |
|----------|---------|
| `PLAY_STORE_JSON_KEY_PATH` or `GOOGLE_PLAY_JSON_KEY` | Path to Google Play Console service account JSON (Play Developer API enabled, release manager access) |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer ID |
| `ASC_KEY_PATH` | Path to the `.p8` API key file |

Install Fastlane once:

```bash
cd Frontend && bundle install
```

### Android release signing

Headless `bundleRelease` uses the same upload keystore as Android Studio.

- Keystore at repo root: `bandeja-release.keystore` (gitignored).
- Copy `Frontend/android/keystore.properties.example` → `Frontend/android/keystore.properties` (gitignored) and fill in alias/passwords.
- Or set env vars: `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

### Manual smoke test (internal track)

1. Configure Play + ASC credentials and Android signing (above).
2. Run `./scripts/app-release.sh`.
3. At store settings, choose **Internal testing** for Google Play and **Upload only** for App Store Connect.
4. Confirm the summary, let the CLI build and upload.
5. In Play Console → Internal testing: verify the new build and What's new text.
6. In App Store Connect → TestFlight: verify the uploaded build and release notes.
7. If satisfied, ship the next production release with track **Production** (or promote from internal).

Baseline and `docs/APP_RELEASE.md` history update automatically after both uploads succeed. Optional auto-commit creates separate git commits for the version bump and baseline update.

## Headless scripts (automation / partial steps)

Generate **What's new** (LLM summarizes commits since baseline):

```bash
./scripts/app-release-whats-new.sh
./scripts/app-release-whats-new.sh --dry-run
./scripts/app-release-whats-new.sh --save release-notes.txt
```

Requires `AI_PROVIDER` + `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` in `Backend/.env`.

Raw commit list (no LLM):

```bash
./scripts/app-release-changes.sh
./scripts/app-release-changes.sh --full
```

Build signed AAB manually:

```bash
cd Frontend/android && ./gradlew bundleRelease
```

Output: `Frontend/android/app/build/outputs/bundle/release/app-release.aab`

Mark as shipped without the CLI (after manual store submission):

```bash
./scripts/app-release-mark-shipped.sh --commit
```

## History

| Version | Build | Commit | Date |
|---------|-------|--------|------|
| 0.96.40 | 154 | `109da47b` | 2026-06-23 |
