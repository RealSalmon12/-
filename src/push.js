import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// 서버(remind 함수)의 VAPID 공개 키. 비밀 키는 Supabase 시크릿 VAPID_KEYS 에만 있음.
const VAPID_PUBLIC_KEY = 'BKcXPAKHQGqctU0UT0EWErr7rYZdd7z-ZSrSnMJiybSqxswoyXq8GpZrzFFDsSpE3jhSX87tFhkUI385hjSMuKI'

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

const toBytes = (b64) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

// 마감 하루 전 알림 상태와 켜기/끄기
// status: 'loading' | 'on' | 'off' | 'denied' | 'ios-install' (아이폰은 홈 화면 앱에서만 됨) | 'unsupported'
export function usePush() {
  const [status, setStatus] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const check = useCallback(async () => {
    if (!supported()) return setStatus(isIos() && !standalone() ? 'ios-install' : 'unsupported')
    if (Notification.permission === 'denied') return setStatus('denied')
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    setStatus(sub ? 'on' : 'off')
  }, [])

  useEffect(() => { check() }, [check])

  async function enable() {
    setBusy(true)
    setError('')
    try {
      if (await Notification.requestPermission() !== 'granted') return check()
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription() ??
        await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY) })
      const { endpoint, keys } = sub.toJSON()
      const { error } = await supabase.from('push_subscriptions')
        .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' })
      if (error) {
        await sub.unsubscribe()
        setError(error.message.includes('push_subscriptions')
          ? 'DB 업데이트(005_push_reminder.sql)를 먼저 실행해 주세요.'
          : '알림을 켜지 못했어요. 잠시 뒤 다시 해 주세요.')
      }
      await check()
    } catch {
      setError('알림을 켜지 못했어요. 잠시 뒤 다시 해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
    setBusy(false)
    check()
  }

  return { status, busy, error, enable, disable }
}
