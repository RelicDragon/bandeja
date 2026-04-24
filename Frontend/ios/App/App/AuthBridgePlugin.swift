import Capacitor

@objc(AuthBridgePlugin)
public class AuthBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthBridgePlugin"
    public let jsName = "AuthBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncWatchPreferences", returnType: CAPPluginReturnPromise)
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
        KeychainHelper.shared.deleteRefreshToken(accessGroup: "group.com.funified.bandeja")
        WatchSessionManager.shared.sendLogout()
        call.resolve()
    }

    @objc func setRefreshToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token") else {
            return call.reject("Missing token")
        }
        KeychainHelper.shared.writeRefreshToken(token: token, accessGroup: "group.com.funified.bandeja")
        call.resolve()
    }

    @objc func getRefreshToken(_ call: CAPPluginCall) {
        let token = KeychainHelper.shared.readRefreshToken(accessGroup: "group.com.funified.bandeja")
        call.resolve(["token": token as Any])
    }

    @objc func deleteRefreshToken(_ call: CAPPluginCall) {
        KeychainHelper.shared.deleteRefreshToken(accessGroup: "group.com.funified.bandeja")
        call.resolve()
    }

    @objc func syncWatchPreferences(_ call: CAPPluginCall) {
        WatchSessionManager.shared.setWatchPreferences(
            language: call.getString("language"),
            weekStart: call.getString("weekStart"),
            defaultCurrency: call.getString("defaultCurrency"),
            timeFormat: call.getString("timeFormat")
        )
        call.resolve()
    }
}
