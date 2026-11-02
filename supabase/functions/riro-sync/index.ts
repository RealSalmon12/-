// 리로스쿨에서 새 수행평가·가정통신문을 가져와 연결된 반(riro_links)에 올리는 Edge Function.
// 하루 세 번 pg_cron 이 부르고(013_riro_sync.sql), 반 관리 화면의 "지금 가져오기" 로도 부름.
// 20분 안에 다시 부르면 아무것도 안 함 (리로스쿨에 너무 자주 로그인하지 않게).
// 필요한 시크릿: RIRO_ID, RIRO_PW (리로스쿨 아이디·비밀번호), VAPID_KEYS (알림, remind 와 같은 값)
// 없어도 되는 시크릿: RIRO_BASE (기본 https://dankook.riroschool.kr/), RIRO_ASSESS_DB (기본 1551), RIRO_NOTICE_DB (기본 1901)
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import {
  forClass, LoginError, parseAssessmentDetail, parseAssessmentList, parseNoticeDetail, parseNoticeList, parseTargetClasses,
  type RiroDetail, type RiroFile, RiroSession
} from './riro.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const BASE = (Deno.env.get('RIRO_BASE') ?? 'https://dankook.riroschool.kr/').replace(/\/?$/, '/')
const ASSESS_DB = Deno.env.get('RIRO_ASSESS_DB') ?? '1551'
const NOTICE_DB = Deno.env.get('RIRO_NOTICE_DB') ?? '1901'
const GAP_MINUTES = 20
const MAX_NEW = 15            // 한 번에 올리는 글 수 (처음 연결했을 때 쏟아지지 않게)
const FIRST_NOTICE_DAYS = 14  // 처음엔 최근 2주 통신문만
const MAX_BYTES = 20 * 1024 * 1024

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

// 012 의 assessments 버킷 허용 목록과 같음
const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip',
  hwp: 'application/x-hwp', hwpx: 'application/hwp+zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}
const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

// 한국 시간 'YYYY-MM-DD HH:MM'
const nowKorea = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
const daysAgoKorea = (n: number) => new Date(Date.now() + 9 * 3600_000 - n * 86400_000).toISOString().slice(0, 10)

async function fingerprint(...parts: string[]) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\u0000')))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

// 이번 실행에서 생긴 문제들 (반 관리 화면에 보여 줌)
let warnings: string[] = []
const warn = (msg: string) => {
  console.error(msg)
  if (warnings.length < 20) warnings.push(msg)
}

// 014 SQL(body_html)을 아직 안 돌렸으면 그 칸 없이 다시 넣음
// deno-lint-ignore no-explicit-any
async function insertRow(table: string, row: Record<string, any>) {
  let res = await admin.from(table).insert(row).select('id').single()
  if (res.error && /body_html/.test(res.error.message)) {
    const { body_html: _, ...rest } = row
    res = await admin.from(table).insert(rest).select('id').single()
  }
  return res
}

type Attachment = { path: string; name: string; size: number; type: string }

// 첨부를 받아서 버킷에 올림. 못 받은 건 건너뜀
async function saveFiles(riro: RiroSession, files: RiroFile[], bucket: string, prefix: string, referer: string) {
  const saved: Attachment[] = []
  for (const [i, f] of files.slice(0, 10).entries()) {
    const ext = extOf(f.name)
    const type = TYPES[ext]
    if (!type) {
      warn(`첨부 ${f.name}: 올릴 수 없는 형식이라 건너뜀`)
      continue
    }
    try {
      const body = await riro.download(f.url, referer)
      if (body.byteLength > MAX_BYTES) {
        warn(`첨부 ${f.name}: 20MB 보다 커서 건너뜀`)
        continue
      }
      const path = `${prefix}-${i}.${ext}`
      const { error } = await admin.storage.from(bucket).upload(path, body, { contentType: type, upsert: true })
      if (error) throw error
      saved.push({ path, name: f.name, size: body.byteLength, type })
    } catch (e) {
      warn(`첨부 ${f.name}: ${String((e as Error).message ?? e)}`)
    }
  }
  return saved
}

