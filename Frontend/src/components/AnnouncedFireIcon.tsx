import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const fireAnimationSrc = '/assets/Fire.lottie';

export const AnnouncedFireIcon = ({ className = '' }: { className?: string }) => (
  <div className={`inline-flex items-center justify-center -mt-1 w-6 h-6 [&>canvas]:max-w-6 [&>canvas]:max-h-6 text-orange-500 dark:text-orange-400 ${className}`}>
    <DotLottieReact src={fireAnimationSrc} loop autoplay />
  </div>
);
