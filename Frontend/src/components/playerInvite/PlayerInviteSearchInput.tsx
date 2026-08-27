import { Search } from 'lucide-react';
import { forwardRef, useLayoutEffect, useRef, type MutableRefObject, type Ref } from 'react';

interface PlayerInviteSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as MutableRefObject<T | null>).current = value;
}

export const PlayerInviteSearchInput = forwardRef<HTMLInputElement, PlayerInviteSearchInputProps>(
  function PlayerInviteSearchInput({ value, onChange, placeholder }, forwardedRef) {
    const inputRef = useRef<HTMLInputElement>(null);
    const retainFocusRef = useRef(false);

    useLayoutEffect(() => {
      if (!retainFocusRef.current) return;
      const el = inputRef.current;
      if (!el) return;
      let cancelled = false;
      const restore = () => {
        if (cancelled || !retainFocusRef.current) return;
        if (document.activeElement !== el) el.focus({ preventScroll: true });
      };
      restore();
      queueMicrotask(restore);
      const frame = requestAnimationFrame(restore);
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
      };
    }, [value]);

    return (
      <div className="flex-shrink-0 px-2.5 pt-3 pb-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden
          />
          <input
            ref={(node) => {
              inputRef.current = node;
              setRef(forwardedRef, node);
            }}
            type="text"
            data-testid="player-invite-search"
            value={value}
            onChange={(e) => {
              retainFocusRef.current = true;
              onChange(e.target.value);
            }}
            onFocus={() => {
              retainFocusRef.current = true;
            }}
            onBlur={() => {
              requestAnimationFrame(() => {
                if (document.activeElement !== inputRef.current) {
                  retainFocusRef.current = false;
                }
              });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab') retainFocusRef.current = false;
            }}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full rounded-2xl border border-gray-200/90 bg-gray-50/80 py-3 ps-11 pe-4 text-sm text-gray-900 shadow-inner shadow-gray-900/[0.03] placeholder:text-gray-400 transition focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-800/60 dark:text-white dark:placeholder-gray-500 dark:focus:border-primary-500 dark:focus:bg-gray-900 dark:focus:ring-primary-400/20"
          />
        </div>
      </div>
    );
  },
);
