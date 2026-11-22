# Google 로그인 설정 (그룹장용) — 테스트 상태로 시작

그룹장은 Google 계정으로 로그인한다. 아래는 **직접 따라 하는 순서**다. 화면 문구는 Google이 가끔 바꾸므로 정확히 같지 않으면 비슷한 이름의 메뉴를 찾는다 `[확인 필요]`.

> 비밀값 규칙: **Client secret은 Supabase 대시보드에만 입력한다.** 채팅·저장소·`.env` 파일 어디에도 적지 않는다. 이 앱 코드에는 필요 없다.

## 0. 준비
- Supabase **테스트 프로젝트**가 있고 `0001`~`0003`이 적용돼 있어야 한다(`docs/SUPABASE.md`).
- 이 문서에서 `<ref>`는 Supabase 프로젝트 주소(`https://<ref>.supabase.co`)의 앞부분이다.

## 1. Google Cloud 프로젝트 만들기
1. https://console.cloud.google.com 에 Google 계정으로 로그인한다.
2. 상단 프로젝트 선택 상자 → **새 프로젝트** → 이름 `coffee-duty` → 만들기. 만든 뒤 그 프로젝트가 선택돼 있는지 확인한다.

## 2. OAuth 동의 화면 (테스트 상태)
1. 왼쪽 메뉴 **API 및 서비스 → OAuth 동의 화면** (새 화면에서는 **Google Auth Platform**). **시작하기**.
2. 앱 정보: 앱 이름 `커피 당번`, 사용자 지원 이메일은 본인 이메일 선택 → 다음.
3. 대상(Audience): **외부(External)** → 다음.
4. 연락처 정보: 본인 이메일 → 다음 → 약관 동의 → **만들기**.
5. **대상(Audience)** 메뉴에서 게시 상태가 **테스트(Testing)** 인지 확인한다. (게시/프로덕션으로 바꾸지 않는다.)
6. 같은 화면 **테스트 사용자**에 **로그인해 볼 본인 Google 이메일**을 추가한다(최대 100명). 여기에 없는 계정은 로그인할 수 없다.
7. **데이터 액세스(Scopes)**: 기본값(`openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`)이면 된다. 더 추가하지 않는다.

테스트 상태에서는 로그인 때 "Google에서 확인하지 않은 앱" 경고가 나온다 → **고급 → (앱 이름)으로 이동**으로 계속한다. 테스트 상태의 로그인 세션은 **7일 뒤 만료**될 수 있다 `[확인 필요]`. 공개 출시 전에 게시(검수) 절차를 따로 한다(4단계).

## 3. OAuth 클라이언트 ID 만들기
1. **API 및 서비스 → 사용자 인증 정보** (또는 Google Auth Platform → **클라이언트**) → **+ 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**.
2. 애플리케이션 유형: **웹 애플리케이션**. 이름 `coffee-duty-web`.
3. **승인된 JavaScript 원본**에 추가 (🌐 도메인이 정해지면 새 주소도 추가):
   - `http://localhost:5173`
   - `https://moonsu8.github.io`
4. **승인된 리디렉션 URI**에 추가:
   - `https://<ref>.supabase.co/auth/v1/callback`
   - (정확한 값은 Supabase 대시보드 **Authentication → Sign In / Providers → Google** 에 "Callback URL"로 보인다. 그 값을 복사해서 붙여 넣는 것이 가장 안전하다.)
5. **만들기** → 팝업의 **클라이언트 ID**와 **클라이언트 보안 비밀번호(Client secret)** 를 복사한다. (팝업을 닫으면 다시 볼 수 있지만 사용자 인증 정보 목록에서 열어야 한다.)

## 4. Supabase에 연결
1. Supabase 대시보드 → **Authentication → Sign In / Providers → Google**.
2. **Enable Sign in with Google** 켜기 → **Client IDs**에 클라이언트 ID, **Client Secret**에 보안 비밀번호를 붙여 넣기 → **Save**.
   (Client secret은 여기에만 입력한다.)
3. **Authentication → URL Configuration**
   - **Site URL**: `http://localhost:5173` (개발 중)
   - **Redirect URLs**에 추가: `http://localhost:5173/**` , `https://moonsu8.github.io/coffee/**` 🌐 (도메인이 정해지면 `https://<도메인>/**` 추가)
4. 저장.

## 5. 앱에서 확인 (개발 서버)
1. 저장소 폴더에 `.env.local` 파일을 만들고 **테스트 프로젝트의 공개 값** 두 줄만 넣는다:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public 키>
   ```
2. `npm run dev` → http://localhost:5173/ → 설정 → **공유 그룹 → Google로 로그인** → "만 14세 이상" 체크 → Google 계정(테스트 사용자로 등록한 것) 선택 → 앱으로 돌아오면 "Google 계정으로 로그인돼 있어요"가 보인다.
3. 안 될 때 흔한 원인
   - `redirect_uri_mismatch`: 3단계 4번의 콜백 주소가 Supabase가 보여준 값과 다르다.
   - "액세스 차단됨/테스트 사용자 아님": 2단계 6번에 그 이메일을 추가하지 않았다.
   - 로그인 후 앱으로 돌아오지 않는다: 4단계 3번의 Redirect URLs에 현재 주소가 없다.

## 6. 하지 않는 것
- Client secret을 코드, `.env`, 저장소, 채팅에 넣기
- 동의 화면을 "프로덕션"으로 게시하기 (공개 출시 전 4단계에서 처리)
- 운영 프로젝트에 같은 클라이언트를 재사용하기 (운영 프로젝트를 만들 때 별도 클라이언트 ID와 리디렉션 URI를 만든다)
