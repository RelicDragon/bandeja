import type { ReactNode } from 'react';
import {
  createTemplateInlinePanelClass,
  createTemplateInlinePanelStopPropagationProps,
} from './createTemplateInlinePanelChrome';

type Props = {
  children: ReactNode;
  'aria-label'?: string;
  sectionLabel?: string;
};

export function CreateTemplateInlinePanel({ children, 'aria-label': ariaLabel, sectionLabel }: Props) {
  return (
    <div
      className={createTemplateInlinePanelClass}
      {...createTemplateInlinePanelStopPropagationProps}
      role="group"
      aria-label={ariaLabel}
    >
      {sectionLabel ? (
        <div className="mb-2 text-[11px] font-medium text-gray-600 dark:text-gray-400">{sectionLabel}</div>
      ) : null}
      {children}
    </div>
  );
}
