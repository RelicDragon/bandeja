import React from 'react';

type MentionSuggestionsContainerProps = {
  children: React.ReactNode;
};

export function MentionSuggestionsContainer({ children }: MentionSuggestionsContainerProps) {
  if (!React.isValidElement(children)) {
    return <>{children}</>;
  }

  const ul = children as React.ReactElement<{ className?: string }>;
  const listClassName = ['mention-suggestions-list', ul.props.className].filter(Boolean).join(' ');

  return (
    <div className="mention-suggestions-shell">
      {React.cloneElement(ul, { className: listClassName })}
    </div>
  );
}
