# Supabase: 한도·일시정지, 설정 순서, RLS 테스트

1단계(서버 백엔드)의 운영 문서다. 코드와 SQL은 `supabase/`, 테스트는 `tests/rls/`.

## 1. 무료 플랜 한도와 일시정지 (공식 문서 확인)
확인일 2026-11-21. 아래 페이지를 읽고 정리했다. 값은 바뀔 수 있으니 출시 전에 다시 본다.

| 항목 | Free | 근거 |
|---|---|---|
| DB 크기 | 500 MB / 프로젝트 | https://supabase.com/pricing |
| Egress | 5 GB (+ 캐시 egress 5 GB) | https://supabase.com/pricing |
| 월간 활성 사용자(MAU) | 50,000 | https://supabase.com/pricing |
| 파일 저장소 | 1 GB (이 앱은 쓰지 않음) | https://supabase.com/pricing |
| Realtime | 동시 접속 최대 200, 월 메시지 200만, 메시지 최대 256 KB | https://supabase.com/pricing |
| Edge Function 호출 | 월 50만 | https://supabase.com/pricing |
| 무료 프로젝트 수 | 활성 2개 (일시정지된 것은 세지 않음) | https://supabase.com/docs/guides/platform/billing-on-supabase |
| 자동 백업 | **Free는 포함되지 않음** (Pro: 7일) | https://supabase.com/pricing |
| 서울 리전 | `ap-northeast-2` (Northeast Asia, Seoul) 있음 | https://supabase.com/docs/guides/platform/regions |
| Pro 요금 | 월 $25부터 (월 $10 컴퓨트 크레딧 포함) | https://supabase.com/pricing |

