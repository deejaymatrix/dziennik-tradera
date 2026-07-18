import { useEffect, useState } from 'react';

/**
 * Wykrywa online/offline przez zdarzenia przeglądarki. To tylko sygnał sieciowy
 * (navigator.onLine) - pełny status synchronizacji (kolejka, konflikty, błędy
 * do ponowienia) pochodzi z packages/sync-engine, który powstaje w Kamieniu 2.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
