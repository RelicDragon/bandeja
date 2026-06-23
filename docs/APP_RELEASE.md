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

1. Generate **What's new** (LLM summarizes commits since baseline):

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

2. Paste the main section into App Store Connect and Google Play; use the `---SHORT---` paragraph for Play if needed.

3. Bump `versionName` / `versionCode` (Android) and iOS project version + build.

4. Commit the version bump (and any last-minute fixes).

### Android CLI release signing

Headless `bundleRelease` uses the same upload keystore as Android Studio.

- Keystore at repo root: `bandeja-release.keystore` (gitignored).
- Copy `Frontend/android/keystore.properties.example` → `Frontend/android/keystore.properties` (gitignored) and fill in alias/passwords.
- Or set env vars: `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

Build signed AAB:

```bash
cd Frontend/android && ./gradlew bundleRelease
```

Output: `Frontend/android/app/build/outputs/bundle/release/app-release.aab`

If signing is missing, Gradle logs a message and `bundleRelease` produces an **unsigned** release bundle (Play upload will fail).

5. Submit to stores.

6. **Mark as shipped** (updates baseline from native version files + current `HEAD` — no manual editing):

   ```bash
   ./scripts/app-release-mark-shipped.sh --commit
   ```

   Run on the branch/commit you shipped (usually right after the version-bump commit). Uses `baseline..HEAD` for the next cycle's What's new.

## History

| Version | Build | Commit | Date |
|---------|-------|--------|------|
| 0.96.40 | 154 | `109da47b` | 2026-06-23 |
