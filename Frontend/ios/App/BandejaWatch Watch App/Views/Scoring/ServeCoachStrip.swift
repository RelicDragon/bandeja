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
            hiddenForMatch: record.hiddenForMatch,
            hintsMode: hintsMode,
            usesTennisSetRules: vm.game?.ballsInGames == true,
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
            pointsServeRotation: record.pointsServeRotation
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
        WatchCopy.nextServeA11y(lang, team: teamLabel(s.serverTeam), name: s.serverDisplayName, side: sideLabel(s.courtSide))
    }

    var body: some View {
        Group {
            if let s = snapshot {
                if s.changeEndsBeforeNextPoint {
                    changeEndsBanner(s)
                } else {
                    stripContent(s)
                }
            }
        }
        .onChange(of: snapshot?.motionToken) { _, newVal in
            guard let newVal else { return }
            if !lastMotionToken.isEmpty, newVal != lastMotionToken {
                WatchScoreHaptics.serveGuideChange()
            }
            lastMotionToken = newVal
        }
        .sheet(item: $detailSnapshot) { snap in
            NavigationStack {
                ServeGuideDetailSheet(snapshot: snap, lang: lang)
            }
        }
    }

    @ViewBuilder
    private func changeEndsBanner(_ s: ServeGuideSnapshot) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "arrow.left.arrow.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.accentColor)
            Text(WatchCopy.serveCoachChangeEnds(lang))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(WatchCopy.serveCoachChangeEnds(lang))
    }

    @ViewBuilder
    private func stripContent(_ s: ServeGuideSnapshot) -> some View {
        let compact = hintsMode == .compact
        Button {
            detailSnapshot = s
        } label: {
            HStack(spacing: 8) {
                courtGlyph(s.courtSide, compact: compact)
                Image(systemName: "tennisball.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                    .id(s.motionToken)
                    .transition(.scale.combined(with: .opacity))
                if !compact {
                    Text(s.serverDisplayName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                Text(sideLabel(s.courtSide))
                    .font(.caption.weight(.bold).monospaced())
                    .foregroundStyle(.secondary)
                if let slot = s.tieBreakServeSlot, !compact {
                    Text(slot == .serveOne ? "S1" : "S2")
                        .font(.caption2.weight(.bold).monospaced())
                        .foregroundStyle(.tertiary)
                }
                if compact, let slot = s.tieBreakServeSlot {
                    Text(slot == .serveOne ? "S1" : "S2")
                        .font(.caption2.weight(.bold).monospaced())
                        .foregroundStyle(.tertiary)
                }
                if compact {
                    Text(s.serverInitial)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.primary.opacity(0.9))
                        .frame(minWidth: 14)
                } else if let u = serverUser(s) {
                    WatchPlayerAvatarView(user: u, size: 22, role: nil)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 7)
            .padding(.horizontal, 10)
            .background(.ultraThinMaterial, in: Capsule())
        }
        .buttonStyle(.plain)
        .environment(\.layoutDirection, .leftToRight)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.55)
                .onEnded { _ in
                    WatchScoreHaptics.serveGuideChange()
                    var next = record
                    next.hiddenForMatch = true
                    record = next
                    WatchServeGuideSessionStore.shared.save(gameId: gameId, matchId: matchId, record: next)
                }
        )
        .accessibilityLabel(Text(accessibilityLine(s)))
    }

    private func serverUser(_ s: ServeGuideSnapshot) -> WatchUser? {
        let users = s.serverTeam == .teamA ? vm.teamAUsers : vm.teamBUsers
        return users[safe: s.serverPlayerIndex] ?? users.first
    }

    @ViewBuilder
    private func courtGlyph(_ side: CourtServeSide, compact: Bool) -> some View {
        HStack(spacing: 2) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(side.isRight ? Color.accentColor.opacity(0.85) : Color.secondary.opacity(0.28))
                .frame(width: compact ? 5 : 6, height: 16)
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(!side.isRight ? Color.accentColor.opacity(0.85) : Color.secondary.opacity(0.28))
                .frame(width: compact ? 5 : 6, height: 16)
        }
        .accessibilityHidden(true)
    }
}
