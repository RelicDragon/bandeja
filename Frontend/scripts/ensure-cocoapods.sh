#!/bin/bash
ensure_cocoapods() {
	if pod --version >/dev/null 2>&1; then
		return 0
	fi

	echo "⚠️  CocoaPods unavailable (often Ruby 4 + outdated Homebrew bottle). Upgrading..."
	if command -v brew >/dev/null 2>&1; then
		brew upgrade cocoapods || true
	fi

	if pod --version >/dev/null 2>&1; then
		echo "✅ CocoaPods ready: $(pod --version)"
		return 0
	fi

	echo "❌ CocoaPods still broken. Run: brew upgrade cocoapods" >&2
	return 1
}
