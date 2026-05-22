import Foundation

/// Mirrors `Frontend/src/utils/liveScoring/serveGuide.ts` court diagram orientation.
enum ServeGuideCourtOrientation {
    static func courtEndsSwappedAfterPoints(_ totalPointsInSegment: Int) -> Bool {
        (totalPointsInSegment / 6) % 2 == 1
    }

    static func courtEndsSwappedFromHistory(
        activeSetIndex: Int,
        sets: [WatchSetWrite],
        segmentPointCount: Int = 0
    ) -> Bool {
        var swapped = false
        for si in 0..<sets.count {
            if si > activeSetIndex { break }
            let row = sets[si]
            if row.resolvedRole != .official || row.isTieBreak { continue }
            let isActive = si == activeSetIndex
            let gamesCompleted = row.teamA + row.teamB
            for g in 0..<gamesCompleted {
                if (g + 1) % 2 == 1 { swapped.toggle() }
            }
            if !isActive, gamesCompleted > 0, gamesCompleted % 2 == 0 {
                swapped.toggle()
            }
        }
        if segmentPointCount > 0 {
            let tbBlocks = segmentPointCount / 6
            if tbBlocks % 2 == 1 { swapped.toggle() }
        }
        return swapped
    }

    static func effectiveCourtEndsSwapped(
        matchStartCourtEndsSwapped: Bool,
        activeSetIndex: Int,
        sets: [WatchSetWrite],
        segmentPointCount: Int = 0,
        pointsSegmentOnly: Bool = false
    ) -> Bool {
        let anchored = matchStartCourtEndsSwapped
        let history = pointsSegmentOnly
            ? courtEndsSwappedAfterPoints(segmentPointCount)
            : courtEndsSwappedFromHistory(
                activeSetIndex: activeSetIndex,
                sets: sets,
                segmentPointCount: segmentPointCount
            )
        return anchored != history
    }
}
