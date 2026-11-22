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
| Realtime | 동시 접속 200, 초당 메시지 100, 초당 채널 참여 100, 연결당 채널 100, 월 메시지 200만, 메시지 최대 256 KB, Postgres Changes 페이로드 1,024 KB(넘으면 64바이트 초과 필드가 잘림) | https://supabase.com/docs/guides/realtime/limits, https://supabase.com/pricing |
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
| `supabase/migrations/0002_import_keep_ids.sql` | `import_group`이 uuid 멤버 id를 유지 | 테스트·운영 프로젝트 모두 |
| `supabase/migrations/0003_group_snapshot.sql` | `get_group_snapshot`(그룹 전체를 한 번에 읽기) | 테스트·운영 프로젝트 모두 |
| `supabase/migrations/0004_apply_group_ops.sql` | `groups.rev`(충돌 감지) + `apply_group_ops`(그룹장 쓰기를 한 트랜잭션으로) | 테스트·운영 프로젝트 모두 |
| `supabase/migrations/0005_rev_bump.sql` | 내용이 바뀌는 모든 경로(직접 쓰기·그룹 설정·그룹장 넘기기)에서 `groups.rev`가 오르게 하는 트리거 (Realtime 신호) | 테스트·운영 프로젝트 모두 |
| `supabase/migrations/0006_membership_signal.sql` | 별명(`nickname`), 참여 요청 승인(인원 제한 포함), 소속 변경 신호(`profiles.membership_rev` + Realtime) — 내보내진 그룹원·삭제된 그룹을 바로 알게 함 | 테스트·운영 프로젝트 모두 |
| `supabase/test-only/sentinel.sql` | "테스트 프로젝트" 표식(`is_test_project()`) | **테스트 프로젝트에만** |
| `tests/rls/*` | RLS·RPC·왕복·스냅샷 검증 (`npm run test:rls`) | 테스트 프로젝트 |
| `scripts/seed-test.ts` | 샘플 그룹 + 초대 코드 넣기 (`npm run seed:test`) | 테스트 프로젝트 |
| `.env.example` | 환경 변수 이름 | 복사해서 `.env.local`, `.env.test.local` |

### 마이그레이션 적용 순서 (SQL Editor에서 새 쿼리 창마다 한 파일씩 Run)
1. `0001_init.sql`
2. `0002_import_keep_ids.sql`
3. `0003_group_snapshot.sql`
4. `0004_apply_group_ops.sql`
5. `0005_rev_bump.sql`
6. `0006_membership_signal.sql`
7. (테스트 프로젝트만) `test-only/sentinel.sql`

새 마이그레이션이 생기면 번호 순서대로 이어서 적용한다. 이미 적용한 파일은 다시 Run하지 않는다(`0001`은 다시 돌리면 "already exists" 오류가 난다).
### 운영 프로젝트 적용 순서: "SQL 먼저 / 앱 먼저"
같은 코드가 이미 배포된 앱(옛 버전)과 새 앱 모두에서 동작해야 하므로, 변경 종류별 순서를 정해 둔다.

