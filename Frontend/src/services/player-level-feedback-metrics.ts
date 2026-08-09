export type PlayerLevelFeedbackMetric =
  | 'prompt_seen'
  | 'opened'
  | 'skipped'
  | 'completed'
  | 'edited'
  | 'save_failed';

export type PlayerLevelFeedbackMetricDetail = {
  event: PlayerLevelFeedbackMetric;
  completedCount?: number;
  totalCount?: number;
};

export const PLAYER_LEVEL_FEEDBACK_METRIC_EVENT = 'bandeja-player-level-feedback-metric';

export function recordPlayerLevelFeedbackMetric(
  detail: PlayerLevelFeedbackMetricDetail,
): void {
  if (import.meta.env.DEV) {
    console.info('[bandeja-player-level-feedback]', detail);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<PlayerLevelFeedbackMetricDetail>(
        PLAYER_LEVEL_FEEDBACK_METRIC_EVENT,
        { detail },
      ),
    );
  }
}
