import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { prepareImage, useChatUrls } from '../chatMedia.js'
import Avatar from './Avatar.jsx'

// 내 계정: 반에서 보이는 이름과 프로필 사진 바꾸기
export default function ProfileEdit() {
  const { user, member, reloadMember } = useSession()
  const [name, setName] = useState(member.display_name)
  const [avatar, setAvatar] = useState(undefined) // undefined = 아직 읽는 중
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const url = useChatUrls([avatar])

  useEffect(() => {
    supabase.from('members').select('avatar_path').eq('user_id', user.id).eq('class_id', member.class_id).single()
      .then(({ data, error }) => setAvatar(error ? null : data.avatar_path))
  }, [user.id, member.class_id])

  async function save(nextName, nextAvatar) {
    const { error } = await supabase.rpc('update_my_profile', { new_name: nextName, new_avatar: nextAvatar })
    if (error) {
      setError(error.message.includes('NAME_LENGTH') ? '이름은 1~20자로 적어 주세요.'
        : error.message.includes('update_my_profile') ? 'DB 업데이트(008_chat_photos_profile.sql)를 먼저 실행해 주세요.'
        : '저장하지 못했어요. 잠시 뒤 다시 해 주세요.')
      return false
    }
    reloadMember()
    return true
  }

  async function saveName(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSaved('')
    if (await save(name.trim(), avatar ?? null)) setSaved('이름을 바꿨어요.')
    setBusy(false)
  }

  async function pickPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setSaved('')
    try {
      // 프로필 사진은 작게, 짤도 움직이게 그대로
      const { blob, ext, type } = await prepareImage(file, 320)
      const path = `${member.class_id}/avatars/${user.id}-${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('chat').upload(path, blob, { contentType: type })
      if (error) throw new Error('사진을 올리지 못했어요. DB 업데이트(008)를 했는지 확인해 주세요.')
      if (await save(member.display_name, path)) {
        if (avatar) await supabase.storage.from('chat').remove([avatar])
        setAvatar(path)
        setSaved('프로필 사진을 바꿨어요.')
      } else {
        await supabase.storage.from('chat').remove([path])
      }
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function removePhoto() {
    setBusy(true)
    setError('')
    if (await save(member.display_name, null)) {
      await supabase.storage.from('chat').remove([avatar])
      setAvatar(null)
      setSaved('프로필 사진을 지웠어요.')
    }
    setBusy(false)
  }

  return (
    <section className="section profile-edit">
      <h2>프로필</h2>
      <div className="profile-photo">
        <Avatar url={url(avatar)} name={member.display_name} size={64} />
        <div className="actions">
          <label className="btn-quiet" aria-disabled={busy || avatar === undefined}>
            {busy ? '저장하는 중…' : '사진 바꾸기'}
            <input type="file" accept="image/*" className="sr-only" onChange={pickPhoto} disabled={busy || avatar === undefined} />
          </label>
          {avatar && <button className="btn-text quiet" onClick={removePhoto} disabled={busy}>사진 지우기</button>}
        </div>
      </div>
      <form className="search-row" onSubmit={saveName}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} aria-label="반에서 보이는 이름" />
        <button className="btn-quiet" disabled={busy || !name.trim() || name.trim() === member.display_name}>이름 저장</button>
      </form>
      <p className="fine">반 채팅과 멤버 목록에 보이는 이름과 사진이에요. 같은 반 사람만 볼 수 있어요.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="call-sent" role="status">{saved}</p>}
    </section>
  )
}