| 변경 종류 | 순서 | 이유 |
|---|---|---|
| 새 열·함수·트리거를 **더하는** SQL (0001~0006 전부) | **SQL 먼저 → 앱** | 새 앱이 새 열·함수를 부르는데 서버에 없으면 그 기능이 오류가 난다. 옛 앱은 추가된 것을 쓰지 않아 영향이 없다. |
| 함수 **인자가 바뀌는** SQL (예: 0006의 `redeem_invite(p_code)` → `(p_code, p_nickname default null)`) | **SQL 먼저 → 앱.** 기존 호출이 그대로 동작하게 새 인자는 `default`를 둔다 | 옛 앱은 `p_code`만 보내도 새 함수로 연결되고, 새 앱은 별명이 있을 때만 `p_nickname`을 보낸다. 앱이 먼저 나가면 별명을 쓰는 참여가 "함수를 찾을 수 없다"로 실패한다. |
| 옛 열·함수를 **지우거나 이름을 바꾸는** SQL | **앱 먼저(새 방식으로 모두 퍼진 뒤) → SQL 나중** | 옛 앱이 아직 쓰고 있을 수 있다. 지금까지는 지우는 변경이 없다(`redeem_invite(text)`는 새 함수가 기본 인자로 대신한다). 이런 변경은 별도 번호로 두고 앱이 충분히 퍼진 뒤에 적용한다. |
| 서버 규칙(트리거)이 **동작을 바꾸는** SQL (0005: `rev` 자동 상승, `import_group`의 첫 rev가 1) | SQL 먼저 | 앱은 항상 서버에서 읽은 rev를 쓰므로 어느 쪽이 먼저여도 동작하지만, SQL 먼저가 Realtime 알림이 처음부터 맞게 간다. |
| **CAPTCHA**(Turnstile) | **앱(사이트 키) 먼저 → 서버 켜기 나중** | 서버를 먼저 켜면 위젯이 없는 앱의 익명 참여가 전부 막힌다. 앱이 먼저 나가면 위젯만 보이고 서버는 토큰을 무시한다. 둘이 같이 나가야 하는 사이의 간격을 줄이려면 앱 배포 직후 서버를 켠다. |
| **운영 환경 변수**(`VITE_SUPABASE_*`) 넣기 | 모든 SQL 적용 + CAPTCHA 확인 **뒤** 마지막 | CLAUDE.md 규칙: CAPTCHA 전에는 운영 값을 배포 설정에 넣지 않는다. 이 값이 들어가야 공유 화면이 켜진다. |
| Google 로그인 **허용 주소**(Redirect URL, Site URL) | **도메인 배포 전**에 새 주소를 추가 | 새 도메인에서 로그인하기 전에 허용돼 있어야 한다. 옛 `github.io` 주소도 한동안 같이 둔다. |

처음 운영 프로젝트를 만들 때의 전체 순서: ① 프로젝트 생성(서울) → ② `0001`~`0006` 순서대로 Run하고 확인 쿼리 → ③ Google OAuth 설정(`docs/GOOGLE_OAUTH.md`) → ④ Turnstile 사이트 키를 넣은 앱 배포 → ⑤ 서버 CAPTCHA 켜고 직접 확인(`docs/CAPTCHA.md`) → ⑥ 운영 환경 변수를 배포 설정에 추가. **`sentinel.sql`은 운영에 절대 적용하지 않는다**(테스트 프로젝트 표식).

### 적용 확인 쿼리 (SQL Editor에서 한 줄씩 Run → 결과가 `true`(또는 13)이면 적용된 것)
| 파일 | 확인 쿼리 | 기대 결과 |
|---|---|---|
| `0001_init.sql` | `select count(*) from information_schema.tables where table_schema='public' and table_name in ('profiles','groups','group_members','members','records','absences','skip_days','orders','prices','invites','join_requests','invite_attempts','entitlements');` | `13` |
| `0002_import_keep_ids.sql` | `select position('[0-9a-f]{8}' in pg_get_functiondef('public.import_group(jsonb)'::regprocedure)) > 0 as ok;` | `true` |
| `0003_group_snapshot.sql` | `select to_regprocedure('public.get_group_snapshot(uuid)') is not null as ok;` | `true` |
| `0004_apply_group_ops.sql` | `select exists(select 1 from information_schema.columns where table_schema='public' and table_name='groups' and column_name='rev') and to_regprocedure('public.apply_group_ops(uuid,bigint,jsonb)') is not null as ok;` | `true` |
| `0005_rev_bump.sql` | `select to_regprocedure('public.groups_rev_guard()') is not null and exists(select 1 from pg_trigger where tgname='records_rev_ins') and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='groups') as ok;` | `true` |
| `0006_membership_signal.sql` | `select exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='membership_rev') and to_regprocedure('public.redeem_invite(text,text)') is not null and to_regprocedure('public.redeem_invite(text)') is null and exists(select 1 from pg_trigger where tgname='group_members_signal') and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') as ok;` | `true` |
| `test-only/sentinel.sql` (테스트만) | `select public.is_test_project();` | `true` |

