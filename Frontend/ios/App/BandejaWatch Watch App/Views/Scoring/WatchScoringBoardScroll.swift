import SwiftUI

/// Vertical scroll container for scoring boards: fills the page when content fits,
/// scrolls instead of clipping when it does not (40/41 mm cases).
struct WatchScoringBoardScroll<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        GeometryReader { proxy in
            ScrollView(.vertical) {
                content()
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height)
            }
        }
    }
}
