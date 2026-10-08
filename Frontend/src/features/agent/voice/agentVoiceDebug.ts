const DEBUG_KEY = 'agentVoiceDebug';

/** The voice latency strip: dev builds, or `localStorage.agentVoiceDebug = '1'`. */
export function agentVoiceDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}
