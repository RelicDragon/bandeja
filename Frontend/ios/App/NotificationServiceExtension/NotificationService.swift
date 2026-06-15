import Intents
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

        decorateCommunicationNotification(mutableContent) { decoratedContent in
            self.attachPreviewIfNeeded(to: decoratedContent) { finalContent in
                contentHandler(finalContent)
            }
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler, let bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    private func decorateCommunicationNotification(
        _ content: UNMutableNotificationContent,
        completion: @escaping (UNMutableNotificationContent) -> Void
    ) {
        guard ChatCommunicationIntentBuilder.shouldDecorate(userInfo: content.userInfo) else {
            completion(content)
            return
        }

        let avatarUrl = ChatCommunicationIntentBuilder.resolveSenderAvatarUrl(from: content.userInfo)
        if let avatarUrl, Self.isAllowedHttpsUrl(avatarUrl) {
            downloadImage(from: avatarUrl) { localUrl in
                let senderImage = localUrl.flatMap { try? Data(contentsOf: $0) }.flatMap { INImage(imageData: $0) }
                self.applyCommunicationIntent(to: content, senderImage: senderImage, completion: completion)
            }
            return
        }

        applyCommunicationIntent(to: content, senderImage: nil, completion: completion)
    }

    private func applyCommunicationIntent(
        to content: UNMutableNotificationContent,
        senderImage: INImage?,
        completion: @escaping (UNMutableNotificationContent) -> Void
    ) {
        guard let intent = ChatCommunicationIntentBuilder.makeIntent(
            userInfo: content.userInfo,
            messageBody: content.body,
            senderImage: senderImage
        ) else {
            completion(content)
            return
        }

        do {
            let updated = try content.updating(from: intent)
            guard let mutableUpdated = updated.mutableCopy() as? UNMutableNotificationContent else {
                completion(content)
                return
            }
            bestAttemptContent = mutableUpdated
            completion(mutableUpdated)
        } catch {
            NSLog("[push-reply] communication notification decorate failed: %@", error.localizedDescription)
            completion(content)
        }
    }

    private func attachPreviewIfNeeded(
        to content: UNMutableNotificationContent,
        completion: @escaping (UNMutableNotificationContent) -> Void
    ) {
        guard
            let previewUrlString = Self.resolvePreviewImageUrl(from: content.userInfo),
            let previewUrl = URL(string: previewUrlString),
            Self.isAllowedHttpsUrl(previewUrl)
        else {
            completion(content)
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
                content.attachments = [attachment]
                self.bestAttemptContent = content
            }
            completion(content)
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
