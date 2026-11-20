# 커피 당번 (coffee-duty)

사무실 6명이 평일마다 돌아가며 커피를 사는 정적 웹앱. 백엔드/DB 없음.

## 스택 / 명령어
Vite + React 19 + TypeScript, Tailwind v4, shadcn 스타일 컴포넌트(Radix Dialog + cva), Framer Motion, lucide-react, canvas-confetti, vite-plugin-pwa, Vitest.

- `npm run dev` 개발 서버 / `npm run build` 타입체크+빌드 / `npm test` 로직 테스트
- `npm run icons` : `public/icon.svg` → PWA PNG 아이콘 재생성 (sharp)
- 경로 별칭 `@/` = `src/`

## 데이터
- 타입: `src/types.ts` (members, purchases, absences, skipDays). 날짜는 로컬 `YYYY-MM-DD` 문자열.
- 구매 기록은 **날짜가 키**(하루 1건). absence에는 삭제용 `id`를 추가했고, member에는 선택값 `color`/`emoji`가 있다.
- 저장: localStorage `coffee-duty:v1`. 비어 있으면 `public/data.json`(`BASE_URL` 기준)을 초기 데이터로 읽는다. (`src/lib/data.ts`)
- 가져오기/초기화는 `parseAppData`가 검증·정규화(깨진 항목만 버림). 내보내기는 JSON 다운로드.
- 멤버 삭제 시 휴가는 같이 지우고, 과거 구매 기록은 보존(화면에선 "탈퇴한 멤버").
- GitHub Pages: `vite.config.ts`의 `base: './'` 라서 하위 경로에서도 동작. 라우터 없이 탭 상태만 사용.

## 핵심 로직 (`src/logic/`, 순수 함수)
- `nextBuyer.ts`
  - 당번 = 그날 휴가가 아닌 멤버 중 **대상 날짜 이전** 마지막 구매일이 가장 오래된 사람. 미구매자 최우선, 동률은 `order`.
  - 주말·`skipDays`는 당번 없음(null)이며 순번을 소모하지 않음. 휴가는 시작/종료일 포함.
  - `rankMembers`: 휴가자 포함 우선순위(UI에서 흐리게 표시), `getNextBuyer`, `forecastBuyers`(기록 있는 날은 실제 구매자, 없는 날은 계산 결과가 샀다고 가정하고 이어서 예측), `countPurchases`.
- `shareText.ts`: "☕ 11/17(화) 당번: A / 다음: B, C"
- `dates.ts`: 날짜 유틸 (UTC 기반 일수 차이로 DST 영향 제거)
- 테스트 `nextBuyer.test.ts` 27개: 휴가자 건너뛰기, 복귀 후 우선순위, 대신 산 경우, 신규 멤버, 주말/휴일, 예측, 공유 텍스트.

