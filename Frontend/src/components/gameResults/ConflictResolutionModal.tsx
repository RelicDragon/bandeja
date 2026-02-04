import { ServerCrash, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConflictOp } from '@/types/ops';
import { Button } from '@/components';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflicts: ConflictOp[];
  onForceClientWin: () => void;
  onAcceptServer: () => void;
  onClose: () => void;
  isProcessing?: boolean;
}

export const ConflictResolutionModal = ({
  isOpen,
  conflicts,
  onForceClientWin,
  onAcceptServer,
  onClose,
  isProcessing = false,
}: ConflictResolutionModalProps) => {
  const { t } = useTranslation();

  const formatPath = (path: string) => {
    return path.split('/').filter(Boolean).join(' > ');
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="conflict-resolution-modal">
      <DialogContent>
        <DialogHeader className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <DialogTitle>{t('conflicts.title')}</DialogTitle>
          <DialogDescription className="mt-1">
            {t('conflicts.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-280px)]">
          <div className="mb-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {t('conflicts.description')}
            </p>
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded p-3">
              {t('conflicts.conflictCount', { count: conflicts.length })}
            </div>
          </div>

          {/* Conflicts List */}
          <div className="space-y-4">
            {conflicts.map((conflict, index) => (
              <div
                key={conflict.opId}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-mono bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">
                    {conflict.reason}
                  </span>
                  <span className="text-xs text-gray-500">#{index + 1}</span>
                </div>

                {conflict.clientPatch.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Smartphone size={14} className="text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                        {t('conflicts.yourChanges')}
                      </span>
                    </div>
                    {conflict.clientPatch.map((patch, pIdx) => (
                      <div key={pIdx} className="ml-6 text-xs space-y-1">
                        <div className="text-gray-600 dark:text-gray-400">
                          <span className="font-medium">Path:</span> {formatPath(patch.path)}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">
                          <span className="font-medium">Operation:</span> {patch.op}
                        </div>
                        {patch.value !== undefined && (
                          <div className="text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Value:</span>
                            <pre className="mt-1 bg-white dark:bg-gray-800 p-2 rounded text-xs overflow-x-auto">
                              {formatValue(patch.value)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {conflict.serverPatch.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ServerCrash size={14} className="text-green-600 dark:text-green-400" />
                      <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                        {t('conflicts.serverChanges')}
                      </span>
                    </div>
                    {conflict.serverPatch.map((patch, pIdx) => (
                      <div key={pIdx} className="ml-6 text-xs space-y-1">
                        <div className="text-gray-600 dark:text-gray-400">
                          <span className="font-medium">Path:</span> {formatPath(patch.path)}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">
                          <span className="font-medium">Operation:</span> {patch.op}
                        </div>
                        {patch.value !== undefined && (
                          <div className="text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Value:</span>
                            <pre className="mt-1 bg-white dark:bg-gray-800 p-2 rounded text-xs overflow-x-auto">
                              {formatValue(patch.value)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-900">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={onAcceptServer}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 px-4 py-3 text-sm rounded-lg font-medium transition-all bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ServerCrash size={18} />
                <span>{t('conflicts.acceptServer')}</span>
              </button>
              
              <button
                onClick={onForceClientWin}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 px-4 py-3 text-sm rounded-lg font-medium transition-all bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Smartphone size={18} />
                <span>{t('conflicts.forceClient')}</span>
              </button>
            </div>

            <Button
              onClick={onClose}
              variant="outline"
              className="w-full"
              disabled={isProcessing}
            >
              {t('common.cancel')}
            </Button>
          </div>

          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              <strong>{t('conflicts.warning')}:</strong> {t('conflicts.warningMessage')}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

