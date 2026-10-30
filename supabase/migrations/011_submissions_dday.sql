-- 학급정리기 11차 업데이트: 가정통신문 제출 체크, 반 D-day
-- 010_report_unread_poll_rating.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- ── 가정통신문 제출 체크 ─────────────────────────────────────
-- 선생님·반장·부반장이 낸 학생을 체크. 학생은 자기 것만 봄
create table if not exists public.notice_submissions (
  notice_id uuid not null references public.notices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  checked_at timestamptz not null default now(),
  primary key (notice_id, user_id)
);
alter table public.notice_submissions enable row level security;

create or replace function public.notice_class(nid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from notices where id = nid;
$$;

drop policy if exists "내 제출이나 관리자는 제출 보기" on public.notice_submissions;
drop policy if exists "관리자는 제출 체크" on public.notice_submissions;
drop policy if exists "관리자는 제출 체크 풀기" on public.notice_submissions;
create policy "내 제출이나 관리자는 제출 보기" on public.notice_submissions for select
  using (user_id = auth.uid() or can_post(notice_class(notice_id)));
create policy "관리자는 제출 체크" on public.notice_submissions for insert
  with check (checked_by = auth.uid() and can_post(notice_class(notice_id))
    and is_class_student(notice_class(notice_id), user_id));
create policy "관리자는 제출 체크 풀기" on public.notice_submissions for delete
  using (can_post(notice_class(notice_id)));

-- 안 낸 학생에게 알림을 마지막으로 보낸 시각 (notify 함수가 한 시간에 한 번만 보내게)
alter table public.notices add column if not exists reminded_at timestamptz;

-- ── 반 D-day ────────────────────────────────────────────────
create table if not exists public.class_events (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 30),
  event_date date not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists class_events_class_date on public.class_events (class_id, event_date);
alter table public.class_events enable row level security;
drop policy if exists "같은 반 D-day 보기" on public.class_events;
drop policy if exists "관리자는 D-day 만들기" on public.class_events;
drop policy if exists "관리자는 D-day 지우기" on public.class_events;
create policy "같은 반 D-day 보기" on public.class_events for select using (is_member(class_id));
create policy "관리자는 D-day 만들기" on public.class_events for insert
  with check (created_by = auth.uid() and can_post(class_id));
create policy "관리자는 D-day 지우기" on public.class_events for delete using (can_post(class_id));
