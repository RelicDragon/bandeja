import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Minus, Plus } from 'lucide-react';
import { transactionsApi } from '@/api/transactions';
import { usersApi } from '@/api/users';
import { Button } from './Button';
import { PlayerAvatar } from './PlayerAvatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';

interface SendMoneyToUserModalProps {
  toUserId: string;
  onClose: () => void;
  onTransferComplete?: () => void;
}

export const SendMoneyToUserModal = ({
  toUserId,
  onClose,
  onTransferComplete,
}: SendMoneyToUserModalProps) => {
  const { t } = useTranslation();
  const [toUser, setToUser] = useState<any>(null);
  const [amount, setAmount] = useState(1);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [wallet, setWallet] = useState<number>(0);
  const [showNumberPicker, setShowNumberPicker] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [walletResponse, statsResponse] = await Promise.all([
          transactionsApi.getWallet(),
          usersApi.getUserStats(toUserId),
        ]);
        setWallet(walletResponse.data.wallet);
        setToUser(statsResponse.data.user);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        toast.error(t('errors.generic'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [toUserId, t]);

  const handleAmountSelect = (selectedAmount: number) => {
    const clampedAmount = Math.max(1, Math.min(selectedAmount, wallet));
    setAmount(clampedAmount);
    setShowNumberPicker(false);
    setManualInput('');
  };

  const handleAmountChange = (newAmount: number) => {
    const clampedAmount = Math.max(1, Math.min(newAmount, wallet));
    setAmount(clampedAmount);
  };

  const handleManualInputChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    setManualInput(digitsOnly);
    if (digitsOnly) {
      const numValue = parseInt(digitsOnly, 10);
      if (!isNaN(numValue)) {
        const clampedAmount = Math.max(1, Math.min(numValue, wallet));
        setAmount(clampedAmount);
      }
    } else {
      setAmount(1);
    }
  };

  const handleNumberPickerOpen = () => {
    setShowNumberPicker(true);
    setManualInput(amount.toString());
  };

  const handleNumberPickerClose = () => {
    setShowNumberPicker(false);
    setManualInput('');
  };

  const handleTransfer = async () => {
    if (amount < 1) {
      toast.error(t('wallet.invalidAmount') || 'Please select an amount');
      return;
    }

    if (amount > wallet) {
      toast.error(t('wallet.insufficientFunds') || 'Insufficient funds');
      return;
    }

    setTransferring(true);
    try {
      await transactionsApi.transferCoins(toUserId, amount, message || undefined);
      toast.success(t('wallet.transferSuccess') || 'Transfer successful');
      onTransferComplete?.();
      handleClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    } finally {
      setTransferring(false);
    }
  };

  const maxAmount = Math.min(wallet, 1000);
  const amountOptions = Array.from({ length: Math.min(maxAmount, 100) }, (_, i) => i + 1);
  const useGridLayout = wallet < 20;
  const numberPickerOptions = Array.from({ length: Math.min(wallet, 100) }, (_, i) => i + 1);

  if (loading) {
    return (
      <Dialog open={isOpen} onClose={handleClose} modalId="send-money-to-user-modal-loading">
        <DialogContent>
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="send-money-to-user-modal">
      <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('wallet.sendCoins') || 'Send Coins'}</DialogTitle>
      </DialogHeader>

      <div className="p-4">
          {toUser && (
            <div className="mb-6 flex items-center justify-center">
              <PlayerAvatar
                player={toUser}
                showName={true}
                extrasmall={false}
              />
            </div>
          )}

          {wallet === 0 ? (
            <div className="mb-6 text-center py-8">
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                {t('wallet.walletEmpty') || 'Your wallet is empty'}
              </p>
            </div>
          ) : (
            <>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('wallet.amount') || 'Amount'}
            </label>
            <div className="relative">
              {!useGridLayout ? (
                <div className={`transition-all duration-500 ${!showNumberPicker ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}`}>
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    <button
                      onClick={() => handleAmountChange(amount - 1)}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95"
                    >
                      <Minus className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <button
                      onClick={handleNumberPickerOpen}
                      className="relative group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-lg sm:blur-xl" />
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 flex items-center justify-center bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl sm:rounded-2xl border-2 border-gray-200 dark:border-gray-700 group-hover:border-primary-500 transition-all duration-200 shadow-lg group-hover:shadow-2xl group-hover:scale-105 active:scale-95">
                        <span className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-br from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                          {amount}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleAmountChange(amount + 1)}
                      disabled={amount >= wallet}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                  {amountOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleAmountSelect(option)}
                      className={`aspect-square rounded-lg font-bold text-sm transition-all duration-200 ${
                        amount === option
                          ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 scale-110 ring-2 ring-primary-400 ring-offset-1 dark:ring-offset-gray-900'
                          : 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-700 dark:hover:to-gray-800 hover:scale-110 active:scale-95 shadow-md hover:shadow-lg border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              {!useGridLayout && (
                <div className={`transition-all duration-500 ${showNumberPicker ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute inset-0'}`}>
                  <div className="flex flex-col items-center gap-3 sm:gap-5">
                    <div className="w-full">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={manualInput}
                        onChange={(e) => handleManualInputChange(e.target.value)}
                        placeholder="0"
                        className="w-full px-4 py-3 text-center text-3xl sm:text-4xl font-bold bg-white dark:bg-gray-800 border-2 border-primary-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
                        autoFocus
                      />
                      <p className="mt-2 text-xs text-center text-gray-500 dark:text-gray-400">
                        {t('wallet.maxAmount') || 'Max'}: {wallet}
                      </p>
                    </div>
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 sm:gap-2 w-full max-w-xs sm:max-w-md px-1">
                      {numberPickerOptions.map((number) => (
                        <button
                          key={number}
                          onClick={() => handleAmountSelect(number)}
                          className={`aspect-square rounded-lg sm:rounded-xl font-bold text-sm sm:text-base transition-all duration-200 ${
                            number === amount
                              ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 scale-110 ring-2 ring-primary-400 ring-offset-1 sm:ring-offset-2 dark:ring-offset-gray-900'
                              : 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-700 dark:hover:to-gray-800 hover:scale-110 active:scale-95 shadow-md hover:shadow-lg border border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {number}
                        </button>
                      ))}
                    </div>
                    <Button
                      onClick={handleNumberPickerClose}
                      variant="outline"
                      className="w-full"
                    >
                      {t('common.done') || 'Done'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('wallet.message') || 'Message (optional)'}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (amount >= 1 && amount <= wallet && !transferring) {
                    handleTransfer();
                  }
                }
              }}
              placeholder={t('wallet.messagePlaceholder') || 'Add a message...'}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              rows={1}
            />
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t('wallet.yourBalance') || 'Your balance'}: <span className="font-semibold">{wallet}</span>
          </div>
          </>
          )}
      </div>

      <DialogFooter className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex gap-2">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1"
              disabled={transferring}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleTransfer}
              className="flex-1"
              disabled={amount < 1 || transferring || amount > wallet || wallet === 0}
            >
              {transferring ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {t('common.sending') || 'Sending...'}
                </div>
              ) : (
                t('wallet.transfer') || 'Transfer'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

