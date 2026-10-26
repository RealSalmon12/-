-- 학급정리기 3차 업데이트: 반마다 학교를 골라서 그 학교 급식·시간표·학사일정을 씀
-- 002_real_use.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- 반의 학교 정보 (NEIS 교육청 코드, 학교 코드, 이름, 학교 종류)
alter table public.classes
  add column if not exists office_code text,
  add column if not exists school_code text,
  add column if not exists school_name text,
  add column if not exists school_kind text;   -- 초등학교 / 중학교 / 고등학교 / 특수학교 등

-- 초등학교는 6학년까지 있으니 학년 범위를 넓힘
alter table public.classes drop constraint if exists classes_grade_check;
alter table public.classes add constraint classes_grade_check check (grade between 1 and 6);

-- 이미 만든 반은 처음 쓰던 학교로 채움 (학교 코드는 함수가 이름으로 찾아 씀)
update public.classes set
  office_code = coalesce(office_code, 'B10'),
  school_name = coalesce(school_name, '단국대학교부속소프트웨어고등학교'),
  school_kind = coalesce(school_kind, '고등학교');

-- 반 만들기: 학교도 같이 받음
drop function if exists public.create_class(int, int, text);
create function public.create_class(
  class_grade int, class_number int, my_name text,
  office text, school text, school_title text, kind text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if office is null or school is null then
    raise exception '학교를 먼저 골라 주세요';
  end if;
  insert into classes (name, grade, class_no, office_code, school_code, school_name, school_kind)
    values (class_grade || '학년 ' || class_number || '반', class_grade, class_number,
            office, school, school_title, kind)
    returning id into cid;
  insert into members (class_id, user_id, display_name, role)
    values (cid, auth.uid(), my_name, 'teacher');
  return cid;
end $$;
