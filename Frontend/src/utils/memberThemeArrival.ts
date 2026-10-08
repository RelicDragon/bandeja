/**
 * One-shot "arrival" gate for member theme art (docs/domains/premium-appearance.md).
 * `html.member-theme-arrival` is set when a member theme is first applied in a session (cold start,
 * theme change, foreground after a long background) and removed ARRIVAL_MS after a member header is
 * on screen, so header remounts (e.g. leaving a full-screen thread) never replay the arrival.
 */
export const MEMBER_THEME_ARRIVAL_CLASS = 'member-theme-arrival';
export const MEMBER_THEME_ARRIVAL_MS = 1600;
const LONG_BACKGROUND_MS = 10 * 60 * 1000;

let armed = false;
let headerVisible = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let hiddenAt: number | null = null;
let listening = false;

function clearTimer() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

export function cancelMemberThemeArrival(): void {
  armed = false;
  clearTimer();
  document.documentElement.classList.remove(MEMBER_THEME_ARRIVAL_CLASS);
}

function startCountdown() {
  clearTimer();
  timer = setTimeout(cancelMemberThemeArrival, MEMBER_THEME_ARRIVAL_MS);
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
  hiddenAt = null;
  if (away > LONG_BACKGROUND_MS) armMemberThemeArrival();
}

/** Plays the arrival once: now if a member header is visible, otherwise when the next one mounts. */
export function armMemberThemeArrival(): void {
  const root = document.documentElement;
  if (!root.dataset.memberTheme) {
    cancelMemberThemeArrival();
    return;
  }
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  clearTimer();
  root.classList.remove(MEMBER_THEME_ARRIVAL_CLASS);
  // Restart keyframes that may still be running from a previous arrival.
  void root.offsetWidth;
  root.classList.add(MEMBER_THEME_ARRIVAL_CLASS);
  armed = true;
  if (headerVisible) startCountdown();
}

export function setMemberThemeArrivalHeaderVisible(visible: boolean): void {
  headerVisible = visible;
  if (visible && armed && timer === undefined) startCountdown();
}
