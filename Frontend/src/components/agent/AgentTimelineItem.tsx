import { memo } from 'react';
import type { AgentMessageFeedback } from '@shared/agentContract';
import type { ConfirmAgentActionVars } from '@/queries/agent/useAgentQueries';
import type { AgentRenderItem } from '@/features/agent/agentTimeline';
import { stripAgentRefTokens } from '@/features/agent/agentBookingCards';
import { sameAgentRenderItem } from '@/features/agent/agentRenderItemEqual';
import { AgentStreamingMarkdown } from './AgentStreamingMarkdown';
import { AgentMessageActions, AgentMessageEditor } from './AgentMessageActions';
import { AgentToolGroup } from './AgentToolGroup';
import { AgentActionCard } from './AgentActionCard';
import { AgentClientActionCard } from './AgentClientActionCard';

type UserItem = Extract<AgentRenderItem, { kind: 'user' }>;

/** Stable callbacks (one object for the whole thread) so settled items skip re-rendering. */
export interface AgentTimelineHandlers {
  startEdit: (messageId: string) => void;
  cancelEdit: (key: string) => void;
  submitEdit: (item: UserItem, text: string) => void;
  regenerate: () => void;
  feedback: (messageId: string, rating: AgentMessageFeedback | null, comment?: string) => void;
  confirm: (vars: ConfirmAgentActionVars) => void;
  reject: (actionId: string) => void;
  alwaysAllow: (actionId: string) => void;
  runClientAction: (actionId: string) => void;
}

export interface AgentTimelineItemProps {
  item: AgentRenderItem;
  handlers: AgentTimelineHandlers;
  /** User item: its inline editor is open. */
  editing: boolean;
  /** A run or send is in flight (or a limit pauses sending): no edit / regenerate. */
  editBlocked: boolean;
  /** Assistant text that closes a reply turn: the whole turn's plain text (Copy / Share). */
  replyText: string | undefined;
  /** Arrived after the chat opened: types in instead of showing at once. */
  animate: boolean;
  /** The newest reply with no run live: offers Regenerate. */
  canRegenerate: boolean;
  feedback: AgentMessageFeedback | null;
  busy: 'confirm' | 'always' | 'reject' | null;
}

function propsEqual(a: AgentTimelineItemProps, b: AgentTimelineItemProps): boolean {
  return (
    a.handlers === b.handlers &&
    a.editing === b.editing &&
    a.editBlocked === b.editBlocked &&
    a.replyText === b.replyText &&
    a.animate === b.animate &&
    a.canRegenerate === b.canRegenerate &&
    a.feedback === b.feedback &&
    a.busy === b.busy &&
    sameAgentRenderItem(a.item, b.item)
  );
}

/** One thread row (bubble, reply text, tool group or confirmation card). */
export const AgentTimelineItem = memo(function AgentTimelineItem({
  item,
  handlers,
  editing,
  editBlocked,
  replyText,
  animate,
  canRegenerate,
  feedback,
  busy,
}: AgentTimelineItemProps) {
  switch (item.kind) {
    case 'user':
      if (editing) {
        return (
          <AgentMessageEditor
            initialText={stripAgentRefTokens(item.text)}
            onCancel={() => handlers.cancelEdit(item.key)}
            onSubmit={(text) => handlers.submitEdit(item, text)}
            submitDisabled={editBlocked}
          />
        );
      }
      return (
        <div className="group">
          <UserBubble text={item.text} />
          <AgentMessageActions
            align="end"
            getText={() => stripAgentRefTokens(item.text)}
            onEdit={() => handlers.startEdit(item.messageId)}
            editDisabled={editBlocked}
          />
        </div>
      );
    case 'assistantText': {
      const messageId = item.messageId;
      return (
        <div className="group max-w-full text-gray-900 dark:text-gray-100">
          <AgentStreamingMarkdown text={item.text} streaming={item.streaming} animate={animate} />
          {replyText ? (
            <AgentMessageActions
              align="start"
              getText={() => replyText}
              onRegenerate={canRegenerate ? handlers.regenerate : undefined}
              regenerateDisabled={editBlocked}
              feedback={feedback}
              onFeedback={messageId ? (rating, comment) => handlers.feedback(messageId, rating, comment) : undefined}
            />
          ) : null}
        </div>
      );
    }
    case 'toolGroup':
      return <AgentToolGroup tools={item.tools} />;
    case 'action':
      if (item.action?.execution === 'client') {
        return (
          <AgentClientActionCard
            action={item.action}
            rejecting={busy === 'reject'}
            onReject={handlers.reject}
            onRun={handlers.runClientAction}
          />
        );
      }
      return (
        <AgentActionCard
          action={item.action}
          busy={busy}
          onConfirm={handlers.confirm}
          onReject={handlers.reject}
          onAlwaysAllow={handlers.alwaysAllow}
        />
      );
  }
}, propsEqual);

export function UserBubble({ text, sending = false }: { text: string; sending?: boolean }) {
  return (
    <div className="flex justify-end">
      <div
        dir="auto"
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-md bg-primary-600 px-3.5 py-2 text-[15px] leading-relaxed text-white transition-opacity ${
          sending ? 'opacity-70' : ''
        }`}
      >
        {stripAgentRefTokens(text)}
      </div>
    </div>
  );
}
