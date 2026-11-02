import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { compressImage } from '../util.js'

const BUCKET = 'assessments'
export const MAX_FILES = 10
const MAX_BYTES = 20 * 1024 * 1024

// 브라우저가 형식을 비워 두는 파일(특히 한글 .hwp)이 많아서 확장자로 정함. 012 SQL 의 허용 목록과 같아야 함
const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip',
  hwp: 'application/x-hwp', hwpx: 'application/hwp+zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}
export const FILE_ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(',')
const extOf = (name) => name.split('.').pop().toLowerCase()
const isImage = (a) => a.type.startsWith('image/')

export const sizeText = (n) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`

// 고른 파일을 첨부 후보로. 못 올리는 건 이유와 함께 돌려줌
export function toDrafts(files) {
  const drafts = []
  const rejected = []
  for (const file of files) {
    const type = TYPES[extOf(file.name)]
    if (!type) rejected.push(`${file.name}: 올릴 수 없는 형식이에요`)
    else if (file.size > MAX_BYTES && !(type.startsWith('image/') && type !== 'image/gif')) rejected.push(`${file.name}: 20MB 보다 커요`)
    else drafts.push({ file, name: file.name, size: file.size, type, preview: type.startsWith('image/') ? URL.createObjectURL(file) : null })
  }
  return { drafts, rejected }
}

// 새로 고른 파일(file 이 있는 것)만 올리고, 저장할 첨부 목록을 돌려줌. 사진은 줄여서 올림(움짤은 그대로)
export async function uploadDrafts(classId, items) {
  const saved = []
  for (const a of items) {
    if (!a.file) { saved.push({ path: a.path, name: a.name, size: a.size, type: a.type }); continue }
    let body = a.file
    let { name, type } = a
    if (isImage(a) && type !== 'image/gif') {
      const small = await compressImage(a.file).catch(() => null)
      if (small) {
        body = small
        type = 'image/jpeg'
        name = name.replace(/\.[^.]+$/, '') + '.jpg'
      }
    }
    const ext = type === 'image/jpeg' ? 'jpg' : extOf(name)
    const path = `${classId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: type })
    if (error) {
      // 앞에서 올린 새 파일은 지워 둠
      const fresh = saved.filter((s) => !items.some((i) => !i.file && i.path === s.path)).map((s) => s.path)
      if (fresh.length) await supabase.storage.from(BUCKET).remove(fresh)
      throw new Error(/bucket|not found/i.test(error.message)
        ? 'DB 업데이트(012_assessment_files.sql)를 먼저 실행해 주세요.'
        : `${a.name}을(를) 올리지 못했어요. ${/size|large/i.test(error.message) ? '20MB 보다 커요.' : '잠시 뒤 다시 해 주세요.'}`)
    }
    saved.push({ path, name, size: body.size, type })
  }
  return saved
}

export const removeFiles = (paths) => paths.length ? supabase.storage.from(BUCKET).remove(paths) : null

// 쓰기 화면: 사진·파일 고르기와 고른 목록
export function AttachPicker({ items, onChange, onError }) {
  const add = (e) => {
    const { drafts, rejected } = toDrafts(e.target.files)
    e.target.value = ''
    const room = MAX_FILES - items.length
    if (drafts.length > room) rejected.push(`첨부는 ${MAX_FILES}개까지예요`)
    onError(rejected.join('\n'))
    onChange([...items, ...drafts.slice(0, Math.max(0, room))])
  }
  const thumb = useUrls(items.filter((a) => !a.file && isImage(a)).map((a) => a.path))

  return (
    <div className="attach">
      <div className="attach-buttons">
        <label className="btn-quiet">
          사진 추가
          <input className="sr-only" type="file" accept="image/*" multiple onChange={add} />
        </label>
        <label className="btn-quiet">
          파일 추가
          <input className="sr-only" type="file" accept={FILE_ACCEPT} multiple onChange={add} />
        </label>
        <span className="fine">PDF, 한글, 워드, PPT, 엑셀 등 · 한 개 20MB · {MAX_FILES}개까지</span>
      </div>
      {items.length > 0 && (
        <ul className="attach-list">
          {items.map((a, i) => (
            <li key={a.path ?? a.preview ?? `${a.name}-${i}`} className="attach-item">
              {isImage(a)
                ? <img src={a.preview ?? thumb[a.path]} alt="" className="attach-thumb" />
                : <span className="attach-ext">{extOf(a.name).toUpperCase()}</span>}
              <span className="attach-name">{a.name}<span className="fine">{sizeText(a.size)}</span></span>
              <button type="button" className="btn-text danger" aria-label={`${a.name} 빼기`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}>빼기</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 비공개 버킷이라 한 시간짜리 주소를 받아서 씀
function useUrls(paths) {
  const [urls, setUrls] = useState({})
  const key = paths.join('|')
  useEffect(() => {
    if (!paths.length) return
    supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      .then(({ data }) => setUrls(Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return urls
}

// 상세 화면: 사진은 크게 보기, 파일은 원래 이름으로 내려받기
export function AttachmentView({ items }) {
  const photos = items.filter(isImage)
  const files = items.filter((a) => !isImage(a))
  const url = useUrls(photos.map((a) => a.path))
  const [zoom, setZoom] = useState(null)
  const [error, setError] = useState('')

  async function download(a) {
    setError('')
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 300, { download: a.name })
    if (error) return setError('파일을 열지 못했어요. 잠시 뒤 다시 해 주세요.')
    location.href = data.signedUrl
  }

  if (!items.length) return null
  return (
    <section className="section">
      <h2>첨부</h2>
      {photos.length > 0 && (
        <div className="attach-photos">
          {photos.map((a) => url[a.path] && (
            <button key={a.path} type="button" onClick={() => setZoom(a)} aria-label={`${a.name} 크게 보기`}>
              <img src={url[a.path]} alt={a.name} />
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <ul className="attach-list">
          {files.map((a) => (
            <li key={a.path}>
              <button type="button" className="attach-item attach-file" onClick={() => download(a)}>
                <span className="attach-ext">{extOf(a.name).toUpperCase()}</span>
                <span className="attach-name">{a.name}<span className="fine">{sizeText(a.size)}</span></span>
                <span className="more">받기</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {zoom && (
        <div className="viewer" onClick={() => setZoom(null)}>
          <img src={url[zoom.path]} alt="" />
          <button className="btn-chalk" onClick={(e) => { e.stopPropagation(); download(zoom) }}>저장</button>
        </div>
      )}
    </section>
  )
}
