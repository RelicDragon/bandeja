import Foundation

/// PRD 346 — attendance answers on the watch.
///
/// Confirmation is a courtesy signal, never a contract. Nothing here — or
/// anything it feeds — can remove a player, change a seat, reorder the queue or
/// touch a level. The watch shows the viewer's own answer and can post one.
enum WatchAttendance {
    nonisolated static let unanswered = "UNANSWERED"
    nonisolated static let confirmed = "CONFIRMED"
    nonisolated static let unsure = "UNSURE"

    /// The window the Next Game surfaces ask in (PRD 346: "within 24 h").
    nonisolated static let promptWindowHours: Double = 24

    /// `true` when the viewer has not answered yet and the game starts inside
    /// the prompt window. A game that has already started asks nothing: the
    /// backend closes answers at kick-off (`gameAcceptsAttendanceAnswers`).
    ///
    /// Silence is always allowed — this only decides whether to *offer* the
    /// question, never whether the player keeps their seat.
    nonisolated static func needsAnswer(
        attendance: String?,
        status: String,
        startTime: Date,
        now: Date = .now
    ) -> Bool {
        guard attendance == unanswered, status == "ANNOUNCED" else { return false }
        let hours = startTime.timeIntervalSince(now) / 3600
        return hours > 0 && hours <= promptWindowHours
    }
}

/// The counts every attendance payload carries. `viewerAttendance` is `nil`
/// when the viewer is not a PLAYING participant of that game.
struct WatchAttendanceSummary: Decodable, Sendable {
    let viewerAttendance: String?
    let confirmedCount: Int
    let playingCount: Int

    nonisolated init(viewerAttendance: String?, confirmedCount: Int, playingCount: Int) {
        self.viewerAttendance = viewerAttendance
        self.confirmedCount = confirmedCount
        self.playingCount = playingCount
    }

    private enum CodingKeys: String, CodingKey {
        case viewerAttendance, confirmedCount, playingCount
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        viewerAttendance = try c.decodeIfPresent(String.self, forKey: .viewerAttendance)
        confirmedCount = try c.decodeIfPresent(Int.self, forKey: .confirmedCount) ?? 0
        playingCount = try c.decodeIfPresent(Int.self, forKey: .playingCount) ?? 0
    }
}

/// The subset of `GET /games/:id/attendance` the watch renders.
struct WatchGameAttendance: Decodable, Sendable {
    let summary: WatchAttendanceSummary
    /// `false` once the game has started, or when it has no time set.
    let answersOpen: Bool

    nonisolated init(summary: WatchAttendanceSummary, answersOpen: Bool) {
        self.summary = summary
        self.answersOpen = answersOpen
    }

    private enum CodingKeys: String, CodingKey {
        case answersOpen
    }

    nonisolated init(from decoder: Decoder) throws {
        summary = try WatchAttendanceSummary(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        answersOpen = try c.decodeIfPresent(Bool.self, forKey: .answersOpen) ?? false
    }

    nonisolated var viewerAttendance: String? { summary.viewerAttendance }
    nonisolated var confirmedCount: Int { summary.confirmedCount }
    nonisolated var playingCount: Int { summary.playingCount }

    /// The viewer is a PLAYING participant and the game still accepts answers.
    nonisolated var canAnswer: Bool { answersOpen && summary.viewerAttendance != nil }

    nonisolated var hasAnswered: Bool {
        viewerAttendance == WatchAttendance.confirmed || viewerAttendance == WatchAttendance.unsure
    }

    /// Folds an answer response back in. `answersOpen` is kept from this value:
    /// the answer endpoint returns counts, not the window.
    nonisolated func merging(_ response: WatchAttendanceAnswerResponse) -> WatchGameAttendance {
        let merged = WatchAttendanceSummary(
            viewerAttendance: response.attendance ?? response.summary?.viewerAttendance ?? viewerAttendance,
            confirmedCount: response.summary?.confirmedCount ?? confirmedCount,
            playingCount: response.summary?.playingCount ?? playingCount
        )
        return WatchGameAttendance(summary: merged, answersOpen: answersOpen)
    }
}

/// `POST /games/:id/attendance` — the only attendance write the watch makes.
struct WatchAttendanceAnswerBody: Encodable, Sendable {
    let state: String

    nonisolated init(state: String) {
        self.state = state
    }
}

/// The `{ attendance, summary }` the answer endpoint returns.
struct WatchAttendanceAnswerResponse: Decodable, Sendable {
    let attendance: String?
    let summary: WatchAttendanceSummary?

    nonisolated init(attendance: String?, summary: WatchAttendanceSummary?) {
        self.attendance = attendance
        self.summary = summary
    }

    private enum CodingKeys: String, CodingKey {
        case attendance, summary
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        attendance = try c.decodeIfPresent(String.self, forKey: .attendance)
        summary = (try? c.decodeIfPresent(WatchAttendanceSummary.self, forKey: .summary)) ?? nil
    }
}
