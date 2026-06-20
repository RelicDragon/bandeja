import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MarketItem } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { MarketItemEditForm } from './MarketItemEditForm';
import { MarketItemContextPanel } from '@/components/chat/contextPanels/MarketItemContextPanel';
import { resolveUserCurrency, DEFAULT_CURRENCY } from '@/utils/currency';
import { MapPin, MessageCircle } from 'lucide-react';
import { useMarketItemChatButton } from '@/components/chat/contextPanels/useMarketItemChatButton';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { MarketItemImageCarousel } from './MarketItemImageCarousel';
import { AnimatedChildrenStagger } from '@/components/motion/AnimatedChildrenStagger';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface MarketItemPanelProps {
  item: MarketItem;
  onClose: () => void;
  onItemUpdate?: (item: MarketItem | null) => void;
}

export const MarketItemPanel = ({
  item,
  onClose,
  onItemUpdate,
}: MarketItemPanelProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const reduceMotion = usePrefersReducedMotion();
  const listPath = location.pathname === '/marketplace/my' ? '/marketplace/my' : '/marketplace';
  const [localItem, setLocalItem] = useState(item);
  const [isEditing, setIsEditing] = useState(false);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setLocalItem(item);
  }, [item]);

  const mediaUrls = (localItem.mediaUrls ?? []).filter((url): url is string => Boolean(url?.trim()));
  const hasPhoto = mediaUrls.length > 0;
  const userCurrency = resolveUserCurrency(user?.defaultCurrency) ?? DEFAULT_CURRENCY;
  const { show: showChatButton, chatButtonProps } = useMarketItemChatButton(localItem, { onNavigate: onClose });
  const { translateCity } = useTranslatedGeo();

  const handleItemUpdate = (updatedItem: MarketItem) => {
    setLocalItem(updatedItem);
    onItemUpdate?.(updatedItem);
  };

  const handleUpdateAfterRemove = () => {
    onItemUpdate?.(null);
    onClose();
    navigate(listPath);
  };

  const handleEditSave = (updatedItem: MarketItem) => {
    setLocalItem(updatedItem);
    onItemUpdate?.(updatedItem);
    setIsEditing(false);
    onClose();
  };

  if (isEditing) {
    return (
      <div className="h-full min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y bg-transparent">
        <div className="mx-auto max-w-2xl p-4">
          <MarketItemEditForm item={localItem} onSave={handleEditSave} onCancel={() => setIsEditing(false)} />
        </div>
      </div>
    );
  }

  const chatButton = showChatButton ? (
    <motion.button
      type="button"
      onClick={chatButtonProps.onClick}
      disabled={chatButtonProps.disabled}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-md hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <MessageCircle size={18} />
      <span>{chatButtonProps.label}</span>
    </motion.button>
  ) : null;

  const detailSections = (
    <>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{localItem.title}</h1>
      {localItem.description && (
        <p className="mt-4 leading-relaxed text-gray-600 dark:text-gray-300">{localItem.description}</p>
      )}
      {localItem.city && (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <MapPin size={16} />
          {translateCity(localItem.city.id, localItem.city.name, localItem.city.country)}
        </div>
      )}
    </>
  );

  return (
    <div className="relative h-full min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y bg-transparent">
      <div className="mx-auto max-w-2xl">
        {!hasPhoto && chatButton && (
          <div className="absolute right-3 top-3 z-10 pt-12">{chatButton}</div>
        )}
        {hasPhoto && (
          <div className="relative">
            <MarketItemImageCarousel
              mediaUrls={mediaUrls}
              title={localItem.title}
              onImageClick={setFullscreenImageUrl}
            />
            {chatButton && (
              <div className="absolute left-0 right-0 top-full z-10 flex min-h-[2.75rem] justify-end px-4 py-4">
                {chatButton}
              </div>
            )}
          </div>
        )}
        <div className="p-6">
          {reduceMotion ? (
            detailSections
          ) : (
            <AnimatedChildrenStagger contentKey={localItem.id} className="space-y-0">
              {detailSections}
            </AnimatedChildrenStagger>
          )}
        </div>
        {fullscreenImageUrl && (
          <FullscreenImageViewer
            imageUrl={fullscreenImageUrl}
            isOpen={!!fullscreenImageUrl}
            onClose={() => setFullscreenImageUrl(null)}
          />
        )}
        <div className="px-6 pb-6">
          <AnimatedMount delay={reduceMotion ? 0 : 0.08}>
            <MarketItemContextPanel
              marketItem={localItem}
              userCurrency={userCurrency}
              onUpdate={handleUpdateAfterRemove}
              onItemUpdate={handleItemUpdate}
              onEdit={() => setIsEditing(true)}
              shouldNavigate={true}
            />
          </AnimatedMount>
        </div>
      </div>
    </div>
  );
};
