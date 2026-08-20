import type { HTMLAttributes } from 'react';

export function OverlayKeyboardBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-overlay-keyboard-body=""
      className={className ? `overlay-keyboard-body ${className}` : 'overlay-keyboard-body'}
      {...props}
    />
  );
}
