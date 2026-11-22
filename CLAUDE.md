# 커피 당번 (coffee-duty)

사무실 6명이 평일마다 돌아가며 커피를 사는 정적 웹앱. 백엔드/DB 없음.

## 스택 / 명령어
Vite + React 19 + TypeScript, Tailwind v4, shadcn 스타일 컴포넌트(Radix Dialog + cva), Framer Motion, lucide-react, canvas-confetti, vite-plugin-pwa, Vitest.

- `npm run dev` 개발 서버 / `npm run build` 타입체크+빌드 / `npm test` 로직 테스트
- `npm run icons` : `public/icon.svg` → PWA PNG 아이콘 재생성 (sharp)
- 경로 별칭 `@/` = `src/`

## 데이터
- 타입: `src/types.ts`. **저장 구조(`AppData`, v4)는 `groups[]`**이고, 그룹 안에 `config`/`schedule`/members/records/absences/skipDays(+금액 기능이 있으면 `coffee`)가 있다. 화면·로직은 현재 그룹의 보기 `GroupView`(v2까지와 같은 모양: members, purchases, orders, priceList, settings…)를 쓴다(아래 "그룹" 참고). 날짜는 로컬 `YYYY-MM-DD` 문자열.
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
- **그룹 테마**(데이터 구조 변경 없음, `config.themeId`): `logic/themes.ts`가 테마 8개(coffee, lunch, notes, stage, clean, recycle, dishes, walk)의 라이트·다크 팔레트·컨페티·빈 화면 문구를 가진다. 색은 아래 CSS 변수 토큰으로 내려가고(`paletteVars`), 앱 최상위(html)의 `data-theme`으로 갈아 끼운다. **커피 테마는 `index.css`의 값 그대로**(기본값)이고 나머지 7개 테마의 `:root[data-theme=…]` 블록은 `main.tsx`가 `themeCss()`로 주입한다(`lib/theme.ts`). 토큰 이름은 기존 그대로(`--caramel`=포인트 배경, `--on-caramel`, `--caramel-ink`, `--espresso`=히어로의 진한 면, `--latte`)이고 `--accent`/`--accent-ink`/`--text`는 별칭이다. 히어로 위 글자는 `text-hero-ink`·`text-hero-ink-2`·`text-hero-accent`(하드코딩 hex 금지). 바뀌는 것: 배경·표면·포인트 색·히어로 일러스트(`components/theme-art.tsx`)·빈 화면 문구·컨페티(`lib/effects.ts`의 `themeConfetti`)·meta theme-color. 바뀌지 않는 것: 레이아웃·폰트·멤버 아바타 색·휴가(민트)/경고(danger) 같은 의미 색. 직접 만들기는 목록에서 테마를 고르기만 한다(자유 색상 없음). 그룹 전환 시 `applyTheme`가 `data-theme`·meta를 바꾸고 300ms 색 전환(`.theme-fade`, reduced-motion이면 즉시), 마지막 테마는 기기별 키 `coffee-duty:theme`에 저장해 첫 화면부터 적용한다. 테스트 `themes.test.ts`가 **모든 테마 × 라이트/다크의 글자 대비 AA(4.5:1)**와 **커피 팔레트 = index.css 값**을 고정한다. 새 테마·색을 추가하면 이 테스트를 통과시킨다. `/design`(또는 `#/design`)은 **개발 서버 전용** 확인 페이지(`src/design/`)로 모든 테마를 라이트·다크 나란히 보여준다(배포본에는 번들되지 않음).
- 색상 토큰은 `src/index.css`의 CSS 변수(라이트/다크는 `prefers-color-scheme`). 카라멜(#E08E45)은 **배경 전용**, 그 위 글자는 `text-on-caramel`; 카라멜 계열 글자는 `text-caramel-ink`. 민트는 휴가 전용(멤버 색상 팔레트에서 제외).
- 멤버 표시는 항상 `components/avatar.tsx` 사용(색+이모지, `absent`면 흐림+🏖️). 색상/이모지 기본값은 `lib/members.ts`.
- 카드 `rounded-card`(24px) + `shadow-card`(갈색 톤). 터치 영역 최소 44px. 숫자는 body 전체에 tabular-nums.
- 토스트(`components/toast.tsx`)는 되돌리기 콜백을 받는다. store의 save/remove 함수는 undo 함수를 반환한다.
- 애니메이션은 `MotionConfig reducedMotion="user"` + CSS `prefers-reduced-motion`으로 최소화, 컨페티는 `disableForReducedMotion`.
- **바텀시트(`components/ui/sheet.tsx`) 규칙**: 구조는 헤더(손잡이·제목) / 가운데 스크롤 영역 / 하단 고정 푸터(`SheetFooter`) / 안전영역 여백. **끌어서 닫기는 손잡이에만** 건다(`dragControls` + `dragListener={false}`). **시트 컨테이너나 스크롤 영역에 `drag`를 걸지 말 것** — Framer Motion이 그 요소에 `touch-action: pan-x`를 걸어 세로 스와이프 스크롤이 안 된다(안드로이드에서 내용이 안 움직이고 저장 버튼에 못 가던 버그의 원인). 스크롤 영역은 `flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y`, 최대 높이는 `100dvh` 기준. 내용이 긴 폼의 저장·추가 같은 주요 버튼은 폼 안에서 `<SheetFooter>`로 감싸 하단에 고정한다(시트가 푸터 영역으로 옮겨 그리며, 폼 상태는 그대로 쓴다). `index.html`의 viewport에 `interactive-widget=resizes-content`가 있어 안드로이드 키보드가 올라와도 하단 버튼이 키보드 위에 보인다.
- 화면: `src/screens/` (home, history, absences, stats, settings). 탭 전환은 `App.tsx`에서 방향별 슬라이드.

## 그룹 (돌아가며 하는 일 엔진, v3 → v4에서 요일·템플릿 추가)
- 그룹 = `{ id, name, emoji, config, schedule, members, records, absences, skipDays, coffee? }` (v4). `template` 필드는 v4에서 없어졌고, 화면이 보는 `GroupView.template`('coffee'=금액 기능 켬 / 'general'=횟수만)은 `config.fairness`에서 계산한다(`templateOf`). 주문(메뉴 취합) 카드·메뉴 목록·기본 메뉴·가격표는 `GroupView.hasOrders`(= money + `config.orders`), 금액·차액·커피 수지·당번 기준은 money일 때 켜진다. 점심 쏘기는 money이지만 주문은 없다(상세 금액 모드는 주문 메뉴가 없어 자동으로 빠지고 간단 모드만). 멤버·기록·휴가·쉬는 날은 **그룹마다 따로**다. 주문·가격표·사용자 메뉴·당번 기준 설정(`orders`/`priceList`/`customMenus`/`settings`)은 커피 그룹의 `coffee`에만 있다.
- **요일(`schedule`)**: `'weekdays'`(기본) | `'daily'` | 요일 번호 배열(0=일…6=토). `logic/schedule.ts`의 `isScheduledDay`가 판정하고 `isBusinessDay`/`nextBusinessDay`/`BuyerContext.schedule`이 따른다. 없으면 평일(기존 동작). 쉬는 날(`skipDays`)과 휴가는 그대로 적용되고, 요일을 바꿔도 지난 기록은 지우지 않는다. 설정 > 그룹 수정에서 바꾼다.
- **템플릿 프리셋(`logic/templates.ts`, 코드 상수)**: 커피·점심 쏘기·회의록·발표·청소·분리수거·설거지·산책·직접 만들기. 그룹을 만들 때 `configOf`로 **값을 복사해 저장**하므로 상수를 나중에 바꿔도 기존 그룹은 변하지 않는다. `GroupConfig` = presetId, actionLabel(버튼 문구), fairness(count|money), orders, memoPlaceholder, shareFormat(`{emoji} {name}` 치환, 커피는 `☕`), themeId. 용어는 `termsOf(config)`(커피·"했어요"는 기존 문구 그대로, 그 외는 버튼 문구를 끼워 만든다). 직접 만들기는 이름·이모지·버튼 문구·요일·기준(횟수/금액)·테마(목록 선택만)를 고르고 주문 기능은 없다. 그룹 추가 화면은 템플릿 카드 → 이름·멤버(선택)·요일.
- **순번 로직(`nextBuyer`·`fairness`·`order`)은 수정 없이 재사용한다.** 스토어가 현재 그룹을 `GroupView`(`logic/groups.ts`의 `groupToView`/`applyView`)로 바꿔 내보내므로 화면 코드는 그대로이고, 일반 그룹은 `settings`가 기본값(횟수 기준)이라 횟수 기준으로만 동작한다. `records`가 곧 `purchases`다.
- 모든 변경 함수는 **만들어질 때의 그룹 id에 묶인다**(되돌리기 토스트가 그룹을 바꾼 뒤에 눌려도 엉뚱한 그룹을 건드리지 않음). 루트 변경은 `logic/groups.ts`의 순수 함수(`updateGroupView`/`withGroup*`/`withAbsences*`)로 분리해 테스트한다.
- 템플릿별 용어는 `TERMS`(`logic/groups.ts`): 커피는 지금 문구 그대로, 일반은 [했어요]. 일반 템플릿은 주문·금액·가격표·커피 수지·기본 메뉴를 숨긴다. 공유 텍스트 머리말은 커피 `☕`, 일반 `{이모지} {이름}`.
- 홈 상단 전환기(`components/group-switcher.tsx`)는 **그룹이 2개 이상일 때만** 보인다(1개면 v2 화면과 똑같음). 그룹 추가·이름/이모지 변경·삭제는 설정의 "그룹" 카드(`components/groups-card.tsx`). 마지막 그룹은 삭제할 수 없고, 삭제는 5초 되돌리기가 있다. 템플릿(종류·버튼 문구)은 만든 뒤 바꿀 수 없고 이름·이모지·요일만 바꾼다.
- 현재 보는 그룹은 데이터가 아니라 기기별 화면 상태라 별도 키 `coffee-duty:active-group`에 저장한다(전환이 데이터·섀도를 다시 쓰지 않고 내보내기에도 안 섞임).
- 휴가 "모든 그룹에 적용"(휴가 화면, 그룹 2개 이상일 때): 멤버가 그룹마다 따로라 **이름 일치**(앞뒤 공백 제거, `planAbsenceAll`)로 연결한다. 이름이 맞는 멤버가 없거나 같은 이름이 둘 이상인 그룹은 건너뛰고 몇 개 그룹에 적용됐는지 알린다. 이미 같은 휴가가 있으면 중복 생성하지 않는다. 삭제는 현재 그룹만 지운다.
- 범위 밖(하지 않음): 템플릿 팩, 유료화, 그룹 간 멤버 공유/연결 ID.

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
- **v3(그룹 도입)**: v1·v2 모두 `STEPS`를 거쳐 v3가 된다. v2 → v3는 기존 데이터 전부를 **id가 고정된(`g-coffee`) "커피" 그룹 하나**로 옮기고(members→members, purchases→records, 주문·가격표·사용자 메뉴·설정→`coffee`) 값은 건드리지 않는다. 몇 번을 옮겨도 결과가 같다(멱등). 원본은 처음 옮길 때 `coffee-duty:backup-before-v3`에 한 번 보관(v1은 `backup-before-v2`도).
- **v4(요일·템플릿 설정)**: v3 → v4는 모든 그룹에 `schedule: 'weekdays'`와 `config`를 채우고 `template`을 지운다. 커피 그룹 → 커피 설정(주문 on, 테마 coffee), 일반 그룹 → 순번 기본 설정(직접 만들기, 횟수, 테마 coffee). 다른 값(멤버·기록·금액·휴가·주문 등)은 그대로. 단계에서 쓰는 설정은 `migrate.ts`에 **고정 리터럴**로 두어 템플릿 상수를 바꿔도 옛 데이터를 옮긴 결과가 달라지지 않는다. 원본은 처음 옮길 때 `coffee-duty:backup-before-v4`에 한 번 보관한다(`backup-before-v3`는 v1/v2 원본 전용이라 v3 데이터를 덮지 않는다). 이미 있는 값은 건드리지 않고 알 수 없는 값은 안전한 기본값(횟수·평일·테마 coffee)으로 정규화.
- **옛 앱 보호 표식**: 저장·내보내기 JSON(`serialize`) 최상위에 빈 `members: []`를 항상 남긴다. 이미 배포된 v2 앱의 `migrate`는 "모양 검사(members 배열) → 버전 검사" 순서라서, 표식이 없으면 v3 데이터를 깨진 데이터로 보고 초기 데이터로 덮어쓴다. 표식이 있으면 `FutureVersionError`("업데이트해 주세요" 화면, 저장 안 함)가 된다. 새 코드의 `migrate`는 **버전 검사를 모양 검사보다 먼저** 한다. 구조를 또 바꿀 때도 이 표식을 유지한다(테스트 `shadow.test.ts`가 고정).
- **shadow(마지막 정상 상태)**: 저장할 때마다 메인(`coffee-duty:v1`)과 함께 전체 데이터를 `coffee-duty:shadow`에도 쓴다(`updatedAt` 포함). 이미 배포된 옛 버전 앱(`42cb18e`)은 `schemaVersion`을 검사하지 않고 **열기만 해도** 아는 필드만 남겨 다시 저장해 `orders`·`priceList`·`pricing`·`favorite`·`settings`를 지우므로, 그 경우를 감지하기 위한 장치다. 옛 앱은 shadow 키를 모른다.
  - 로드 시 메인이 v1 모양(schemaVersion 없음)인데 v2 shadow가 있고 더 최신이면(또는 메인이 읽을 수 없는데 정상 shadow가 있으면) **자동 복구/병합하지 않고** 바텀시트로 묻는다. 묻는 동안에는 저장하지 않는다(shadow가 덮어써지지 않도록).
  - "되돌리기": 지금 메인을 `coffee-duty:backup-before-restore`에 남기고 shadow 전체를 복원. "그대로 두기": 메인을 정상 마이그레이션하고 이전 shadow는 `coffee-duty:shadow-prev`에 보관. 보관에 실패하면 선택을 확정하지 않는다. `shadow-prev`는 앱 화면에서 복구하는 메뉴를 **의도적으로 두지 않았다**(복구 시트의 "그대로 두기" 아래에 "이 선택은 되돌릴 수 없어요" 안내만 있다). 초기화·가져오기는 섀도를 새 상태로 바꾸는 지금 동작 그대로다.
  - v3부터 shadow는 **v2 이상이면 복구 후보**(현재 버전으로 올려 읽음)이고, 메인이 더 낮은 버전(v1 모양·배포 전 v2 화면이 덮어쓴 v2 모양)이며 shadow가 더 최신(`updatedAt`)이면 묻는다. 같은 시점에 함께 쓴 v2 메인+v2 shadow는 질문 없이 v3로 옮긴다.
  - shadow가 없거나 깨졌거나 v1 모양이면(미래 버전 포함) 조용히 무시한다. 설정 > 데이터의 "마지막 정상 상태로 되돌리기"는 같은 복원을 수동으로 한다. 로직은 `lib/data.ts`(`readShadow`/`isOverwrittenByOldApp`/`applyRecovery`/`restoreLastGood`), 테스트는 `lib/shadow.test.ts`.
- **실제 데이터 검증**: 총무 폰에서 내보낸 JSON을 `backup/`에 넣고 `npm run check:migration`. **v1/v2 파일은 "커피" 그룹으로 값까지 옮겨졌는지**(멤버·기록·금액·휴가·쉬는 날·주문·가격표·사용자 메뉴·설정), v3 파일은 그룹별 값 보존 + 모두 평일·템플릿에 맞는 설정을 받았는지, v4 파일은 그룹별 왕복 일치(요일·설정 포함)를 확인한다. 개수·값 일치 여부만 출력(실명 미출력), 원본은 읽기만 한다. 키 순서와 무관하게 값을 비교한다(오탐 방지). `backup/`은 `.gitignore`에 있고 **절대 커밋하지 않는다**(실명 포함). 배포 전에 이 검증을 통과시킨다.

## 배포 규칙 (운영)
이 저장소는 `main`에 push하면 곧바로 배포되고, 총무 폰에 실제 기록이 있다. 이미 배포된 옛 버전은 v2 데이터의 모르는 필드를 지워 버릴 수 있으므로 다음을 지킨다.
- **롤백 금지.** 문제가 생기면 이전 커밋으로 되돌리지 말고 **수정본을 앞으로만(roll forward) 배포**한다. 옛 코드가 v2 데이터 위에서 열리면 `orders`·`priceList`·`pricing` 등이 지워진다. `git revert`로 되돌리는 새 커밋도 옛 코드를 다시 배포하는 것이므로 데이터 구조(스키마)가 달라지는 변경은 revert하지 않는다.
- **옛 Actions 실행 재실행 금지.** Actions 탭에서 과거 실행의 "Re-run"을 누르면 그때의 옛 코드가 다시 배포된다. 수동 배포는 항상 최신 `main`에서 "Run workflow"로 한다.
- push 전에 총무 폰에서 JSON을 내보내 `backup/`에 넣고 `npm run check:migration`을 통과시킨다(`backup/`은 실명 포함이라 절대 커밋하지 않는다).
- 배포 직후 총무 폰에서 설치 앱과 브라우저 탭을 **모두 닫았다가 다시 연다.** 가능하면 설치 앱만 쓰고, 같은 사이트를 브라우저 탭으로 같이 열어 두지 않는다(오래 열려 있던 옛 화면이 저장하면 덮어쓸 수 있다).
- 서비스 워커는 `autoUpdate`(`skipWaiting` + `clientsClaim`, 갱신되면 열린 화면을 자동 새로고침)다. 배포 직후 첫 실행은 캐시된 옛 화면이 먼저 뜰 수 있으니 한 번 더 열어 최신인지 확인한다.
- 그래도 데이터가 사라져 보이면: 앱을 다시 열 때 "마지막 정상 상태로 되돌릴까요?"가 뜨면 되돌리기를 선택하고, 안 뜨면 설정 > 데이터 > "마지막 정상 상태로 되돌리기"를 쓴다. 그 전에 데이터를 더 수정하지 않는다.
- **v4(요일·템플릿) 배포도 스키마 변경 배포다.** v3 상태에서 내보낸 JSON으로 `check:migration`을 통과시킨 뒤 push한다. 배포 후 v3 앱은 v4 데이터를 열면 "업데이트해 주세요" 화면만 띄운다(표식).
- **v3(그룹) 배포는 스키마 변경 배포다.** 직전 단계(v2) 배포가 총무 폰에서 안정적임을 확인하고, **v2 상태에서 내보낸 JSON**으로 `check:migration`을 통과시킨 뒤 push한다. 배포 후 v2 앱은 v3 데이터를 열면 "업데이트해 주세요" 화면만 띄운다(위 표식).
- 새 버전이 안정적으로 퍼진 뒤에도, 스키마를 바꾸는 배포는 한 번에 한 단계씩, 로컬에서 `check:migration`과 화면 확인을 끝낸 뒤에만 한다.

## 개발 규칙
- 이 저장소는 `main`에 push하면 바로 배포되고 실제 기록이 있는 기기가 있다. 데이터 구조를 바꾸는 변경은 로컬에서 화면과 `check:migration`을 확인한 뒤에만 push한다.

## 상태
- 테스트 292개 통과(`nextBuyer`, `order`, `fairness`, `pricing-form`, `groups`, `schedule`(요일·프리셋·v3→v4), `themes`(대비·커피 불변), `migrate`, `pricing-migrate`, `shadow`, `install`, `metrics`), `tsc` 및 `vite build` 통과.
- 시트 터치 스크롤은 설치된 Chrome에 실제 터치 이벤트(`touchStart/Move/End`)를 보내는 방식(360x800·다크·`playwright-core`를 `--no-save`로 임시 설치)으로 확인했다: 수정 전 스와이프 0px·저장 버튼 화면 밖 → 수정 후 스크롤·저장 버튼 고정 노출. `synthesizeScrollGesture`는 이 환경에서 스크롤을 일으키지 못하므로 쓰지 말고, 항상 홈 화면 같은 대조군으로 도구가 동작하는지 먼저 확인한다.
- 커피 화면 불변 확인: 테마 도입 전후로 홈·기록·휴가·통계·설정·기록 추가 시트를 라이트·다크(375x800, 날짜 고정, reduced-motion)로 캡처해 PIL로 비교 → 12장 모두 픽셀 차이 0. 새 테마의 실제 렌더링은 `/design`과 그룹 전환(Chrome 에뮬레이션)으로 확인했고 실제 기기에서는 확인하지 못했다.
- **미확인**: 그룹 전환기·그룹 관리 카드·휴가 "모든 그룹에 적용"·주문 카드·금액 시트·커피 수지 카드·설정 화면의 실제 렌더링, 스와이프/드래그 제스처, 모바일 375px 레이아웃은 눈으로 확인하지 못했다(Playwright 미연결). 실제 총무 폰 데이터로 `check:migration`도 아직 돌리지 않았다.

## 배포 (GitHub Pages)
- 주소: `https://<아이디>.github.io/coffee/` (저장소 이름이 `coffee`일 때). 저장소는 public.
- `main`에 push하면 `.github/workflows/deploy.yml`이 `npm ci` → `npm test` → `npm run build` → Pages 배포를 자동 실행. 테스트나 타입체크가 실패하면 배포되지 않는다. 수동 실행은 Actions 탭의 "Run workflow".
- 최초 1회 GitHub 웹 설정: 저장소 Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 변경.
- 하위 경로 대응: `vite.config.ts`의 `base: './'`, manifest의 `start_url`/`scope`/아이콘 경로, SW(`./sw.js`, scope `./`), `data.json`(`BASE_URL` 기준) 모두 상대 경로라서 `/coffee/`에서 동작. 라우터가 없어 새로고침 404 문제도 없다.
- 데이터는 사용자 브라우저의 localStorage에만 있어 기기끼리 공유되지 않는다. 공개 저장소이므로 `public/data.json`에는 실명을 넣지 않는다(현재 "멤버 1~6" 자리표시자). 실제 이름은 앱 설정 화면에서 입력하거나 JSON 가져오기로 넣는다.
- 배포 후 앱이 안 바뀌어 보이면 서비스 워커 캐시 때문일 수 있다. 새로고침을 두 번 하거나 사이트 데이터를 지운다.

## 서비스화 로드맵 작업 원칙 (상세: `docs/ROADMAP.md`)
안드로이드(구글 플레이) 출시용으로 키우는 중이다. 단계는 0 선행 점검 → 1 Supabase·권한 → 2 초대 링크 → 3 유료화 → 4 플레이 출시 준비. **코드는 단계 계획을 승인받은 뒤에만 쓴다.**
- 단계마다 계획 먼저 → 사용자 승인 → 구현. 질문은 꼭 필요한 1~2개만, 보고는 짧게.
- 기존 순번·공평성·주문 로직과 테스트는 수정 없이 통과해야 한다. 화면·테마는 최대한 재사용.
- 확인 못 한 것(화면, 실제 기기, 실제 데이터)은 "확인 못 했다"고 정직하게 보고.
- 기능 하나 끝날 때마다 커밋, push는 단계별로 작게. 커밋 작성자는 noreply 주소.
- 스키마·데이터 구조를 바꾸는 push 전에는 "총무 폰에서 JSON 내보내기 했어?"만 확인.
- 롤백·옛 Actions 재실행 금지(앞으로만 배포).
- **비밀값(서비스 키, 서명 키, 토큰)은 저장소·번들·내보내기 JSON에 넣지 않는다.** Supabase는 anon key만 클라이언트에, service_role key는 서버 함수에서만.
- 개인정보(A안): 주민번호 등 고유식별정보·카드/계좌·민감정보는 수집·저장 금지. 결제는 Google Play/PG가 처리하고 서버엔 구독 상태만. 이름(별명)·기록·휴가·금액·주문은 서버에 평문 저장하되 RLS로 그룹 소속자만 접근. 멤버 입력칸에 "실명 대신 별명도 괜찮아요", 메모칸에 "주민번호·카드번호 등은 적지 마세요" 안내. 탈퇴·그룹 삭제 시 서버 데이터 즉시 삭제, 만 14세 미만 가입 제한. 저장 계층을 분리해 나중에 종단간 암호화(B안)로 바꿀 수 있게 설계.
- 매년 target API 상향 절차는 4단계에서 이 파일에 기록한다.

## 서버 공유(Supabase) 구현 메모와 운영 규칙
- **운영 환경 변수 규칙(CAPTCHA 전까지)**: 운영 Supabase 프로젝트의 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`는 **익명 로그인 CAPTCHA(1-F)를 넣기 전까지 GitHub Secrets·Variables나 배포 설정에 넣지 않는다.** 빌드에 이 값이 없으면 공유 UI는 숨겨지고 `supabase-js`도 로드되지 않는다(배포본은 로컬 전용 앱 그대로). 로컬 개발의 `.env.local`은 **테스트 프로젝트** 값만 쓴다.
- 환경 변수 이름: 앱(공개 값) `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, RLS 테스트·시드 `SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY`(`.env.test.local`). 서로 섞지 않는다. `service_role` 키·DB 비밀번호·Google Client secret은 어디에도 두지 않는다(대시보드에만).
- 서버 그룹은 **로컬 `AppData`(v4)에 넣지 않는다.** 스토어는 로컬 그룹(`groups`, 편집 가능)과 서버 그룹(`shared`, 읽기 전용)을 따로 들고 `switchable`로 합쳐 보여준다. 서버 그룹을 보는 동안 `access = { kind: 'remote', canWrite: false }`이고 `set()`이 변경을 막는다(그리고 `updateGroupView`는 로컬에 없는 id를 건드리지 않는다). 화면은 `access.canWrite`로 쓰기 버튼을 숨긴다.
- 코드 위치: `logic/remote-map.ts`(행↔Group, diff, import payload, payload 코덱=B안 전환 지점), `lib/repository.ts`(로컬 저장 계층), `remote/`(`api.ts` supabase-js 동적 로드·모든 통신, `provider.tsx` 상태·갱신·오프라인, `cache.ts` 별도 키 `coffee-duty:remote-cache`, `snapshot.ts` 서버 응답 검증, `invite.ts`, `format.ts`), `components/shared-card.tsx`(설정 카드), `components/shared-banner.tsx`(보기 전용 안내).
- 서버 그룹 읽기는 RPC `get_group_snapshot` 한 번(일관된 스냅샷). 갱신은 앱 열 때·화면 복귀 시(30초 간격)·온라인 복귀 시·수동 새로고침. 실시간은 1-E.
- 로그인 세션은 supabase-js가 `coffee-duty:auth` 키에 저장한다. 세션도 캐시도 없으면 서버에 연결하지 않는다. 익명 세션은 도메인이 바뀌면 사라진다(도메인 확정 전에는 실제 그룹원을 `github.io`로 초대하지 않는다).
- DB 마이그레이션은 `supabase/migrations/`에 번호 순서로 쌓고 이미 적용한 파일은 고치지 않는다(새 번호로 추가). 적용 순서와 방법: `docs/SUPABASE.md`. Google 로그인 설정: `docs/GOOGLE_OAUTH.md`.
- **새 SQL 규칙**: 사용자가 대시보드에서 SQL을 Run하게 할 때는 **한 줄 확인 쿼리**(새 함수·컬럼이 있는지 조회)와 기대 결과를 항상 함께 알려 주고 `docs/SUPABASE.md`의 확인 쿼리 표에도 추가한다. "Success" 표시만으로 적용을 믿지 않는다.
- **서버 쓰기(그룹장)**: 서버 그룹은 변경 전/후 `diffGroups`를 `apply_group_ops`(0004, 한 트랜잭션, `rev` 충돌 감지)로 보낸다. `remote/writer.ts`가 그룹별 순서 대기열(성공마다 rev 이어가기, 충돌·오류 시 뒤 변경 폐기 → 최신 내용 다시 읽기), `remote/provider.tsx`의 `commitGroup`이 낙관적 반영. 오프라인이면 쓰기를 막는다(`access.canWrite = 그룹장 && online`, 큐는 나중). 서버 그룹의 새 멤버·휴가 id는 `crypto.randomUUID()`(`makeId`).
- **내 기기 그룹 → 서버로 옮기기(`remote/share.ts`)**: 백업(`coffee-duty:backup-before-share-<그룹id>`, 처음 한 번만) → 연결 정보(`coffee-duty:share-links`: importKey·멤버 id 매핑, 올리기 전에 먼저 저장) → `import_group`(같은 key면 같은 그룹, 재시도 안전) → 서버에서 다시 읽어 `diffContent`로 대조(`verified`). 다르면 경고하고 이 기기 사본 삭제를 권하지 않는다. 연결 정보는 AppData와 분리된 기기 키(내보내기·shadow에 안 섞임)이고 로그아웃해도 유지한다.
- **사본 상태(`remote/links.ts` `copyStatus`)**: 서버 그룹이 보이면 내 기기 사본은 전환기에서 숨김(`moved`), 안 보이면(로그아웃 등) "서버로 옮긴 그룹의 이전 사본"(`stale`)으로 보이고 **기본은 수정 불가**, 배너의 [수정하기] → 경고 확인 후 이번 실행 동안만 수정 가능(`access.staleCopy`, `unlockCopy`). 이 사본의 수정은 서버로 가지 않는다.
