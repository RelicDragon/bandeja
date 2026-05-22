import SwiftUI

/// Honor-system pickleball reminders (mirrors web `PickleballCoachButtons`).
struct WatchPickleballCoachButtons: View {
    let lang: String
    @State private var hintMessage: String?

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                coachButton(WatchCopy.pickleballUnderhandServe(lang), hint: WatchCopy.pickleballUnderhandServeHint(lang))
                coachButton(WatchCopy.pickleballSideOut(lang), hint: WatchCopy.pickleballSideOutHint(lang))
            }
            coachButton(WatchCopy.pickleballTwoBounce(lang), hint: WatchCopy.pickleballTwoBounceHint(lang))
        }
        .alert(WatchCopy.serveHintsMenu(lang), isPresented: Binding(
            get: { hintMessage != nil },
            set: { if !$0 { hintMessage = nil } }
        )) {
            Button(WatchCopy.close(lang), role: .cancel) { hintMessage = nil }
        } message: {
            if let hintMessage {
                Text(hintMessage)
            }
        }
    }

    private func coachButton(_ title: String, hint: String) -> some View {
        Button {
            hintMessage = hint
        } label: {
            Text(title)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity)
                .background(
                    Capsule()
                        .fill(Color.orange.opacity(0.18))
                )
        }
        .buttonStyle(.plain)
    }
}
