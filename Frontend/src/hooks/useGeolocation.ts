import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface GeoPosition {
  latitude: number;
  longitude: number;
}

export type GeoErrorCode =
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'unsupported';

export interface GeoResult {
  position: GeoPosition | null;
  errorCode: string | null;
}

export interface UseGeolocationResult {
  getPosition: () => Promise<GeoResult>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useGeolocation(): UseGeolocationResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPosition = useCallback(async (): Promise<GeoResult> => {
    setError(null);
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const status = await Geolocation.checkPermissions();
        if (status.location !== 'granted') {
          const request = await Geolocation.requestPermissions();
          if (request.location !== 'granted') {
            setLoading(false);
            setError('permission_denied');
            return { position: null, errorCode: 'permission_denied' };
          }
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        });
        setLoading(false);
        return {
          position: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          },
          errorCode: null,
        };
      }
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          setError('unsupported');
          setLoading(false);
          return resolve({ position: null, errorCode: 'unsupported' });
        }
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setLoading(false);
            resolve({
              position: {
                latitude: p.coords.latitude,
                longitude: p.coords.longitude,
              },
              errorCode: null,
            });
          },
          (err: GeolocationPositionError) => {
            setLoading(false);
            const code =
              err.code === 1
                ? 'permission_denied'
                : err.code === 2
                  ? 'position_unavailable'
                  : err.code === 3
                    ? 'timeout'
                    : 'position_unavailable';
            setError(code);
            resolve({ position: null, errorCode: code });
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
      });
    } catch (e) {
      setLoading(false);
      setError('position_unavailable');
      return { position: null, errorCode: 'position_unavailable' };
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { getPosition, loading, error, clearError };
}
