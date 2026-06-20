import SwiftUI

struct WatchServeGuidePage: View {
    @Bindable var vm: MatchScoringViewModel
    @Environment(WatchServeHintsSettingsStore.self) private var hintsStore
    @Environment(WatchPreferencesStore.self) private var prefs

    private var lang: String { prefs.uiLanguageCode }

    private var snapshot: ServeGuideSnapshot? {
        WatchServeGuideSnapshot.compute(vm: vm, hintsMode: hintsStore.mode)
    }

    var body: some View {
        Group {
            if let s = snapshot {
                guideContent(s)
            } else {
                Text(WatchCopy.serveGuideUnavailable(lang))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private func guideContent(_ snapshot: ServeGuideSnapshot) -> some View {
        VStack(spacing: 6) {
            if snapshot.changeEndsBeforeNextPoint {
                Text(WatchCopy.serveCoachChangeEnds(lang))
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color(red: 0.05, green: 0.23, blue: 0.45))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if snapshot.changeEndsBeforeNextPoint {
                HStack(spacing: 4) {
                    WatchChangeEndsSideTag(label: WatchCopy.serveCoachChangeEnds(lang), sign: 1)
                    courtView(snapshot)
                    WatchChangeEndsSideTag(label: WatchCopy.serveCoachChangeEnds(lang), sign: -1)
                }
            } else {
                courtView(snapshot)
            }

            Text(snapshot.serverDisplayName)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            HStack(spacing: 6) {
                WatchServeSideArrow(courtSide: snapshot.courtSide)
                if let slot = snapshot.tieBreakServeSlot {
                    Text(slot == .serveOne ? "S1" : "S2")
                        .font(.caption2.weight(.bold).monospaced())
                        .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 0)

            Text(WatchCopy.serveGuideSwipeHint(lang))
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.55)
                .onEnded { _ in
                    WatchScoreHaptics.serveGuideChange()
                    vm.hideServeGuideForMatch()
                }
        )
        .accessibilityLabel(Text(snapshot.accessibilityLine))
        .accessibilityHint(Text(WatchCopy.serveGuideHideHint(lang)))
    }

    @ViewBuilder
    private func courtView(_ snapshot: ServeGuideSnapshot) -> some View {
        WatchServeCourtView.coachCourt(
            snapshot: snapshot,
            sport: vm.game?.resolvedSport,
            uiId: vm.liveScoringUiId,
            teamAUsers: vm.teamAUsers,
            teamBUsers: vm.teamBUsers,
            matchDoubles: vm.isDoublesMatch,
            compact: false,
            courtAccessibilityLabel: snapshot.accessibilityLine
        )
        .frame(maxWidth: 130, maxHeight: 100)
    }
}
