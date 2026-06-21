import Foundation

enum ChatReplyApiClient {
    private static let connectTimeout: TimeInterval = 15
    private static let readTimeout: TimeInterval = 30
    private static let unreadBadgeUnknown = -1

    struct ApiResult {
        let statusCode: Int
        let success: Bool
        let unreadBadgeCount: Int

        init(statusCode: Int, success: Bool, unreadBadgeCount: Int = unreadBadgeUnknown) {
            self.statusCode = statusCode
            self.success = success
            self.unreadBadgeCount = unreadBadgeCount
        }
    }

    static func sendPushReply(data: ChatPushData, content: String) -> ApiResult {
        guard let replyToken = data.replyToken, !replyToken.isEmpty else {
            return ApiResult(statusCode: 401, success: false)
        }

        let body: [String: Any] = [
            "replyToken": replyToken,
            "content": content,
            "clientMutationId": "push-reply:\(data.messageId):\(Int(Date().timeIntervalSince1970 * 1000))",
        ]
        return postJson(path: "/chat/push-reply", token: nil, body: body)
    }

    private static func postJson(path: String, token: String?, body: [String: Any]) -> ApiResult {
        let apiBase = NativeApiConfig.getApiBaseUrl()
        guard let url = URL(string: apiBase + path) else {
            return ApiResult(statusCode: -1, success: false)
        }

        var request = URLRequest(
            url: url,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: readTimeout
        )
        request.httpMethod = "POST"
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        guard let payload = try? JSONSerialization.data(withJSONObject: body) else {
            return ApiResult(statusCode: -1, success: false)
        }
        request.httpBody = payload

        let semaphore = DispatchSemaphore(value: 0)
        var result = ApiResult(statusCode: -1, success: false)

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = connectTimeout
        config.timeoutIntervalForResource = readTimeout
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config)

        let task = session.dataTask(with: request) { data, response, _ in
            defer { semaphore.signal() }
            guard let http = response as? HTTPURLResponse else { return }
            let statusCode = http.statusCode
            let success = (200 ..< 300).contains(statusCode)
            let responseBody = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            let unreadBadgeCount = parseUnreadBadgeCount(responseBody)
            result = ApiResult(statusCode: statusCode, success: success, unreadBadgeCount: unreadBadgeCount)
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + readTimeout + connectTimeout)

        return result
    }

    private static func parseUnreadBadgeCount(_ responseBody: String) -> Int {
        guard let data = responseBody.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let count = json["unreadBadgeCount"] as? Int else {
            return unreadBadgeUnknown
        }
        return max(0, count)
    }
}
