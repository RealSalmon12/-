// 공지와 1:1 채팅 알림: 앱이 글을 저장한 뒤 { kind: 'announcement' | 'dm', id } 로 부름.
// 쓴 사람 본인만 부를 수 있고, 같은 글로는 한 번만 보냄 (notified_at).
// 필요한 시크릿: VAPID_KEYS (remind 함수와 같은 값), VAPID_CONTACT (없어도 됨)
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS') ?? '{}'))
const appServer = await webpush.ApplicationServer.new({
  // 애플(아이폰·맥) 푸시 서버는 연락처가 진짜 주소가 아니면 거절하므로 앱 주소를 기본으로 씀
  contactInformation: Deno.env.get('VAPID_CONTACT') ?? 'https://three-navy-90.vercel.app',
  vapidKeys
})

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

async function push(userIds: string[], message: Record<string, string>, ttl: number) {
  if (!userIds.length) return 0
  const { data: subs } = await admin.from('push_subscriptions')
    .select('endpoint, p256dh, auth').in('user_id', userIds)
  let sent = 0
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await appServer.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify(message), { ttl, urgency: webpush.Urgency.High })
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
  return sent
}

async function notify(req: Request) {
  const { kind, id } = await req.json().catch(() => ({}))
  const table = kind === 'announcement' ? 'announcements' : kind === 'dm' ? 'direct_messages' : null
  if (!table || !id) return json({ error: 'kind, id 가 필요해요' }, 400)

  // 부른 사람이 누구인지, 그 사람이 쓴 글인지 확인
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: 'login' }, 401)

  // 아직 안 보낸 글이면 보낸 표시를 먼저 남김 (동시에 두 번 불러도 한 번만 보냄)
  const author = kind === 'announcement' ? 'user_id' : 'sender_id'
  const { data: row } = await admin.from(table).update({ notified_at: new Date().toISOString() })
    .eq('id', id).eq(author, user.id).is('notified_at', null).select('*').maybeSingle()
  if (!row) return json({ sent: 0 })

  const { data: members } = await admin.from('members')
    .select('user_id, display_name, role').eq('class_id', row.class_id)
  const me = members?.find((m) => m.user_id === user.id)

  if (kind === 'announcement') {
    const others = (members ?? []).filter((m) => m.user_id !== user.id).map((m) => m.user_id)
    const sent = await push(others, {
      title: `공지: ${row.title}`,
      body: cut(row.body || `${me?.display_name ?? '선생님'} 선생님의 공지예요.`, 140),
      url: '/announcements',
      tag: `announcement-${row.id}`
    }, 24 * 3600)
    return json({ sent })
  }

  // 1:1 채팅: 학생이 보내면 그 반 선생님들에게, 선생님이 보내면 그 학생에게
  const fromStudent = row.sender_id === row.student_id
  const to = fromStudent
    ? (members ?? []).filter((m) => m.role === 'teacher').map((m) => m.user_id)
    : [row.student_id]
  const sent = await push(to.filter((u: string) => u !== user.id), {
    title: fromStudent ? `${me?.display_name ?? '학생'}의 1:1 메시지` : `${me?.display_name ?? '선생님'} 선생님의 1:1 메시지`,
    body: cut(row.body, 140),
    url: fromStudent ? `/dm/${row.student_id}` : '/dm',
    tag: `dm-${row.student_id}`
  }, 12 * 3600)
  return json({ sent })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    return await notify(req)
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
