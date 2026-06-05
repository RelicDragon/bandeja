import type { KeyboardEvent, MouseEvent } from 'react';

/** Shared chrome for panels revealed under a selected create-game template tile. */
export const createTemplateInlinePanelClass =
  'rounded-b-xl border-x-2 border-b-2 border-primary-500 bg-primary-50/50 px-3.5 pb-3 pt-2 dark:border-primary-500 dark:bg-primary-500/5';

export const createTemplateInlinePanelStopPropagationProps = {
  onClick: (e: MouseEvent) => e.stopPropagation(),
  onKeyDown: (e: KeyboardEvent) => e.stopPropagation(),
} as const;
