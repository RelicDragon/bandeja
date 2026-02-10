import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { ShoppingBag, Ban } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';

interface ConfirmRemoveMarketItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (status: 'SOLD' | 'WITHDRAWN') => void;
  isLoading?: boolean;
}

export const ConfirmRemoveMarketItemModal = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
}: ConfirmRemoveMarketItemModalProps) => {
  const { t } = useTranslation();

  const handleMarkAsSold = () => {
    onConfirm('SOLD');
  };

  const handleWithdraw = () => {
    onConfirm('WITHDRAWN');
  };

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="confirm-remove-market-item-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('marketplace.removeItem', { defaultValue: 'Remove Item' })}</DialogTitle>
        </DialogHeader>

        <DialogDescription className="py-4">
          {t('marketplace.removeItemDescription', {
            defaultValue: 'What would you like to do with this listing?'
          })}
        </DialogDescription>

        <div className="space-y-3">
          {/* Mark as Sold Button */}
          <button
            onClick={handleMarkAsSold}
            disabled={isLoading}
            className="w-full p-4 rounded-lg border-2 border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                <ShoppingBag size={20} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-emerald-900 dark:text-emerald-100">
                  {t('marketplace.markAsSold', { defaultValue: 'Mark as Sold' })}
                </div>
                <div className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                  {t('marketplace.markAsSoldDescription', {
                    defaultValue: 'Item was successfully sold'
                  })}
                </div>
              </div>
            </div>
          </button>

          {/* Withdraw Button */}
          <button
            onClick={handleWithdraw}
            disabled={isLoading}
            className="w-full p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center flex-shrink-0">
                <Ban size={20} className="text-gray-600 dark:text-gray-400" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  {t('marketplace.withdrawFromSale', { defaultValue: 'Withdraw from Sale' })}
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                  {t('marketplace.withdrawFromSaleDescription', {
                    defaultValue: 'Remove listing without marking as sold'
                  })}
                </div>
              </div>
            </div>
          </button>
        </div>

        <DialogFooter className="mt-6">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
