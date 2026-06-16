#!/bin/bash
verify_capacitor_bundle() {
	local dist="${1:-$SCRIPT_DIR/dist}"
	[[ -d "$dist/assets" ]] || {
		echo "❌ Missing $dist/assets — run npm run build first" >&2
		return 1
	}

	if rg -q 'VITE_API_BASE_URL: "http://localhost' "$dist"/assets/*.js 2>/dev/null; then
		echo "❌ Bundle bakes localhost API URL (breaks iOS/Android). Use build-env.sh or bld-ios.sh / bld-android.sh" >&2
		return 1
	fi

	if rg -q 'VITE_MEDIA_BASE_URL: "http://localhost' "$dist"/assets/*.js 2>/dev/null; then
		echo "❌ Bundle bakes localhost media URL (breaks iOS/Android). Use build-env.sh or bld-ios.sh / bld-android.sh" >&2
		return 1
	fi
}
