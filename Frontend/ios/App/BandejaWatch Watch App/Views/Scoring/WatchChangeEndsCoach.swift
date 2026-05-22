import SwiftUI

/// Narrow bouncing arrow tag (web `ChangeEndsSideTag`).
struct WatchChangeEndsSideTag: View {
    let label: String
    let sign: Int

    var body: some View {
        VStack(spacing: 4) {
            WatchCourtFlipBounceArrow(sign: sign) {
                Image(systemName: sign > 0 ? "arrow.up" : "arrow.down")
                    .font(.system(size: 9, weight: .bold))
            }
            Text(label)
                .font(.system(size: 8, weight: .semibold))
                .foregroundStyle(Color(red: 0.05, green: 0.23, blue: 0.45))
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .multilineTextAlignment(.center)
                .rotationEffect(.degrees(-90))
                .frame(width: 28)
            WatchCourtFlipBounceArrow(sign: -sign) {
                Image(systemName: sign > 0 ? "arrow.down" : "arrow.up")
                    .font(.system(size: 9, weight: .bold))
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(red: 0.88, green: 0.95, blue: 1).opacity(0.92))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color(red: 0.55, green: 0.75, blue: 0.9), lineWidth: 1)
        )
    }
}

private struct WatchCourtFlipBounceArrow<Content: View>: View {
    let sign: Int
    @ViewBuilder let content: () -> Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var offsetUp = false

    var body: some View {
        content()
            .foregroundStyle(Color(red: 0.05, green: 0.23, blue: 0.45))
            .offset(y: reduceMotion ? 0 : (offsetUp ? 5 * CGFloat(sign) : -3 * CGFloat(sign)))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.75).repeatForever(autoreverses: true)) {
                    offsetUp = true
                }
            }
    }
}
