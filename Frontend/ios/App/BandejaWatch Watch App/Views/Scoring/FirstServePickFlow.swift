import SwiftUI

struct FirstServePickFlow: View {
    let vm: MatchScoringViewModel
    let lang: String
    let onFinished: () -> Void

    @State private var step: Step = .pickTeam
    @State private var pickedTeam: TeamSide?
    @State private var pickedPlayerIndex = 0
    @State private var pickedRotation = "official"
    @State private var courtEndsSwapped = false
    @State private var teamASidesMirrored = false
    @State private var teamBSidesMirrored = false

    private enum Step {
        case pickRotation
        case pickTeam
        case pickDoublesServer
        case pickCourtEnds
    }

    private var showRotationStep: Bool {
        vm.isAmericano || vm.activeSetIsSuperTieBreak
    }

    private var isSquashServeSetup: Bool {
        vm.game?.resolvedSport == .squash
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()
            VStack(spacing: 6) {
                Text(WatchCopy.serveFirstTitle(lang))
                    .font(.caption.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Text(WatchCopy.serveFirstBody(lang))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)

                Spacer(minLength: 0)

                switch step {
                case .pickRotation:
                    rotationPickSection
                case .pickTeam:
                    teamPickSection
                case .pickDoublesServer:
                    doublesPickSection
                case .pickCourtEnds:
                    courtEndsSection
                }

                Spacer(minLength: 0)

                Button(WatchCopy.skipServeHints(lang)) {
                    skip()
                }
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.horizontal, 4)
        }
    }

    private var rotationPickSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(WatchCopy.serveRotationRulesLabel(lang))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            rotationButton(
                "official",
                title: WatchCopy.serveRotationOfficialTitle(lang),
                desc: WatchCopy.serveRotationOfficialDesc(lang)
            )
            rotationButton(
                "simple",
                title: WatchCopy.serveRotationSimpleTitle(lang),
                desc: WatchCopy.serveRotationSimpleDesc(lang)
            )
            Button(WatchCopy.continueAction(lang)) {
                if let t = pickedTeam {
                    proceedAfterRotationOrPlayer(t, playerIndex: pickedPlayerIndex)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.mini)
            .frame(maxWidth: .infinity)
        }
    }

    private func finishAfterPlayerPick(_ side: TeamSide, playerIndex: Int) {
        pickedTeam = side
        pickedPlayerIndex = playerIndex
        if showRotationStep {
            step = .pickRotation
        } else {
            proceedAfterRotationOrPlayer(side, playerIndex: playerIndex)
        }
    }

    private func proceedAfterRotationOrPlayer(_ side: TeamSide, playerIndex: Int) {
        pickedTeam = side
        pickedPlayerIndex = playerIndex
        step = .pickCourtEnds
    }

    private func rotationButton(_ value: String, title: String, desc: String) -> some View {
        Button {
            pickedRotation = value
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption2.weight(.bold))
                    .lineLimit(1)
                Text(desc)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(pickedRotation == value ? Color.accentColor.opacity(0.35) : Color.secondary.opacity(0.12))
            )
        }
        .buttonStyle(.plain)
    }

    private var teamPickSection: some View {
        VStack(spacing: 6) {
            teamBigButton(.teamA, title: WatchCopy.teamAShort(lang), users: vm.teamAUsers)
            teamBigButton(.teamB, title: WatchCopy.teamBShort(lang), users: vm.teamBUsers)
        }
    }

    private func teamBigButton(_ side: TeamSide, title: String, users: [WatchUser]) -> some View {
        Button {
            pickedTeam = side
            if isSquashServeSetup {
                courtEndsSwapped = side == .teamA
            }
            let count = side == .teamA ? vm.teamAUsers.count : vm.teamBUsers.count
            if vm.isDoublesMatch, count >= 2 {
                pickedPlayerIndex = 0
                step = .pickDoublesServer
            } else {
                finishAfterPlayerPick(side, playerIndex: 0)
            }
        } label: {
            HStack(spacing: 8) {
                HStack(spacing: -4) {
                    ForEach(Array(users.prefix(vm.isDoublesMatch ? 2 : 1)), id: \.id) { u in
                        WatchPlayerAvatarView(user: u, size: 28, role: nil, levelSport: vm.game?.resolvedSport)
                    }
                }
                Text(title)
                    .font(.caption.weight(.semibold))
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.accentColor.opacity(0.22))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.12), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var doublesPickSection: some View {
        let side = pickedTeam ?? .teamA
        let users = side == .teamA ? vm.teamAUsers : vm.teamBUsers
        return VStack(alignment: .leading, spacing: 6) {
            Text(WatchCopy.whoServesFirstGame(lang))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            HStack(spacing: 6) {
                ForEach(Array(users.enumerated()), id: \.element.id) { idx, u in
                    Button {
                        if idx != pickedPlayerIndex {
                            if side == .teamA {
                                teamASidesMirrored.toggle()
                            } else {
                                teamBSidesMirrored.toggle()
                            }
                        }
                        pickedPlayerIndex = idx
                    } label: {
                        VStack(spacing: 3) {
                            WatchPlayerAvatarView(user: u, size: 32, role: nil, levelSport: vm.game?.resolvedSport)
                            Text(u.displayName)
                                .font(.caption2.weight(.semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                        }
                        .padding(6)
                        .frame(maxWidth: .infinity)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(pickedPlayerIndex == idx ? Color.accentColor.opacity(0.35) : Color.secondary.opacity(0.12))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            Button(WatchCopy.continueAction(lang)) {
                if let t = pickedTeam {
                    finishAfterPlayerPick(t, playerIndex: pickedPlayerIndex)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.mini)
            .frame(maxWidth: .infinity)
        }
    }

    private var courtEndsSetupSnapshot: ServeGuideSnapshot? {
        guard let team = pickedTeam else { return nil }
        let names = team == .teamA ? vm.teamAUsers.map(\.displayName) : vm.teamBUsers.map(\.displayName)
        let display = names[safe: pickedPlayerIndex] ?? names.first ?? "—"
        return ServeGuideSnapshot(
            serverTeam: team,
            serverPlayerIndex: pickedPlayerIndex,
            serverDisplayName: display,
            serverInitial: String(display.prefix(1)).uppercased(),
            courtSide: .rightDeuce,
            tieBreakServeSlot: nil,
            changeEndsBeforeNextPoint: false,
            courtEndsSwapped: courtEndsSwapped,
            courtTeamASidesMirrored: teamASidesMirrored,
            courtTeamBSidesMirrored: teamBSidesMirrored,
            accessibilityLine: display,
            motionToken: "setup"
        )
    }

    private var courtEndsSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let snap = courtEndsSetupSnapshot {
                Group {
                    if isSquashServeSetup {
                        WatchServeCourtView.coachCourt(
                            snapshot: snap,
                            sport: vm.game?.resolvedSport,
                            uiId: vm.liveScoringUiId,
                            teamAUsers: vm.teamAUsers,
                            teamBUsers: vm.teamBUsers,
                            matchDoubles: vm.isDoublesMatch,
                            compact: true,
                            endsSetup: true,
                            courtAccessibilityLabel: WatchCopy.courtEndsTitle(lang)
                        )
                    } else {
                        VStack(spacing: 2) {
                            Text(courtEndsSwapped ? WatchCopy.teamAShort(lang) : WatchCopy.teamBShort(lang))
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.secondary)
                            WatchServeCourtView.coachCourt(
                                snapshot: snap,
                                sport: vm.game?.resolvedSport,
                                uiId: vm.liveScoringUiId,
                                teamAUsers: vm.teamAUsers,
                                teamBUsers: vm.teamBUsers,
                                matchDoubles: vm.isDoublesMatch,
                                compact: true,
                                endsSetup: true,
                                courtAccessibilityLabel: WatchCopy.courtEndsTitle(lang)
                            )
                            Text(courtEndsSwapped ? WatchCopy.teamBShort(lang) : WatchCopy.teamAShort(lang))
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(maxWidth: .infinity)
            }
            if !isSquashServeSetup {
                Button {
                    courtEndsSwapped.toggle()
                } label: {
                    Label(WatchCopy.flipCourtVertical(lang), systemImage: "arrow.up.arrow.down")
                        .font(.caption2.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
            }
            if vm.isDoublesMatch {
                HStack(spacing: 6) {
                    Button {
                        flipTeamSides(.teamA)
                    } label: {
                        Image(systemName: "arrow.left.arrow.right")
                            .font(.caption2.weight(.semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
                    .accessibilityLabel(WatchCopy.flipTeamASides(lang))
                    Button {
                        flipTeamSides(.teamB)
                    } label: {
                        Image(systemName: "arrow.left.arrow.right")
                            .font(.caption2.weight(.semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
                    .accessibilityLabel(WatchCopy.flipTeamBSides(lang))
                }
            }
            Button(WatchCopy.continueAction(lang)) {
                if let t = pickedTeam {
                    commitTeam(t, playerIndex: pickedPlayerIndex)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.mini)
            .frame(maxWidth: .infinity)
        }
    }

    private func flipTeamSides(_ team: TeamSide) {
        if team == .teamA {
            teamASidesMirrored.toggle()
        } else {
            teamBSidesMirrored.toggle()
        }
        if pickedTeam == team {
            pickedPlayerIndex = pickedPlayerIndex == 0 ? 1 : 0
        }
    }

    private func commitTeam(_ side: TeamSide, playerIndex: Int) {
        vm.commitServeSetup(
            team: side,
            playerIndex: playerIndex,
            pointsRotation: showRotationStep ? pickedRotation : nil,
            courtEndsSwapped: courtEndsSwapped,
            teamASidesMirrored: vm.isDoublesMatch && teamASidesMirrored,
            teamBSidesMirrored: vm.isDoublesMatch && teamBSidesMirrored
        )
        onFinished()
    }

    private func skip() {
        vm.skipServeGuide()
        onFinished()
    }
}
