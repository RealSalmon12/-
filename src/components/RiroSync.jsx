import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

const when = (iso) => iso
  ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '아직 없음'

// 반 관리: 리로스쿨 자동 가져오기 상태. 연결(013 SQL)된 반의 관리자에게만 보임
export default function RiroSync({ classId }) {
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')

  const load = () => supabase.from('riro_links').select('last_run_at, last_ok_at, last_error')
    .eq('class_id', classId).maybeSingle().then(({ data }) => setLink(data))
  useEffect(() => { load() }, [classId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runNow() {
    setBusy(true)
    setResult('')
    const { data, error } = await supabase.functions.invoke('riro-sync', { body: {} })
    setBusy(false)
    if (error) setResult('가져오지 못했어요. 잠시 뒤 다시 해 주세요.')
    else if (data?.skipped) setResult(data.skipped)
    else if (data?.error) setResult(data.error)
    else {
      const note = data?.warnings?.length ? ` 못 가져온 것: ${data.warnings.slice(0, 3).join(' / ')}` : ''
      setResult((data?.added ? `새 글 ${data.added}개를 가져왔어요.` : '새 글이 없어요.') + note)
    }
    load()
  }

  if (!link) return null
  return (
    <section className="section">
      <h2>리로스쿨 자동 가져오기</h2>
      <p className="fine">하루 세 번(아침 7시, 점심 12시 40분, 오후 5시) 새 수행평가와 가정통신문을 가져와요.</p>
      <dl className="facts">
        <div><dt>마지막 성공</dt><dd>{when(link.last_ok_at)}</dd></div>
        <div><dt>마지막 시도</dt><dd>{when(link.last_run_at)}</dd></div>
      </dl>
      {link.last_error && <p className="error" role="alert">{link.last_error}</p>}
      <button type="button" className="btn-quiet" onClick={runNow} disabled={busy}>
        {busy ? '가져오는 중…' : '지금 가져오기'}
      </button>
      {result && <p className="fine" role="status">{result}</p>}
    </section>
  )
}
