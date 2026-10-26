-- 학급정리기 2차 업데이트: 평가 방식·배점, 개인 완료 체크, 학년/반 번호, NEIS 캐시
-- schema.sql 을 실행한 뒤, 이 파일을 SQL Editor 에 붙여넣고 한 번 실행하세요.

-- 수행평가: 평가 방식과 반영 비율(%)
alter table public.assessments
  add column if not exists kind text not null default '',
  add column if not exists weight smallint check (weight between 0 and 100);

-- 반: 시간표를 불러오려면 학년과 반 번호가 필요함
alter table public.classes
  add column if not exists grade smallint check (grade between 1 and 3),
  add column if not exists class_no smallint check (class_no between 1 and 20);

-- 이미 만든 반은 이름("2학년 3반")에서 숫자를 뽑아 채움
update public.classes set
  grade = coalesce(grade, (regexp_match(name, '(\d)\s*학년'))[1]::smallint),
  class_no = coalesce(class_no, (regexp_match(name, '(\d+)\s*반'))[1]::smallint);

create policy "선생님은 반 정보 고치기" on public.classes for update
  using (is_teacher(id)) with check (is_teacher(id));

-- 반 만들기: 학년, 반 번호를 같이 받음
drop function if exists public.create_class(text, text);
create function public.create_class(class_grade int, class_number int, my_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  insert into classes (name, grade, class_no)
    values (class_grade || '학년 ' || class_number || '반', class_grade, class_number)
    returning id into cid;
  insert into members (class_id, user_id, display_name, role)
    values (cid, auth.uid(), my_name, 'teacher');
  return cid;
end $$;

-- 내가 끝낸 수행평가 (본인만 보고 바꿀 수 있음)
create table if not exists public.assessment_done (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (assessment_id, user_id)
);
alter table public.assessment_done enable row level security;

create policy "내 완료 기록 보기" on public.assessment_done for select
  using (user_id = auth.uid());
create policy "내 완료 기록 남기기" on public.assessment_done for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from assessments a where a.id = assessment_id and is_member(a.class_id))
  );
create policy "내 완료 기록 지우기" on public.assessment_done for delete
  using (user_id = auth.uid());

-- 시간표·학사일정 캐시 (Edge Function 만 씀)
create table if not exists public.neis_cache (
  key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.neis_cache enable row level security;
