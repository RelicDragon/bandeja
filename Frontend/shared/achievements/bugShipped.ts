/** Habit ladder: bugs/suggestions that completed the tracker workflow. */
export const BUG_SHIPPED_THRESHOLDS = [1, 5, 10, 25, 50] as const;

/** @deprecated Prefer ruleKind HABIT_BUG_SHIPPED — kept for first-tier id checks. */
export const BUG_SHIPPED_ACHIEVEMENT_ID = 'habit_bug_shipped_1' as const;

export const BUG_SHIPPED_TERMINAL_STATUSES = ['FINISHED', 'ARCHIVED'] as const;

/** Workflow stages that must be reached before terminal (app enum uses TEST, not TESTING). */
export const BUG_SHIPPED_WORKFLOW_MIDDLE_STATUSES = ['IN_PROGRESS', 'TEST'] as const;

export type BugShippedStatus = (typeof BUG_SHIPPED_TERMINAL_STATUSES)[number];
export type BugShippedMiddleStatus = (typeof BUG_SHIPPED_WORKFLOW_MIDDLE_STATUSES)[number];

export function bugTypeCountsForShippedAchievement(bugType: string): boolean {
  return bugType !== 'QUESTION';
}

export function bugTerminalStatusForShipped(status: string): boolean {
  return status === 'FINISHED' || status === 'ARCHIVED';
}

export function bugWorkflowMiddleReached(params: {
  inProgressReachedAt?: Date | string | null;
  testingStartedAt?: Date | string | null;
}): boolean {
  return params.inProgressReachedAt != null || params.testingStartedAt != null;
}

export function isBugEligibleForShippedAchievement(bug: {
  bugType: string;
  status: string;
  inProgressReachedAt?: Date | string | null;
  testingStartedAt?: Date | string | null;
}): boolean {
  if (!bugTypeCountsForShippedAchievement(bug.bugType)) return false;
  if (!bugTerminalStatusForShipped(bug.status)) return false;
  return bugWorkflowMiddleReached(bug);
}

/** Lowercase status tokens stored in BUG_STATUS_CHANGED system messages. */
export function bugShippedMiddleStatusInMessageContent(content: string): boolean {
  return (
    content.includes('"status":"in_progress"') ||
    content.includes('"status":"test"')
  );
}
