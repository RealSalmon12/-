-- BacoClass 15차 업데이트: 반마다 앱에서 리로스쿨 계정 연결하기
-- 014_riro_body_html.sql 다음에 SQL Editor 에서 한 번 실행하세요. 바꿀 곳은 없어요.
-- 비밀번호는 Supabase Vault 에 암호화해서 넣고, riro-sync 함수(service_role)만 꺼낼 수 있어요.

create extension if not exists supabase_vault with schema vault;

alter table public.riro_links
  add column if not exists base_url text,     -- https://xxx.riroschool.kr/
  add column if not exists assess_db text,    -- 교과활동 게시판 번호 (예: 1551)
  add column if not exists notice_db text,    -- 가정통신문 게시판 번호 (예: 1901)
  add column if not exists riro_id text,
  add column if not exists pw_secret uuid;    -- vault.secrets 의 id

-- 앱 사용자는 상태 칸만 읽음 (리로스쿨 아이디, 비밀번호 위치는 못 읽음)
revoke select on public.riro_links from anon, authenticated;
grant select (class_id, author_id, base_url, last_run_at, last_ok_at, last_error, created_at)
  on public.riro_links to authenticated;

-- 연결 저장: 같은 반을 다시 연결하면 비밀번호를 바꿔 넣고 오류 기록을 지움
create or replace function public.riro_save_login(cid uuid, author uuid, base text, adb text, ndb text, rid text, rpw text)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  delete from vault.secrets where name = 'riro-' || cid::text;
  sid := vault.create_secret(rpw, 'riro-' || cid::text, 'BacoClass 리로스쿨 비밀번호');
  insert into riro_links (class_id, author_id, base_url, assess_db, notice_db, riro_id, pw_secret)
  values (cid, author, base, adb, ndb, rid, sid)
  on conflict (class_id) do update set
    author_id = excluded.author_id, base_url = excluded.base_url, assess_db = excluded.assess_db,
    notice_db = excluded.notice_db, riro_id = excluded.riro_id, pw_secret = excluded.pw_secret,
    failed_login = null, last_error = null, last_run_at = null;
end $$;

-- 가져올 때 쓰는 계정 (함수만)
create or replace function public.riro_logins(cids uuid[])
returns table (class_id uuid, base_url text, assess_db text, notice_db text, riro_id text, riro_pw text)
language sql stable security definer set search_path = public as $$
  select l.class_id, l.base_url, l.assess_db, l.notice_db, l.riro_id, s.decrypted_secret
  from riro_links l
  left join vault.decrypted_secrets s on s.id = l.pw_secret
  where l.class_id = any(cids);
$$;

-- 연결 끊기: 비밀번호도 지움
create or replace function public.riro_forget(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from vault.secrets where name = 'riro-' || cid::text;
  delete from riro_links where class_id = cid;
end $$;

-- 세 함수는 riro-sync 함수(service_role)만 부를 수 있음
revoke execute on function public.riro_save_login(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.riro_logins(uuid[]) from public, anon, authenticated;
revoke execute on function public.riro_forget(uuid) from public, anon, authenticated;
grant execute on function public.riro_save_login(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.riro_logins(uuid[]) to service_role;
grant execute on function public.riro_forget(uuid) to service_role;
