import SwiftUI

/// Direction cue for serve-side text row (mirrors web `LiveServeSideArrow`).
struct WatchServeSideArrow: View {
    let courtSide: CourtServeSide

    var body: some View {
        Image(systemName: courtSide.isRight ? "arrow.right" : "arrow.left")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
    }
}
