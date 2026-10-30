# 학급정리기

우리 반 수행평가 일정, 가정통신문 사진, 오늘 급식을 한 화면에서 보는 웹앱(PWA)입니다.
휴대폰 브라우저에서 열고 "홈 화면에 추가"를 누르면 앱처럼 쓸 수 있어요.

- 선생님, 반장, 부반장: 수행평가와 가정통신문을 쓰고 고치고 지울 수 있음
- 학생: 모든 내용을 볼 수 있음
- 급식, 시간표, 학사일정: 반을 만들 때 고른 학교의 정보를 NEIS 에서 자동으로 불러옴 (전국 초·중·고)
- 수행평가마다 "다 했어요" 체크, 휴대폰 캘린더로 내보내기

## 처음 설정하기

### 1. Supabase (무료)

1. [supabase.com](https://supabase.com) 에서 새 프로젝트를 만듭니다.
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 내용을 통째로 붙여넣고 실행합니다.
   이어서 [`002_real_use.sql`](supabase/migrations/002_real_use.sql), [`003_school_picker.sql`](supabase/migrations/003_school_picker.sql), [`004_account_reset.sql`](supabase/migrations/004_account_reset.sql) 도 순서대로 한 번씩 실행합니다.
3. **Authentication > Providers > Google** 을 켭니다. (Google Cloud Console 에서 OAuth 클라이언트 ID 를 만들어 넣어야 해요.)
4. **Authentication > URL Configuration** 의 Site URL 에 배포 주소(예: `https://학급정리기.vercel.app`)를 넣습니다.

### 2. 급식 API

1. [교육정보 개방포털](https://open.neis.go.kr) 에서 인증키를 발급받습니다.
2. [Supabase CLI](https://supabase.com/docs/guides/cli) 로 급식 함수를 올립니다.

```bash
supabase link --project-ref <프로젝트 ref>
supabase secrets set NEIS_API_KEY=<발급받은 키>
supabase functions deploy meals
```

### 마감 하루 전 알림 (선택)

1. `supabase secrets set VAPID_KEYS='<JWK 두 개를 담은 JSON>'` (공개 키는 `src/push.js` 의 `VAPID_PUBLIC_KEY` 와 짝이어야 해요)
2. `supabase functions deploy remind`
3. SQL Editor 에서 [`005_push_reminder.sql`](supabase/migrations/005_push_reminder.sql) 의 `<ANON_KEY>` 를 anon 키로 바꿔 실행 (Database > Extensions 에서 pg_cron, pg_net 이 켜져 있어야 해요)

매일 18시(한국 시간)에 다음 날 마감인 수행평가를 알림을 켠 학생에게 보내요.

아이폰·아이패드(iOS 16.4 이상)는 홈 화면에 추가한 앱에서, 맥은 사파리·크롬에서 알림을 받아요. 애플 푸시 서버는 VAPID 연락처가 진짜 주소여야 해서 기본값을 앱 주소로 두었어요. 바꾸려면 `VAPID_CONTACT` 시크릿에 `mailto:` 또는 `https:` 주소를 넣으세요.

### 관리자 호출 (선택)

1. SQL Editor 에서 [`006_call_admin.sql`](supabase/migrations/006_call_admin.sql) 실행
2. `supabase functions deploy call-admin` (VAPID_KEYS 시크릿은 remind 와 같이 씀)

학생·반장·부반장이 홈의 **관리자 호출**로 선생님·반장·부반장에게 바로 알림을 보내요. 한 사람당 하루(한국 시간) 3번까지예요.

### 선생님 공지, 1:1 채팅, 호출 설정

1. SQL Editor 에서 [`009_notice_dm_calls.sql`](supabase/migrations/009_notice_dm_calls.sql) 실행
2. `supabase functions deploy notify` (공지·1:1 메시지 알림), `supabase functions deploy call-admin` (한 명만 부르기)

선생님이 공지를 쓰면 반 전체에 알림이 가요. 채팅 탭의 "1:1"에서 학생과 선생님이 따로 대화해요. 관리자 호출은 한 명만 골라 부를 수 있고, 하루 횟수는 반 관리에서 선생님이 1~20번으로 정해요.

### 반 채팅

SQL Editor 에서 [`007_class_chat.sql`](supabase/migrations/007_class_chat.sql) 실행. 같은 반 멤버끼리 실시간으로 대화하고(Realtime), 본인 메시지는 본인이, 모든 메시지는 선생님·반장·부반장이 지울 수 있어요. 한 사람이 10초에 5개까지만 보낼 수 있어요.

채팅 사진·짤과 프로필(이름, 사진)을 쓰려면 [`008_chat_photos_profile.sql`](supabase/migrations/008_chat_photos_profile.sql) 도 실행하세요. 비공개 `chat` 버킷(한 장 5MB, 그림 파일만)을 만들어요.

학교는 반마다 앱에서 검색해서 고르므로 학교 코드를 따로 넣을 필요가 없어요.
대시보드에서 올린다면 **Edge Functions → meals → Code** 에 [`index.ts`](supabase/functions/meals/index.ts) 를 붙여넣고 Deploy 하면 돼요. 이 함수 하나가 급식, 시간표, 학사일정을 모두 처리해요.

### 3. 배포 (Vercel, 무료)

1. [vercel.com](https://vercel.com) 에서 이 저장소를 가져옵니다.
2. 환경 변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 를 넣습니다. (Supabase > Settings > API)
3. 배포된 주소를 학생들에게 공유합니다.

## 사용 방법

1. 선생님이 먼저 로그인해서 **반 만들기**를 누르면 6자리 초대 코드가 생깁니다. (홈 > 반 관리)
2. 학생들은 로그인한 뒤 초대 코드를 넣고 들어옵니다.
3. 선생님이 **반 관리**에서 반장, 부반장을 지정합니다.

## 개발

```bash
cp .env.example .env   # 값 채우기
npm install
npm run dev
```

구조: React + Vite + vite-plugin-pwa, Supabase(로그인, DB, 사진 저장소, Edge Function).
