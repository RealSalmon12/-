-- 학급정리기 DB 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 실행하세요.

create extension if not exists pgcrypto;

-- 반
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- 예: 2학년 3반
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

-- 반 멤버와 역할
create table public.members (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'student'
    check (role in ('teacher', 'president', 'vice', 'student')),
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

-- 수행평가
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject text not null,
  due_date date not null,
  title text not null,
  content text not null default '',
  materials text not null default '',
  author_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.assessments (class_id, due_date);

-- 가정통신문
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  memo text not null default '',
  due_date date,
  photo_paths text[] not null default '{}',   -- storage 'notices' 버킷 안의 경로
  author_id uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.notices (class_id, created_at desc);

-- 급식 캐시 (Edge Function 만 씀)
create table public.meal_cache (
  meal_date date not null,
  meal_type text not null,           -- 조식 / 중식 / 석식
  dishes text[] not null,
  calories text,
  fetched_at timestamptz not null default now(),
  primary key (meal_date, meal_type)
);

-- 권한 확인 함수
create function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where class_id = cid and user_id = auth.uid());
$$;

create function public.can_post(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members
    where class_id = cid and user_id = auth.uid()
      and role in ('teacher', 'president', 'vice')
  );
$$;

create function public.is_teacher(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members where class_id = cid and user_id = auth.uid() and role = 'teacher'
  );
$$;

-- 선생님이 반 만들기 (만든 사람이 담임으로 등록됨)
create function public.create_class(class_name text, my_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  insert into classes (name) values (class_name) returning id into cid;
  insert into members (class_id, user_id, display_name, role)
    values (cid, auth.uid(), my_name, 'teacher');
  return cid;
end $$;

-- 초대 코드로 반 들어가기 (학생으로 등록됨)
create function public.join_class(code text, my_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from classes where invite_code = upper(trim(code));
  if cid is null then
    raise exception '초대 코드가 맞지 않아요';
  end if;
  insert into members (class_id, user_id, display_name)
    values (cid, auth.uid(), my_name)
    on conflict (class_id, user_id) do nothing;
  return cid;
end $$;

-- 초대 코드 새로 만들기 (선생님만)
create function public.reset_invite_code(cid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not is_teacher(cid) then raise exception '선생님만 할 수 있어요'; end if;
  update classes set invite_code = upper(substr(md5(random()::text), 1, 6))
    where id = cid returning invite_code into code;
  return code;
end $$;

-- 행 단위 권한 (RLS)
alter table public.classes enable row level security;
alter table public.members enable row level security;
alter table public.assessments enable row level security;
alter table public.notices enable row level security;
alter table public.meal_cache enable row level security;

create policy "멤버는 반 정보 보기" on public.classes for select using (is_member(id));

create policy "멤버는 같은 반 멤버 보기" on public.members for select using (is_member(class_id));
-- 선생님은 역할 변경(반장/부반장 지정)과 내보내기 가능. 선생님 역할은 바꿀 수 없음.
create policy "선생님은 역할 변경" on public.members for update
  using (is_teacher(class_id) and role <> 'teacher')
  with check (role in ('president', 'vice', 'student'));
create policy "선생님은 멤버 내보내기" on public.members for delete
  using (is_teacher(class_id) and role <> 'teacher');

create policy "멤버는 수행평가 보기" on public.assessments for select using (is_member(class_id));
create policy "작성자만 수행평가 쓰기" on public.assessments for insert with check (can_post(class_id));
create policy "작성자만 수행평가 고치기" on public.assessments for update
  using (can_post(class_id)) with check (can_post(class_id));
create policy "작성자만 수행평가 지우기" on public.assessments for delete using (can_post(class_id));

create policy "멤버는 통신문 보기" on public.notices for select using (is_member(class_id));
create policy "작성자만 통신문 쓰기" on public.notices for insert with check (can_post(class_id));
create policy "작성자만 통신문 고치기" on public.notices for update
  using (can_post(class_id)) with check (can_post(class_id));
create policy "작성자만 통신문 지우기" on public.notices for delete using (can_post(class_id));

create policy "로그인하면 급식 보기" on public.meal_cache for select to authenticated using (true);

-- 사진 저장소: 비공개 버킷, 경로는 "<class_id>/<파일명>"
insert into storage.buckets (id, name, public) values ('notices', 'notices', false)
  on conflict (id) do nothing;

create policy "멤버는 통신문 사진 보기" on storage.objects for select
  using (bucket_id = 'notices' and is_member(((storage.foldername(name))[1])::uuid));
create policy "작성자만 통신문 사진 올리기" on storage.objects for insert
  with check (bucket_id = 'notices' and can_post(((storage.foldername(name))[1])::uuid));
create policy "작성자만 통신문 사진 지우기" on storage.objects for delete
  using (bucket_id = 'notices' and can_post(((storage.foldername(name))[1])::uuid));
