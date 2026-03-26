import SwiftUI

struct NotAuthenticatedView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "iphone.and.arrow.forward")
                .font(.system(size: 36))
                .foregroundStyle(.yellow)
            Text("Sign In Required")
                .font(.headline)
                .multilineTextAlignment(.center)
            Text("Open Bandeja on your iPhone to sign in.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
