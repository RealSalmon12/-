-- 학급정리기 9차 업데이트: 선생님 공지, 선생님과 1:1 채팅, 한 명만 호출, 반별 호출 횟수
-- 008_chat_photos_profile.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- ── 선생님 공지 ─────────────────────────────────────────────
create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 60),
  body text not null default '' check (char_length(body) <= 2000),
  notified_at timestamptz,          -- notify 함수가 알림을 보낸 시각 (두 번 보내지 않게)
  created_at timestamptz not null default now()
);
create index if not exists announcements_class_time on public.announcements (class_id, id desc);
alter table public.announcements enable row level security;

drop policy if exists "같은 반 공지 보기" on public.announcements;
drop policy if exists "선생님은 공지 쓰기" on public.announcements;
drop policy if exists "선생님은 공지 지우기" on public.announcements;
create policy "같은 반 공지 보기" on public.announcements for select using (is_member(class_id));
create policy "선생님은 공지 쓰기" on public.announcements for insert
  with check (user_id = auth.uid() and is_teacher(class_id) and notified_at is null);
create policy "선생님은 공지 지우기" on public.announcements for delete using (is_teacher(class_id));

-- ── 학생 ↔ 선생님 1:1 채팅 ──────────────────────────────────
-- 대화방은 (반, 학생) 하나. 그 반 선생님은 모두 같은 대화방을 봄
create table if not exists public.direct_messages (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists direct_messages_thread on public.direct_messages (class_id, student_id, id desc);
alter table public.direct_messages enable row level security;

-- 그 반의 선생님이 아닌 멤버인지
create or replace function public.is_class_student(cid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where class_id = cid and user_id = uid and role <> 'teacher');
$$;

drop policy if exists "내 1:1 채팅 보기" on public.direct_messages;
drop policy if exists "내 1:1 채팅 쓰기" on public.direct_messages;
drop policy if exists "내 1:1 메시지 지우기" on public.direct_messages;
create policy "내 1:1 채팅 보기" on public.direct_messages for select
  using (student_id = auth.uid() or is_teacher(class_id));
create policy "내 1:1 채팅 쓰기" on public.direct_messages for insert
  with check (
    sender_id = auth.uid() and notified_at is null and is_class_student(class_id, student_id)
    and (student_id = auth.uid() or is_teacher(class_id))
  );
create policy "내 1:1 메시지 지우기" on public.direct_messages for delete using (sender_id = auth.uid());

-- 도배 막기: 1:1 채팅도 한 사람이 10초에 5개까지
create or replace function public.dm_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('dm:' || new.sender_id::text));
  if (select count(*) from direct_messages
      where sender_id = new.sender_id and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'CHAT_TOO_FAST';
  end if;
  new.body := trim(new.body);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists dm_rate_limit on public.direct_messages;
create trigger dm_rate_limit before insert on public.direct_messages
  for each row execute function public.dm_rate_limit();

do $$ begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object then null;
end $$;

-- ── 관리자 호출: 한 명만 부르기, 반별 하루 횟수 ──────────────
alter table public.admin_calls add column if not exists target_id uuid references auth.users(id) on delete set null;
alter table public.classes add column if not exists daily_call_limit int not null default 3;
alter table public.classes drop constraint if exists classes_daily_call_limit_check;
alter table public.classes add constraint classes_daily_call_limit_check check (daily_call_limit between 1 and 20);

-- 관리자 호출. target 을 주면 그 관리자 한 명만 부름. 하루 횟수는 반 설정(기본 3번)
drop function if exists public.call_admin(text);
create or replace function public.call_admin(msg text default '', target uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  lim int;
  used int;
  new_id uuid;
begin
  select m.class_id, c.daily_call_limit into cid, lim
    from members m join classes c on c.id = m.class_id
    where m.user_id = auth.uid() order by m.joined_at limit 1;
  if cid is null then raise exception '반에 들어가 있지 않아요'; end if;
  if target is not null and (target = auth.uid() or not exists (
    select 1 from members where class_id = cid and user_id = target and role in ('teacher', 'president', 'vice')
  )) then
    raise exception 'BAD_TARGET';
  end if;

  -- 같은 사람이 동시에 여러 번 눌러도 횟수를 넘지 않게 줄 세움
  perform pg_advisory_xact_lock(hashtext('admin_calls:' || auth.uid()::text));
  select count(*) into used from admin_calls
    where user_id = auth.uid()
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
  if used >= lim then raise exception 'DAILY_LIMIT'; end if;

  insert into admin_calls (class_id, user_id, message, target_id)
    values (cid, auth.uid(), left(trim(coalesce(msg, '')), 60), target)
    returning id into new_id;
  return new_id;
end $$;

revoke execute on function public.call_admin(text, uuid) from public, anon;
grant execute on function public.call_admin(text, uuid) to authenticated;
