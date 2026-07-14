import SwiftUI

enum BandejaBrand {
    /// Adaptive AccentColor asset (`#0EA5E9` / `#38BDF8` night).
    static let accent = Color.accentColor
    /// App icon & splash wash `#ABDEE3`
    static let wash = Color(red: 171 / 255, green: 222 / 255, blue: 227 / 255)
}

struct BandejaBrandMark: View {
    var size: CGFloat = 18

    var body: some View {
        Image("BrandLogo")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
            .accessibilityHidden(true)
    }
}
