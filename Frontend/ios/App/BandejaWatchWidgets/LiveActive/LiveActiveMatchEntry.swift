import WidgetKit

struct LiveActiveMatchEntry: TimelineEntry {
    let date: Date
    let title: String
    let score: String
    let active: Bool
    /// Game to open on tap (`bandejawatch://games/<gameId>`); nil when idle.
    let gameId: String?
}
