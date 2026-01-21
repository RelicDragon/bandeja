import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNavigationStore } from '@/store/navigationStore';

interface UseSplitViewTabOptions<T> {
  parseIdFromPath: (path: string) => T | null;
  buildPath: (id: T) => string;
  listPath: string;
  isDesktop: boolean;
  onResizeToMobile?: (id: T | null) => void;
}

export const useSplitViewTab = <T extends string>({
  parseIdFromPath,
  buildPath,
  listPath,
  isDesktop,
  onResizeToMobile,
}: UseSplitViewTabOptions<T>) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setIsAnimating } = useNavigationStore();
  const [selectedId, setSelectedId] = useState<T | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedIdRef = useRef<T | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const path = location.pathname;
    const newId = parseIdFromPath(path);
    
    if (newId !== null && newId !== selectedId) {
      setSelectedId(newId);
    } else if (path === listPath && selectedId !== null) {
      setSelectedId(null);
    }
  }, [location.pathname, selectedId, parseIdFromPath, listPath]);

  const handleSelect = useCallback((id: T) => {
    if (isDesktop) {
      if (selectedId === id) {
        return;
      }
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      setIsTransitioning(true);
      requestAnimationFrame(() => {
        setSelectedId(id);
        navigate(buildPath(id), { replace: true });
        
        timeoutRef.current = setTimeout(() => {
          setIsTransitioning(false);
          timeoutRef.current = null;
        }, 150);
      });
    } else {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      
      setIsAnimating(true);
      try {
        navigate(buildPath(id));
        animationTimeoutRef.current = setTimeout(() => {
          setIsAnimating(false);
          animationTimeoutRef.current = null;
        }, 300);
      } catch (error) {
        console.error('Navigation failed:', error);
        setIsAnimating(false);
      }
    }
  }, [isDesktop, selectedId, setIsAnimating, navigate, buildPath]);

  useEffect(() => {
    if (!isDesktop && selectedIdRef.current && onResizeToMobile) {
      onResizeToMobile(selectedIdRef.current);
      setSelectedId(null);
    }
  }, [isDesktop, onResizeToMobile]);

  return { selectedId, isTransitioning, handleSelect };
};
