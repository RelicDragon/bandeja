import React from 'react';

interface ChatDateSeparatorProps {
  label: string;
}

export const ChatDateSeparator: React.FC<ChatDateSeparatorProps> = ({ label }) => (
  <div
    className="flex justify-center py-1.5 pointer-events-none select-none"
    role="separator"
    aria-label={label}
  >
    <span className="rounded-full bg-gray-200/70 px-2.5 py-1 text-[10px] font-medium leading-none text-gray-600 shadow-sm backdrop-blur-sm dark:bg-gray-700/70 dark:text-gray-300">
      {label}
    </span>
  </div>
);
