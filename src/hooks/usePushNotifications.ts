import { useState, useEffect, useCallback } from 'react'
import { getJwtToken } from './useAuth'

function urlB64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function usePushNotifications(restBase: string) {
  const [isSupported,  setIsSupported]  = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading,    setIsLoading]    = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const checkSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    setIsSubscribed(!!sub)
  }, [])

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window
    setIsSupported(supported)
    if (supported) checkSubscription()
  }, [checkSubscription])

  const subscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true)
    setError(null)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setError('使用者拒絕通知授權')
        return false
      }

      const res = await fetch(`${restBase}/api/push/vapid-key`)
      if (!res.ok) throw new Error('無法取得 VAPID 金鑰')
      const { publicKey } = await res.json() as { publicKey: string }
      if (!publicKey) throw new Error('VAPID 金鑰為空')

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(publicKey).buffer as ArrayBuffer,
      })

      const token = getJwtToken()
      const postRes = await fetch(`${restBase}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!postRes.ok) throw new Error('訂閱儲存失敗')

      setIsSubscribed(true)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '訂閱失敗')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [restBase])

  const unsubscribe = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) { setIsSubscribed(false); return }

      const token = getJwtToken()
      await fetch(`${restBase}/api/push/unsubscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(sub.toJSON()),
      }).catch(() => {/* ignore network errors on unsubscribe */})

      await sub.unsubscribe()
      setIsSubscribed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消訂閱失敗')
    } finally {
      setIsLoading(false)
    }
  }, [restBase])

  return { isSupported, isSubscribed, isLoading, error, subscribe, unsubscribe }
}
