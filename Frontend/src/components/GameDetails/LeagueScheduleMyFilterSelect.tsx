import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface LeagueScheduleMyFilterOption {
  value: string;
  label: string;
}

interface LeagueScheduleMyFilterSelectProps {
  value: string;
  options: LeagueScheduleMyFilterOption[];
  onSelect: (value: string) => void;
}

export function LeagueScheduleMyFilterSelect({
  value,
  options,
  onSelect,
}: LeagueScheduleMyFilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? value,
    [options, value],
  );

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (buttonRef.current && buttonRef.current.contains(target)) ||
        (menuRef.current && menuRef.current.contains(target))
      ) {
        return;
      }
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();

    const handleReposition = () => {
      updateMenuPosition();
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updateMenuPosition]);

  const handleSelect = (next: string) => {
    onSelect(next);
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200"
      >
        <span className="min-w-0 truncate text-left text-sm font-medium text-gray-900 dark:text-white">
          {selectedLabel}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
              style={{
                position: 'fixed',
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
              }}
            >
              <div className="max-h-80 overflow-y-auto">
                {options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSelect(option.value)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ${
                        isSelected
                          ? 'bg-primary-50 dark:bg-primary-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <span
                        className={`min-w-0 flex-1 truncate text-sm font-medium ${
                          isSelected
                            ? 'text-primary-700 dark:text-primary-400'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {option.label}
                      </span>
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {isSelected ? (
                          <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
