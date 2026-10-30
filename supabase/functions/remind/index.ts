// 내일이 마감인 수행평가를 반 학생들에게 푸시 알림으로 알려 주는 Edge Function.
// 매일 18시(한국 시간)에 pg_cron 이 부름 (005_push_reminder.sql).
// 이미 "다 했어요"를 누른 사람과 이미 알림을 받은 사람은 빼고 보냄.
// 필요한 시크릿: VAPID_KEYS (JWK 두 개를 담은 JSON), VAPID_CONTACT (mailto: 또는 https 주소, 없어도 됨)
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS') ?? '{}'))
const appServer = await webpush.ApplicationServer.new({
  // 애플(아이폰·맥) 푸시 서버는 연락처가 진짜 주소가 아니면 거절하므로 앱 주소를 기본으로 씀
  contactInformation: Deno.env.get('VAPID_CONTACT') ?? 'https://three-navy-90.vercel.app',
  vapidKeys
})

// 한국 시간 기준 내일 'YYYY-MM-DD'
function tomorrowInKorea() {
  const d = new Date(Date.now() + 9 * 3600_000)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

type Assessment = { id: string; class_id: string; subject: string; title: string }

async function remind() {
  const due = tomorrowInKorea()
  const { data: assessments } = await admin
    .from('assessments').select('id, class_id, subject, title').eq('due_date', due)
  if (!assessments?.length) return { due, sent: 0 }

  const ids = assessments.map((a) => a.id)
  const classIds = [...new Set(assessments.map((a) => a.class_id))]
  const [{ data: members }, { data: done }, { data: logged }] = await Promise.all([
    admin.from('members').select('class_id, user_id').in('class_id', classIds),
    admin.from('assessment_done').select('assessment_id, user_id').in('assessment_id', ids),
    admin.from('reminder_log').select('assessment_id, user_id').in('assessment_id', ids)
  ])
  const skip = new Set([...(done ?? []), ...(logged ?? [])].map((r) => `${r.assessment_id}:${r.user_id}`))

  // 사람마다 알려 줄 수행평가 목록
  const byUser = new Map<string, Assessment[]>()
  for (const m of members ?? []) {
    for (const a of assessments) {
      if (a.class_id !== m.class_id || skip.has(`${a.id}:${m.user_id}`)) continue
      byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), a])
    }
  }
  if (!byUser.size) return { due, sent: 0 }

  const { data: subs } = await admin
    .from('push_subscriptions').select('endpoint, user_id, p256dh, auth').in('user_id', [...byUser.keys()])

  let sent = 0
  const log: { assessment_id: string; user_id: string }[] = []
  for (const s of subs ?? []) {
    const list = byUser.get(s.user_id)
    if (!list) continue
    const message = {
      title: list.length === 1 ? `내일 마감: ${list[0].subject}` : `내일 마감인 수행평가 ${list.length}개`,
      body: list.map((a) => `${a.subject} · ${a.title}`).join('\n'),
      url: list.length === 1 ? `/assessments/${list[0].id}` : '/assessments',
      tag: `due-${due}`
    }
    try {
      await appServer.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify(message), { ttl: 12 * 3600 })
      sent++
      for (const a of list) log.push({ assessment_id: a.id, user_id: s.user_id })
    } catch (e) {
      // 앱을 지웠거나 알림을 끈 휴대폰은 구독을 지움
      if (e instanceof webpush.PushMessageError && e.isGone()) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      } else {
        console.error(String(e))
      }
    }
  }
  if (log.length) await admin.from('reminder_log').upsert(log, { ignoreDuplicates: true })
  return { due, sent }
}

Deno.serve(async () => {
  try {
    return Response.json(await remind())
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 500 })
  }
})
