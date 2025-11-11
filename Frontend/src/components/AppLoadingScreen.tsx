import { Loader2 } from 'lucide-react';

interface AppLoadingScreenProps {
  isInitializing: boolean;
}

export const AppLoadingScreen = ({ isInitializing }: AppLoadingScreenProps) => {
  if (!isInitializing) return null;

  return (
    <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4 px-6">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-gray-600 dark:text-gray-400 text-center">
          Loading...
        </p>
      </div>
    </div>
  );
};

