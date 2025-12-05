import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Game, PriceType, PriceCurrency } from '@/types';
import { Select } from '@/components';
import { gamesApi } from '@/api';
import toast from 'react-hot-toast';

interface EditGamePriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  onGameUpdate?: (game: Game) => void;
}

export const EditGamePriceModal = ({ isOpen, onClose, game, onGameUpdate }: EditGamePriceModalProps) => {
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [priceTotal, setPriceTotal] = useState<number | undefined>(undefined);
  const [priceType, setPriceType] = useState<PriceType>('NOT_KNOWN');
  const [priceCurrency, setPriceCurrency] = useState<PriceCurrency | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      setPriceTotal(game.priceTotal);
      setPriceType(game.priceType || 'NOT_KNOWN');
      setPriceCurrency(game.priceCurrency || undefined);
      setIsClosing(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      if (!isOpen) {
        document.body.style.overflow = '';
      }
    };
  }, [isOpen, game.priceTotal, game.priceType, game.priceCurrency]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleSave = async () => {
    if (!game.id) return;

    setIsSaving(true);
    try {
      const updateData: Partial<Game> = {
        priceTotal: priceType !== 'NOT_KNOWN' ? priceTotal : undefined,
        priceType: priceType,
        priceCurrency: priceType !== 'NOT_KNOWN' ? priceCurrency : undefined,
      };

      await gamesApi.update(game.id, updateData);
      
      const response = await gamesApi.getById(game.id);
      if (onGameUpdate) {
        onGameUpdate(response.data);
      }
      
      toast.success(t('gameDetails.settingsUpdated'));
      handleClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className={`relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col transition-transform duration-200 ${
          isClosing ? 'scale-95' : 'scale-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-gray-500 dark:text-gray-400">€</span>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('createGame.price')}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              {t('createGame.priceType')}
            </label>
            <Select
              options={[
                { value: 'NOT_KNOWN', label: t('createGame.priceTypeNotKnown') },
                { value: 'PER_PERSON', label: t('createGame.priceTypePerPerson') },
                { value: 'PER_TEAM', label: t('createGame.priceTypePerTeam') },
                { value: 'TOTAL', label: t('createGame.priceTypeTotal') },
              ]}
              value={priceType}
              onChange={(value) => setPriceType(value as PriceType)}
              disabled={false}
            />
          </div>

          {priceType !== 'NOT_KNOWN' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  {t('createGame.priceTotal')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceTotal || ''}
                  onChange={(e) => {
                    const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                    setPriceTotal(value);
                  }}
                  placeholder={t('createGame.priceTotalPlaceholder')}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  {t('createGame.priceCurrency')}
                </label>
                <Select
                  options={[
                    { value: 'EUR', label: 'EUR' },
                    { value: 'RSD', label: 'RSD' },
                    { value: 'RUB', label: 'RUB' },
                  ]}
                  value={priceCurrency || 'EUR'}
                  onChange={(value) => setPriceCurrency(value as PriceCurrency)}
                  disabled={false}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
