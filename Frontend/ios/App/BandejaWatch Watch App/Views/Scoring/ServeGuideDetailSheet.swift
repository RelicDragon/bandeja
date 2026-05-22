import SwiftUI

struct ServeGuideDetailSheet: View {
    let snapshot: ServeGuideSnapshot
    let vm: MatchScoringViewModel
    let lang: String
    var matchDoubles: Bool = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if snapshot.changeEndsBeforeNextPoint {
                    HStack(spacing: 6) {
                        WatchChangeEndsSideTag(label: WatchCopy.serveCoachChangeEnds(lang), sign: 1)
                        WatchServeCourtView.coachCourt(
                            snapshot: snapshot,
                            sport: vm.game?.resolvedSport,
                            uiId: vm.liveScoringUiId,
                            teamAUsers: vm.teamAUsers,
                            teamBUsers: vm.teamBUsers,
                            matchDoubles: matchDoubles,
                            compact: false,
                            courtAccessibilityLabel: snapshot.accessibilityLine
                        )
                        .frame(maxWidth: 120)
                        WatchChangeEndsSideTag(label: WatchCopy.serveCoachChangeEnds(lang), sign: -1)
                    }
                } else {
                    WatchServeCourtView.coachCourt(
                        snapshot: snapshot,
                        sport: vm.game?.resolvedSport,
                        uiId: vm.liveScoringUiId,
                        teamAUsers: vm.teamAUsers,
                        teamBUsers: vm.teamBUsers,
                        matchDoubles: matchDoubles,
                        compact: false,
                        courtAccessibilityLabel: snapshot.accessibilityLine
                    )
                    .frame(maxWidth: 120)
                }
                Text(snapshot.serverDisplayName)
                    .font(.caption.weight(.semibold))
                if snapshot.tieBreakServeSlot != nil {
                    Text(WatchCopy.serveDetailTbBlock(lang))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Text(WatchCopy.serveDetailPerspective(lang))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(WatchCopy.serveGuideDisclaimer(lang))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
        }
        .navigationTitle(WatchCopy.serveHintsMenu(lang))
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(WatchCopy.close(lang)) { dismiss() }
            }
        }
    }
}
