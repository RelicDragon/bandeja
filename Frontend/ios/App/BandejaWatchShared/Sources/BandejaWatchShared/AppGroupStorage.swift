import Foundation

public enum AppGroupStorage {
    public static let suiteName = "group.com.funified.bandeja"

    public enum Keys {
        public static let nextGames = "bandeja.widget.nextGames.v1"
        public static let liveActiveSnapshot = "watchLiveActiveScoringV1"
        public static let uiLanguage = "bandeja.widget.uiLanguage.v1"
    }

    public static var suite: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }
}
