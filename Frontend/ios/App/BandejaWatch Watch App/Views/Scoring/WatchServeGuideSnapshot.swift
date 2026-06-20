import SwiftUI

enum WatchServeGuideSnapshot {
    @MainActor
    static func compute(vm: MatchScoringViewModel, hintsMode: WatchServeHintsMode) -> ServeGuideSnapshot? {
        ServeGuideEngine.compute(.from(vm: vm, hintsMode: hintsMode))
    }

    @MainActor
    static func showGuidePage(
        vm: MatchScoringViewModel,
        hintsMode: WatchServeHintsMode,
        needsServeSetup: Bool
    ) -> Bool {
        guard vm.usesTennisStyleServeGuide,
              hintsMode != .off,
              !vm.serveGuideSkipped,
              !vm.isReadOnly,
              vm.firstServerTeam != nil,
              !needsServeSetup else { return false }
        return compute(vm: vm, hintsMode: hintsMode) != nil
    }
}

extension ServeGuideInputs {
    @MainActor
    static func from(
        vm: MatchScoringViewModel,
        hintsMode: WatchServeHintsMode
    ) -> ServeGuideInputs {
        ServeGuideInputs(
            matchFirstServerTeam: vm.firstServerTeam,
            matchFirstDoublesPlayerIndex: vm.firstServerDoublesPlayerIndex,
            seedSkipped: vm.serveGuideSkipped,
            hintsMode: hintsMode,
            resolvedSport: vm.game?.resolvedSport,
            usesTennisSetRules: vm.game?.serveGuideUsesClassicSetRules ?? false,
            isDoublesMatch: vm.isDoublesMatch,
            isAmericano: vm.isAmericano,
            isReadOnly: vm.isReadOnly,
            activeSetIndex: vm.activeSetIndex,
            sets: vm.sets,
            activeSetIsSupplemental: vm.activeSetIsSupplemental,
            activeSetIsSuperTieBreak: vm.activeSetIsSuperTieBreak,
            withinSetTieBreakMode: vm.withinSetTieBreakMode,
            tieBreakA: vm.tieBreakA,
            tieBreakB: vm.tieBreakB,
            classicPointsPlayedInGame: vm.classicPointsPlayedInGame,
            teamAPlayerNames: vm.teamAUsers.map(\.displayName),
            teamBPlayerNames: vm.teamBUsers.map(\.displayName),
            pendingSetFormatChoice: vm.pendingSetFormatChoiceIndex != nil,
            pointsServeRotation: vm.pointsServeRotation,
            usesRallyPointsServeGuide: vm.usesRallyPointsServeGuide,
            rallyPointsSport: vm.usesRallyPointsServeGuide ? vm.game?.resolvedSport : nil,
            rallyPointsPerSet: vm.maxPointsPerSet,
            rallyFixedNumberOfSets: vm.rules.fixedNumberOfSets,
            rallyWinBy: vm.rules.winBy,
            matchStartCourtEndsSwapped: vm.matchStartCourtEndsSwapped == true,
            matchStartTeamASidesMirrored: vm.matchStartTeamASidesMirrored == true,
            matchStartTeamBSidesMirrored: vm.matchStartTeamBSidesMirrored == true,
            pointWinnerLog: vm.pointWinnerLog
        )
    }
}
