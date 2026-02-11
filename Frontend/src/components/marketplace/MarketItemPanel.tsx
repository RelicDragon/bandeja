import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MarketItem } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { MarketItemEditForm } from './MarketItemEditForm';
import { MarketItemContextPanel } from '@/components/chat/contextPanels/MarketItemContextPanel';
import { resolveUserCurrency, DEFAULT_CURRENCY } from '@/utils/currency';
import { MapPin, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const listPath = location.pathname === '/marketplace/my' ? '/marketplace/my' : '/marketplace';
  const [imageIndex, setImageIndex] = useState(0);
  const [localItem, setLocalItem] = useState(item);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setLocalItem(item);
  }, [item]);

  const mediaUrls = (localItem.mediaUrls ?? []).filter((url): url is string => Boolean(url?.trim()));
  const hasMultipleImages = mediaUrls.length > 1;
  const hasPhoto = mediaUrls.length > 0;
  const userCurrency = resolveUserCurrency(user?.defaultCurrency) ?? DEFAULT_CURRENCY;

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
      <div className="h-full overflow-y-auto bg-transparent">
        <div className="max-w-2xl mx-auto p-4">
          <MarketItemEditForm item={localItem} onSave={handleEditSave} onCancel={() => setIsEditing(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="max-w-2xl mx-auto">
        {hasPhoto && (
          <div className="aspect-square bg-transparent relative flex-shrink-0">
            <img src={mediaUrls[imageIndex]} alt={localItem.title} className="w-full h-full object-cover" />
            {hasMultipleImages && (
              <>
                <button
                  type="button"
                  onClick={() => setImageIndex((i) => (i - 1 + mediaUrls.length) % mediaUrls.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setImageIndex((i) => (i + 1) % mediaUrls.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <ChevronRight size={20} />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {mediaUrls.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setImageIndex(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${i === imageIndex ? 'bg-white' : 'bg-white/50'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div className="p-6">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{localItem.title}</h1>
          {localItem.description && (
            <p className="mt-4 text-gray-600 dark:text-gray-300 leading-relaxed">{localItem.description}</p>
          )}
          {localItem.city && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <MapPin size={16} />
              {localItem.city.name}
            </div>
          )}
        </div>
        <div className="px-6 pb-6">
          <MarketItemContextPanel
            marketItem={localItem}
            userCurrency={userCurrency}
            onUpdate={handleUpdateAfterRemove}
            onItemUpdate={handleItemUpdate}
            onEdit={() => setIsEditing(true)}
            onNavigate={onClose}
            shouldNavigate={true}
          />
        </div>
      </div>
    </div>
  );
};
