import SwiftUI

struct WatchServeIndicatorRow: View {
    @Bindable var vm: MatchScoringViewModel
    @Environment(WatchServeHintsSettingsStore.self) private var hintsStore
    let lang: String

    @State private var lastMotionToken = ""
    @State private var serveAnimPulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var snapshot: ServeGuideSnapshot? {
        WatchServeGuideSnapshot.compute(vm: vm, hintsMode: hintsStore.mode)
    }

    var body: some View {
        Group {
            if let s = snapshot {
                rowContent(s)
            }
        }
        .onChange(of: snapshot?.motionToken) { _, newVal in
            guard let newVal else { return }
            if !lastMotionToken.isEmpty, newVal != lastMotionToken {
                WatchScoreHaptics.serveGuideChange()
                serveAnimPulse = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.65) {
                    serveAnimPulse = false
                }
            }
            lastMotionToken = newVal
        }
    }

    @ViewBuilder
    private func rowContent(_ s: ServeGuideSnapshot) -> some View {
        let compact = hintsStore.mode == .compact
        HStack(spacing: compact ? 4 : 6) {
            if let u = serverUser(s) {
                WatchPlayerAvatarView(user: u, size: compact ? 18 : 20, role: nil, levelSport: vm.game?.resolvedSport)
            }
            VStack(alignment: .leading, spacing: 1) {
                if s.changeEndsBeforeNextPoint {
                    Text(WatchCopy.serveCoachChangeEnds(lang))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color(red: 0.05, green: 0.23, blue: 0.45))
                        .lineLimit(1)
                }
                if !compact {
                    Text(s.serverDisplayName)
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                } else {
                    Text(s.serverInitial)
                        .font(.caption2.weight(.bold))
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                WatchServeSideArrow(courtSide: s.courtSide)
                if let slot = s.tieBreakServeSlot {
                    Text(slot == .serveOne ? "S1" : "S2")
                        .font(.caption2.weight(.bold).monospaced())
                        .foregroundStyle(.tertiary)
                }
            }
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, compact ? 4 : 5)
        .padding(.horizontal, compact ? 6 : 8)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .scaleEffect(reduceMotion ? 1 : (serveAnimPulse ? 1.03 : 1))
        .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.68), value: serveAnimPulse)
        .accessibilityLabel(Text(s.accessibilityLine))
    }

    private func serverUser(_ s: ServeGuideSnapshot) -> WatchUser? {
        let users = s.serverTeam == .teamA ? vm.teamAUsers : vm.teamBUsers
        return users[safe: s.serverPlayerIndex] ?? users.first
    }
}
