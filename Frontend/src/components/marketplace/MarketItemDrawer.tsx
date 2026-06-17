import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Drawer, DrawerContent, DrawerClose } from '@/components/ui/Drawer';
import { MarketItem } from '@/types';
import { MarketItemPanel } from './MarketItemPanel';
import { X } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

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
  onItemUpdate,
}: MarketItemDrawerProps) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
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
      <DrawerContent className="flex max-h-[85vh] flex-col overflow-hidden !pb-0 p-0">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
        <motion.div
          key={localItem.id}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] }}
          className="min-h-0 flex-1 overflow-hidden"
        >
          <MarketItemPanel
            item={localItem}
            onClose={onClose}
            onItemUpdate={handleItemUpdate}
          />
        </motion.div>

        <div className="absolute right-3 top-5 z-50">
          <DrawerClose asChild>
            <motion.button
              type="button"
              whileTap={reduceMotion ? undefined : { scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20 }}
              className="rounded-full bg-black/50 p-2 text-white shadow-lg transition-colors hover:bg-black/70"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </motion.button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