let appServer: webpush.ApplicationServer | null = null
async function push(classId: string, message: Record<string, string>) {
  if (!Deno.env.get('VAPID_KEYS')) return 0
  appServer ??= await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get('VAPID_CONTACT') ?? 'https://www.bacolab-cc.xyz',
    vapidKeys: await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS')!))
  })
  const { data: members } = await admin.from('members').select('user_id').eq('class_id', classId)
  const ids = (members ?? []).map((m) => m.user_id)
  if (!ids.length) return 0
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', ids)
  let sent = 0
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await appServer!.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify(message), { ttl: 12 * 3600 })
      sent++
    } catch (e) {
      if (e instanceof webpush.PushMessageError && e.isGone()) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      } else console.error(String(e))
    }
  }))
  return sent
}

type Link = { class_id: string; author_id: string; failed_login: string | null }
type ClassInfo = { id: string; grade: number | null; class_no: number | null }

async function assessmentDetail(riro: RiroSession, cate: string): Promise<RiroDetail & { page: string }> {
  const tries = [
    `portfolio.php?club=index&action=write_form&db=${ASSESS_DB}&cate=${cate}&cls=&my_cate=`,
    `portfolio.php?club=index&action=set_view&db=${ASSESS_DB}&cate=${cate}&cls=&my_cate=&uid=00&num=1`
  ]
  for (const path of tries) {
    try {
      const found = parseAssessmentDetail(await riro.page(path), BASE, ASSESS_DB, cate)
      if (found) return { ...found, page: new URL(path, BASE).href }
    } catch (e) {
      warn(`수행 ${cate} 공지: ${String((e as Error).message ?? e)}`)
    }
  }
  return { text: '', html: '', files: [], page: BASE }
}

// 과제를 받는 반 목록에 우리 반(예: 1학년 2반 → 102)이 있는지. 목록을 못 읽으면 일단 넣음
async function forOurClass(riro: RiroSession, cate: string, cls: ClassInfo) {
  if (!cls.grade || !cls.class_no) return true
  try {
    const targets = parseTargetClasses(await riro.page(`portfolio.php?action=list&db=${ASSESS_DB}&cate=${cate}`))
    if (!targets.length) return true
    const ours = String(cls.grade * 100 + cls.class_no)
    return targets.includes(ours)
  } catch (e) {
    console.error(`수행 ${cate} 대상 반: ${String((e as Error).message ?? e)}`)
    return true
  }
}

