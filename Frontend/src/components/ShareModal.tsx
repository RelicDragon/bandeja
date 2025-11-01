import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Copy, Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  shareText: string;
}

export const ShareModal = ({
  isOpen,
  onClose,
  shareUrl,
  shareText
}: ShareModalProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && (window.isSecureContext || location.protocol === 'https:')) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success(t('gameDetails.linkCopied'));
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast.error(t('gameDetails.copyError') || 'Failed to copy link');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />
      <div
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 mx-4 max-w-md w-full border border-gray-200 dark:border-gray-800 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('gameDetails.shareGame')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {shareText}
          </p>
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white outline-none"
            />
            <button
              onClick={handleCopy}
              className={`p-2 rounded-lg transition-colors ${
                copied
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-800/30'
              }`}
              title={copied ? t('common.copied') || 'Copied!' : t('common.copy') || 'Copy'}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

