import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { isCapacitor } from '@/utils/capacitor';

interface PhotoCaptureState {
  isCapturing: boolean;
  pendingResult: any;
}

export const usePhotoCapture = (onPhotoResult?: (result: any) => void) => {
  const stateRef = useRef<PhotoCaptureState>({
    isCapturing: false,
    pendingResult: null,
  });

  useEffect(() => {
    if (!isCapacitor() || !onPhotoResult) return;

    const handleAppRestore = async (result: any) => {
      if (result?.cameraResult) {
        stateRef.current.pendingResult = result.cameraResult;
        if (stateRef.current.isCapturing) {
          onPhotoResult(result.cameraResult);
          stateRef.current.isCapturing = false;
          stateRef.current.pendingResult = null;
        }
      }
    };

    const listener = App.addListener('appRestoredResult', handleAppRestore);

    return () => {
      listener.then(l => l.remove());
    };
  }, [onPhotoResult]);

  const setCapturing = (isCapturing: boolean) => {
    stateRef.current.isCapturing = isCapturing;
    if (isCapturing && stateRef.current.pendingResult) {
      onPhotoResult?.(stateRef.current.pendingResult);
      stateRef.current.pendingResult = null;
    }
  };

  return { setCapturing };
};
