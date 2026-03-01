import { useCallback, useEffect, useState } from 'react';
import { getVapidPublicKey, subscribePush, unsubscribePush } from '../api/notifications';

type PushState = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'error';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check current state on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    navigator.serviceWorker
      .getRegistration('/sw.js')
      .then(async (reg) => {
        if (!reg) {
          // Register the service worker
          reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        }
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setSubscription(sub);
          setState('subscribed');
        } else {
          setState('unsubscribed');
        }
      })
      .catch((err) => {
        setError(String(err));
        setState('error');
      });
  }, []);

  const subscribe = useCallback(async () => {
    try {
      setError(null);

      // Get VAPID key from server
      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) {
        setError('Push notifications not configured on server');
        setState('error');
        return;
      }

      // Register service worker if needed
      let reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        // Wait for it to be ready
        await navigator.serviceWorker.ready;
      }

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Send subscription to server
      await subscribePush(sub);

      setSubscription(sub);
      setState('subscribed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      setError(null);

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await unsubscribePush(endpoint);
      }

      setSubscription(null);
      setState('unsubscribed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, [subscription]);

  return {
    state,
    subscription,
    error,
    subscribe,
    unsubscribe,
    isSupported: state !== 'unsupported',
    isSubscribed: state === 'subscribed',
  };
}
