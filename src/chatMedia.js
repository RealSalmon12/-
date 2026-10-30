import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { compressImage } from './util.js'

export const MAX_BYTES = 5 * 1024 * 1024

// 올릴 그림 준비: 짤(GIF)은 움직이도록 그대로, 나머지 사진은 줄여서 JPEG 로
export async function prepareImage(file, maxSide = 1600) {
  if (!file.type.startsWith('image/')) throw new Error('그림 파일만 올릴 수 있어요.')
  if (file.type === 'image/gif') {
    if (file.size > MAX_BYTES) throw new Error('짤이 너무 커요. 5MB 이하만 올릴 수 있어요.')
    return { blob: file, ext: 'gif', type: 'image/gif' }
  }
  try {
    return { blob: await compressImage(file, maxSide, 0.82), ext: 'jpg', type: 'image/jpeg' }
  } catch {
    throw new Error('이 사진은 열 수 없어요. 다른 사진으로 해 주세요.')
  }
}

// 'chat' 버킷의 경로들을 1시간짜리 주소로 바꿔 둠. 50분이 지난 주소는 다시 받음
const cache = new Map() // path -> { url, at }
const fresh = (p) => cache.has(p) && Date.now() - cache.get(p).at < 50 * 60_000
export function useChatUrls(paths) {
  const [, bump] = useState(0)
  const key = [...new Set(paths.filter((p) => p && !fresh(p)))].sort().join('|')
  useEffect(() => {
    const missing = key ? key.split('|') : []
    if (!missing.length) return
    for (const p of missing) cache.set(p, { url: cache.get(p)?.url ?? null, at: Date.now() })
    supabase.storage.from('chat').createSignedUrls(missing, 3600).then(({ data }) => {
      for (const d of data ?? []) if (d.signedUrl) cache.set(d.path, { url: d.signedUrl, at: Date.now() })
      bump((n) => n + 1)
    })
  }, [key])
  return (path) => (path ? cache.get(path)?.url ?? null : null)
}

// 반 멤버 이름·역할·프로필 사진. DB 업데이트(008) 전이면 사진 없이 읽음
export async function loadClassPeople(classId) {
  let res = await supabase.from('members').select('user_id, display_name, role, avatar_path').eq('class_id', classId)
  if (res.error) res = await supabase.from('members').select('user_id, display_name, role').eq('class_id', classId)
  return Object.fromEntries((res.data ?? []).map((m) => [m.user_id, m]))
}
