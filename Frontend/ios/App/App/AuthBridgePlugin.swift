import UIKit
import Capacitor

extension Notification.Name {
    static let bandejaAppShellReady = Notification.Name("bandejaAppShellReady")
}

@objc(AuthBridgePlugin)
public class AuthBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthBridgePlugin"
    public let jsName = "AuthBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRefreshToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setApiBaseUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncWatchPreferences", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppIconBadgeCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAppIconBadgeCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncBrandingLogo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyAppShellReady", returnType: CAPPluginReturnPromise)
    ]

    @objc func setToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token") else {
            return call.reject("Missing token")
        }
        KeychainHelper.shared.write(token: token, accessGroup: "group.com.funified.bandeja")
        WatchSessionManager.shared.sendToken(token)
        call.resolve()
    }

    @objc func getToken(_ call: CAPPluginCall) {
        let token = KeychainHelper.shared.readToken(accessGroup: "group.com.funified.bandeja")
        call.resolve(["token": token as Any])
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

    @objc func setApiBaseUrl(_ call: CAPPluginCall) {
        guard let apiBaseUrl = call.getString("apiBaseUrl") else {
            return call.reject("Missing apiBaseUrl")
        }
        NativeApiConfig.setApiBaseUrl(apiBaseUrl)
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

    @objc func setAppIconBadgeCount(_ call: CAPPluginCall) {
        let count = call.getInt("count") ?? 0
        DispatchQueue.main.async {
            UIApplication.shared.applicationIconBadgeNumber = max(0, count)
        }
        call.resolve()
    }

    @objc func getAppIconBadgeCount(_ call: CAPPluginCall) {
        let count = DispatchQueue.main.sync {
            UIApplication.shared.applicationIconBadgeNumber
        }
        call.resolve(["count": max(0, count)])
    }

    @objc func syncBrandingLogo(_ call: CAPPluginCall) {
        let logoKey = call.getString("logoKey") ?? "padel"
        UserDefaults.standard.set(logoKey, forKey: MainViewController.brandingSplashLogoKey)
        call.resolve()
    }

    @objc func notifyAppShellReady(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .bandejaAppShellReady, object: nil)
        }
        call.resolve()
    }
}