async function syncClass(riro: RiroSession, link: Link, cls: ClassInfo, lists: {
  assessments: ReturnType<typeof parseAssessmentList>; notices: ReturnType<typeof parseNoticeList>
}) {
  const now = nowKorea()
  const added: { kind: 'assessment' | 'notice'; id: string; label: string }[] = []

  // ── 수행평가: 아직 안 끝난 것, 우리 반 것, 처음 보는 것만
  // 한 번 가져온 글은 반에서 지웠어도 다시 안 가져옴
  const { data: seen } = await admin.from('riro_seen').select('kind, source_id').eq('class_id', cls.id)
  const seenA = new Set((seen ?? []).filter((r) => r.kind === 'assessment').map((r) => r.source_id))
  const seenN = new Set((seen ?? []).filter((r) => r.kind === 'notice').map((r) => r.source_id))
  const remember = (kind: string, source_id: string) =>
    admin.from('riro_seen').upsert({ class_id: cls.id, kind, source_id }, { ignoreDuplicates: true })
  const candidates = lists.assessments
    .filter((a) => a.state !== '마감' && a.end >= now && forClass(a.title, cls.grade, cls.class_no) && !seenA.has(a.id))
  let addedA = 0
  for (const a of candidates) {
    if (addedA >= MAX_NEW) break
    if (!(await forOurClass(riro, a.id, cls))) continue
    addedA++
    const detail = await assessmentDetail(riro, a.id)
    const attachments = await saveFiles(riro, detail.files, 'assessments', `${cls.id}/riro-a${a.id}`, detail.page)
    const head = [
      a.teacher && `담당: ${a.teacher} 선생님`,
      `제출: ${a.start.slice(5)} ~ ${a.end.slice(5)}`
    ].filter(Boolean).join('\n')
    const { data, error } = await insertRow('assessments', {
      class_id: cls.id,
      body_html: detail.html || null,
      subject: a.subject.slice(0, 30),
      title: a.title.slice(0, 200),
      due_date: a.due,
      content: [head, detail.text].filter(Boolean).join('\n\n').slice(0, 20000),
      attachments,
      author_id: link.author_id,
      source: 'riro',
      source_id: a.id,
      source_url: a.url
    })
    if (error) {
      console.error(`수행 ${a.id} 저장: ${error.message}`)
      if (attachments.length) await admin.storage.from('assessments').remove(attachments.map((f) => f.path))
      continue
    }
    await remember('assessment', a.id)
    added.push({ kind: 'assessment', id: data.id, label: `${a.subject} · ${a.title}` })
  }

  // ── 가정통신문: 처음이면 최근 2주만, 그 뒤로는 처음 보는 글만
  const since = daysAgoKorea(seenN.size ? 60 : FIRST_NOTICE_DAYS)
  const freshN = lists.notices
    .filter((n) => n.date >= since && !seenN.has(n.id))
    .slice(0, MAX_NEW)
    .reverse() // 오래된 것부터 올려야 목록 순서가 맞음
  for (const n of freshN) {
    let detail: Awaited<ReturnType<typeof parseNoticeDetail>> = { text: '', html: '', files: [], posted: null }
    try {
      detail = parseNoticeDetail(await riro.page(n.url), BASE)
    } catch (e) {
      warn(`통신문 ${n.id}: ${String((e as Error).message ?? e)}`)
    }
    const saved = await saveFiles(riro, detail.files, 'notices', `${cls.id}/riro-n${n.id}`, n.url)
    const photos = saved.filter((f) => f.type.startsWith('image/'))
    const others = saved.filter((f) => !f.type.startsWith('image/'))
    const posted = detail.posted ? new Date(`${detail.posted.replace(' ', 'T')}+09:00`).toISOString() : undefined
    const { data, error } = await insertRow('notices', {
      class_id: cls.id,
      body_html: detail.html || null,
      title: n.title.slice(0, 200),
      memo: [n.writer && `작성: ${n.writer} 선생님`, detail.text].filter(Boolean).join('\n\n').slice(0, 20000),
      photo_paths: photos.map((f) => f.path),
      attachments: others,
      author_id: link.author_id,
      source: 'riro',
      source_id: n.id,
      source_url: n.url,
      ...(posted ? { created_at: posted } : {})
    })
    if (error) {
      console.error(`통신문 ${n.id} 저장: ${error.message}`)
      if (saved.length) await admin.storage.from('notices').remove(saved.map((f) => f.path))
      continue
    }
    await remember('notice', n.id)
    added.push({ kind: 'notice', id: data.id, label: n.title })
  }

  if (added.length) {
    const one = added.length === 1 ? added[0] : null
    await push(cls.id, {
      title: one
        ? (one.kind === 'assessment' ? '리로스쿨 새 수행평가' : '리로스쿨 새 가정통신문')
        : `리로스쿨에서 새 글 ${added.length}개`,
      body: added.map((x) => x.label).slice(0, 5).join('\n'),
      url: one ? (one.kind === 'assessment' ? `/assessments/${one.id}` : `/notices/${one.id}`) : '/',
      tag: `riro-${Date.now()}`
    })
  }
  return added.length
}

