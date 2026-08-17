import Foundation
import CryptoKit

enum APIError: Error, LocalizedError {
    case httpError(Int)
    case noToken
    case decodingError(Error)
    case liveScoringRevisionMismatch(revision: Int, serverEnvelope: WatchLiveScoringEnvelope?)

    var errorDescription: String? {
        switch self {
        case .httpError(let code):
            return code == 401 ? "Please sign in on your iPhone." : "Server error (\(code))."
        case .noToken:
            return "Not signed in. Open Bandeja on your iPhone."
        case .decodingError(let underlying):
            return "Unexpected server response: \(underlying.localizedDescription)"
        case .liveScoringRevisionMismatch:
            return "Live score was updated elsewhere."
        }
    }

    func localizedMessage(uiLanguageCode: String) -> String {
        switch self {
        case .httpError(let code):
            return code == 401
                ? WatchCopy.errorSignInOnIPhone(uiLanguageCode)
                : WatchCopy.errorServer(uiLanguageCode, code: code)
        case .noToken:
            return WatchCopy.errorNotSignedIn(uiLanguageCode)
        case .decodingError:
            return WatchCopy.errorUnexpectedResponse(uiLanguageCode)
        case .liveScoringRevisionMismatch:
            return WatchCopy.errorLiveScoringOutOfDate(uiLanguageCode)
        }
    }

    /// Whether a failed HTTP response should be retried via the scoring outbox (enqueue on save, keep on flush).
    nonisolated static func httpStatusWarrantsOutboxRetry(_ statusCode: Int) -> Bool {
        if statusCode == 401 { return false }
        if statusCode == 408 || statusCode == 429 { return true }
        if (400..<500).contains(statusCode) { return false }
        return true
    }

    /// Transient failures (network / 5xx / rate limit) worth queueing for delivery retry.
    nonisolated static func warrantsDeliveryRetry(_ error: Error) -> Bool {
        if let api = error as? APIError {
            switch api {
            case .httpError(let code):
                return httpStatusWarrantsOutboxRetry(code)
            case .noToken, .decodingError, .liveScoringRevisionMismatch:
                return false
            }
        }
        let ns = error as NSError
        return ns.domain == NSURLErrorDomain
    }
}

struct APIClient: Sendable {
    static var baseURL: URL {
        WatchApiConfig.apiBaseURL()
    }

    /// Host root for relative `avatar` paths from the API (e.g. `https://bandeja.me`).
    static var mediaOrigin: String {
        WatchApiConfig.mediaOrigin()
    }

    /// Ensures a usable access token exists (refreshing from shared Keychain when needed).
    static func ensureAccessToken() async -> String? {
        if let token = KeychainHelper.shared.readToken(), !token.isEmpty {
            return token
        }
        do {
            return try await WatchAuthRefreshCoordinator.shared.refreshAccessToken()
        } catch {
            return nil
        }
    }

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private func authenticatedResponse(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        var token = KeychainHelper.shared.readToken()
        if token == nil || token?.isEmpty == true {
            // Access may have been cleared by a stale logout sync; refresh still lives in shared Keychain.
            token = try await WatchAuthRefreshCoordinator.shared.refreshAccessToken()
        }
        guard let token, !token.isEmpty else {
            throw APIError.noToken
        }
        var authorized = request
        authorized.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (firstData, firstResponse) = try await URLSession.shared.data(for: authorized)
        guard let firstHTTP = firstResponse as? HTTPURLResponse else {
            throw APIError.httpError(0)
        }
        guard firstHTTP.statusCode == 401 else { return (firstData, firstHTTP) }

        let refreshed = try await WatchAuthRefreshCoordinator.shared.refreshAccessToken()
        authorized.setValue("Bearer \(refreshed)", forHTTPHeaderField: "Authorization")
        let (retryData, retryResponse) = try await URLSession.shared.data(for: authorized)
        guard let retryHTTP = retryResponse as? HTTPURLResponse else {
            throw APIError.httpError(0)
        }
        return (retryData, retryHTTP)
    }

