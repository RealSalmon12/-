import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const when = (iso) => iso
  ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '아직 없음'

// 함수가 4xx 로 돌려준 { error } 문구를 꺼냄
async function call(body) {
  const { data, error } = await supabase.functions.invoke('riro-sync', { body })
  if (!error) return data ?? {}
  const detail = await error.context?.json?.().catch(() => null)
  return { error: detail?.error ?? '서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.' }
}

// 리로스쿨 연결 폼: 학교 주소, 아이디, 비밀번호, 동의
function ConnectForm({ classId, onDone, onCancel }) {
  const [school, setSchool] = useState('')
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await call({ action: 'connect', classId, school, id, pw })
    setBusy(false)
    if (res.error) return setError(res.error)
    setPw('')
    onDone(res)
  }

  return (
    <form className="riro-connect" onSubmit={submit}>
      <label>
        학교 리로스쿨 주소
        <input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="예: dankook.riroschool.kr"
          autoCapitalize="off" autoCorrect="off" spellCheck="false" inputMode="url" required />
      </label>
      <label>
        리로스쿨 아이디
        <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" autoCapitalize="off" required />
      </label>
      <label>
        리로스쿨 비밀번호
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
      </label>
      <label className="riro-agree">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
        <span>
          비밀번호를 암호화해 저장하고, 하루 세 번 내 계정으로 리로스쿨에 로그인해 우리 반 수행평가·가정통신문을
          가져오는 데 동의해요. 연결을 끊으면 바로 지워요.
        </span>
      </label>
      <p className="fine">학생 계정을 추천해요. 2단계 인증(OTP)이 켜진 계정은 쓸 수 없어요.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn-chalk" disabled={busy || !agree}>{busy ? '로그인 확인 중…' : '연결하기'}</button>
        {onCancel && <button type="button" className="btn-text" onClick={onCancel}>취소</button>}
      </div>
    </form>
  )
}

// 반 관리·내 계정: 리로스쿨 자동 가져오기. 선생님·반장·부반장에게만 보임
export default function RiroSync({ classId }) {
  const [link, setLink] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [editing, setEditing] = useState(false)

  const load = () => supabase.from('riro_links').select('base_url, last_run_at, last_ok_at, last_error')
    .eq('class_id', classId).maybeSingle()
    .then(({ data, error }) => {
      // 015 를 안 돌렸으면 base_url 칸이 없음
      if (error) return supabase.from('riro_links').select('last_run_at, last_ok_at, last_error')
        .eq('class_id', classId).maybeSingle().then((r) => setLink(r.data ?? null))
      setLink(data ?? null)
    })
  useEffect(() => { load() }, [classId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runNow() {
    setBusy(true)
    setResult('')
    const data = await call({ classId })
    setBusy(false)
    if (data.skipped) setResult(data.skipped)
    else if (data.error) setResult(data.error)
    else {
      const note = data.warnings?.length ? ` 못 가져온 것: ${data.warnings.slice(0, 3).join(' / ')}` : ''
      setResult((data.added ? `새 글 ${data.added}개를 가져왔어요.` : '새 글이 없어요.') + note)
    }
    load()
  }

  async function disconnect() {
    if (!confirm('리로스쿨 연결을 끊을까요? 저장한 비밀번호도 지워요. 이미 가져온 글은 남아요.')) return
    setBusy(true)
    const res = await call({ action: 'disconnect', classId })
    setBusy(false)
    if (res.error) return setResult(res.error)
    setResult('')
    load()
  }

  function connected(res) {
    setEditing(false)
    const parts = [res.assessments && '수행평가', res.notices && '가정통신문'].filter(Boolean).join('·')
    setResult(`연결했어요. ${parts}을 가져올게요. "지금 가져오기"로 바로 확인해 보세요.`)
    load()
  }

  if (link === undefined) return null
  const host = link?.base_url?.replace(/^https:\/\//, '').replace(/\/$/, '')
  return (
    <section className="section">
      <h2>리로스쿨 자동 가져오기</h2>
      <p className="fine">하루 세 번(아침 7시, 점심 12시 40분, 오후 5시) 우리 반 수행평가와 가정통신문을 첨부까지 가져와요.</p>
      {!link || editing ? (
        <ConnectForm classId={classId} onDone={connected} onCancel={link ? () => setEditing(false) : null} />
      ) : (
        <>
          <dl className="facts">
            {host && <div><dt>학교</dt><dd>{host}</dd></div>}
            <div><dt>마지막 성공</dt><dd>{when(link.last_ok_at)}</dd></div>
            <div><dt>마지막 시도</dt><dd>{when(link.last_run_at)}</dd></div>
          </dl>
          {link.last_error && <p className="error" role="alert">{link.last_error}</p>}
          <div className="actions">
            <button type="button" className="btn-quiet" onClick={runNow} disabled={busy}>
              {busy ? '가져오는 중…' : '지금 가져오기'}
            </button>
            <button type="button" className="btn-text" onClick={() => setEditing(true)} disabled={busy}>계정 바꾸기</button>
            <button type="button" className="btn-text danger" onClick={disconnect} disabled={busy}>연결 끊기</button>
          </div>
        </>
      )}
      {result && <p className="fine" role="status">{result}</p>}
    </section>
  )
}
