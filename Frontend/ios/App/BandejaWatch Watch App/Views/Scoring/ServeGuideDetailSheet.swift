import SwiftUI

struct ServeGuideDetailSheet: View {
    let snapshot: ServeGuideSnapshot
    let lang: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(WatchCopy.serveDetailPerspective(lang))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if snapshot.tieBreakServeSlot != nil {
                    Text(WatchCopy.serveDetailTbBlock(lang))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Text(WatchCopy.serveGuideDisclaimer(lang))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
        }
        .navigationTitle(WatchCopy.serveHintsMenu(lang))
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(WatchCopy.close(lang)) { dismiss() }
            }
        }
    }
}
