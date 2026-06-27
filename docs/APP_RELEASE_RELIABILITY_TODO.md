# App Release Reliability TODO

## Highest priority

- [x] Verify the exact App Store build before continuing.
  - Match the planned `version` and `build_number`, not just the latest visible build.
  - Continue only when that exact build is processed and selectable.

- [x] Verify App Store metadata after finalizing.
  - Confirm `whatsNew` is present for `en-US`.
  - Confirm the selected build number matches the planned build.
  - Confirm submit-for-review happened only when requested.

- [x] Delay shipped-baseline updates until both stores are confirmed.
  - Add a final store-verification phase before `markReleaseAsShipped`.

## Session state

- [x] Store richer iOS App Store Connect state in `.app-release/session.json`.
  - App Store version id.
  - Build id.
  - Last observed processing status.
  - Metadata-updated timestamp.
  - Submission/request id, if available.

## Operator clarity

- [x] Rename the iOS “upload-only” mode.
  - Current behavior prepares the App Store version and writes metadata.
  - Suggested label: `Prepare App Store version, do not submit`.

- [x] Improve Apple-processing timeout messaging.
  - Make clear that IPA upload completed.
  - Name the pending build version/build.
  - Explain that resume will skip IPA upload and continue with metadata/submission.

- [x] Avoid Fastlane lane/action naming ambiguity.
  - Rename the custom lane from `wait_for_build_processing` to `wait_for_processed_ios_build`.

## Diagnostics

- [ ] Add a store-state check command.
  - Example: `APP_RELEASE_CHECK_STORES=1 ./scripts/app-release.sh`.
  - Show current Google Play and App Store Connect state for the planned version/build without uploading.
