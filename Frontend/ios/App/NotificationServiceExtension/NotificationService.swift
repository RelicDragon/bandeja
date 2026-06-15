import UserNotifications

class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?

    private static let maxDownloadBytes = 10 * 1024 * 1024

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        guard let mutableContent = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        bestAttemptContent = mutableContent

        guard
            let previewUrlString = Self.resolvePreviewImageUrl(from: mutableContent.userInfo),
            let previewUrl = URL(string: previewUrlString),
            Self.isAllowedHttpsUrl(previewUrl)
        else {
            contentHandler(mutableContent)
            return
        }

        downloadImage(from: previewUrl) { localUrl in
            if
                let localUrl,
                let attachment = try? UNNotificationAttachment(
                    identifier: "chat-preview",
                    url: localUrl,
                    options: [UNNotificationAttachmentOptionsTypeHintKey: "public.jpeg"]
                )
            {
                mutableContent.attachments = [attachment]
            }
            contentHandler(mutableContent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler, let bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    static func resolvePreviewImageUrl(from userInfo: [AnyHashable: Any]) -> String? {
        if let nested = userInfo["data"] as? [String: Any] {
            if let url = nested["previewImageUrl"] as? String {
                return normalizeUrl(url)
            }
        }
        if let url = userInfo["previewImageUrl"] as? String {
            return normalizeUrl(url)
        }
        return nil
    }

    private static func normalizeUrl(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    static func isAllowedHttpsUrl(_ url: URL) -> Bool {
        guard url.scheme == "https", let host = url.host, !host.isEmpty else {
            return false
        }
        return true
    }

    private func downloadImage(from url: URL, completion: @escaping (URL?) -> Void) {
        var request = URLRequest(url: url)
        request.timeoutInterval = 5

        URLSession.shared.downloadTask(with: request) { tempUrl, response, error in
            guard
                error == nil,
                let tempUrl,
                let http = response as? HTTPURLResponse,
                http.statusCode == 200
            else {
                completion(nil)
                return
            }

            if let contentLength = http.value(forHTTPHeaderField: "Content-Length"),
               let length = Int64(contentLength),
               length > Self.maxDownloadBytes
            {
                completion(nil)
                return
            }

            let destination = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension("jpg")

            do {
                let fileManager = FileManager.default
                if fileManager.fileExists(atPath: destination.path) {
                    try fileManager.removeItem(at: destination)
                }
                try fileManager.moveItem(at: tempUrl, to: destination)

                let attributes = try fileManager.attributesOfItem(atPath: destination.path)
                if let fileSize = attributes[.size] as? Int64, fileSize > Self.maxDownloadBytes {
                    try? fileManager.removeItem(at: destination)
                    completion(nil)
                    return
                }

                completion(destination)
            } catch {
                completion(nil)
            }
        }.resume()
    }
}
