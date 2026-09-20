import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Send, ArrowUp, ArrowDown, ShoppingBag } from 'lucide-react';
import { transactionsApi, Transaction, Wallet } from '@/api/transactions';
import { useAuthStore } from '@/store/authStore';
import { Button } from './Button';
import { PlayerListModal } from './PlayerListModal';
import { SendMoneyToUserModal } from './SendMoneyToUserModal';
import { PlayerCardBottomSheet } from './PlayerCardBottomSheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { getUserPrimarySport, resolveActivePrimarySport } from '@/utils/profileSports';
import { WalletOwedSections } from '@/components/wallet/WalletOwedSections';
import { isShopEnabled } from '@/config/featureFlags';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import {
  REFERRAL_TRANSACTION_REASON,
  WALLET_HIGHLIGHT_CLASS,
  WALLET_HIGHLIGHT_DURATION_MS,
  walletTransactionLabelKey,
} from '@/features/referral/walletReferralRow';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface WalletModalProps {
  onClose: () => void;
  /**
   * PRD 351 — transaction to flash when the Wallet is opened from a reward
   * push. The row gets a soft sky tint for one second and the balance counts
   * up; reduced motion shows both end states immediately.
   */
  highlightTransactionId?: string | null;
}

export const WalletModal = ({ onClose, highlightTransactionId }: WalletModalProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const userId = authUser?.id;
  const walletLevelSport = resolveActivePrimarySport(authUser) ?? getUserPrimarySport(authUser);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlayerList, setShowPlayerList] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [walletResponse, transactionsResponse] = await Promise.all([
          transactionsApi.getWallet(),
          transactionsApi.getTransactions(1, 50),
        ]);
        setWallet(walletResponse.data);
        setTransactions(transactionsResponse.data.transactions);
      } catch (error) {
        console.error('Failed to fetch wallet data:', error);
        toast.error(t('errors.generic'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [t]);

  // PRD 351 — flash the row the reward push pointed at, then let it settle.
  // Reduced motion still gets the tint (it is state, not decoration) but no
  // transition; the timer is always cleared so a fast close cannot leak it.
  useEffect(() => {
    if (!highlightTransactionId) return undefined;
    setHighlighted(highlightTransactionId);
    highlightTimerRef.current = setTimeout(
      () => setHighlighted(null),
      WALLET_HIGHLIGHT_DURATION_MS,
    );
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    };
  }, [highlightTransactionId]);

  const handleSendClick = () => {
    setShowPlayerList(true);
  };

  const handlePlayerSelected = (playerIds: string[]) => {
    if (playerIds.length > 0) {
      setSelectedPlayerId(playerIds[0]);
      setShowPlayerList(false);
    }
  };

  const handleTransferComplete = () => {
    setSelectedPlayerId(null);
    const fetchData = async () => {
      try {
        const [walletResponse, transactionsResponse] = await Promise.all([
          transactionsApi.getWallet(),
          transactionsApi.getTransactions(1, 50),
        ]);
        setWallet(walletResponse.data);
        setTransactions(transactionsResponse.data.transactions);
      } catch (error) {
        console.error('Failed to refresh wallet data:', error);
      }
    };
    fetchData();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const locale = i18n.language || 'en';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getTransactionLabel = (transaction: Transaction) => {
    // PRD 351 — payout rows are stored with a machine reason (`REFERRAL`)
    // because `TransactionRow.name` is written once and cannot be localized
    // later. Map it back to real copy here.
    const reasonKey = walletTransactionLabelKey(transaction.transactionRows[0]?.name);
    if (reasonKey) return t(reasonKey);
    if (transaction.type === 'TRANSFER') {
      if (transaction.fromUserId === userId) {
        const name = `${transaction.toUser?.firstName || ''} ${transaction.toUser?.lastName || ''}`.trim() || t('common.unknown');
        return `→ ${name}`;
      } else {
        const name = `${transaction.fromUser?.firstName || ''} ${transaction.fromUser?.lastName || ''}`.trim() || t('common.unknown');
        return `← ${name}`;
      }
    }
    return transaction.transactionRows[0]?.name || transaction.type;
  };

  const getTransactionMessage = (transaction: Transaction) => {
    const message = transaction.transactionRows[0]?.name;
    if (message === REFERRAL_TRANSACTION_REASON) return null;
    if (transaction.type === 'TRANSFER' && message && message !== 'Transfer') {
      return message;
    }
    return null;
  };

  const isOutgoing = (transaction: Transaction) => {
    return transaction.fromUserId === userId;
  };

  const handleTransactionClick = (transaction: Transaction) => {
    if (transaction.type === 'TRANSFER') {
      const otherUserId = isOutgoing(transaction) 
        ? transaction.toUserId 
        : transaction.fromUserId;
      if (otherUserId) {
        setViewPlayerId(otherUserId);
      }
    }
  };

  const walletOpen = !showPlayerList && !selectedPlayerId && !viewPlayerId;

  return (
    <SportLevelProvider sport={walletLevelSport}>
    <>
      <Dialog open={walletOpen} onClose={onClose} modalId="wallet-modal">
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>{t('wallet.title') || 'Wallet'}</DialogTitle>
              {/* PRD 355 — the shop entry point, beside the balance. */}
              {isShopEnabled() && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate('/shop');
                  }}
                  aria-label={t('shop.title')}
                  className="me-8 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-gray-100 px-3 text-sm font-semibold text-gray-900 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  <ShoppingBag size={16} aria-hidden="true" />
                  {t('shop.title')}
                </button>
              )}
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12 flex-1">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                <div className="flex items-center justify-between mb-0">
                  <div className="ps-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      {t('wallet.balance') || 'Balance'}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {/* PRD 351 — one short count-up on the balance, no confetti.
                          `CountUpNumber` jumps straight to the value under
                          reduced motion. */}
                      <CountUpNumber value={wallet?.wallet ?? 0} />
                    </p>
                  </div>
                  <Button
                    onClick={handleSendClick}
                    className="flex items-center gap-2"
                    disabled={!wallet || wallet.wallet === 0}
                  >
                    <Send size={18} />
                    {t('wallet.sendCoins') || 'Send Coins'}
                  </Button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 min-h-0 p-4">
                {/* PRD 348 — outstanding game cost shares, both directions. */}
                <WalletOwedSections onNavigate={onClose} />

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {t('wallet.transactions') || 'Transactions'}
                </h3>
                {transactions.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-gray-600 dark:text-gray-400">
                      {t('wallet.noTransactions') || 'No transactions yet'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((transaction) => {
                      const outgoing = isOutgoing(transaction);
                      const amount = Math.abs(transaction.total);
                      const message = getTransactionMessage(transaction);
                      const isTransfer = transaction.type === 'TRANSFER';
                      const isClickable = isTransfer && (isOutgoing(transaction) ? transaction.toUserId : transaction.fromUserId);
                      return (
                        <div
                          key={transaction.id}
                          onClick={() => handleTransactionClick(transaction)}
                          className={`flex items-center gap-4 p-4 rounded-lg ${
                            highlighted === transaction.id
                              ? WALLET_HIGHLIGHT_CLASS
                              : 'bg-gray-50 dark:bg-gray-800'
                          } ${prefersReducedMotion ? '' : 'transition-colors duration-200'} ${
                            isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''
                          }`}
                        >
                          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                            outgoing
                              ? 'bg-red-100 dark:bg-red-900/30'
                              : 'bg-green-100 dark:bg-green-900/30'
                          }`}>
                            {outgoing ? (
                              <ArrowUp size={20} className="text-red-600 dark:text-red-400" />
                            ) : (
                              <ArrowDown size={20} className="text-green-600 dark:text-green-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {getTransactionLabel(transaction)}
                            </p>
                            {message && (
                              <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                                {message}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(transaction.createdAt)}
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            <p className={`text-lg font-semibold ${
                              outgoing
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-green-600 dark:text-green-400'
                            }`}>
                              {outgoing ? '-' : '+'}{amount}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {showPlayerList && (
        <PlayerListModal
          onClose={() => setShowPlayerList(false)}
          onConfirm={handlePlayerSelected}
          multiSelect={false}
          title={t('wallet.selectPlayer') || 'Select Player'}
          gameSport={walletLevelSport}
        />
      )}

      {selectedPlayerId && (
        <SendMoneyToUserModal
          toUserId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          onTransferComplete={handleTransferComplete}
        />
      )}

      {viewPlayerId && (
        <PlayerCardBottomSheet
          playerId={viewPlayerId}
          onClose={() => setViewPlayerId(null)}
        />
      )}
    </>
    </SportLevelProvider>
  );
};

