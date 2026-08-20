import { useRef, type ComponentProps, type Ref } from 'react';
import { SKIP_CARET_FOLLOW_SCROLL_ATTR } from './selectionPreserve';
import { usePreserveTextareaSelection } from './usePreserveTextareaSelection';

type SelectionPreservingTextareaProps = ComponentProps<'textarea'>;

const assignRef = (ref: Ref<HTMLTextAreaElement> | undefined, node: HTMLTextAreaElement | null) => {
  if (typeof ref === 'function') {
    ref(node);
    return;
  }
  if (ref) ref.current = node;
};

export function SelectionPreservingTextarea({
  value,
  onChange,
  onSelect,
  onCompositionStart,
  onCompositionEnd,
  className,
  ref,
  ...rest
}: SelectionPreservingTextareaProps) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const selection = usePreserveTextareaSelection(innerRef);

  return (
    <textarea
      {...rest}
      ref={(node) => {
        innerRef.current = node;
        assignRef(ref, node);
      }}
      value={value}
      className={['overflow-x-hidden', className].filter(Boolean).join(' ')}
      {...{ [SKIP_CARET_FOLLOW_SCROLL_ATTR]: '' }}
      onChange={(event) => {
        selection.captureFromElement(event.currentTarget);
        onChange?.(event);
      }}
      onSelect={(event) => {
        selection.captureFromElement(event.currentTarget);
        onSelect?.(event);
      }}
      onCompositionStart={(event) => {
        selection.onCompositionStart();
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        selection.onCompositionEnd(event.currentTarget);
        onCompositionEnd?.(event);
      }}
    />
  );
}
