import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, DrawerContent, DrawerClose } from '@/components/ui/Drawer';
import { MarketItem } from '@/types';
import { MarketItemPanel } from './MarketItemPanel';
import { X } from 'lucide-react';

export interface MarketItemDrawerProps {
  item: MarketItem;
  isOpen: boolean;
  onClose: () => void;
  onItemUpdate?: (item: MarketItem | null) => void;
}

export const MarketItemDrawer = ({
  item,
  isOpen,
  onClose,
  onItemUpdate
}: MarketItemDrawerProps) => {
  const { t } = useTranslation();
  const [localItem, setLocalItem] = useState(item);

  useEffect(() => {
    if (isOpen) {
      setLocalItem(item);
    }
  }, [isOpen, item]);



  const handleItemUpdate = (updated: MarketItem | null) => {
    setLocalItem(updated ?? item);
    onItemUpdate?.(updated);
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="flex flex-col p-0 max-h-[80vh] overflow-hidden !pb-0">
          <MarketItemPanel
            item={localItem}
            onClose={onClose}
            onItemUpdate={handleItemUpdate}
          />

        <div className="absolute top-3 right-3 z-50">
          <DrawerClose asChild>
            <button
              type="button"
              className="p-2 rounded-full bg-black/50 text-white shadow-lg hover:bg-black/70 transition-colors"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
