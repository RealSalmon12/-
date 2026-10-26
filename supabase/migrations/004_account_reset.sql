-- 학급정리기 4차 업데이트: 계정 초기화(반 나가기)
-- 003_school_picker.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- 내가 속한 반에서 나감. 내가 그 반의 마지막 선생님이면 반 전체(수행평가, 통신문 포함)를 지움.
-- 돌려주는 값: 'deleted' (반을 지움) 또는 'left' (나만 나감)
create or replace function public.leave_class() returns text
language plpgsql security definer set search_path = public as $$
declare
  m record;
  result text := 'left';
begin
  for m in select class_id, role from members where user_id = auth.uid() loop
    delete from assessment_done d
      using assessments a
      where d.assessment_id = a.id and a.class_id = m.class_id and d.user_id = auth.uid();
    if m.role = 'teacher' and not exists (
      select 1 from members
      where class_id = m.class_id and role = 'teacher' and user_id <> auth.uid()
    ) then
      delete from classes where id = m.class_id;   -- 멤버, 수행평가, 통신문은 cascade 로 같이 지워짐
      result := 'deleted';
    else
      delete from members where class_id = m.class_id and user_id = auth.uid();
    end if;
  end loop;
  return result;
end $$;

grant execute on function public.leave_class() to authenticated;
