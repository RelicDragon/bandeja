import { ReactNode } from 'react';
import { Button } from './Button';

interface ModernFooterProps {
  onCancel: () => void;
  onSave?: () => void;
  cancelText?: string;
  saveText?: string;
  isLoading?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}

export const ModernFooter = ({
  onCancel,
  onSave,
  cancelText = 'Cancel',
  saveText = 'Save',
  isLoading = false,
  disabled = false,
  children
}: ModernFooterProps) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 safe-area-inset-bottom">
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex gap-3">
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1 h-11 text-base font-semibold rounded-lg border-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200"
              disabled={isLoading}
            >
              {cancelText}
            </Button>
            {onSave && (
              <Button
                onClick={onSave}
                className="flex-1 h-11 text-base font-semibold rounded-lg bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={disabled || isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </div>
                ) : (
                  saveText
                )}
              </Button>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};
