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

## 메뉴별 금액 · 공평성 (커피 수지)
- 데이터(스키마 버전은 v2 그대로, 누락 시 기본값으로 정규화): `Purchase.pricing?`(없으면 "금액 없음" = 기존 기록 그대로), `AppData.priceList`(우리 팀 가격표, 사용자가 입력한 값만), `AppData.settings`(`buyerRule` 'count'|'balance', `defaultPriceMode`, `balanceSince`). `cafeBrandId`는 브랜드 개념이 생기기 전까지 상수 `'default'`.
- **앱은 가격을 미리 제공하지 않는다.** `public/data.json`의 `priceList`는 비어 있고 테스트(`pricing-migrate.test.ts`)가 이를 확인한다.
- 기록에는 메뉴·가격을 그 시점 값으로 굳혀 저장한다(상세: `lines`, 간단: `participants`). 가격표를 나중에 고쳐도 지난 계산은 바뀌지 않는다.
- `logic/fairness.ts`(순수 함수): `allocate`(영수증 총액을 가격 비율로 반올림 배분, 끝전은 결제자=그날 당번의 "마신 돈"에 더함 → 모든 행의 차액 합은 항상 0), `computeFairness`(낸 돈/마신 돈/차액, 금액 없음·불완전 기록은 제외하고 건수 반환, 탈퇴 멤버는 한 행으로 합산), 가격표(`lookupPrice`/`diffPrices`/`upsertPrices`), 모드 규칙(`allowedModes`/`needsPriceSheet`/`defaultModeFor`/`warnsOnClear`). 차액 = 낸 돈 − 마신 돈(플러스 = 더 냄).
- `logic/pricing-form.ts`: 금액 폼의 순수 로직(`initPricingForm` 가격표 자동 채움, `buildPricing`). UI는 `components/pricing-fields.tsx`, 홈 시트 `components/price-sheet.tsx`, 기록 편집 시트(`screens/history.tsx`).
- **당번 기준 "차액"**: `nextBuyer.ts`의 `BuyerContext.settings`가 있고 `buyerRule === 'balance'`면 차액이 가장 작은 사람이 먼저(동률이면 기존 횟수 규칙). `settings`가 없으면 기존 횟수 기준 그대로. 순번용 차액은 **`balanceSince` 이후, 계산 날짜 이전 기록만** 쓰고 통계 탭의 기간 토글과는 분리. 예상 순번(`forecastBuyers`)은 가상 구매에 금액이 없어 산 사람을 뒤로 보내는 "추정".
- `balanceSince`: 차액 기준을 처음 켤 때 오늘로 설정(이미 있으면 유지). "정산 완료, 오늘부터 다시 계산"은 `nextSettlementDate`: 오늘 이미 기록된 구매가 있으면 내일부터, 없으면 오늘부터 센다(정산된 기록이 다시 잡히지 않도록).
- 차액 기준에서는 [샀어요]의 "금액 없음"이 선택지에 없고(항상 금액 시트), 금액 기본값 '없음'은 '상세'로 바뀐다. 지난 기록 편집에서 `balanceSince` 이후 기록의 금액을 지우면 "차액 계산에서 빠져 당번 순서가 달라질 수 있어요" 경고. 통계 "커피 수지" 카드는 멤버 순서로만 표시(순위·강조 없음), `balanceSince` 이후 금액 없는 기록이 있으면 건수를 경고로 표시.
- 차액 기준을 **다시** 켤 때(`balanceSince`가 이미 있을 때) 그 이후 금액 없는 기록이 있으면 "금액 없는 기록 N건이 있어요. 오늘부터 새로 계산할까요?" 확인(`reenablePlan`). 예 → 정산과 같은 규칙(`nextSettlementDate`)으로 `balanceSince` 갱신, 아니요 → 이전 시작일 유지, 창을 닫으면 켜기 취소. 설정 변경 규칙은 순수 함수 `applySettingsPatch`.
- 횟수 기준 + 금액 기본값 "없음"(기본)이면 [샀어요]는 예전처럼 한 번 탭으로 기록된다.

