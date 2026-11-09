-- 016: 선생님이 학생이 처음 어떤 이름·구글 계정으로 들어왔는지 볼 수 있게
-- 학생이 나중에 이름을 바꿔도, 처음 가입할 때 적은 이름은 joined_name 에 남음.
-- 구글 이름·이메일은 다른 학생에게는 안 보이고, 그 반 선생님만 member_origins() 로 봄.

alter table public.members add column if not exists joined_name text;

-- 이미 있는 멤버는 지금 이름을 처음 이름으로 채움
update public.members set joined_name = display_name where joined_name is null;

create or replace function public.set_joined_name() returns trigger
language plpgsql as $$
begin
  new.joined_name := coalesce(new.joined_name, new.display_name);
  return new;
end $$;

drop trigger if exists members_joined_name on public.members;
create trigger members_joined_name before insert on public.members
  for each row execute function public.set_joined_name();

-- 처음 이름은 본인도 못 바꾸게 (이름 바꾸기는 display_name 만)
create or replace function public.keep_joined_name() returns trigger
language plpgsql as $$
begin
  new.joined_name := old.joined_name;
  return new;
end $$;

drop trigger if exists members_keep_joined_name on public.members;
create trigger members_keep_joined_name before update on public.members
  for each row execute function public.keep_joined_name();

-- 선생님 전용: 반 멤버의 처음 이름, 구글 계정 이름, 이메일
create or replace function public.member_origins(cid uuid)
returns table (user_id uuid, joined_name text, google_name text, email text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_teacher(cid) then
    raise exception '선생님만 볼 수 있어요';
  end if;
  return query
    select m.user_id, m.joined_name,
      coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')::text,
      u.email::text, m.joined_at
    from members m join auth.users u on u.id = m.user_id
    where m.class_id = cid;
end $$;

revoke execute on function public.member_origins(uuid) from public, anon;
grant execute on function public.member_origins(uuid) to authenticated;
