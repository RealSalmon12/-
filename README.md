# 학급정리기

우리 반 수행평가 일정, 가정통신문 사진, 오늘 급식을 한 화면에서 보는 웹앱(PWA)입니다.
휴대폰 브라우저에서 열고 "홈 화면에 추가"를 누르면 앱처럼 쓸 수 있어요.

- 선생님, 반장, 부반장: 수행평가와 가정통신문을 쓰고 고치고 지울 수 있음
- 학생: 모든 내용을 볼 수 있음
- 급식, 시간표, 학사일정: 단국대학교부속소프트웨어고등학교 정보를 NEIS 에서 자동으로 불러옴
- 수행평가마다 "다 했어요" 체크, 휴대폰 캘린더로 내보내기

## 처음 설정하기

### 1. Supabase (무료)

1. [supabase.com](https://supabase.com) 에서 새 프로젝트를 만듭니다.
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 내용을 통째로 붙여넣고 실행합니다.
   이어서 [`supabase/migrations/002_real_use.sql`](supabase/migrations/002_real_use.sql) 도 같은 방법으로 한 번 실행합니다.
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

학교 코드(`NEIS_SCHOOL_CODE`)는 넣지 않으면 학교 이름으로 자동으로 찾아요.
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
