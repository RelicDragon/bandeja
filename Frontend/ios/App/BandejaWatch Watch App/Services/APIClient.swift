import Foundation

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
}

struct APIClient: Sendable {
    static let baseURL = URL(string: "https://bandeja.me/api")!

    /// Host root for relative `avatar` paths from the API (e.g. `https://bandeja.me`).
    static var mediaOrigin: String {
        var s = Self.baseURL.absoluteString
        if s.hasSuffix("/api/") {
            s.removeLast(5)
        } else if s.hasSuffix("/api") {
            s.removeLast(4)
        }
        return s.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

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
        guard let token = KeychainHelper.shared.readToken() else {
            throw APIError.noToken
        }
        var request = Endpoint.patchMatchLiveScoring(gameId: gameId, matchId: matchId).urlRequest(baseURL: Self.baseURL)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.httpError(0)
        }
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
        guard let token = KeychainHelper.shared.readToken() else {
            throw APIError.noToken
        }
        var request = endpoint.urlRequest(baseURL: Self.baseURL)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if includeBody {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.httpError(0)
        }
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

private struct BandejaApiEnvelope<T: Decodable>: Decodable, Sendable {
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
