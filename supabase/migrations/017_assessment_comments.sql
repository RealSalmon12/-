-- 017: 수행평가 댓글
-- 016_member_origin.sql 다음에 Supabase SQL Editor 에서 한 번 실행하세요.
-- 같은 반 멤버(학생 포함)는 누구나 댓글을 보고 쓸 수 있고,
-- 자기 댓글은 본인이, 아무 댓글이나 선생님·반장·부반장이 지울 수 있어요.

create table if not exists public.assessment_comments (
  id bigint generated always as identity primary key,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists assessment_comments_by_assessment
  on public.assessment_comments (assessment_id, id);
alter table public.assessment_comments enable row level security;

drop policy if exists "같은 반 댓글 보기" on public.assessment_comments;
drop policy if exists "같은 반 댓글 쓰기" on public.assessment_comments;
drop policy if exists "내 댓글이나 관리자는 지우기" on public.assessment_comments;
create policy "같은 반 댓글 보기" on public.assessment_comments for select
  using (is_member(class_id));
create policy "같은 반 댓글 쓰기" on public.assessment_comments for insert
  with check (user_id = auth.uid() and is_member(class_id));
create policy "내 댓글이나 관리자는 지우기" on public.assessment_comments for delete
  using (user_id = auth.uid() or can_post(class_id));
-- 고치기(update)는 막아 둠: 정책이 없으면 아무도 못 고침

-- 반은 수행평가에서 가져옴(다른 반 이름으로 못 쓰게), 도배 막기: 10초에 5개까지
create or replace function public.assessment_comment_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select class_id into new.class_id from assessments where id = new.assessment_id;
  if new.class_id is null then
    raise exception 'NO_ASSESSMENT';
  end if;
  perform pg_advisory_xact_lock(hashtext('acomment:' || new.user_id::text));
  if (select count(*) from assessment_comments
      where user_id = new.user_id and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'COMMENT_TOO_FAST';
  end if;
  new.body := trim(new.body);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists assessment_comment_before on public.assessment_comments;
create trigger assessment_comment_before before insert on public.assessment_comments
  for each row execute function public.assessment_comment_before();

-- 다른 사람이 단 댓글도 바로 보이게 (실시간)
do $$ begin
  alter publication supabase_realtime add table public.assessment_comments;
exception when duplicate_object then null;
end $$;
