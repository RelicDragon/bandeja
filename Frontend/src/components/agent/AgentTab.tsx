import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useDesktop } from '@/hooks/useDesktop';
import { ResizableSplitter } from '@/components/ResizableSplitter';
import { SplitViewLeftPanel } from '@/components/SplitViewPanels';
import { useShellNavStore } from '@/store/shellNavStore';
import { AgentChatList, type AgentOpenChatOptions } from './AgentChatList';
import { AgentOrb } from './AgentOrb';
import { AgentChatView } from './AgentChatView';
import { AgentPermissionsScreen } from './AgentPermissionsScreen';
import { AGENT_INITIAL_PROMPT_STATE_KEY, AGENT_START_VOICE_STATE_KEY } from './agentExamplePrompts';

function useOpenAgentChat(selectedChatId: string | null) {
  const navigate = useNavigate();
  return useCallback(
    (chatId: string, opts?: AgentOpenChatOptions) => {
      const state =
        opts?.initialPrompt || opts?.startVoice
          ? {
              ...(opts.initialPrompt ? { [AGENT_INITIAL_PROMPT_STATE_KEY]: opts.initialPrompt } : {}),
              ...(opts.startVoice ? { [AGENT_START_VOICE_STATE_KEY]: true } : {}),
            }
          : undefined;
      // Desktop switches chats in place; from the list (no selection) opening is a push so Back returns.
      navigate(`/ai/${encodeURIComponent(chatId)}`, { replace: selectedChatId != null, state });
    },
    [navigate, selectedChatId],
  );
}

/**
 * My → AI (`/?tab=ai`) and, on desktop, `/ai/:chatId` (list | thread split view).
 * On mobile an open chat is its own full-screen route (`AgentChatRoute`).
 */
export function AgentTab({ selectedChatId = null }: { selectedChatId?: string | null }) {
  const { t } = useTranslation();
  const isDesktop = useDesktop();
  const openChat = useOpenAgentChat(isDesktop ? selectedChatId : null);
  const bottomTabsVisible = useShellNavStore((s) => s.bottomTabsVisible);

  if (!isDesktop) {
    return (
      <div className="pb-4">
        <AgentChatList onOpenChat={openChat} />
        <AgentPermissionsScreen />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-0 overflow-hidden"
      style={{ top: 'calc(var(--app-header-height, 4rem) + env(safe-area-inset-top, 0px))' }}
    >
      <ResizableSplitter
        defaultLeftWidth={32}
        minLeftWidth={280}
        maxLeftWidth={480}
        leftPanel={
          // Bottom tabs live in the list panel (like Chats), so they never cover the composer.
          <SplitViewLeftPanel bottomTabsVisible={bottomTabsVisible}>
            <AgentChatList fillHeight selectedChatId={selectedChatId} onOpenChat={openChat} />
          </SplitViewLeftPanel>
        }
        rightPanel={
          <div className="relative h-full bg-gray-50 dark:bg-gray-900">
            {selectedChatId ? (
              <AgentChatView key={selectedChatId} chatId={selectedChatId} embedded />
            ) : (
              <div className="relative flex h-full flex-col items-center justify-center gap-5 overflow-hidden text-gray-500 dark:text-gray-400">
                <div className="agent-aurora opacity-30" aria-hidden />
                <AgentOrb size={88} />
                <p className="relative text-lg font-medium">{t('agent.selectChat')}</p>
              </div>
            )}
          </div>
        }
      />
      <AgentPermissionsScreen />
    </div>
  );
}

/** `/ai/:chatId` — mobile full-screen thread, desktop split view. */
export function AgentChatRoute() {
  const { chatId } = useParams<{ chatId: string }>();
  const isDesktop = useDesktop();
  if (!chatId) return null;
  if (isDesktop) return <AgentTab selectedChatId={chatId} />;
  return (
    <>
      <AgentChatView key={chatId} chatId={chatId} />
      <AgentPermissionsScreen />
    </>
  );
}
