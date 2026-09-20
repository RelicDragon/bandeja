import Foundation

/// Keeps `@MainActor @Observable` instances alive for the whole test process.
/// Deallocating one inside a test body trips the watchOS simulator's isolated-deinit
/// runtime shim (`swift_task_deinitOnExecutorMainActorBackDeploy` → malloc abort);
/// leaking a few small objects in tests is harmless.
@MainActor
enum TestRetain {
    private static var retained: [AnyObject] = []

    static func keep(_ object: AnyObject) {
        retained.append(object)
    }
}