    func fetch<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        try await execute(endpoint)
    }

    func send<T: Decodable, Body: Encodable>(_ endpoint: Endpoint, body: Body) async throws -> T {
        try await execute(endpoint, body: body)
    }

    func put<T: Decodable, Body: Encodable>(_ endpoint: Endpoint, body: Body) async throws -> T {
        try await execute(endpoint, body: body)
    }

    func patch<T: Decodable, Body: Encodable>(_ endpoint: Endpoint, body: Body) async throws -> T {
        try await execute(endpoint, body: body)
    }

    func patchMatchLiveScoring(gameId: String, matchId: String, body: WatchPatchLiveScoringBody) async throws -> WatchPatchLiveScoringResponse {
        var request = Endpoint.patchMatchLiveScoring(gameId: gameId, matchId: matchId).urlRequest(baseURL: Self.baseURL)
        request.httpBody = try JSONEncoder().encode(body)

        let (data, http) = try await authenticatedResponse(for: request)
        if http.statusCode == 409 {
            if let parsed = try? Self.decoder.decode(LiveScoringConflictResponse.self, from: data),
               let rev = parsed.revision {
                throw APIError.liveScoringRevisionMismatch(revision: rev, serverEnvelope: parsed.liveScoring)
            }
            throw APIError.httpError(409)
        }
        guard 200..<300 ~= http.statusCode else {
            throw APIError.httpError(http.statusCode)
        }

        do {
            let wrapped = try Self.decoder.decode(BandejaApiEnvelope<WatchPatchLiveScoringResponse>.self, from: data)
            guard let d = wrapped.data else {
                throw APIError.decodingError(NSError(domain: "APIClient", code: -1))
            }
            return d
        } catch {
            if let direct = try? Self.decoder.decode(WatchPatchLiveScoringResponse.self, from: data) {
                return direct
            }
            throw APIError.decodingError(error)
        }
    }

    func sendVoid<Body: Encodable>(_ endpoint: Endpoint, body: Body? = nil) async throws {
        if let body {
            _ = try await execute(endpoint, body: body) as SimpleSuccessResponse
        } else {
            _ = try await execute(endpoint, body: OptionalBody(), includeBody: false) as SimpleSuccessResponse
        }
    }

    func sendVoid(_ endpoint: Endpoint) async throws {
        _ = try await execute(endpoint, body: OptionalBody(), includeBody: false) as SimpleSuccessResponse
    }

    func postNoBody<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        try await execute(endpoint, body: OptionalBody(), includeBody: false)
    }

    private func execute<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        try await execute(endpoint, body: OptionalBody(), includeBody: false)
    }

    private func execute<T: Decodable, Body: Encodable>(
        _ endpoint: Endpoint,
        body: Body,
        includeBody: Bool = true
    ) async throws -> T {
        var request = endpoint.urlRequest(baseURL: Self.baseURL)
        if includeBody {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, http) = try await authenticatedResponse(for: request)
        guard 200..<300 ~= http.statusCode else {
            throw APIError.httpError(http.statusCode)
        }

        do {
            let wrapped = try Self.decoder.decode(BandejaApiEnvelope<T>.self, from: data)
            guard let d = wrapped.data else {
                if let direct = try? Self.decoder.decode(T.self, from: data) {
                    return direct
                }
                throw APIError.decodingError(NSError(domain: "APIClient", code: -1))
            }
            return d
        } catch {
            if let direct = try? Self.decoder.decode(T.self, from: data) {
                return direct
            }
            throw APIError.decodingError(error)
        }
    }
}

private struct OptionalBody: Codable, Sendable {}

private struct BandejaApiEnvelope<T: Decodable>: Decodable {
    let success: Bool?
    let data: T?
}

private struct LiveScoringConflictResponse: Decodable, Sendable {
    let revision: Int?
    let liveScoring: WatchLiveScoringEnvelope?
}

private struct SimpleSuccessResponse: Codable, Sendable {
    let success: Bool
}

actor WatchAuthRefreshCoordinator {
    static let shared = WatchAuthRefreshCoordinator()
    private var inFlight: Task<String, Error>?

    func refreshAccessToken() async throws -> String {
        if let inFlight {
            return try await inFlight.value
        }
        let task = Task { try await self.performRefresh(allowSharedCredentialRetry: true) }
        inFlight = task
        defer { inFlight = nil }
        return try await task.value
    }

    private func performRefresh(allowSharedCredentialRetry: Bool, attempt: Int = 0) async throws -> String {
        guard let refreshToken = KeychainHelper.shared.readRefreshToken(), !refreshToken.isEmpty else {
            throw APIError.noToken
        }
        let requestIdInput = Data("bandeja-refresh-request-v1:\(refreshToken)".utf8)
        let requestId = "native-v1-" + SHA256.hash(data: requestIdInput)
            .map { String(format: "%02x", $0) }
            .joined()

        let refreshURL = await APIClient.baseURL.appendingPathComponent("auth/refresh")
        var request = URLRequest(
            url: refreshURL,
            timeoutInterval: 20
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("ios", forHTTPHeaderField: "X-Client-Platform")
        request.setValue(
            Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0",
            forHTTPHeaderField: "X-Client-Version"
        )
        request.setValue(requestId, forHTTPHeaderField: "X-Refresh-Request-Id")
        request.httpBody = try JSONEncoder().encode(WatchRefreshRequest(refreshToken: refreshToken))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.httpError(0) }
        if http.statusCode == 401, allowSharedCredentialRetry,
           let latest = KeychainHelper.shared.readRefreshToken(), latest != refreshToken {
            return try await performRefresh(allowSharedCredentialRetry: false)
        }
        if [408, 429, 503].contains(http.statusCode), attempt < 2 {
            let delayNs = UInt64(180_000_000 * (attempt + 1))
            try await Task.sleep(nanoseconds: delayNs)
            return try await performRefresh(
                allowSharedCredentialRetry: allowSharedCredentialRetry,
                attempt: attempt + 1
            )
        }
        guard 200..<300 ~= http.statusCode else { throw APIError.httpError(http.statusCode) }
        let envelope = try JSONDecoder().decode(WatchRefreshEnvelope.self, from: data)
        guard let refreshed = envelope.data,
              !refreshed.token.isEmpty,
              !refreshed.refreshToken.isEmpty,
              KeychainHelper.shared.writeRefreshToken(token: refreshed.refreshToken),
              KeychainHelper.shared.write(token: refreshed.token) else {
            throw APIError.noToken
        }
        return refreshed.token
    }
}

nonisolated private struct WatchRefreshRequest: Encodable {
    let refreshToken: String
}

nonisolated private struct WatchRefreshEnvelope: Decodable {
    let data: WatchRefreshPayload?
}

nonisolated private struct WatchRefreshPayload: Decodable {
    let token: String
    let refreshToken: String
}
