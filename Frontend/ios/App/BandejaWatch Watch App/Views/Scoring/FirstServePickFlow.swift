import SwiftUI

struct FirstServePickFlow: View {
    @Binding var record: WatchServeGuideSessionRecord
    let vm: MatchScoringViewModel
    let lang: String
    let gameId: String
    let matchId: String
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

    var body: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()
            ScrollView {
                VStack(spacing: 14) {
                    Text(WatchCopy.serveFirstTitle(lang))
                        .font(.headline.weight(.semibold))
                        .multilineTextAlignment(.center)
                    Text(WatchCopy.serveFirstBody(lang))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

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

                    Button(WatchCopy.skipServeHints(lang)) {
                        skip()
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 16)
            }
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.horizontal, 6)
        }
    }

    private var rotationPickSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(WatchCopy.serveRotationRulesLabel(lang))
                .font(.caption.weight(.semibold))
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
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.caption.weight(.bold))
                Text(desc)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(pickedRotation == value ? Color.accentColor.opacity(0.35) : Color.secondary.opacity(0.12))
            )
        }
        .buttonStyle(.plain)
    }

    private var teamPickSection: some View {
        VStack(spacing: 10) {
            teamBigButton(.teamA, title: WatchCopy.teamAShort(lang), users: vm.teamAUsers)
            teamBigButton(.teamB, title: WatchCopy.teamBShort(lang), users: vm.teamBUsers)
        }
    }

    private func teamBigButton(_ side: TeamSide, title: String, users: [WatchUser]) -> some View {
        Button {
            pickedTeam = side
            let count = side == .teamA ? vm.teamAUsers.count : vm.teamBUsers.count
            if count >= 2 {
                pickedPlayerIndex = 0
                step = .pickDoublesServer
            } else {
                finishAfterPlayerPick(side, playerIndex: 0)
            }
        } label: {
            HStack(spacing: 10) {
                HStack(spacing: -6) {
                    ForEach(Array(users.prefix(2)), id: \.id) { u in
                        WatchPlayerAvatarView(user: u, size: 36, role: nil)
                    }
                }
                Text(title)
                    .font(.body.weight(.semibold))
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.accentColor.opacity(0.22))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.12), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var doublesPickSection: some View {
        let side = pickedTeam ?? .teamA
        let users = side == .teamA ? vm.teamAUsers : vm.teamBUsers
        return VStack(alignment: .leading, spacing: 10) {
            Text(WatchCopy.whoServesFirstGame(lang))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                ForEach(Array(users.enumerated()), id: \.element.id) { idx, u in
                    Button {
                        pickedPlayerIndex = idx
                    } label: {
                        VStack(spacing: 4) {
                            WatchPlayerAvatarView(user: u, size: 40, role: nil)
                            Text(u.displayName)
                                .font(.caption2.weight(.semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
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
            .frame(maxWidth: .infinity)
        }
    }

    private var courtEndsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(WatchCopy.courtEndsTitle(lang))
                .font(.caption.weight(.semibold))
            Text(WatchCopy.courtEndsBody(lang))
                .font(.caption2)
                .foregroundStyle(.secondary)
            VStack(spacing: 6) {
                Text(courtEndsSwapped ? WatchCopy.teamAShort(lang) : WatchCopy.teamBShort(lang))
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                Image(systemName: "sportscourt")
                    .font(.title2)
                    .symbolRenderingMode(.hierarchical)
                Text(courtEndsSwapped ? WatchCopy.teamBShort(lang) : WatchCopy.teamAShort(lang))
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            Button {
                courtEndsSwapped.toggle()
            } label: {
                Label(WatchCopy.flipCourtVertical(lang), systemImage: "arrow.up.arrow.down")
                    .font(.caption2.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            HStack(spacing: 8) {
                Button {
                    teamASidesMirrored.toggle()
                } label: {
                    Label(WatchCopy.flipTeamASides(lang), systemImage: "arrow.left.arrow.right")
                        .font(.caption2.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                Button {
                    teamBSidesMirrored.toggle()
                } label: {
                    Label(WatchCopy.flipTeamBSides(lang), systemImage: "arrow.left.arrow.right")
                        .font(.caption2.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            Button(WatchCopy.continueAction(lang)) {
                if let t = pickedTeam {
                    commitTeam(t, playerIndex: pickedPlayerIndex)
                }
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity)
        }
    }

    private func commitTeam(_ side: TeamSide, playerIndex: Int) {
        var r = record
        r.firstServerTeam = side
        r.firstServerDoublesPlayerIndex = playerIndex
        r.pointsServeRotation = showRotationStep ? pickedRotation : nil
        r.matchStartCourtEndsSwapped = courtEndsSwapped ? true : nil
        r.matchStartTeamASidesMirrored = teamASidesMirrored ? true : nil
        r.matchStartTeamBSidesMirrored = teamBSidesMirrored ? true : nil
        r.skipped = false
        r.classicPointsPlayedInGame = vm.classicPointsPlayedInGame
        record = r
        WatchServeGuideSessionStore.shared.save(gameId: gameId, matchId: matchId, record: r)
        onFinished()
    }

    private func skip() {
        var r = record
        r.skipped = true
        r.firstServerTeam = nil
        r.firstServerDoublesPlayerIndex = nil
        r.pointsServeRotation = nil
        r.matchStartCourtEndsSwapped = nil
        r.matchStartTeamASidesMirrored = nil
        r.matchStartTeamBSidesMirrored = nil
        record = r
        WatchServeGuideSessionStore.shared.save(gameId: gameId, matchId: matchId, record: r)
        onFinished()
    }
}
