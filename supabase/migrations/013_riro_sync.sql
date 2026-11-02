-- BacoClass 13차 업데이트: 리로스쿨 수행평가·가정통신문 자동 가져오기
-- 012_assessment_files.sql 다음에 SQL Editor 에서 한 번 실행하세요.
-- 맨 아래 "연결" 부분의 <초대코드> 와 <내 구글 이메일> 두 군데만 바꾸면 돼요.

-- ── 어디서 온 글인지 ─────────────────────────────────────────
-- source: 'riro' 이면 리로스쿨에서 가져온 글. source_id 로 같은 글을 두 번 올리지 않음
alter table public.assessments
  add column if not exists source text,
  add column if not exists source_id text,
  add column if not exists source_url text;
alter table public.notices
  add column if not exists source text,
  add column if not exists source_id text,
  add column if not exists source_url text,
  -- 사진이 아닌 첨부(PDF·한글 등). 모양은 수행평가 attachments 와 같음
  add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.notices drop constraint if exists notices_attachments_check;
alter table public.notices add constraint notices_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

create unique index if not exists assessments_source_uniq
  on public.assessments (class_id, source, source_id) where source is not null;
create unique index if not exists notices_source_uniq
  on public.notices (class_id, source, source_id) where source is not null;

-- 한 번 가져온 글 번호. 반에서 지운 글을 다음에 다시 가져오지 않게 (riro-sync 함수만 씀)
create table if not exists public.riro_seen (
  class_id uuid not null references public.classes(id) on delete cascade,
  kind text not null check (kind in ('assessment', 'notice')),
  source_id text not null,
  seen_at timestamptz not null default now(),
  primary key (class_id, kind, source_id)
);
alter table public.riro_seen enable row level security;

-- ── 연결 설정 (riro-sync 함수만 고침) ─────────────────────────
-- 리로스쿨 아이디·비밀번호는 여기가 아니라 Supabase 시크릿(RIRO_ID, RIRO_PW)에만 둠
create table if not exists public.riro_links (
  class_id uuid primary key references public.classes(id) on delete cascade,
  -- 가져온 글의 작성자로 표시될 사람 (선생님·반장·부반장)
  author_id uuid not null references auth.users(id) on delete cascade,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  -- 로그인에 실패한 아이디·비밀번호의 지문. 같은 값으로 다시 시도하지 않아 계정 잠금을 막음
  failed_login text,
  created_at timestamptz not null default now()
);
alter table public.riro_links enable row level security;

-- 반 관리자는 상태(마지막으로 가져온 시각, 오류)만 봄. 연결·해제는 SQL 로만
drop policy if exists "관리자는 리로스쿨 연결 상태 보기" on public.riro_links;
create policy "관리자는 리로스쿨 연결 상태 보기" on public.riro_links for select
  using (can_post(class_id));

-- ── 하루 세 번 가져오기 (한국 시간 7:00, 12:40, 17:00) ──────────
-- <ANON_KEY> 는 Supabase > Settings > API 의 anon 키 (005 에 넣은 것과 같음)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobname) from cron.job where jobname like 'riro-sync-%';
select cron.schedule('riro-sync-' || t.name, t.spec, $$
  select net.http_post(
    url := 'https://nbjuyovvivrdbjmrpvlp.supabase.co/functions/v1/riro-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <ANON_KEY>'),
    body := '{}'::jsonb
  );
$$)
from (values ('morning', '0 22 * * *'), ('lunch', '40 3 * * *'), ('evening', '0 8 * * *')) as t(name, spec);

-- ── 연결: 내 반에 리로스쿨 글을 넣기 ───────────────────────────
-- <초대코드> 는 반 초대 코드(6자리), <내 구글 이메일> 은 BacoClass 에 로그인한 구글 계정
-- 그 반의 선생님·반장·부반장이어야 연결돼요.
insert into public.riro_links (class_id, author_id)
select m.class_id, m.user_id
from public.members m
join public.classes c on c.id = m.class_id
join auth.users u on u.id = m.user_id
where c.invite_code = upper('<초대코드>')
  and lower(u.email) = lower('<내 구글 이메일>')
  and m.role in ('teacher', 'president', 'vice')
on conflict (class_id) do update set author_id = excluded.author_id, failed_login = null;

-- 연결됐는지 확인: 한 줄이 나오면 성공
select c.name, l.created_at from public.riro_links l join public.classes c on c.id = l.class_id;
