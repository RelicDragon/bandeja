import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Send, ArrowUp, ArrowDown, Wallet as WalletIcon } from 'lucide-react';
import { transactionsApi, Transaction, Wallet } from '@/api/transactions';
import { useAuthStore } from '@/store/authStore';
import { Button } from './Button';
import { PlayerListModal } from './PlayerListModal';
import { SendMoneyToUserModal } from './SendMoneyToUserModal';
import { PlayerCardBottomSheet } from './PlayerCardBottomSheet';
import { BaseModal } from './BaseModal';

interface WalletModalProps {
  onClose: () => void;
}

export const WalletModal = ({ onClose }: WalletModalProps) => {
  const { t, i18n } = useTranslation();
  const userId = useAuthStore((state) => state.user?.id);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlayerList, setShowPlayerList] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null);

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

  return (
    <>
      <BaseModal 
        isOpen={!showPlayerList && !selectedPlayerId && !viewPlayerId} 
        onClose={onClose} 
        isBasic 
        modalId="wallet-modal"
        showCloseButton={true}
        closeOnBackdropClick={true}
      >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <WalletIcon size={24} className="text-primary-600 dark:text-primary-400" />
              {t('wallet.title') || 'Wallet'}
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 flex-1">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                <div className="flex items-center justify-between mb-0">
                  <div className="pl-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      {t('wallet.balance') || 'Balance'}
                    </p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {wallet?.wallet || 0}
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
                          className={`flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg ${
                            isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors' : ''
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
      </BaseModal>

      {showPlayerList && (
        <PlayerListModal
          onClose={() => setShowPlayerList(false)}
          onConfirm={handlePlayerSelected}
          multiSelect={false}
          title={t('wallet.selectPlayer') || 'Select Player'}
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
  );
};

