import SwiftUI

/// Routes serve-coach court graphics by sport (mirrors FE `courtRegistry` / plugin `uiId`).
enum WatchServeCourtView {
    @ViewBuilder
    static func coachCourt(
        snapshot: ServeGuideSnapshot,
        sport: WatchSport?,
        uiId: WatchLiveScoringUiId,
        teamAUsers: [WatchUser],
        teamBUsers: [WatchUser],
        matchDoubles: Bool,
        compact: Bool,
        endsSetup: Bool = false,
        courtAccessibilityLabel: String? = nil
    ) -> some View {
        let resolved = sport ?? .padel
        let labeled = coachCourtBody(
            snapshot: snapshot,
            sport: resolved,
            uiId: uiId,
            teamAUsers: teamAUsers,
            teamBUsers: teamBUsers,
            matchDoubles: matchDoubles,
            compact: compact,
            endsSetup: endsSetup
        )
        if let courtAccessibilityLabel, !courtAccessibilityLabel.isEmpty {
            labeled.accessibilityElement(children: .ignore)
                .accessibilityLabel(courtAccessibilityLabel)
        } else {
            labeled.accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private static func coachCourtBody(
        snapshot: ServeGuideSnapshot,
        sport: WatchSport,
        uiId: WatchLiveScoringUiId,
        teamAUsers: [WatchUser],
        teamBUsers: [WatchUser],
        matchDoubles: Bool,
        compact: Bool,
        endsSetup: Bool
    ) -> some View {
        switch sport {
        case .tableTennis where uiId == .tableTennisBoard:
            TableTennisCourtStrip(
                serverTeam: endsSetup ? nil : snapshot.serverTeam,
                serverOnRightHalf: snapshot.courtSide.isRight
            )
            .frame(width: compact ? 44 : 52, height: compact ? 22 : 26)
        case .badminton:
            BadmintonCourtStrip(
                serverTeam: endsSetup ? nil : snapshot.serverTeam,
                serveRight: snapshot.courtSide.isRight
            )
            .frame(width: compact ? 36 : 44, height: compact ? 52 : 64)
        case .pickleball:
            PickleballCourtStrip(
                serverTeam: endsSetup ? nil : snapshot.serverTeam,
                serveRight: snapshot.courtSide.isRight
            )
            .frame(width: compact ? 36 : 44, height: compact ? 52 : 64)
        case .squash:
            SquashCourtStrip(
                serverTeam: endsSetup ? nil : snapshot.serverTeam,
                serverOnRightHalf: snapshot.courtSide.isRight
            )
            .frame(width: compact ? 36 : 44, height: compact ? 22 : 28)
        default:
            WatchServeCourtSchema(
                snapshot: snapshot,
                teamAUsers: teamAUsers,
                teamBUsers: teamBUsers,
                matchDoubles: matchDoubles,
                variant: sport == .tennis ? .tennis : .padel,
                compact: compact,
                endsSetup: endsSetup
            )
        }
    }
}
