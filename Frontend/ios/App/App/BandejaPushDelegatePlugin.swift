import Foundation
import Capacitor

@objc(BandejaPushDelegatePlugin)
public class BandejaPushDelegatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BandejaPushDelegatePlugin"
    public let jsName = "BandejaPushDelegate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setPushReplyJsReady", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        if let bridge {
            BandejaPushNotificationDelegate.shared.attachToBridge(bridge)
        }
    }

    @objc func setPushReplyJsReady(_ call: CAPPluginCall) {
        let ready = call.getBool("ready") ?? false
        BandejaPushNotificationDelegate.shared.setPushReplyJsReady(ready)
        call.resolve()
    }
}