새 SQL 파일을 만들 때마다 **한 줄 확인 쿼리를 이 표와 채팅에 같이 적는다**(새 함수·컬럼이 있는지 조회). "Success"만으로는 적용 여부를 알 수 없다(실제로 다른 프로젝트·다른 내용에 실행한 적이 있었다).
앱 쪽에서는 `npm run test:rls`가 같은 것을 확인한다(적용 안 된 SQL이 있으면 해당 테스트가 실패한다).

적용 뒤에 함수가 안 보이면 SQL Editor에서 `notify pgrst, 'reload schema';` 를 한 번 실행한다.

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

## 3-1. 샘플 데이터 넣기 (테스트 프로젝트)
1-C 단계의 앱에서 서버 그룹을 만들 수 없는 동안(1-C)에는 시드 스크립트로 읽기 전용 화면을 확인한다.
```
npm run seed:test              # 샘플 그룹 + 초대 코드(그룹장 승인 없이 참여)
npm run seed:test -- --approval  # 그룹장 승인이 필요한 초대 코드
```
- `service_role` 키 없이, 익명 사용자 1명이 기존 RPC(`confirm_age` → `import_group` → `create_invite`)로 만든다.
- 출력은 초대 코드와 그룹 이름뿐이다(이름은 가짜). 코드는 30일, 최대 200명 사용 가능.
- 이 익명 그룹장은 세션을 저장하지 않아 다시 로그인할 수 없다. **보기 전용 확인용 그룹**이다. 그룹장 기능(1-D)은 Google 로그인으로 따로 만든 그룹으로 확인한다.
- 앱에서 쓰려면 `.env.local`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(테스트 프로젝트의 공개 값)를 넣고 `npm run dev` → 설정 > 공유 그룹 > 초대 코드로 참여.

## 3-2. 테스트로 쌓이는 익명 사용자 정리
`npm run test:rls`와 `npm run seed:test`는 실행할 때마다 익명 사용자를 만든다(Supabase는 자동 정리가 없다). **테스트 프로젝트에서만** 가끔 정리한다.

대시보드 **SQL Editor**(DB 비밀번호·service_role 키 필요 없음)에서:
```sql
-- 1) 먼저 개수 확인 (미리보기)
select count(*) as anon_users from auth.users where is_anonymous is true and created_at < now() - interval '1 day';
select count(*) as groups_owned_by_them
from public.group_members gm join auth.users u on u.id = gm.user_id
where gm.role = 'owner' and u.is_anonymous is true and u.created_at < now() - interval '1 day';

-- 2) 하루 이상 지난 익명 사용자의 그룹과 계정을 삭제 (그룹은 cascade로 모든 데이터가 함께 지워진다)
delete from public.groups where id in (
  select gm.group_id from public.group_members gm join auth.users u on u.id = gm.user_id
  where gm.role = 'owner' and u.is_anonymous is true and u.created_at < now() - interval '1 day'
);
delete from auth.users where is_anonymous is true and created_at < now() - interval '1 day';
```
- 시드로 만든 샘플 그룹도 지워진다 → 다시 `npm run seed:test`로 만들고 새 코드를 쓴다.
- 대시보드로 하려면 Authentication → Users 에서 목록을 보고 선택 삭제할 수도 있다.
- **운영 프로젝트에서는 이 SQL을 실행하지 않는다.** (운영에는 실제 그룹원이 익명 계정이다.) 운영의 오래된 익명 계정 정리 기준은 처리방침과 함께 따로 정한다.
- 익명 로그인이 막히면(IP당 시간당 30회) Authentication → Rate Limits 에서 한도를 올리거나 1시간 뒤에 다시 한다.

## 4. 검증 상태 (정직하게)
- `0001`·`0002`는 테스트 프로젝트에서 실행해 RLS 테스트로 확인했다. `0003`은 문법만 확인했다(적용 뒤 확인).
- RLS·왕복·스냅샷 테스트는 `npm run test:rls`(테스트 프로젝트 필요, 없으면 건너뜀)로 돌린다. 마지막 전체 통과는 0002까지(29개) 확인했고, 0003의 스냅샷 테스트는 0003 적용 뒤에 확인한다.
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
