import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Bug, MarketItem, PriceCurrency } from '@/types';
import type { GroupChannel } from '@/api/chat';
import { BugContextPanel } from './BugContextPanel';
import { MarketItemContextPanel } from './MarketItemContextPanel';
import { useAuthStore } from '@/store/authStore';
import { resolveUserCurrency } from '@/utils/currency';

interface ChatContextPanelProps {
  contextType: 'GAME' | 'USER' | 'GROUP';
  bug?: Bug | null;
  marketItem?: MarketItem | null;
  groupChannel?: GroupChannel | null;
  canEditBug?: boolean;
  onUpdate?: () => void;
  onJoinChannel?: () => void;
}

/**
 * Universal collapsible panel wrapper for context-specific panels in chat view.
 * - Handles collapsible/expandable functionality
 * - Mounts appropriate context panel based on chat type
 * - Positioned absolutely to overhang chat content
 */
export const ChatContextPanel = ({
  contextType,
  bug,
  marketItem,
  groupChannel: _groupChannel,
  canEditBug = false,
  onUpdate,
  onJoinChannel,
}: ChatContextPanelProps) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const currentUser = useAuthStore((state) => state.user);
  const userCurrency = resolveUserCurrency(currentUser?.defaultCurrency) as PriceCurrency;

  // Determine which context panel to show
  const isBugChat = contextType === 'GROUP' && !!bug;
  const isMarketItemChat = contextType === 'GROUP' && !!marketItem;

  // Don't render if no context to show
  if (!isBugChat && !isMarketItemChat) {
    return null;
  }

  // Render the appropriate context panel
  const renderContextPanel = () => {
    if (isBugChat && bug) {
      return (
        <BugContextPanel
          bug={bug}
          canEdit={canEditBug}
          onUpdate={onUpdate}
        />
      );
    }

    if (isMarketItemChat && marketItem) {
      return (
        <MarketItemContextPanel
          marketItem={marketItem}
          userCurrency={userCurrency}
          onUpdate={onUpdate}
          onJoinChannel={onJoinChannel}
        />
      );
    }

    return null;
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-30 flex justify-center px-4 pointer-events-none">
      <div className="w-full max-w-[90%] pointer-events-auto">
        {/* Unified Panel with Integrated Toggle */}
        <div className="bg-gradient-to-b from-gray-50/80 to-white/80 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-sm border-x border-b border-gray-200 dark:border-gray-700 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] rounded-b-xl transition-all duration-300 ease-in-out">
          {/* Panel Content */}
          <div
            className={`bg-gradient-to-b from-white via-white to-gray-50/90 dark:from-gray-800 dark:via-gray-800 dark:to-gray-900/90 overflow-hidden transition-all duration-300 ease-in-out ${
              isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-4 py-4">
              {renderContextPanel()}
            </div>
          </div>

          {/* Toggle Button (Integrated Handle) */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all duration-200 group uppercase tracking-wider"
          >
            <span>
              {isExpanded ? t('common.hideDetails', { defaultValue: 'Hide Details' }) : t('common.showDetails', { defaultValue: 'Show Details' })}
            </span>
            <div className="transition-transform duration-200 group-hover:scale-110">
              {isExpanded ? (
                <ChevronUp size={16} className="transition-transform group-hover:-translate-y-0.5" />
              ) : (
                <ChevronDown size={16} className="transition-transform group-hover:translate-y-0.5" />
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
