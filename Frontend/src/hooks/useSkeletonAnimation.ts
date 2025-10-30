import { useState, useEffect, useCallback, useRef } from 'react';

type SkeletonState = 'hidden' | 'fading-in' | 'visible' | 'fading-out';

export const useSkeletonAnimation = () => {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [skeletonStates, setSkeletonStates] = useState<Record<number, SkeletonState>>({});
  const skeletonTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const showSkeletonsAnimated = useCallback(() => {
    skeletonTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    skeletonTimeoutsRef.current = [];
    
    setShowSkeleton(true);
    setSkeletonStates({});
    
    const skeletonCount = 3;
    for (let i = 0; i < skeletonCount; i++) {
      const timeout = setTimeout(() => {
        setSkeletonStates(prev => ({ ...prev, [i]: 'fading-in' }));
        
        const fadeInTimeout = setTimeout(() => {
          setSkeletonStates(prev => ({ ...prev, [i]: 'visible' }));
        }, 300);
        skeletonTimeoutsRef.current.push(fadeInTimeout);
      }, i * 200);
      skeletonTimeoutsRef.current.push(timeout);
    }
  }, []);

  const hideSkeletonsAnimated = useCallback(() => {
    skeletonTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    skeletonTimeoutsRef.current = [];
    
    const skeletonCount = 3;
    for (let i = 0; i < skeletonCount; i++) {
      const timeout = setTimeout(() => {
        setSkeletonStates(prev => ({ ...prev, [i]: 'fading-out' }));
        
        const fadeOutTimeout = setTimeout(() => {
          setSkeletonStates(prev => ({ ...prev, [i]: 'hidden' }));
        }, 300);
        skeletonTimeoutsRef.current.push(fadeOutTimeout);
      }, i * 150);
      skeletonTimeoutsRef.current.push(timeout);
    }
    
    const finalTimeout = setTimeout(() => {
      setShowSkeleton(false);
      setSkeletonStates({});
    }, skeletonCount * 150 + 400);
    skeletonTimeoutsRef.current.push(finalTimeout);
  }, []);

  useEffect(() => {
    return () => {
      skeletonTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  return {
    showSkeleton,
    skeletonStates,
    showSkeletonsAnimated,
    hideSkeletonsAnimated,
  };
};

