import React, { useEffect, useRef } from 'react';

type MentionSuggestionsContainerProps = {
  children: React.ReactNode;
};

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

function bindMentionListScrollTrap(list: HTMLUListElement): () => void {
  const onWheel = (e: WheelEvent) => {
    e.stopPropagation();
    if (list.scrollHeight <= list.clientHeight + 1) {
      e.preventDefault();
      return;
    }
    const atTop = list.scrollTop <= 0;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
    if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
      e.preventDefault();
    }
  };

  list.addEventListener('wheel', onWheel, { passive: false });
  return () => list.removeEventListener('wheel', onWheel);
}

export function MentionSuggestionsContainer({ children }: MentionSuggestionsContainerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  if (!React.isValidElement(children)) {
    return <>{children}</>;
  }

  const ul = children as React.ReactElement<{ className?: string; ref?: React.Ref<HTMLUListElement> }>;
  const listClassName = ['mention-suggestions-list', ul.props.className].filter(Boolean).join(' ');

  const setListRef = (node: HTMLUListElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (node) {
      cleanupRef.current = bindMentionListScrollTrap(node);
    }
  };

  return (
    <div className="mention-suggestions-shell">
      {React.cloneElement(ul, {
        className: listClassName,
        ref: mergeRefs(ul.props.ref, setListRef),
      })}
    </div>
  );
}
