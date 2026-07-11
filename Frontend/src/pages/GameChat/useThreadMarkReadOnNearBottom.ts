import { useEffect, useRef } from 'react';

/** Mark read when the user scrolls back to the bottom of an open thread. */
export function useThreadMarkReadOnNearBottom(
  subscribe: (listener: () => void) => () => void,
  getNearBottom: () => boolean,
  markRead: () => void
): void {
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  useEffect(() => {
    let prevNear = getNearBottom();
    return subscribe(() => {
      const near = getNearBottom();
      if (!prevNear && near) {
        markReadRef.current();
      }
      prevNear = near;
    });
  }, [subscribe, getNearBottom]);
}