async function run(manual: boolean) {
  const id = Deno.env.get('RIRO_ID')
  const pw = Deno.env.get('RIRO_PW')
  if (!id || !pw) return { skipped: 'RIRO_ID, RIRO_PW 시크릿이 없어요' }
  warnings = []

  // 20분 안에 돌았으면 건너뜀. 먼저 시각을 찍어서 동시에 불려도 한 번만 돔
  const cutoff = new Date(Date.now() - GAP_MINUTES * 60_000).toISOString()
  const { data: links } = await admin.from('riro_links')
    .update({ last_run_at: new Date().toISOString() })
    .or(`last_run_at.is.null,last_run_at.lt.${cutoff}`)
    .select('class_id, author_id, failed_login')
  if (!links?.length) return { skipped: `연결된 반이 없거나 ${GAP_MINUTES}분 안에 이미 가져왔어요` }

  const classIds = links.map((l) => l.class_id)
  const fail = async (message: string, extra: Record<string, unknown> = {}) => {
    await admin.from('riro_links').update({ last_error: message, ...extra }).in('class_id', classIds)
    return { error: message }
  }

  // 틀린 비밀번호로 계속 시도하면 리로스쿨 계정이 잠기므로, 같은 값이면 다시 안 함
  const fp = await fingerprint(BASE, id, pw)
  // 반 관리자가 "지금 가져오기" 를 누르면 한 번 더 시도함 (20분에 한 번까지라 잠길 만큼 반복되진 않음)
  if (!manual && links.some((l) => l.failed_login === fp)) {
    return { skipped: '지난번에 로그인이 안 된 아이디·비밀번호예요. 시크릿을 고치면 다시 시도해요' }
  }

  const riro = new RiroSession(BASE)
  try {
    await riro.login(id, pw)
  } catch (e) {
    const message = String((e as Error).message ?? e)
    return fail(message, e instanceof LoginError ? { failed_login: fp } : {})
  }

  try {
    const [assessHtml, noticeHtml] = [
      await riro.page(`portfolio.php?db=${ASSESS_DB}`),
      await riro.page(`board_msg.php?db=${NOTICE_DB}`)
    ]
    const lists = {
      assessments: parseAssessmentList(assessHtml, BASE),
      notices: parseNoticeList(noticeHtml, BASE, NOTICE_DB)
    }
    if (!lists.assessments.length && !lists.notices.length) {
      return fail('리로스쿨 화면에서 글을 하나도 못 읽었어요. 화면 구조가 바뀌었을 수 있어요')
    }
    const { data: classes } = await admin.from('classes').select('id, grade, class_no').in('id', classIds)
    let added = 0
    for (const link of links) {
      const cls = classes?.find((c) => c.id === link.class_id)
      if (cls) added += await syncClass(riro, link, cls, lists)
    }
    await admin.from('riro_links')
      .update({
        last_ok_at: new Date().toISOString(),
        last_error: warnings.length ? `일부를 못 가져왔어요: ${warnings.slice(0, 3).join(' / ')}` : null,
        failed_login: null
      })
      .in('class_id', classIds)
    return { added, warnings, seen: { assessments: lists.assessments.length, notices: lists.notices.length } }
  } catch (e) {
    return fail(String((e as Error).message ?? e))
  }
}

// 앱에서 반 관리자(선생님·반장·부반장)가 부른 것인지
async function isManual(req: Request) {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token || token === Deno.env.get('SUPABASE_ANON_KEY')) return false
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return false
  const { data } = await admin.from('members').select('class_id, role').eq('user_id', user.id)
    .in('role', ['teacher', 'president', 'vice'])
  const { data: links } = await admin.from('riro_links').select('class_id')
    .in('class_id', (data ?? []).map((m) => m.class_id))
  return Boolean(links?.length)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    return json(await run(await isManual(req).catch(() => false)))
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
