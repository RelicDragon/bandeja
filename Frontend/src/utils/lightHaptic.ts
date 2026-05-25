const LIGHT_VIBRATE_MS = 12;

/** Short tap feedback on native WebView / Android; no-op where unsupported. */
export function lightHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(LIGHT_VIBRATE_MS);
    }
  } catch {
    // ignore
  }
}
