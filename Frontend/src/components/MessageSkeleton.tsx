import React, { useState, useEffect } from 'react';

interface MessageSkeletonProps {
  isOwn?: boolean;
  delay?: number;
  shouldFadeOut?: boolean;
  fadeOutDelay?: number;
}

export const MessageSkeleton: React.FC<MessageSkeletonProps> = ({ 
  isOwn = false, 
  delay = 0, 
  shouldFadeOut = false,
  fadeOutDelay = 0
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade in with delay
    const fadeInTimer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => {
      clearTimeout(fadeInTimer);
    };
  }, [delay]);

  useEffect(() => {
    if (shouldFadeOut) {
      // Fade out with delay when parent signals to fade out
      const fadeOutTimer = setTimeout(() => {
        setIsVisible(false);
      }, fadeOutDelay);

      return () => {
        clearTimeout(fadeOutTimer);
      };
    }
  }, [shouldFadeOut, fadeOutDelay]);

  return (
    <div 
      className={`group flex select-none ${isOwn ? 'justify-end' : 'justify-start'} mb-4 transition-opacity duration-500 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className={`flex max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isOwn && (
          <div className="flex-shrink-0 mr-3 self-center">
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
          </div>
        )}
        
        <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {!isOwn && (
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse mb-0.5 px-2" />
          )}
          
          <div className="relative">
            <div
              className={`px-4 py-2 rounded-lg shadow-sm relative min-w-[120px] ${
                isOwn
                  ? 'bg-gray-200 dark:bg-gray-600'
                  : 'bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
              } animate-pulse`}
            >
              <div className="space-y-1">
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-full" />
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-3/4" />
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2" />
              </div>
              
              {/* Time skeleton */}
              <div className={`absolute bottom-1 right-2 flex items-center gap-1`}>
                <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded w-8" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const MessageSkeletonList: React.FC = () => {
  const [shouldFadeOut, setShouldFadeOut] = useState(false);

  useEffect(() => {
    // Start fade out earlier to allow parallel transition with real messages
    const fadeOutTimer = setTimeout(() => {
      setShouldFadeOut(true);
    }, 800); // Start fading out after 0.8 seconds

    return () => {
      clearTimeout(fadeOutTimer);
    };
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4 space-y-1 min-h-0">
      {/* Mix of left and right aligned skeletons with staggered delays */}
      <MessageSkeleton isOwn={false} delay={0} shouldFadeOut={shouldFadeOut} fadeOutDelay={0} />
      <MessageSkeleton isOwn={true} delay={100} shouldFadeOut={shouldFadeOut} fadeOutDelay={100} />
      <MessageSkeleton isOwn={false} delay={200} shouldFadeOut={shouldFadeOut} fadeOutDelay={200} />
      <MessageSkeleton isOwn={true} delay={300} shouldFadeOut={shouldFadeOut} fadeOutDelay={300} />
      <MessageSkeleton isOwn={false} delay={400} shouldFadeOut={shouldFadeOut} fadeOutDelay={400} />
      <MessageSkeleton isOwn={true} delay={500} shouldFadeOut={shouldFadeOut} fadeOutDelay={500} />
      <MessageSkeleton isOwn={false} delay={600} shouldFadeOut={shouldFadeOut} fadeOutDelay={600} />
    </div>
  );
};