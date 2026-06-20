import SwiftUI

/// Compact strict officiating controls (mirrors web `PickleballStrictFaultButtons` + `RallyOfficiatingButtons`).
struct WatchStrictOfficiatingButtons: View {
    @Bindable var vm: MatchScoringViewModel
    let lang: String

    @State private var kitchenFaultPickOpen = false

    private var sport: WatchSport? { vm.game?.resolvedSport }
    private var actionsDisabled: Bool { vm.strictOfficiatingActionsDisabled }

    var body: some View {
        if !vm.officiatingIsStrict {
            EmptyView()
        } else if vm.officiatingLetPending {
            letReplayStrip
        } else if sport == .pickleball, vm.liveScoringUiId == .rallyPointsBoard {
            pickleballKitchenFaultStrip
        } else if sport == .badminton, vm.liveScoringUiId == .rallyPointsBoard {
            letServiceFaultStrip
        } else if sport == .tennis, vm.liveScoringUiId == .classicCourt {
            letServiceFaultStrip
        } else {
            EmptyView()
        }
    }

    private var letReplayStrip: some View {
        VStack(spacing: 6) {
            Text(WatchCopy.strictLetPending(lang))
                .font(.caption2.weight(.medium))
                .foregroundStyle(Color.orange)
                .multilineTextAlignment(.center)
            Button(WatchCopy.strictLetReplay(lang)) {
                vm.confirmLetReplay()
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
            .disabled(vm.isReadOnly)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.orange.opacity(0.12))
        )
    }

    @ViewBuilder
    private var pickleballKitchenFaultStrip: some View {
        if kitchenFaultPickOpen {
            VStack(spacing: 6) {
                Text(WatchCopy.strictKitchenFaultPickTeam(lang))
                    .font(.caption2.weight(.medium))
                    .multilineTextAlignment(.center)
                HStack(spacing: 6) {
                    faultTeamButton(WatchCopy.teamAFault(lang), team: .teamA)
                    faultTeamButton(WatchCopy.teamBFault(lang), team: .teamB)
                }
                Button(WatchCopy.cancelAction(lang)) {
                    kitchenFaultPickOpen = false
                }
                .font(.caption2)
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 6)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.orange.opacity(0.12))
            )
        } else {
            Button(WatchCopy.pickleballKitchenFault(lang)) {
                kitchenFaultPickOpen = true
            }
            .font(.caption2.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .background(
                Capsule()
                    .fill(Color.orange.opacity(0.2))
            )
            .buttonStyle(.plain)
            .disabled(actionsDisabled)
        }
    }

    private var letServiceFaultStrip: some View {
        HStack(spacing: 6) {
            strictCapsuleButton(WatchCopy.letCall(lang), role: .neutral) {
                vm.markLetPending()
            }
            strictCapsuleButton(WatchCopy.serviceFault(lang), role: .fault) {
                vm.applyServiceFault()
            }
        }
    }

    private enum CapsuleRole {
        case neutral
        case fault
    }

    private func strictCapsuleButton(_ title: String, role: CapsuleRole, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity)
                .background(
                    Capsule()
                        .fill(role == .fault ? Color.red.opacity(0.18) : Color.secondary.opacity(0.14))
                )
        }
        .buttonStyle(.plain)
        .disabled(actionsDisabled)
    }

    private func faultTeamButton(_ title: String, team: TeamSide) -> some View {
        Button(title) {
            vm.kitchenFault(faultingTeam: team)
            kitchenFaultPickOpen = false
        }
        .font(.caption2.weight(.semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity)
        .background(
            Capsule()
                .fill(team == .teamA ? Color.blue.opacity(0.18) : Color.purple.opacity(0.18))
        )
        .buttonStyle(.plain)
        .disabled(actionsDisabled)
    }
}
