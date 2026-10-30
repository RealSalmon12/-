-- 학급정리기 8차 업데이트: 채팅 사진·짤, 내 이름·프로필 사진 바꾸기
-- 007_class_chat.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- 채팅 메시지에 사진 한 장. 글이 비어 있어도 사진이 있으면 보낼 수 있음
alter table public.chat_messages add column if not exists image_path text;
alter table public.chat_messages alter column body set default '';
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages drop constraint if exists chat_messages_content_check;
alter table public.chat_messages add constraint chat_messages_content_check check (
  char_length(body) <= 500 and (char_length(trim(body)) > 0 or image_path is not null)
);

-- 프로필 사진 (storage 'chat' 버킷의 '<반 id>/avatars/...')
alter table public.members add column if not exists avatar_path text;

-- 내 이름·프로필 사진 바꾸기. 역할은 건드리지 않음
create or replace function public.update_my_profile(new_name text, new_avatar text) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  select class_id into cid from members where user_id = auth.uid() order by joined_at limit 1;
  if cid is null then raise exception '반에 들어가 있지 않아요'; end if;
  if char_length(trim(coalesce(new_name, ''))) not between 1 and 20 then
    raise exception 'NAME_LENGTH';
  end if;
  if new_avatar is not null and new_avatar not like cid::text || '/avatars/' || auth.uid()::text || '-%' then
    raise exception 'BAD_AVATAR';
  end if;
  update members set display_name = trim(new_name), avatar_path = new_avatar
    where user_id = auth.uid() and class_id = cid;
end $$;
revoke execute on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- 채팅 사진·프로필 사진 저장소. 같은 반 멤버만 보고 올림. 한 장 5MB, 그림 파일만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 5242880, array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "같은 반 채팅 사진 보기" on storage.objects;
drop policy if exists "같은 반 채팅 사진 올리기" on storage.objects;
drop policy if exists "내 사진이나 관리자는 채팅 사진 지우기" on storage.objects;
create policy "같은 반 채팅 사진 보기" on storage.objects for select
  using (bucket_id = 'chat' and is_member(((storage.foldername(name))[1])::uuid));
create policy "같은 반 채팅 사진 올리기" on storage.objects for insert
  with check (bucket_id = 'chat' and is_member(((storage.foldername(name))[1])::uuid));
create policy "내 사진이나 관리자는 채팅 사진 지우기" on storage.objects for delete
  using (bucket_id = 'chat' and (owner_id = auth.uid()::text or can_post(((storage.foldername(name))[1])::uuid)));
