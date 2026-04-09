import HealthKit
import SwiftUI

enum WorkoutControlMode {
    case gameActive
    case matchActive
}

struct WorkoutControlPage: View {
    let mode: WorkoutControlMode
    let gameId: String
    @Environment(ActiveSessionManager.self) private var session
    @Environment(WatchPreferencesStore.self) private var prefs
    @Bindable private var workout = WorkoutManager.shared
    @State private var showFinishGameConfirm = false
    @State private var showExitConfirm = false

    var body: some View {
        let lang = prefs.uiLanguageCode
        ScrollView {
            VStack(spacing: 12) {
                metricsSection(lang: lang)

                if mode == .gameActive, let err = session.scoringViewModel?.error {
                    Text(sessionErrorMessage(err, lang: lang))
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                if mode == .gameActive {
                    if session.scoringViewModel?.canFinalizeResults == true {
                        Button {
                            showFinishGameConfirm = true
                        } label: {
                            controlCircle(
                                systemName: "xmark",
                                color: .red,
                                label: WatchCopy.sessionFinishGame(lang)
                            )
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text(WatchCopy.sessionNeedScoresToFinalize(lang))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        showExitConfirm = true
                    } label: {
                        Text(WatchCopy.sessionExitScoring(lang))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                } else {
                    HStack(spacing: 16) {
                        if workout.isActive, workout.activeGameId == gameId, !workout.authDenied {
                            Button {
                                workout.togglePauseResume()
                            } label: {
                                controlCircle(
                                    systemName: workout.sessionState == .paused ? "play.fill" : "pause.fill",
                                    color: .yellow,
                                    label: workout.sessionState == .paused
                                        ? WatchCopy.workoutResumeA11y(lang)
                                        : WatchCopy.workoutPauseA11y(lang)
                                )
                            }
                            .buttonStyle(.plain)
                        }

                        Button {
                            session.requestFinishMatchFromControl()
                        } label: {
                            controlCircle(
                                systemName: "stop.fill",
                                color: .red,
                                label: WatchCopy.finishMatch(lang)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.vertical, 8)
        }
        .confirmationDialog(WatchCopy.sessionFinishGame(lang), isPresented: $showFinishGameConfirm, titleVisibility: .visible) {
            Button(WatchCopy.finalizeResults(lang)) {
                Task { await session.finishGame() }
            }
            Button(WatchCopy.cancelAction(lang), role: .cancel) {}
        }
        .confirmationDialog(WatchCopy.sessionExitScoring(lang), isPresented: $showExitConfirm, titleVisibility: .visible) {
            Button(WatchCopy.sessionExitScoring(lang), role: .destructive) {
                Task { await session.resetSessionDiscardWorkout() }
            }
            Button(WatchCopy.cancelAction(lang), role: .cancel) {}
        }
    }

    @ViewBuilder
    private func metricsSection(lang: String) -> some View {
        if workout.isActive, workout.activeGameId == gameId, !workout.authDenied {
            VStack(alignment: .leading, spacing: 6) {
                metricRow(icon: "flame.fill", color: .orange, text: WatchCopy.workoutKcal(lang, value: Int(workout.activeCalories.rounded())))
                if workout.heartRate > 0 {
                    metricRow(icon: "heart.fill", color: .red, text: WatchCopy.workoutBpm(lang, value: Int(workout.heartRate.rounded())))
                }
                let m = Int(workout.elapsedSeconds) / 60
                let s = Int(workout.elapsedSeconds) % 60
                metricRow(icon: "timer", color: .green, text: WatchCopy.workoutTimerShort(lang, minutes: m, seconds: s))
            }
            .font(.caption2)
        } else if mode == .gameActive && !(session.workoutStartedForGame) {
            Text(WatchCopy.sessionWaitFirstMatch(lang))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }

    private func metricRow(icon: String, color: Color, text: String) -> some View {
        Label(text, systemImage: icon)
            .foregroundStyle(color)
    }

    private func controlCircle(systemName: String, color: Color, label: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: systemName)
                .font(.title3)
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Circle().fill(color))
            Text(label)
                .font(.caption2)
                .lineLimit(2)
                .multilineTextAlignment(.center)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
    }

    private func sessionErrorMessage(_ error: Error, lang: String) -> String {
        if let api = error as? APIError {
            return api.localizedMessage(uiLanguageCode: lang)
        }
        return error.localizedDescription
    }
}
