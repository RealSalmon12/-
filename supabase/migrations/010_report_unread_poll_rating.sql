-- 학급정리기 10차 업데이트: 채팅 신고·차단, 안 읽은 메시지, 공지 읽음 확인, 채팅 투표, 급식 별점, @멘션
-- 009_notice_dm_calls.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- ── 채팅 신고 ───────────────────────────────────────────────
-- 신고하면 그 순간의 메시지 내용을 따로 남김 (나중에 지워져도 선생님이 볼 수 있게)
create table if not exists public.chat_reports (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes(id) on delete cascade,
  message_id bigint references public.chat_messages(id) on delete set null,
  reported_user uuid references auth.users(id) on delete set null,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 200),
  body_snapshot text not null default '',
  image_snapshot text,
  notified_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);
alter table public.chat_reports enable row level security;
drop policy if exists "내 신고나 선생님은 신고 보기" on public.chat_reports;
drop policy if exists "선생님은 신고 처리" on public.chat_reports;
create policy "내 신고나 선생님은 신고 보기" on public.chat_reports for select
  using (reporter_id = auth.uid() or is_teacher(class_id));
create policy "선생님은 신고 처리" on public.chat_reports for update
  using (is_teacher(class_id)) with check (is_teacher(class_id));

-- 신고하기. 같은 반 메시지만, 내 메시지는 안 됨. 돌려주는 값: 신고 id
create or replace function public.report_message(mid bigint, why text default '') returns bigint
language plpgsql security definer set search_path = public as $$
declare
  m record;
  rid bigint;
begin
  select * into m from chat_messages where id = mid;
  if m is null or not is_member(m.class_id) then raise exception 'NOT_FOUND'; end if;
  if m.user_id = auth.uid() then raise exception 'OWN_MESSAGE'; end if;
  insert into chat_reports (class_id, message_id, reported_user, reason, body_snapshot, image_snapshot)
    values (m.class_id, m.id, m.user_id, left(trim(coalesce(why, '')), 200), m.body, m.image_path)
    on conflict (message_id, reporter_id) do update set reason = excluded.reason
    returning id into rid;
  return rid;
end $$;
revoke execute on function public.report_message(bigint, text) from public, anon;
grant execute on function public.report_message(bigint, text) to authenticated;

-- ── 차단 (내 화면에서만 그 사람 메시지를 가림) ───────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "내 차단 목록" on public.user_blocks;
create policy "내 차단 목록" on public.user_blocks for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- ── 안 읽은 메시지: 방마다 어디까지 읽었는지 ─────────────────
-- room: 'class' (반 채팅) 또는 'dm:<학생 id>' (1:1)
create table if not exists public.chat_reads (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  room text not null check (room = 'class' or room like 'dm:%'),
  last_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, room)
);
alter table public.chat_reads enable row level security;
drop policy if exists "내 읽음 기록" on public.chat_reads;
create policy "내 읽음 기록" on public.chat_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 공지 읽음 확인 ──────────────────────────────────────────
create table if not exists public.announcement_reads (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.announcement_reads enable row level security;

create or replace function public.announcement_class(aid bigint) returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from announcements where id = aid;
$$;

drop policy if exists "공지 읽음 남기기" on public.announcement_reads;
drop policy if exists "내 읽음이나 선생님은 읽음 보기" on public.announcement_reads;
create policy "공지 읽음 남기기" on public.announcement_reads for insert
  with check (user_id = auth.uid() and is_member(announcement_class(announcement_id)));
create policy "내 읽음이나 선생님은 읽음 보기" on public.announcement_reads for select
  using (user_id = auth.uid() or is_teacher(announcement_class(announcement_id)));

-- ── 채팅 투표 ───────────────────────────────────────────────
create table if not exists public.polls (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 1 and 100),
  options text[] not null check (array_length(options, 1) between 2 and 6),
  created_at timestamptz not null default now()
);
alter table public.polls enable row level security;
drop policy if exists "같은 반 투표 보기" on public.polls;
drop policy if exists "같은 반 투표 만들기" on public.polls;
create policy "같은 반 투표 보기" on public.polls for select using (is_member(class_id));
create policy "같은 반 투표 만들기" on public.polls for insert
  with check (user_id = auth.uid() and is_member(class_id));

create table if not exists public.poll_votes (
  poll_id bigint not null references public.polls(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  choice smallint not null check (choice >= 0),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
alter table public.poll_votes enable row level security;

-- 그 투표가 있는 반에 내가 있고, 고른 번호가 보기 안에 있는지
create or replace function public.can_vote(pid bigint, pick smallint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from polls p where p.id = pid and is_member(p.class_id) and pick < array_length(p.options, 1)
  );
$$;
create or replace function public.poll_class(pid bigint) returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from polls where id = pid;
$$;

drop policy if exists "같은 반 투표 결과 보기" on public.poll_votes;
drop policy if exists "내 표 넣기" on public.poll_votes;
drop policy if exists "내 표 바꾸기" on public.poll_votes;
drop policy if exists "내 표 빼기" on public.poll_votes;
create policy "같은 반 투표 결과 보기" on public.poll_votes for select using (is_member(poll_class(poll_id)));
create policy "내 표 넣기" on public.poll_votes for insert
  with check (user_id = auth.uid() and can_vote(poll_id, choice));
create policy "내 표 바꾸기" on public.poll_votes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and can_vote(poll_id, choice));
create policy "내 표 빼기" on public.poll_votes for delete using (user_id = auth.uid());

-- 채팅 메시지에 투표·멘션 붙이기
alter table public.chat_messages add column if not exists poll_id bigint references public.polls(id) on delete cascade;
alter table public.chat_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.chat_messages add column if not exists notified_at timestamptz;
alter table public.chat_messages drop constraint if exists chat_messages_content_check;
alter table public.chat_messages add constraint chat_messages_content_check check (
  char_length(body) <= 500
  and (char_length(trim(body)) > 0 or image_path is not null or poll_id is not null)
  and coalesce(array_length(mentions, 1), 0) <= 20
);
-- 알림 보낸 표시(notified_at)는 notify 함수만 남김
drop policy if exists "같은 반 채팅 쓰기" on public.chat_messages;
create policy "같은 반 채팅 쓰기" on public.chat_messages for insert
  with check (
    user_id = auth.uid() and is_member(class_id) and notified_at is null
    and (poll_id is null or poll_class(poll_id) = class_id)
  );

-- ── 급식 별점 (반별) ─────────────────────────────────────────
create table if not exists public.meal_ratings (
  class_id uuid not null references public.classes(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (char_length(meal_type) <= 10),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (class_id, meal_date, meal_type, user_id)
);
alter table public.meal_ratings enable row level security;
drop policy if exists "같은 반 별점 보기" on public.meal_ratings;
drop policy if exists "내 별점 남기기" on public.meal_ratings;
drop policy if exists "내 별점 고치기" on public.meal_ratings;
drop policy if exists "내 별점 지우기" on public.meal_ratings;
create policy "같은 반 별점 보기" on public.meal_ratings for select using (is_member(class_id));
create policy "내 별점 남기기" on public.meal_ratings for insert
  with check (user_id = auth.uid() and is_member(class_id) and meal_date <= (now() at time zone 'Asia/Seoul')::date);
create policy "내 별점 고치기" on public.meal_ratings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member(class_id));
create policy "내 별점 지우기" on public.meal_ratings for delete using (user_id = auth.uid());

-- ── 실시간 ──────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null;
end $$;
