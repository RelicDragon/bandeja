public enum WatchConnectivityEvent {
    public static let liveScoringRelay = "liveScoringRelay"
    public static let matchTimerRelay = "matchTimerRelay"
    public static let scoreUpdated = "scoreUpdated"
    public static let logout = "logout"
    /// Watch refreshed the shared session; phone must adopt the rotated credentials.
    public static let authRotated = "authRotated"
}
