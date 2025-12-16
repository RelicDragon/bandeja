interface AppLoadingScreenProps {
  isInitializing: boolean;
}

export const AppLoadingScreen = ({ isInitializing }: AppLoadingScreenProps) => {
  if (!isInitializing) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <img
        src="/splash-background.jpg"
        alt="Splash Background"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src="/bandeja-blue-flat-small.png"
          alt="Logo"
          className="w-[220px] h-[220px] object-contain animate-splash-logo"
        />
      </div>
    </div>
  );
};

