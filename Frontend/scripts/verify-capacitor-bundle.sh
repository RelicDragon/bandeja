#!/bin/bash
verify_capacitor_bundle() {
	local dist="${1:-$SCRIPT_DIR/dist}"
	[[ -d "$dist/assets" ]] || {
		echo "❌ Missing $dist/assets — run npm run build first" >&2
		return 1
	}

	if rg -q 'VITE_API_BASE_URL: "http://localhost|VITE_MEDIA_BASE_URL: "http://localhost' "$dist"/assets/*.js 2>/dev/null; then
		echo "❌ Bundle bakes a localhost API/media URL (breaks iOS/Android). Use the app release CLI or build-env.sh." >&2
		return 1
	fi

	if rg -q 'http://(localhost|127\.0\.0\.1):3001' "$dist"/assets/*.js 2>/dev/null; then
		echo "❌ Bundle bakes a localhost media origin (breaks iOS/Android). Use the app release CLI or build-env.sh." >&2
		return 1
	fi

	if rg -q '["'\'']/api/app/version-check["'\'']' "$dist"/assets/*.js 2>/dev/null; then
		echo "❌ Bundle uses relative /api for app version-check (breaks iOS/Android). Ensure NODE_ENV=production for vite build." >&2
		return 1
	fi

	if rg -q 'jsxDEV|jsx-dev-runtime|fileName:\s*["'\''][^"'\'']*/Frontend/src/' "$dist"/assets/*.js 2>/dev/null; then
		echo "❌ Bundle contains React development output/source paths. Ensure NODE_ENV=production for vite build." >&2
		return 1
	fi
}