## 데이터 마이그레이션 (중요: 기존 기록을 잃지 않는 것이 최우선)
- `lib/migrate.ts`의 `migrate()`가 localStorage·JSON 가져오기·`data.json` 모두의 단일 진입점(`parseAppData`). 단계(`STEPS`)를 한 칸씩 올린다. **구조를 바꾸면 `SCHEMA_VERSION`을 올리고 단계 함수와 테스트를 추가한다.**
- v1 → v2: 기존 필드는 값 그대로 보존하고 새 필드만 채운다. 멤버 `order` 값은 재번호하지 않고, 탈퇴한 멤버의 구매·휴가 기록도 버리지 않으며, 휴가 from/to도 뒤집지 않는다.
- 앱보다 새로운 `schemaVersion`은 `FutureVersionError`로 읽지 않는다. localStorage가 미래 버전이면 앱이 "업데이트해 주세요" 화면만 띄우고 **저장을 막는다**(구버전 앱이 덮어써 잃는 것 방지).
- 안전장치: 구버전을 처음 옮길 때 원본을 `coffee-duty:backup-before-v2`에 한 번 보관, 읽을 수 없는 저장값은 초기 데이터로 덮어쓰기 전에 `coffee-duty:corrupt-backup`에 보관. 저장 키 `coffee-duty:v1`은 그대로 쓴다.
- **shadow(마지막 정상 상태)**: 저장할 때마다 메인(`coffee-duty:v1`)과 함께 전체 데이터를 `coffee-duty:shadow`에도 쓴다(`updatedAt` 포함). 이미 배포된 옛 버전 앱(`42cb18e`)은 `schemaVersion`을 검사하지 않고 **열기만 해도** 아는 필드만 남겨 다시 저장해 `orders`·`priceList`·`pricing`·`favorite`·`settings`를 지우므로, 그 경우를 감지하기 위한 장치다. 옛 앱은 shadow 키를 모른다.
  - 로드 시 메인이 v1 모양(schemaVersion 없음)인데 v2 shadow가 있고 더 최신이면(또는 메인이 읽을 수 없는데 정상 shadow가 있으면) **자동 복구/병합하지 않고** 바텀시트로 묻는다. 묻는 동안에는 저장하지 않는다(shadow가 덮어써지지 않도록).
  - "되돌리기": 지금 메인을 `coffee-duty:backup-before-restore`에 남기고 shadow 전체를 복원. "그대로 두기": 메인을 정상 마이그레이션하고 이전 shadow는 `coffee-duty:shadow-prev`에 보관. 보관에 실패하면 선택을 확정하지 않는다.
  - shadow가 없거나 깨졌거나 v2가 아니면(미래 버전 포함) 조용히 무시한다. 설정 > 데이터의 "마지막 정상 상태로 되돌리기"는 같은 복원을 수동으로 한다. 로직은 `lib/data.ts`(`readShadow`/`isOverwrittenByOldApp`/`applyRecovery`/`restoreLastGood`), 테스트는 `lib/shadow.test.ts`.
- **실제 데이터 검증**: 총무 폰에서 내보낸 JSON을 `backup/`에 넣고 `npm run check:migration`. 개수·값 일치 여부만 출력(실명 미출력), 원본은 읽기만 한다. `backup/`은 `.gitignore`에 있고 **절대 커밋하지 않는다**(실명 포함). 배포 전에 이 검증을 통과시킨다.

