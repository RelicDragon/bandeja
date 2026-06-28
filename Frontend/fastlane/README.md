fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Android

### android upload_release

```sh
[bundle exec] fastlane android upload_release
```

Upload signed AAB to Google Play with en-US What's new

### android verify_release

```sh
[bundle exec] fastlane android verify_release
```

Verify Google Play release after upload

----


## iOS

### ios upload_binary

```sh
[bundle exec] fastlane ios upload_binary
```

Upload IPA binary to App Store Connect

### ios wait_for_processed_ios_build

```sh
[bundle exec] fastlane ios wait_for_processed_ios_build
```

Wait until App Store Connect has processed the exact uploaded iOS build

### ios finalize_store_version

```sh
[bundle exec] fastlane ios finalize_store_version
```

Update App Store version metadata and optionally submit for review

### ios verify_store_version

```sh
[bundle exec] fastlane ios verify_store_version
```

Verify App Store version metadata after finalizing

### ios upload_release

```sh
[bundle exec] fastlane ios upload_release
```

Upload IPA, wait for processing, update metadata, and optionally submit for review

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