## UI 규칙
- 색상 토큰은 `src/index.css`의 CSS 변수(라이트/다크는 `prefers-color-scheme`). 카라멜(#E08E45)은 **배경 전용**, 그 위 글자는 `text-on-caramel`; 카라멜 계열 글자는 `text-caramel-ink`. 민트는 휴가 전용(멤버 색상 팔레트에서 제외).
- 멤버 표시는 항상 `components/avatar.tsx` 사용(색+이모지, `absent`면 흐림+🏖️). 색상/이모지 기본값은 `lib/members.ts`.
- 카드 `rounded-card`(24px) + `shadow-card`(갈색 톤). 터치 영역 최소 44px. 숫자는 body 전체에 tabular-nums.
- 토스트(`components/toast.tsx`)는 되돌리기 콜백을 받는다. store의 save/remove 함수는 undo 함수를 반환한다.
- 애니메이션은 `MotionConfig reducedMotion="user"` + CSS `prefers-reduced-motion`으로 최소화, 컨페티는 `disableForReducedMotion`.
- 화면: `src/screens/` (home, history, absences, stats, settings). 탭 전환은 `App.tsx`에서 방향별 슬라이드.

## PWA 설치 안내
- `src/lib/install.ts`: `detectEnv`(standalone / 인앱 / iOS / 기타 판별, 순수 함수), `isDismissed`(7일 숨김, localStorage `coffee-duty:install-dismissed`), `useInstall`. `beforeinstallprompt`/`appinstalled`는 React 마운트 전에 올 수 있어 **모듈 로드 시점**에 잡아 보관한다.
- `src/components/install.tsx`: 홈 하단 `InstallBanner`(Android 설치 창 / iOS 안내 / 인앱 브라우저 안내)와 환경별 `InstallSheet`. 설정 화면의 "앱 설치 방법"도 같은 시트를 연다.
- standalone(설치된 앱)으로 실행 중이면 배너를 띄우지 않는다. 안드로이드 카카오톡은 `kakaotalk://web/openExternal?url=` 로 외부 브라우저를 연다.
- 테스트: `src/lib/install.test.ts` (UA 판별, 7일 경계). 실제 기기에서의 설치 흐름은 자동 테스트하지 못했다.

## 오늘의 주문 (메뉴 취합)
- 당번(총무) 폰 한 대에서 멤버 주문을 모아 단톡방에 공유하는 구조. 서버 없음, 기기별 localStorage.
- 데이터: `Member.favorite`(기본 메뉴), `AppData.orders`(그날 `items` = 기본 메뉴보다 우선하는 값), `customMenus`(프리셋 외 사용자 메뉴). `schemaVersion`(현재 2)과 `updatedAt`(모든 변경 시 갱신)이 최상위에 있다.
- 프리셋 메뉴는 코드 상수(`logic/menu.ts`)이고 데이터에는 저장하지 않는다. "안 마심"은 메뉴 이름 `'안 마심'` 또는 `skipped: true` 둘 다 인정(`isNoDrink`).
- `logic/order.ts` (순수 함수): `buildDraft`(휴가자 제외, favorite으로 초안, 없으면 미정) → `resolveOrder`(당일 저장값을 덮어씀, 휴가자의 저장값은 무시) → `aggregate`(메뉴+온도+사이즈+샷으로 묶음, **메모는 키에서 제외**, 안 마심·미정 제외) → `buildOrderText`(공유 텍스트). 집계 줄은 "아이스 아메리카노 3", 개인별 줄은 "아아 / 라떼(따뜻)"처럼 줄임말.
- **주문표 복사 시점에 그날 최종 주문을 `orders`에 굳힌다(`snapshotItems`).** 이후 기본 메뉴를 바꿔도 지난 기록 화면의 주문 내역은 변하지 않는다. `edited`("오늘만" 표시)는 기본 메뉴와 내용이 다를 때만 true(`sameLine`).
- UI: `components/order-card.tsx`(홈 카드, 멤버별 바텀시트, 복사 실패 시 텍스트 대체 시트, 기록 화면의 접이식 `OrderHistory`), `components/order-fields.tsx`(오늘 변경/기본 메뉴 지정 공용 폼). 새 색상은 추가하지 않았다.
- 사용 지표(`lib/metrics.ts`): 키 `coffee-duty:metrics`에 복사 횟수·사용한 날짜·당일 변경 횟수. 앱 데이터와 분리(내보내기/가져오기/초기화에 섞이지 않음), 외부 전송 없음. 설정 맨 아래 "사용 통계(이 기기)".

## 데이터 마이그레이션 (중요: 기존 기록을 잃지 않는 것이 최우선)
- `lib/migrate.ts`의 `migrate()`가 localStorage·JSON 가져오기·`data.json` 모두의 단일 진입점(`parseAppData`). 단계(`STEPS`)를 한 칸씩 올린다. **구조를 바꾸면 `SCHEMA_VERSION`을 올리고 단계 함수와 테스트를 추가한다.**
- v1 → v2: 기존 필드는 값 그대로 보존하고 새 필드만 채운다. 멤버 `order` 값은 재번호하지 않고, 탈퇴한 멤버의 구매·휴가 기록도 버리지 않으며, 휴가 from/to도 뒤집지 않는다.
- 앱보다 새로운 `schemaVersion`은 `FutureVersionError`로 읽지 않는다. localStorage가 미래 버전이면 앱이 "업데이트해 주세요" 화면만 띄우고 **저장을 막는다**(구버전 앱이 덮어써 잃는 것 방지).
- 안전장치: 구버전을 처음 옮길 때 원본을 `coffee-duty:backup-before-v2`에 한 번 보관, 읽을 수 없는 저장값은 초기 데이터로 덮어쓰기 전에 `coffee-duty:corrupt-backup`에 보관. 저장 키 `coffee-duty:v1`은 그대로 쓴다.
- **실제 데이터 검증**: 총무 폰에서 내보낸 JSON을 `backup/`에 넣고 `npm run check:migration`. 개수·값 일치 여부만 출력(실명 미출력), 원본은 읽기만 한다. `backup/`은 `.gitignore`에 있고 **절대 커밋하지 않는다**(실명 포함). 배포 전에 이 검증을 통과시킨다.

## 개발 규칙
- 이 저장소는 `main`에 push하면 바로 배포되고 실제 기록이 있는 기기가 있다. 데이터 구조를 바꾸는 변경은 로컬에서 화면과 `check:migration`을 확인한 뒤에만 push한다.

## 상태
- 테스트 71개 통과(`nextBuyer` 27, `order`, `migrate`, `install`, `metrics`), `tsc` 및 `vite build` 통과.
- **미확인**: 주문 카드·바텀시트·설정 화면의 실제 렌더링, 스와이프/드래그 제스처, 모바일 375px 레이아웃은 눈으로 확인하지 못했다(Playwright 미연결). 실제 총무 폰 데이터로 `check:migration`도 아직 돌리지 않았다.

## 배포 (GitHub Pages)
- 주소: `https://<아이디>.github.io/coffee/` (저장소 이름이 `coffee`일 때). 저장소는 public.
- `main`에 push하면 `.github/workflows/deploy.yml`이 `npm ci` → `npm test` → `npm run build` → Pages 배포를 자동 실행. 테스트나 타입체크가 실패하면 배포되지 않는다. 수동 실행은 Actions 탭의 "Run workflow".
- 최초 1회 GitHub 웹 설정: 저장소 Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 변경.
- 하위 경로 대응: `vite.config.ts`의 `base: './'`, manifest의 `start_url`/`scope`/아이콘 경로, SW(`./sw.js`, scope `./`), `data.json`(`BASE_URL` 기준) 모두 상대 경로라서 `/coffee/`에서 동작. 라우터가 없어 새로고침 404 문제도 없다.
- 데이터는 사용자 브라우저의 localStorage에만 있어 기기끼리 공유되지 않는다. 공개 저장소이므로 `public/data.json`에는 실명을 넣지 않는다(현재 "멤버 1~6" 자리표시자). 실제 이름은 앱 설정 화면에서 입력하거나 JSON 가져오기로 넣는다.
- 배포 후 앱이 안 바뀌어 보이면 서비스 워커 캐시 때문일 수 있다. 새로고침을 두 번 하거나 사이트 데이터를 지운다.
