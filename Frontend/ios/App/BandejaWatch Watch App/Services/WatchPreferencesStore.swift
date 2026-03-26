import Foundation
import Observation

@Observable
@MainActor
final class WatchPreferencesStore {
    static let shared = WatchPreferencesStore()

    private(set) var payload: WatchUserPreferencesPayload
    private(set) var resolvedLocale: Locale = .current
    private(set) var resolvedCalendar: Calendar = .current
    private(set) var resolvedCurrencyCode: String = "EUR"
    private(set) var uiLanguageCode: String = "en"
    private(set) var prefsRevision = 0

    private init() {
        payload = WatchUserPreferencesPayload.loadFromDefaults()
        recompute()
    }

    func clear() {
        payload = WatchUserPreferencesPayload()
        WatchUserPreferencesPayload.clearDefaults()
        recompute()
    }

    func applyFromPhone(
        language: String?,
        weekStart: String?,
        defaultCurrency: String?,
        timeFormat: String?,
        prefsVersion: Double?
    ) {
        var next = payload
        if let language { next.language = language }
        if let weekStart { next.weekStart = weekStart }
        if let defaultCurrency { next.defaultCurrency = defaultCurrency }
        if let timeFormat { next.timeFormat = timeFormat }
        if let prefsVersion { next.prefsVersion = prefsVersion }
        payload = next
        payload.saveToDefaults()
        recompute()
    }

    func applyFromProfile(_ dto: WatchProfilePreferencesDTO) {
        var next = payload
        next.language = dto.language
        next.weekStart = dto.weekStart
        next.defaultCurrency = dto.defaultCurrency
        next.timeFormat = dto.timeFormat
        next.prefsVersion = Date().timeIntervalSince1970
        payload = next
        payload.saveToDefaults()
        recompute()
    }

    func refreshFromProfile(api: APIClient) async {
        do {
            let dto: WatchProfilePreferencesDTO = try await api.fetch(.userProfile)
            applyFromProfile(dto)
        } catch {
            // Keep cached session / disk prefs
        }
    }

    private func recompute() {
        let device = Locale.current
        resolvedLocale = WatchDisplayPreferences.resolvedLocale(language: payload.language, deviceLocale: device)
        resolvedCalendar = WatchDisplayPreferences.calendar(weekStart: payload.weekStart, resolvedLocale: resolvedLocale)
        resolvedCurrencyCode = WatchDisplayPreferences.resolvedCurrencyCode(
            defaultCurrency: payload.defaultCurrency,
            deviceLocale: device
        )
        uiLanguageCode = WatchDisplayPreferences.uiLanguageCode(language: payload.language, deviceLocale: device)
        prefsRevision += 1
    }
}
