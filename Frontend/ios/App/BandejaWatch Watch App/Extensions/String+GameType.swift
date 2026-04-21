import Foundation

extension String {
    /// Returns the SF Symbol name for a given `gameType` string value.
    var gameTypeIconName: String {
        switch self {
        case "AMERICANO":   return "arrow.triangle.2.circlepath"
        case "MEXICANO":    return "flag.fill"
        case "ROUND_ROBIN": return "circle.grid.3x3"
        case "WINNER_COURT": return "crown.fill"
        case "LADDER":      return "arrow.up.arrow.down"
        default:            return "sportscourt.fill"
        }
    }
}
