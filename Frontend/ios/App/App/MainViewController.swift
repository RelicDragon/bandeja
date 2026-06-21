import UIKit
import WebKit
import Capacitor

final class MainViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    static let brandingSplashLogoKey = "brandingSplashLogoKey"

    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(AuthBridgePlugin())
        bridge?.registerPluginInstance(LiveScoringBridgePlugin())
        bridge?.registerPluginInstance(BandejaPushDelegatePlugin())
        bridge?.registerPluginInstance(ChatIntentBridgePlugin())
    }

    override public func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.allowsPictureInPictureMediaPlayback = true
        return config
    }

    private var splashOverlay: UIView?
    private var logoImageView: UIImageView?

    private var isLoadingObservation: NSKeyValueObservation?
    private var progressObservation: NSKeyValueObservation?
    private var didStartAnyLoad = false
    private var hasDismissedSplash = false
    private var timeoutWorkItem: DispatchWorkItem?
    private var swipeBackInstalled = false
    private var swipeBackRetryCount = 0
    private let swipeBackMaxRetries = 50
    private var swipeBackPanRecognizer: UIPanGestureRecognizer?
    private let swipeBackEdgeWidth: CGFloat = 24
    private let swipeBackMinTranslationX: CGFloat = 60

    override func viewDidLoad() {
        super.viewDidLoad()
        installSplashOverlayIfNeeded()
        startObservingWebViewLoadState()
        scheduleFallbackDismiss()
        installSwipeBackGestureIfNeeded()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startLogoAnimation()
    }

    private func installSplashOverlayIfNeeded() {
        guard splashOverlay == nil else { return }

        let overlay = UIView()
        overlay.translatesAutoresizingMaskIntoConstraints = false
        overlay.backgroundColor = UIColor(red: 171/255, green: 222/255, blue: 227/255, alpha: 1)

        let logo = UIImageView(image: Self.resolveSplashLogoImage())
        logo.translatesAutoresizingMaskIntoConstraints = false
        logo.contentMode = .scaleAspectFit

        overlay.addSubview(logo)
        view.addSubview(overlay)

        NSLayoutConstraint.activate([
            overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            overlay.topAnchor.constraint(equalTo: view.topAnchor),
            overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            logo.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            logo.widthAnchor.constraint(equalToConstant: 220),
            logo.heightAnchor.constraint(equalToConstant: 220),
        ])

        splashOverlay = overlay
        logoImageView = logo
    }

    private func startLogoAnimation() {
        guard let logoImageView else { return }
        guard logoImageView.layer.animationKeys()?.isEmpty ?? true else { return }

        logoImageView.transform = .identity
        UIView.animate(
            withDuration: 0.9,
            delay: 0,
            usingSpringWithDamping: 0.55,
            initialSpringVelocity: 0.9,
            options: [.autoreverse, .repeat, .allowUserInteraction],
            animations: {
                logoImageView.transform = CGAffineTransform(rotationAngle: CGFloat.pi / 4.0)
            },
            completion: nil
        )
    }

    private func startObservingWebViewLoadState() {
        guard let webView = self.webView else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                self?.startObservingWebViewLoadState()
            }
            return
        }

        isLoadingObservation = webView.observe(\.isLoading, options: [.initial, .new]) { [weak self] webView, _ in
            guard let self else { return }

            if webView.isLoading {
                self.didStartAnyLoad = true
                return
            }

            if self.didStartAnyLoad {
                self.dismissSplashIfNeeded()
            }
        }

        progressObservation = webView.observe(\.estimatedProgress, options: [.initial, .new]) { [weak self] webView, _ in
            guard let self else { return }

            if webView.estimatedProgress > 0 {
                self.didStartAnyLoad = true
            }

            if !webView.isLoading && webView.estimatedProgress >= 0.95 {
                self.dismissSplashIfNeeded()
            }
        }
    }

    private func scheduleFallbackDismiss() {
        timeoutWorkItem?.cancel()

        let item = DispatchWorkItem { [weak self] in
            self?.dismissSplashIfNeeded()
        }
        timeoutWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 12.0, execute: item)
    }

    private static func resolveSplashLogoImage() -> UIImage? {
        let logoKey = UserDefaults.standard.string(forKey: brandingSplashLogoKey) ?? "padel"
        let candidates: [String]
        switch logoKey {
        case "racket":
            candidates = ["public/orig_icons/racket-blue/bandeja-blue-flat.png"]
        case "tennis":
            candidates = ["public/bandeja2-tennis-white-tr.png"]
        case "pickleball":
            candidates = ["public/bandeja2-pickleball-white-tr.png"]
        case "badminton":
            candidates = ["public/bandeja2-badminton-white-tr.png"]
        case "table_tennis":
            candidates = ["public/bandeja2-table-tennis-white-tr.png"]
        case "squash":
            candidates = ["public/bandeja2-squash-white-tr.png"]
        default:
            candidates = ["public/bandeja2-white-tr.png"]
        }

        for relativePath in candidates {
            let parts = relativePath.split(separator: "/")
            guard let fileName = parts.last else { continue }
            let base = (fileName as NSString).deletingPathExtension
            let ext = (fileName as NSString).pathExtension.isEmpty ? "png" : (fileName as NSString).pathExtension
            let subdirectory = parts.count > 1 ? parts.dropLast().joined(separator: "/") : nil
            if let url = Bundle.main.url(forResource: base, withExtension: ext, subdirectory: subdirectory),
               let data = try? Data(contentsOf: url),
               let image = UIImage(data: data) {
                return image
            }
        }

        return UIImage(named: "Logo")
    }

    private func dismissSplashIfNeeded() {
        guard !hasDismissedSplash else { return }
        hasDismissedSplash = true

        timeoutWorkItem?.cancel()
        timeoutWorkItem = nil

        isLoadingObservation = nil
        progressObservation = nil
        didStartAnyLoad = false

        guard let overlay = splashOverlay else { return }

        logoImageView?.layer.removeAllAnimations()

        UIView.animate(withDuration: 0.25, animations: {
            overlay.alpha = 0
        }, completion: { [weak self] _ in
            overlay.removeFromSuperview()
            self?.splashOverlay = nil
            self?.logoImageView = nil
        })
    }

    private func installSwipeBackGestureIfNeeded() {
        guard !swipeBackInstalled else { return }
        guard let webView = self.webView else {
            guard swipeBackRetryCount < swipeBackMaxRetries else { return }
            swipeBackRetryCount += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                self?.installSwipeBackGestureIfNeeded()
            }
            return
        }
        swipeBackInstalled = true
        webView.allowsBackForwardNavigationGestures = false
        let recognizer = UIPanGestureRecognizer(target: self, action: #selector(handleSwipeBackPan(_:)))
        recognizer.delegate = self
        recognizer.cancelsTouchesInView = false
        webView.addGestureRecognizer(recognizer)
        swipeBackPanRecognizer = recognizer
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard gestureRecognizer === swipeBackPanRecognizer,
              let webView = self.webView else { return true }
        return touch.location(in: webView).x <= swipeBackEdgeWidth
    }

    @objc private func handleSwipeBackPan(_ recognizer: UIPanGestureRecognizer) {
        guard recognizer.state == .ended, let webView = self.webView else { return }
        let translation = recognizer.translation(in: webView)
        guard translation.x >= swipeBackMinTranslationX,
              abs(translation.x) > abs(translation.y) else { return }
        let script = "window.dispatchEvent(new CustomEvent('capacitorBackButton'))"
        webView.evaluateJavaScript(script) { _, error in
            if let error = error {
                NSLog("iOS swipe-back JS dispatch failed: %@", error.localizedDescription)
            }
        }
    }
}

