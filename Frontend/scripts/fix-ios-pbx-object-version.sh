#!/bin/bash
fix_ios_pbx_object_version() {
	local p="$SCRIPT_DIR/ios/App/App.xcodeproj/project.pbxproj"
	[[ -f "$p" ]] || return 0
	perl -i -pe 's/objectVersion = 71;/objectVersion = 77;/g' "$p"
}
