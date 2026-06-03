import SwiftUI

extension ServeGuideInputs {
    @MainActor
    static func from(
        vm: MatchScoringViewModel,
        record: WatchServeGuideSessionRecord,
        hintsMode: WatchServeHintsMode
    ) -> ServeGuideInputs {
        ServeGuideInputs(
            matchFirstServerTeam: record.firstServerTeam,
            matchFirstDoublesPlayerIndex: record.firstServerDoublesPlayerIndex,
            seedSkipped: record.skipped,
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
            pointsServeRotation: record.pointsServeRotation,
            usesRallyPointsServeGuide: vm.usesRallyPointsServeGuide,
            rallyPointsSport: vm.usesRallyPointsServeGuide ? vm.game?.resolvedSport : nil,
            rallyPointsPerSet: vm.maxPointsPerSet,
            rallyFixedNumberOfSets: vm.rules.fixedNumberOfSets,
            rallyWinBy: vm.rules.winBy,
            matchStartCourtEndsSwapped: record.matchStartCourtEndsSwapped == true,
            matchStartTeamASidesMirrored: record.matchStartTeamASidesMirrored == true,
            matchStartTeamBSidesMirrored: record.matchStartTeamBSidesMirrored == true,
            pointWinnerLog: vm.pointWinnerLog
        )
    }
}

struct ServeCoachStrip: View {
    @Bindable var vm: MatchScoringViewModel
    @Binding var record: WatchServeGuideSessionRecord
    @Environment(WatchServeHintsSettingsStore.self) private var hintsStore
    let lang: String
    let gameId: String
    let matchId: String

    @State private var detailSnapshot: ServeGuideSnapshot?
    @State private var lastMotionToken: String = ""
    @State private var serveAnimPulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var hintsMode: WatchServeHintsMode { hintsStore.mode }

    private var snapshot: ServeGuideSnapshot? {
        ServeGuideEngine.compute(.from(vm: vm, record: record, hintsMode: hintsMode))
    }

    private func sideLabel(_ side: CourtServeSide) -> String {
        side.isRight ? WatchCopy.courtRight(lang) : WatchCopy.courtLeft(lang)
    }

    private func teamLabel(_ team: TeamSide) -> String {
        team == .teamA ? WatchCopy.teamAShort(lang) : WatchCopy.teamBShort(lang)
    }

    private func accessibilityLine(_ s: ServeGuideSnapshot) -> String {
        var parts: [String] = []
        if s.changeEndsBeforeNextPoint {
            parts.append(WatchCopy.serveCoachChangeEnds(lang))
        }
        parts.append(WatchCopy.nextServeA11y(lang, team: teamLabel(s.serverTeam), name: s.serverDisplayName, side: sideLabel(s.courtSide)))
        return parts.joined(separator: ". ")
    }

    var body: some View {
        Group {
            if let s = snapshot {
                stripContent(s)
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
        .sheet(item: $detailSnapshot) { snap in
            NavigationStack {
                ServeGuideDetailSheet(
                    snapshot: snap,
                    vm: vm,
                    lang: lang,
                    matchDoubles: vm.isDoublesMatch
                )
            }
        }
    }

    @ViewBuilder
    private func stripContent(_ s: ServeGuideSnapshot) -> some View {
        let compact = hintsMode == .compact
        let changeEndsLabel = WatchCopy.serveCoachChangeEnds(lang)
        Button {
            detailSnapshot = s
        } label: {
            HStack(spacing: compact ? 4 : 6) {
                if s.changeEndsBeforeNextPoint {
                    WatchChangeEndsSideTag(label: changeEndsLabel, sign: 1)
                }
                WatchServeCourtView.coachCourt(
                    snapshot: s,
                    sport: vm.game?.resolvedSport,
                    uiId: vm.liveScoringUiId,
                    teamAUsers: vm.teamAUsers,
                    teamBUsers: vm.teamBUsers,
                    matchDoubles: vm.isDoublesMatch,
                    compact: compact,
                    courtAccessibilityLabel: s.accessibilityLine
                )
                .scaleEffect(reduceMotion ? 1 : (serveAnimPulse ? 1.06 : 1))
                .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.68), value: serveAnimPulse)
                if s.changeEndsBeforeNextPoint {
                    WatchChangeEndsSideTag(label: changeEndsLabel, sign: -1)
                }

                VStack(alignment: .leading, spacing: 2) {
                    if s.changeEndsBeforeNextPoint {
                        Text(changeEndsLabel)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Color(red: 0.05, green: 0.23, blue: 0.45))
                            .lineLimit(1)
                    }
                    if !compact {
                        Text(s.serverDisplayName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    HStack(spacing: 4) {
                        WatchServeSideArrow(courtSide: s.courtSide)
                        if let slot = s.tieBreakServeSlot {
                            Text(slot == .serveOne ? "S1" : "S2")
                                .font(.caption2.weight(.bold).monospaced())
                                .foregroundStyle(.tertiary)
                        }
                        if compact {
                            Text(s.serverInitial)
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.primary.opacity(0.9))
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if !compact, let u = serverUser(s) {
                    WatchPlayerAvatarView(user: u, size: 22, role: nil, levelSport: vm.game?.resolvedSport)
                }
            }
            .padding(.vertical, compact ? 5 : 7)
            .padding(.horizontal, compact ? 6 : 8)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .environment(\.layoutDirection, .leftToRight)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.55)
                .onEnded { _ in
                    hideServeGuideForMatch()
                }
        )
        .accessibilityLabel(Text(accessibilityLine(s)))
    }

    private func hideServeGuideForMatch() {
        WatchScoreHaptics.serveGuideChange()
        var next = record
        next.skipped = true
        record = next
        WatchServeGuideSessionStore.shared.save(gameId: gameId, matchId: matchId, record: next)
        vm.requestLiveScoringSave()
    }

    private func serverUser(_ s: ServeGuideSnapshot) -> WatchUser? {
        let users = s.serverTeam == .teamA ? vm.teamAUsers : vm.teamBUsers
        return users[safe: s.serverPlayerIndex] ?? users.first
    }
}
