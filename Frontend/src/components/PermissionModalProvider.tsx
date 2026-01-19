import { useEffect, useState, useCallback } from 'react';
import { App } from '@capacitor/app';
import { PermissionModal } from './PermissionModal';
import { permissionService } from '@/services/permissionService';
import { checkPhotoPermission } from '@/utils/permissions';
import { isCapacitor } from '@/utils/capacitor';

export const PermissionModalProvider = () => {
  const [state, setState] = useState(() => permissionService.getState());

  useEffect(() => {
    const unsubscribe = permissionService.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  // Re-check permissions when app becomes active (user returns from settings)
  useEffect(() => {
    if (!isCapacitor() || !state.isOpen) return;

    const handleAppStateChange = async (appState: { isActive: boolean }) => {
      if (appState.isActive) {
        // User returned to app - check if permission was granted
        try {
          const permissionCheck = await checkPhotoPermission();
          if (permissionCheck.status === 'granted' || permissionCheck.status === 'limited') {
            // Permission granted! Close modal and trigger retry if callback exists
            permissionService.hidePermissionModal();
            permissionService.triggerPermissionGrantedCallback();
          }
        } catch (error) {
          console.error('Error re-checking permissions:', error);
        }
      }
    };

    let listenerHandle: any = null;
    App.addListener('appStateChange', handleAppStateChange).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      if (listenerHandle) {
        listenerHandle.then((l: any) => l.remove()).catch(() => {});
      }
    };
  }, [state.isOpen]);

  const handleClose = useCallback(() => {
    permissionService.hidePermissionModal();
  }, []);

  return (
    <PermissionModal
      isOpen={state.isOpen}
      onClose={handleClose}
      permissionType={state.permissionType}
    />
  );
};
