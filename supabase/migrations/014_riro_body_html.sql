-- BacoClass 14차 업데이트: 리로스쿨 글을 표 모양 그대로 보여 주기
-- 013_riro_sync.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- 리로스쿨 본문(표·굵게·목록만 남긴 HTML). riro-sync 함수만 씀
alter table public.assessments add column if not exists body_html text;
alter table public.notices add column if not exists body_html text;

-- 앱 사용자(선생님·반장·부반장 포함)는 이 칸을 쓸 수 없게: 함수(service_role)만 넣음
create or replace function public.keep_body_html() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.body_html := case when tg_op = 'UPDATE' then old.body_html else null end;
  end if;
  return new;
end $$;
drop trigger if exists keep_body_html on public.assessments;
create trigger keep_body_html before insert or update on public.assessments
  for each row execute function public.keep_body_html();
drop trigger if exists keep_body_html on public.notices;
create trigger keep_body_html before insert or update on public.notices
  for each row execute function public.keep_body_html();

-- 이미 가져온 리로스쿨 글을 지우고 새 형식(표·첨부·우리 반만)으로 다시 가져오기
-- 반 관리 → 지금 가져오기 를 누르면 다시 들어와요. (직접 쓴 글은 안 지워요)
delete from public.assessments where source = 'riro';
delete from public.notices where source = 'riro';
delete from public.riro_seen;
update public.riro_links set last_run_at = null;
