import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components';
import { BasicUser } from '@/types';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { BaseModal } from '@/components/BaseModal';

interface EditLevelModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: BasicUser;
  currentLevel: number;
  currentReliability: number;
  onSave: (level: number, reliability: number) => Promise<void>;
}

export const EditLevelModal = ({
  isOpen,
  onClose,
  user,
  currentLevel,
  currentReliability,
  onSave,
}: EditLevelModalProps) => {
  const { t } = useTranslation();
  const [level, setLevel] = useState(currentLevel);
  const [reliability, setReliability] = useState(currentReliability);
  const [saving, setSaving] = useState(false);
  const [showConfirmDecrease, setShowConfirmDecrease] = useState(false);
  const [pendingLevel, setPendingLevel] = useState<number | null>(null);
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setInternalIsOpen(true);
      setLevel(currentLevel);
      setReliability(currentReliability);
    }
  }, [isOpen, currentLevel, currentReliability]);

  const handleClose = () => {
    setInternalIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleLevelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLevel = parseFloat(e.target.value);
    const clampedLevel = Math.min(4.0, Math.max(1.0, newLevel));
    
    if (currentLevel > 4.0 && clampedLevel < currentLevel) {
      setPendingLevel(clampedLevel);
      setShowConfirmDecrease(true);
    } else {
      setLevel(clampedLevel);
    }
  };

  const handleConfirmDecrease = () => {
    if (pendingLevel !== null) {
      setLevel(pendingLevel);
      setPendingLevel(null);
    }
    setShowConfirmDecrease(false);
  };

  const handleCancelDecrease = () => {
    setPendingLevel(null);
    setShowConfirmDecrease(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(level, reliability);
      handleClose();
    } catch (error) {
      console.error('Failed to save level:', error);
    } finally {
      setSaving(false);
    }
  };

  const isReliabilityDisabled = currentReliability >= 70;
  const clampedLevel = Math.min(4.0, Math.max(1.0, level));

  return (
    <>
      <BaseModal 
        isOpen={internalIsOpen && !showConfirmDecrease} 
        onClose={handleClose} 
        isBasic 
        modalId="edit-level-modal"
        showCloseButton={true}
        closeOnBackdropClick={true}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('training.editLevel')}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ minHeight: 0, overflowX: 'hidden' }}>
            <div className="px-4 py-4 space-y-4">
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'User'}
                </span>
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('training.currentLevel')}: {currentLevel.toFixed(1)}
                    </label>
                    <div className="inline-flex items-center justify-center h-8 px-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {clampedLevel.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.1"
                    value={clampedLevel}
                    onChange={handleLevelChange}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((clampedLevel - 1.0) / 3.0) * 100}%, #e2e8f0 ${((clampedLevel - 1.0) / 3.0) * 100}%, #e2e8f0 100%)`
                    }}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {t('training.levelRangeHint', { defaultValue: 'Select level between 1.0 and 4.0' })}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('training.currentReliability')}: {currentReliability.toFixed(1)}
                    </label>
                    {!isReliabilityDisabled && (
                      <div className="inline-flex items-center justify-center h-8 px-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {reliability.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                  {isReliabilityDisabled ? (
                    <>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        value={currentReliability}
                        disabled
                        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-not-allowed opacity-50"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {t('training.reliabilityTooHigh', { defaultValue: 'Reliability is already above 70 and cannot be increased' })}
                      </p>
                    </>
                  ) : (
                    <>
                      <input
                        type="range"
                        min={currentReliability}
                        max="70"
                        step="0.1"
                        value={reliability}
                        onChange={(e) => setReliability(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                        style={{
                          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((reliability - currentReliability) / (70 - currentReliability)) * 100}%, #e2e8f0 ${((reliability - currentReliability) / (70 - currentReliability)) * 100}%, #e2e8f0 100%)`
                        }}
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {t('training.reliabilityRangeHint', { defaultValue: 'Select reliability between current value and 70' })}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <Button onClick={handleClose} variant="outline" disabled={saving} size="md">
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} variant="primary" disabled={saving} size="md">
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  {t('common.saving')}
                </>
              ) : (
                t('common.save')
              )}
            </Button>
          </div>
      </BaseModal>

      <ConfirmationModal
        isOpen={showConfirmDecrease}
        title={t('training.confirmLevelDecrease')}
        message={t('training.confirmLevelDecreaseMessage', {
          defaultValue: 'Are you sure you want to decrease the level from {{current}} to {{new}}?',
          current: currentLevel.toFixed(1),
          new: pendingLevel?.toFixed(1) || '',
        })}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={handleConfirmDecrease}
        onClose={handleCancelDecrease}
      />
    </>
  );
};
