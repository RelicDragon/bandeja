import SwiftUI

/// Shared `Game.status` / `resultsStatus` → label and color mapping for list rows and the detail pill.
enum WatchGameStatusCopy {
    static func label(status: String, resultsStatus: String, lang: String) -> String {
        switch (status, resultsStatus) {
        case ("ANNOUNCED", _):           return WatchCopy.statusAnnounced(lang)
        case ("STARTED", "NONE"):        return WatchCopy.statusInProgress(lang)
        case ("STARTED", "IN_PROGRESS"): return WatchCopy.statusScoring(lang)
        case (_, "FINAL"):               return WatchCopy.resultsFinal(lang)
        case ("FINISHED", _):            return WatchCopy.statusFinished(lang)
        case ("ARCHIVED", _):            return WatchCopy.statusArchived(lang)
        default:                         return WatchCopy.statusLabelFallback(lang)
        }
    }

    static func color(status: String) -> Color {
        switch status {
        case "STARTED":   return .green
        case "ANNOUNCED": return .yellow
        default:          return .secondary
        }
    }
}
