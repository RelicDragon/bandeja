import SwiftUI

enum WatchLevelColor {
    private struct Stop {
        let level: Double
        let rgb: (Double, Double, Double)
    }

    private static let stops: [Stop] = [
        Stop(level: 0, rgb: (59, 130, 246)),
        Stop(level: 2, rgb: (34, 197, 94)),
        Stop(level: 3, rgb: (234, 179, 8)),
        Stop(level: 4, rgb: (249, 115, 22)),
        Stop(level: 5, rgb: (239, 68, 68)),
        Stop(level: 6, rgb: (245, 158, 11)),
        Stop(level: 7, rgb: (168, 85, 247)),
    ]

    static func color(for level: Double, isDark: Bool) -> Color {
        let rgb = rgbForLevel(level, isDark: isDark)
        return Color(red: rgb.r / 255, green: rgb.g / 255, blue: rgb.b / 255)
    }

    private static func rgbForLevel(_ level: Double, isDark: Bool) -> (r: Double, g: Double, b: Double) {
        let clamped = min(7, max(0, level))
        let darkMultiplier = isDark ? 0.85 : 1.0

        let rgb: (Double, Double, Double)
        if clamped <= stops[0].level {
            rgb = stops[0].rgb
        } else if clamped >= stops[stops.count - 1].level {
            rgb = stops[stops.count - 1].rgb
        } else {
            var resolved = stops[0].rgb
            for i in 0..<(stops.count - 1) {
                let current = stops[i]
                let next = stops[i + 1]
                if clamped >= current.level && clamped <= next.level {
                    let span = next.level - current.level
                    let t = span > 0 ? (clamped - current.level) / span : 0
                    resolved = interpolateRgb(current.rgb, next.rgb, t)
                    break
                }
            }
            rgb = resolved
        }

        return (
            r: (rgb.0 * darkMultiplier).rounded(),
            g: (rgb.1 * darkMultiplier).rounded(),
            b: (rgb.2 * darkMultiplier).rounded()
        )
    }

    private static func interpolateRgb(
        _ start: (Double, Double, Double),
        _ end: (Double, Double, Double),
        _ t: Double
    ) -> (Double, Double, Double) {
        (
            start.0 + (end.0 - start.0) * t,
            start.1 + (end.1 - start.1) * t,
            start.2 + (end.2 - start.2) * t
        )
    }
}
