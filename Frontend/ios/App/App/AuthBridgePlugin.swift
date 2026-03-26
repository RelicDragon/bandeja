import Capacitor

@objc(AuthBridgePlugin)
public class AuthBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthBridgePlugin"
    public let jsName = "AuthBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteToken", returnType: CAPPluginReturnPromise)
    ]

    @objc func setToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token") else {
            return call.reject("Missing token")
        }
        KeychainHelper.shared.write(token: token, accessGroup: "group.com.funified.bandeja")
        WatchSessionManager.shared.sendToken(token)
        call.resolve()
    }

    @objc func deleteToken(_ call: CAPPluginCall) {
        KeychainHelper.shared.deleteToken(accessGroup: "group.com.funified.bandeja")
        WatchSessionManager.shared.sendLogout()
        call.resolve()
    }
}
