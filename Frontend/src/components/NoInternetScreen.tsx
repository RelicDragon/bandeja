import { WifiOff } from 'lucide-react';

export const NoInternetScreen = () => {
  return (
    <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <WifiOff className="w-20 h-20 text-yellow-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            No Internet Connection
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-md">
            Please check your internet connection and try again.
          </p>
        </div>
      </div>
    </div>
  );
};

