-- 학급정리기 12차 업데이트: 수행평가에 사진·파일 첨부
-- 011_submissions_dday.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- 첨부 목록: [{ "path": "<반 id>/<uuid>.pdf", "name": "원래 파일 이름.pdf", "size": 12345, "type": "application/pdf" }]
alter table public.assessments add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.assessments drop constraint if exists assessments_attachments_check;
alter table public.assessments add constraint assessments_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

-- 비공개 버킷: 같은 반만 보고, 선생님·반장·부반장만 올리고 지움. 한 파일 20MB 까지
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assessments', 'assessments', false, 20971520, array[
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'application/zip',
  'application/x-hwp', 'application/hwp+zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "멤버는 수행평가 첨부 보기" on storage.objects;
drop policy if exists "작성자만 수행평가 첨부 올리기" on storage.objects;
drop policy if exists "작성자만 수행평가 첨부 지우기" on storage.objects;
create policy "멤버는 수행평가 첨부 보기" on storage.objects for select
  using (bucket_id = 'assessments' and is_member(((storage.foldername(name))[1])::uuid));
create policy "작성자만 수행평가 첨부 올리기" on storage.objects for insert
  with check (bucket_id = 'assessments' and can_post(((storage.foldername(name))[1])::uuid));
create policy "작성자만 수행평가 첨부 지우기" on storage.objects for delete
  using (bucket_id = 'assessments' and can_post(((storage.foldername(name))[1])::uuid));
