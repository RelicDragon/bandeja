import Foundation

/// Single place that turns a thrown error into user-facing copy in the app language.
enum WatchErrorText {
    static func message(_ error: Error, lang: String) -> String {
        if let api = error as? APIError {
            return api.localizedMessage(uiLanguageCode: lang)
        }
        return error.localizedDescription
    }
}
