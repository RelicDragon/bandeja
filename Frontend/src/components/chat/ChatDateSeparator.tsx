import React from 'react';

interface ChatDateSeparatorProps {
  label: string;
}

export const ChatDateSeparator: React.FC<ChatDateSeparatorProps> = ({ label }) => (
  <div
    className="flex justify-center py-2 pointer-events-none select-none"
    role="separator"
    aria-label={label}
  >
    <span className="text-[10px] leading-none text-slate-500 dark:text-slate-400">{label}</span>
  </div>
);
