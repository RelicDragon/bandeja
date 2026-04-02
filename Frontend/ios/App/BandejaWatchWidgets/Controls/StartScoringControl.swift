import SwiftUI
import WidgetKit

struct StartScoringControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.funified.bandeja.startScoring") {
            ControlWidgetButton(action: OpenBandejaIntent()) {
                Label(WatchWidgetCopy.brand(), systemImage: "sportscourt.fill")
            }
        }
        .displayName("Bandeja")
        .description("Open Bandeja on your Apple Watch.")
    }
}