### 일시정지 (중요)
- **Free 프로젝트는 1주(7일) 동안 활동이 없으면 일시정지된다.** (pricing: "Free projects are paused after 1 week of inactivity" / going-into-prod: 7일간 활동이 적은 Free 프로젝트를 정지할 수 있음)
- 유료(Pro 이상) 프로젝트는 일시정지되지 않는다.
- 정지된 프로젝트는 대시보드에서 한 번에 복구할 수 있다. 복구 가능 기간: 문서 본문은 **1년**, 같은 페이지의 그림 설명은 "90 Days Remaining"이라고 적혀 있어 **서로 다르다. [확인 필요]** (https://supabase.com/docs/guides/platform/upgrading)
- 정지가 풀리기 전에는 앱이 서버에 연결되지 않는다. 그래서 **실제 사용자에게 공개하는 운영 프로젝트는 Pro로 올리는 것을 전제로 한다.** 개발·테스트 프로젝트는 Free로 충분하지만 1주 이상 안 쓰면 멈춘다(복구하면 됨).
- Free 프로젝트의 백업 다운로드: pricing은 "포함되지 않음", going-into-prod는 "Free 프로젝트는 백업을 내려받을 수 없음", upgrading 문서는 복구 기간이 지나면 백업을 내려받을 수 있다고 적어 **문서끼리 어긋난다. [확인 필요]** 운영 데이터가 생기면 Pro의 일일 백업(7일 보관)을 쓰고, 자체 내보내기도 함께 둔다.
- **[확인 필요]** Free 프로젝트가 서울 리전을 선택할 수 있는지는 문서에 명시돼 있지 않다. 프로젝트를 만들 때 목록에서 확인한다.

### 익명 로그인 (그룹원용)
- Free에서 사용 가능. **IP당 시간당 30회** 제한이 있고 대시보드에서 조정할 수 있다. (https://supabase.com/docs/guides/deployment/going-into-prod)
- 남용 방지를 위해 **CAPTCHA(Turnstile 등)를 강하게 권장**한다. 익명 사용자도 DB에 저장되어 DB 크기를 늘리기 때문이다. (https://supabase.com/docs/guides/auth/auth-anonymous)
- 익명 사용자 자동 정리는 **제공되지 않는다.** 문서의 SQL로 직접 지운다:
  `delete from auth.users where is_anonymous is true and created_at < now() - interval '30 days';`
  (이 앱은 계정이 삭제되면 데이터도 같이 지우는 정책이라, 오래 안 쓴 익명 계정 정리 기준은 처리방침과 함께 정한다.)
- RLS 테스트는 한 번 돌릴 때 익명 사용자를 20명 안팎 만든다. 테스트 프로젝트에서 이 한도를 올려 두거나(예: 시간당 300), 두 번 연속 돌리지 않는다.

## 2. 파일 구성
| 파일 | 용도 | 어디에 적용 |
|---|---|---|
| `supabase/migrations/0001_init.sql` | 테이블, RLS, RPC, Realtime | 테스트·운영 프로젝트 모두 |
| `supabase/test-only/sentinel.sql` | "테스트 프로젝트" 표식(`is_test_project()`) | **테스트 프로젝트에만** |
| `tests/rls/*` | RLS·RPC 검증 (`npm run test:rls`) | 테스트 프로젝트 |
| `.env.example` | 환경 변수 이름 | 복사해서 `.env.local`, `.env.test.local` |

환경 변수 이름은 일부러 다르다. 서로 섞이면 안 된다.
- 운영(앱에 들어가는 공개 값): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` → `.env.local`
- 테스트(RLS 테스트 전용): `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` → `.env.test.local`
- 두 파일 모두 `*.local`이라 `.gitignore`에 걸려 커밋되지 않는다.
- **service_role 키와 DB 비밀번호는 어떤 파일·채팅에도 넣지 않는다.** 이 저장소의 코드와 테스트는 그 키가 필요 없게 만들었다.
- 안전장치: 테스트는 (a) `SUPABASE_TEST_URL`이 운영 주소와 같으면 중단하고 (b) 대상 프로젝트에 `is_test_project()`가 없으면 중단한다.

## 3. 사용자가 대시보드에서 할 일 (순서)
테스트 프로젝트부터. 운영 프로젝트는 1-C(로그인 연결) 직전에 같은 방식으로 만든다.
1. https://supabase.com/dashboard 에서 새 프로젝트 `coffee-duty-test` 생성. 리전은 Seoul. DB 비밀번호는 직접 정해서 비밀번호 관리자에 보관한다(나에게 알려주지 않는다).
2. **SQL Editor**에서 `supabase/migrations/0001_init.sql` 내용 전체를 붙여넣고 Run. 이어서 `supabase/test-only/sentinel.sql`도 Run. (오류가 나면 메시지를 알려 주세요.)
3. **Authentication → Sign In / Providers → Anonymous sign-ins** 켜기.
4. (권장) **Authentication → Rate Limits**에서 익명 로그인 한도를 올린다(테스트 프로젝트만).
5. **Project Settings → API**에서 **Project URL**과 **anon public** 키만 복사해 저장소 폴더의 `.env.test.local`에 적는다:
   ```
   SUPABASE_TEST_URL=https://<프로젝트>.supabase.co
   SUPABASE_TEST_ANON_KEY=<anon public 키>
   ```
   (`service_role` 키는 복사하지 않는다. anon 키는 앱에 들어가는 공개 값이지만 이 파일은 커밋하지 않는다.)
6. `npm run test:rls` 실행. 결과(통과/실패)를 알려 주세요.

운영 프로젝트(나중): 같은 방법으로 생성 → `0001_init.sql`만 적용(sentinel은 적용하지 않음) → Pro로 올릴지 결정 → Google 로그인 설정(1-C에서 안내).

## 4. 검증 상태 (정직하게)
- SQL은 PostgreSQL 파서(pglast)로 **문법만** 확인했다(문 77개, plpgsql 함수 17개 파싱 통과). **실제 Supabase에서 실행해 본 적은 없다.**
- RLS 테스트 26개는 작성했지만, **테스트 프로젝트가 연결되기 전까지 실행하지 못했다**(설정이 없으면 건너뛴다).
- 자동 검증이 없는 것: 초대 코드 **만료**(클라이언트가 시간을 되돌릴 수 없음), Realtime의 RLS 적용, `delete_my_account`가 실제 Supabase 환경에서 `auth.users`를 지울 수 있는지(테스트에는 포함, 실행 전까지 미확인).

## 5. RLS 테스트가 확인하는 것
사용자 역할: 그룹장 / 그룹원 / 무관한 사용자 / 로그인 안 한 사용자 / 다른 그룹의 그룹장
- 로그인 안 한 사용자: 테이블·RPC 모두 접근 불가
- 만 14세 확인 전: 그룹 만들기·초대 참여 거절, `profiles`는 직접 쓰기 불가
- 그룹장: 자기 그룹 읽기·쓰기 가능, 다른 그룹 쓰기 불가, `groups` 직접 생성·삭제 불가, 같은 날 기록 중복 불가
- 그룹원: 읽기 가능, 모든 데이터 테이블 쓰기 거절(insert는 오류, update/delete는 0행), 초대·소속 목록 조회·권한 변경·그룹 삭제·넘기기 불가
- 무관한 사용자: 모든 테이블에서 0행, 쓰기 거절
- 초대: 8자리·헷갈리는 글자 제외, 소문자·공백 허용, 틀린/취소/사용 횟수 초과 → `invalid`, 10번 실패 시 `rate_limited`, 그룹장 승인 흐름
- 그룹장 기능: 내보내기·나가기·넘기기·그룹 삭제·계정 삭제(데이터 즉시 삭제)
- 기기→서버 옮기기: 전부 옮김, 같은 key 재시도 시 중복 없음, 삭제된 멤버의 과거 기록 보존, 상한 초과 시 아무것도 안 남음, 남의 key 거절
