-- 학급정리기 7차 업데이트: 반 채팅방
-- 006_call_admin.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- 같은 반 멤버만 보고 쓰는 메시지. 지우면 행이 사라짐
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_class_time on public.chat_messages (class_id, id desc);
alter table public.chat_messages enable row level security;

drop policy if exists "같은 반 채팅 보기" on public.chat_messages;
drop policy if exists "같은 반 채팅 쓰기" on public.chat_messages;
drop policy if exists "내 메시지나 관리자는 지우기" on public.chat_messages;
create policy "같은 반 채팅 보기" on public.chat_messages for select using (is_member(class_id));
create policy "같은 반 채팅 쓰기" on public.chat_messages for insert
  with check (user_id = auth.uid() and is_member(class_id));
-- 선생님·반장·부반장은 반 채팅의 아무 메시지나 지울 수 있음
create policy "내 메시지나 관리자는 지우기" on public.chat_messages for delete
  using (user_id = auth.uid() or can_post(class_id));

-- 도배 막기: 한 사람이 10초에 5개까지
create or replace function public.chat_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('chat:' || new.user_id::text));
  if (select count(*) from chat_messages
      where user_id = new.user_id and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'CHAT_TOO_FAST';
  end if;
  new.body := trim(new.body);
  new.created_at := now();
  return new;
end $$;
drop trigger if exists chat_rate_limit on public.chat_messages;
create trigger chat_rate_limit before insert on public.chat_messages
  for each row execute function public.chat_rate_limit();

-- 실시간으로 새 메시지·지운 메시지 받기 (지운 메시지는 id 만 오면 되므로 기본 설정 그대로)
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end $$;
