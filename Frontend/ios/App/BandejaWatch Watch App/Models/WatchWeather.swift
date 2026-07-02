import Foundation

struct WatchWeatherSummary: Decodable, Sendable {
    let temperatureC: Double
    let temperatureF: Double
    let conditionKey: String
    let precipitationProbability: Int?
    let windSpeedKmh: Double?
    let isDay: Bool?
    let stale: Bool

    private enum CodingKeys: String, CodingKey {
        case temperatureC, temperatureF, conditionKey, precipitationProbability, windSpeedKmh, isDay, stale
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        temperatureC = try c.decode(Double.self, forKey: .temperatureC)
        temperatureF = try c.decode(Double.self, forKey: .temperatureF)
        conditionKey = (try c.decodeIfPresent(String.self, forKey: .conditionKey)) ?? "unknown"
        precipitationProbability = try c.decodeIfPresent(Int.self, forKey: .precipitationProbability)
        windSpeedKmh = try c.decodeIfPresent(Double.self, forKey: .windSpeedKmh)
        isDay = try c.decodeIfPresent(Bool.self, forKey: .isDay)
        stale = (try c.decodeIfPresent(Bool.self, forKey: .stale)) ?? false
    }

    nonisolated func temperatureLabel(localeIdentifier: String = Locale.current.identifier) -> String {
        let useFahrenheit = WatchWeatherUnit.usesFahrenheit(localeIdentifier: localeIdentifier)
        let value = useFahrenheit ? temperatureF : temperatureC
        let unit = useFahrenheit ? "F" : "C"
        return "\(Int(value.rounded()))°\(unit)"
    }

    nonisolated func compactTemperatureLabel(localeIdentifier: String = Locale.current.identifier) -> String {
        let value = WatchWeatherUnit.usesFahrenheit(localeIdentifier: localeIdentifier) ? temperatureF : temperatureC
        return "\(Int(value.rounded()))°"
    }

    nonisolated func conditionLabel(lang: String) -> String {
        WatchCopy.weatherCondition(lang, conditionKey: conditionKey)
    }

    nonisolated var systemImageName: String {
        switch conditionKey {
        case "clear":
            return isDay == false ? "moon.stars.fill" : "sun.max.fill"
        case "mainly_clear":
            return isDay == false ? "cloud.moon.fill" : "sun.max.fill"
        case "partly_cloudy":
            return isDay == false ? "cloud.moon.fill" : "cloud.sun.fill"
        case "cloudy":
            return "cloud.fill"
        case "fog":
            return "cloud.fog.fill"
        case "drizzle":
            return "cloud.drizzle.fill"
        case "rain", "freezing_rain":
            return "cloud.rain.fill"
        case "snow":
            return "cloud.snow.fill"
        case "showers":
            return "cloud.heavyrain.fill"
        case "thunderstorm":
            return "cloud.bolt.rain.fill"
        default:
            return "cloud.sun.fill"
        }
    }
}

private enum WatchWeatherUnit {
    nonisolated static func usesFahrenheit(localeIdentifier: String) -> Bool {
        let normalized = localeIdentifier.replacingOccurrences(of: "_", with: "-")
        if normalized.lowercased().contains("-u-ms-ussystem") { return true }
        if normalized.lowercased().contains("-u-ms-metric") || normalized.lowercased().contains("-u-ms-uksystem") {
            return false
        }

        let region = Locale(identifier: normalized).region?.identifier.uppercased()
        return ["US", "BS", "BZ", "KY", "LR", "PW"].contains(region ?? "")
    }
}
