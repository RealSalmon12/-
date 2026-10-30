-- 학급정리기 6차 업데이트: 관리자 호출 (한 사람당 하루 3번)
-- 005_push_reminder.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- 호출 기록. 부른 사람은 자기 것만, 관리자(선생님·반장·부반장)는 반 전체를 봄
create table if not exists public.admin_calls (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists admin_calls_class_time on public.admin_calls (class_id, created_at desc);
create index if not exists admin_calls_user_time on public.admin_calls (user_id, created_at desc);
alter table public.admin_calls enable row level security;

drop policy if exists "호출 보기" on public.admin_calls;
create policy "호출 보기" on public.admin_calls for select
  using (user_id = auth.uid() or can_post(class_id));
-- 넣기는 아래 call_admin() 으로만 (하루 3번 제한을 거기서 지킴)

-- 관리자 호출. 한국 시간으로 하루에 3번까지. 돌려주는 값: 새 호출의 id
create or replace function public.call_admin(msg text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  used int;
  new_id uuid;
begin
  select class_id into cid from members where user_id = auth.uid() order by joined_at limit 1;
  if cid is null then raise exception '반에 들어가 있지 않아요'; end if;

  -- 같은 사람이 동시에 여러 번 눌러도 3번을 넘지 않게 줄 세움
  perform pg_advisory_xact_lock(hashtext('admin_calls:' || auth.uid()::text));
  select count(*) into used from admin_calls
    where user_id = auth.uid()
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
  if used >= 3 then raise exception 'DAILY_LIMIT'; end if;

  insert into admin_calls (class_id, user_id, message)
    values (cid, auth.uid(), left(trim(coalesce(msg, '')), 60))
    returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.call_admin(text) from public, anon;
grant execute on function public.call_admin(text) to authenticated;
