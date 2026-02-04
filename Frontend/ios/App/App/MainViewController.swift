import UIKit
import Capacitor

final class MainViewController: CAPBridgeViewController {
    private var splashOverlay: UIView?
    private var logoImageView: UIImageView?

    private var isLoadingObservation: NSKeyValueObservation?
    private var progressObservation: NSKeyValueObservation?
    private var didStartAnyLoad = false
    private var hasDismissedSplash = false
    private var timeoutWorkItem: DispatchWorkItem?

    override func viewDidLoad() {
        super.viewDidLoad()
        installSplashOverlayIfNeeded()
        startObservingWebViewLoadState()
        scheduleFallbackDismiss()
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

        let logo = UIImageView(image: UIImage(named: "Logo"))
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
}

