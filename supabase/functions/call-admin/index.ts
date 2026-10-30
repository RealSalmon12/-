// 관리자 호출: 하루 3번 제한을 통과하면 반의 선생님·반장·부반장에게 푸시 알림을 보냄.
// 앱에서 로그인한 사용자가 부름 (supabase.functions.invoke('call-admin')).
// 필요한 시크릿: VAPID_KEYS (remind 함수와 같은 값), VAPID_CONTACT (없어도 됨)
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS') ?? '{}'))
const appServer = await webpush.ApplicationServer.new({
  contactInformation: Deno.env.get('VAPID_CONTACT') ?? 'mailto:noreply@example.com',
  vapidKeys
})

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

const ROLE_NAMES: Record<string, string> = { teacher: '선생님', president: '반장', vice: '부반장', student: '학생' }

async function callAdmin(req: Request) {
  const { message = '' } = await req.json().catch(() => ({}))

  // 부른 사람 권한으로 call_admin() 실행 → 하루 3번 제한은 DB 가 지킴
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
  })
  const { data: callId, error } = await asUser.rpc('call_admin', { msg: String(message) })
  if (error) {
    if (error.message.includes('DAILY_LIMIT')) return json({ error: 'limit' }, 429)
    return json({ error: error.message }, 400)
  }

  const { data: call } = await admin.from('admin_calls').select('class_id, user_id, message').eq('id', callId).single()
  const { data: members } = await admin.from('members')
    .select('user_id, display_name, role').eq('class_id', call!.class_id)
  const caller = members?.find((m) => m.user_id === call!.user_id)
  const recipients = (members ?? [])
    .filter((m) => ['teacher', 'president', 'vice'].includes(m.role) && m.user_id !== call!.user_id)
    .map((m) => m.user_id)

  let sent = 0
  if (recipients.length) {
    const { data: subs } = await admin.from('push_subscriptions')
      .select('endpoint, p256dh, auth').in('user_id', recipients)
    const payload = JSON.stringify({
      title: `호출: ${caller?.display_name ?? '학생'} (${ROLE_NAMES[caller?.role ?? 'student']})`,
      body: call!.message || '관리자를 불렀어요.',
      url: '/calls',
      tag: `call-${callId}`
    })
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await appServer.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(payload, { ttl: 3600, urgency: webpush.Urgency.High })
        sent++
      } catch (e) {
        // 앱을 지웠거나 알림을 끈 휴대폰은 구독을 지움
        if (e instanceof webpush.PushMessageError && e.isGone()) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        } else {
          console.error(String(e))
        }
      }
    }))
  }

  const since = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00+09:00'
  const { count } = await admin.from('admin_calls').select('id', { count: 'exact', head: true })
    .eq('user_id', call!.user_id).gte('created_at', since)
  return json({ sent, left: Math.max(0, 3 - (count ?? 0)) })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    return await callAdmin(req)
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
