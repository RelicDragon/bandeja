import Foundation

enum TeamSide: String, Sendable {
    case teamA
    case teamB
}

enum PadelPoint: Int, Sendable {
    case zero = 0
    case fifteen = 15
    case thirty = 30
    case forty = 40

    var label: String {
        switch self {
        case .zero: return "0"
        case .fifteen: return "15"
        case .thirty: return "30"
        case .forty: return "40"
        }
    }

    var next: PadelPoint? {
        switch self {
        case .zero: return .fifteen
        case .fifteen: return .thirty
        case .thirty: return .forty
        case .forty: return nil
        }
    }

    var previous: PadelPoint? {
        switch self {
        case .zero: return nil
        case .fifteen: return .zero
        case .thirty: return .fifteen
        case .forty: return .thirty
        }
    }
}

enum PadelPointState: Sendable {
    case regular(a: PadelPoint, b: PadelPoint)
    case deuce
    case advantage(TeamSide)
}

