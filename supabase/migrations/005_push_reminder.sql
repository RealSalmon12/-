-- 학급정리기 5차 업데이트: 수행평가 마감 하루 전 푸시 알림
-- 004_account_reset.sql 다음에 SQL Editor 에서 한 번 실행하세요.

-- 휴대폰(브라우저)마다 하나씩 생기는 푸시 구독 정보
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

drop policy if exists "내 알림 구독 보기" on public.push_subscriptions;
drop policy if exists "내 알림 구독 남기기" on public.push_subscriptions;
drop policy if exists "내 알림 구독 고치기" on public.push_subscriptions;
drop policy if exists "내 알림 구독 지우기" on public.push_subscriptions;
create policy "내 알림 구독 보기" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "내 알림 구독 남기기" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "내 알림 구독 고치기" on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "내 알림 구독 지우기" on public.push_subscriptions for delete using (user_id = auth.uid());

-- 같은 알림을 두 번 보내지 않도록 보낸 기록을 남김 (remind 함수만 씀)
create table if not exists public.reminder_log (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (assessment_id, user_id)
);
alter table public.reminder_log enable row level security;

-- 매일 18시(한국 시간)에 remind 함수를 부름. <ANON_KEY> 는 Supabase > Settings > API 의 anon 키.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('remind-due-tomorrow')
  where exists (select 1 from cron.job where jobname = 'remind-due-tomorrow');
select cron.schedule('remind-due-tomorrow', '0 9 * * *', $$
  select net.http_post(
    url := 'https://nbjuyovvivrdbjmrpvlp.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <ANON_KEY>'),
    body := '{}'::jsonb
  );
$$);