## 배포 규칙 (운영)
이 저장소는 `main`에 push하면 곧바로 배포되고, 총무 폰에 실제 기록이 있다. 이미 배포된 옛 버전은 v2 데이터의 모르는 필드를 지워 버릴 수 있으므로 다음을 지킨다.
- **롤백 금지.** 문제가 생기면 이전 커밋으로 되돌리지 말고 **수정본을 앞으로만(roll forward) 배포**한다. 옛 코드가 v2 데이터 위에서 열리면 `orders`·`priceList`·`pricing` 등이 지워진다. `git revert`로 되돌리는 새 커밋도 옛 코드를 다시 배포하는 것이므로 데이터 구조(스키마)가 달라지는 변경은 revert하지 않는다.
- **옛 Actions 실행 재실행 금지.** Actions 탭에서 과거 실행의 "Re-run"을 누르면 그때의 옛 코드가 다시 배포된다. 수동 배포는 항상 최신 `main`에서 "Run workflow"로 한다.
- push 전에 총무 폰에서 JSON을 내보내 `backup/`에 넣고 `npm run check:migration`을 통과시킨다(`backup/`은 실명 포함이라 절대 커밋하지 않는다).
- 배포 직후 총무 폰에서 설치 앱과 브라우저 탭을 **모두 닫았다가 다시 연다.** 가능하면 설치 앱만 쓰고, 같은 사이트를 브라우저 탭으로 같이 열어 두지 않는다(오래 열려 있던 옛 화면이 저장하면 덮어쓸 수 있다).
- 서비스 워커는 `autoUpdate`(`skipWaiting` + `clientsClaim`, 갱신되면 열린 화면을 자동 새로고침)다. 배포 직후 첫 실행은 캐시된 옛 화면이 먼저 뜰 수 있으니 한 번 더 열어 최신인지 확인한다.
- 그래도 데이터가 사라져 보이면: 앱을 다시 열 때 "마지막 정상 상태로 되돌릴까요?"가 뜨면 되돌리기를 선택하고, 안 뜨면 설정 > 데이터 > "마지막 정상 상태로 되돌리기"를 쓴다. 그 전에 데이터를 더 수정하지 않는다.
- 새 버전이 안정적으로 퍼진 뒤에도, 스키마를 바꾸는 배포는 한 번에 한 단계씩, 로컬에서 `check:migration`과 화면 확인을 끝낸 뒤에만 한다.

## 개발 규칙
- 이 저장소는 `main`에 push하면 바로 배포되고 실제 기록이 있는 기기가 있다. 데이터 구조를 바꾸는 변경은 로컬에서 화면과 `check:migration`을 확인한 뒤에만 push한다.

## 상태
- 테스트 161개 통과(`nextBuyer`, `order`, `fairness`, `pricing-form`, `migrate`, `pricing-migrate`, `install`, `metrics`), `tsc` 및 `vite build` 통과.
- **미확인**: 주문 카드·금액 시트·커피 수지 카드·설정 화면의 실제 렌더링, 스와이프/드래그 제스처, 모바일 375px 레이아웃은 눈으로 확인하지 못했다(Playwright 미연결). 실제 총무 폰 데이터로 `check:migration`도 아직 돌리지 않았다.

## 배포 (GitHub Pages)
- 주소: `https://<아이디>.github.io/coffee/` (저장소 이름이 `coffee`일 때). 저장소는 public.
- `main`에 push하면 `.github/workflows/deploy.yml`이 `npm ci` → `npm test` → `npm run build` → Pages 배포를 자동 실행. 테스트나 타입체크가 실패하면 배포되지 않는다. 수동 실행은 Actions 탭의 "Run workflow".
- 최초 1회 GitHub 웹 설정: 저장소 Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 변경.
- 하위 경로 대응: `vite.config.ts`의 `base: './'`, manifest의 `start_url`/`scope`/아이콘 경로, SW(`./sw.js`, scope `./`), `data.json`(`BASE_URL` 기준) 모두 상대 경로라서 `/coffee/`에서 동작. 라우터가 없어 새로고침 404 문제도 없다.
- 데이터는 사용자 브라우저의 localStorage에만 있어 기기끼리 공유되지 않는다. 공개 저장소이므로 `public/data.json`에는 실명을 넣지 않는다(현재 "멤버 1~6" 자리표시자). 실제 이름은 앱 설정 화면에서 입력하거나 JSON 가져오기로 넣는다.
- 배포 후 앱이 안 바뀌어 보이면 서비스 워커 캐시 때문일 수 있다. 새로고침을 두 번 하거나 사이트 데이터를 지운다.
