import Foundation

enum APIError: Error, LocalizedError {
    case httpError(Int)
    case noToken
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .httpError(let code):
            return code == 401 ? "Please sign in on your iPhone." : "Server error (\(code))."
        case .noToken:
            return "Not signed in. Open Bandeja on your iPhone."
        case .decodingError(let underlying):
            return "Unexpected server response: \(underlying.localizedDescription)"
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
        }
    }
}

struct APIClient: Sendable {
    static let baseURL = URL(string: "https://bandeja.me/api")!

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func fetch<T: Decodable & Sendable>(_ endpoint: Endpoint) async throws -> T {
        guard let token = KeychainHelper.shared.readToken() else {
            throw APIError.noToken
        }
        var request = endpoint.urlRequest(baseURL: Self.baseURL)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.httpError(0)
        }
        guard 200..<300 ~= http.statusCode else {
            throw APIError.httpError(http.statusCode)
        }

        do {
            let wrapped = try Self.decoder.decode(ApiResponse<T>.self, from: data)
            return wrapped.data
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
