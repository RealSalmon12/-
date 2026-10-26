import { useState } from 'react'
import { searchSchools } from '../neis.js'

// 초등학교는 6학년, 나머지는 3학년까지
export const gradesFor = (kind) => (kind === '초등학교' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3])

// 학교 이름으로 찾아서 하나 고르기. value 는 { office, code, name, kind } 또는 null
export default function SchoolPicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function search() {
    setBusy(true)
    setError('')
    try {
      const list = await searchSchools(query)
      setResults(list)
      if (!list.length) setError('그 이름의 학교가 없어요. 학교 이름을 조금 다르게 적어 보세요.')
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  if (value) {
    return (
      <div className="school-chosen">
        <div>
          <span className="fine">학교</span>
          <b>{value.name}</b>
        </div>
        <button type="button" className="btn-text" onClick={() => onChange(null)}>바꾸기</button>
      </div>
    )
  }

  return (
    <div className="school-picker">
      <label htmlFor="school-query">학교</label>
      <div className="search-row">
        <input
          id="school-query" value={query} placeholder="예: 단국대학교부속소프트웨어"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }}
        />
        <button type="button" className="btn-quiet" onClick={search} disabled={busy || query.trim().length < 2}>
          {busy ? '찾는 중…' : '찾기'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {results?.length > 0 && (
        <ul className="school-results">
          {results.map((s) => (
            <li key={s.office + s.code}>
              <button type="button" onClick={() => onChange(s)}>
                <b>{s.name}</b>
                <span className="fine">{[s.kind, s.address || s.officeName].filter(Boolean).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
